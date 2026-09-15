import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export function parseArgs(argv) {
  const options = { command: "lead-doctor", timeoutMs: 30000, keepProject: false }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === "--command") options.command = argv[++index] ?? ""
    else if (value === "--timeout-ms") options.timeoutMs = Number(argv[++index] ?? 0)
    else if (value === "--keep-project") options.keepProject = true
    else throw new Error(`Unknown option: ${value}`)
  }
  if (!/^(lead-doctor|lead-plan|lead-models)$/.test(options.command)) throw new Error("--command must be lead-doctor, lead-plan, or lead-models")
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 600000) throw new Error("--timeout-ms must be between 1000 and 600000")
  return options
}

async function run(command, args, cwd, timeoutMs) {
  const { spawn } = await import("node:child_process")
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`${command} timed out after ${timeoutMs}ms\n${stderr}\n${stdout}`))
    }, timeoutMs)
    child.stdout?.on("data", (chunk) => { stdout += chunk })
    child.stderr?.on("data", (chunk) => { stderr += chunk })
    child.once("error", (error) => { clearTimeout(timer); reject(error) })
    child.once("close", (code) => {
      clearTimeout(timer)
      if (code !== 0) reject(new Error(`${command} failed with exit ${code}\n${stderr}\n${stdout}`))
      else resolve({ stdout, stderr })
    })
  })
}

async function install(project) {
  const script = process.platform === "win32" ? path.join(root, "install.ps1") : path.join(root, "install.sh")
  const command = process.platform === "win32" ? "pwsh.exe" : "bash"
  const args = process.platform === "win32" ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Project", project] : [script, project]
  await run(command, args, root, 30000)
  const npmCommand = process.platform === "win32" ? process.execPath : "npm"
  const npmArgs = process.platform === "win32" ? [process.env.npm_execpath, "install", "--ignore-scripts", "--no-audit", "--no-fund"] : ["install", "--ignore-scripts", "--no-audit", "--no-fund"]
  await run(npmCommand, npmArgs, path.join(project, ".opencode"), 120000)
}

async function createProject() {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-host-smoke-"))
  await fs.writeFile(path.join(project, "README.md"), "# TeamLead host smoke test\n")
  await run("git", ["init", "--initial-branch", "main"], project, 30000)
  await run("git", ["config", "user.email", "teamlead-smoke@example.invalid"], project, 30000)
  await run("git", ["config", "user.name", "TeamLead smoke test"], project, 30000)
  await run("git", ["add", "."], project, 30000)
  await run("git", ["commit", "-m", "host smoke baseline"], project, 30000)
  return project
}

async function removeProject(project) {
  let lastError
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await fs.rm(project, { recursive: true, force: true })
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw lastError
}

function toolContext(project) {
  const abort = new AbortController()
  return {
    sessionID: "teamlead-host-smoke",
    messageID: "teamlead-host-smoke-message",
    agent: "build",
    directory: project,
    worktree: project,
    abort: abort.signal,
    metadata() {},
    async ask() {},
  }
}

function parseToolOutput(output) {
  if (typeof output !== "string") throw new Error("TeamLead host tool returned a non-string result")
  return JSON.parse(output)
}

export async function runHostSmoke(options = parseArgs([])) {
  const project = await createProject()
  const previousCwd = process.cwd()
  let server
  try {
    await install(project)
    process.chdir(project)
    const { createOpencode } = await import("@opencode-ai/sdk")
    const instance = await createOpencode({ hostname: "127.0.0.1", port: 0, timeout: options.timeoutMs })
    server = instance.server
    const client = instance.client
    const directory = process.cwd()
    const commandsResponse = await client.command.list({ query: { directory } })
    const toolsResponse = await client.tool.ids({ query: { directory } })
    const commands = (commandsResponse.data ?? commandsResponse).map((entry) => entry.name ?? entry.command ?? entry)
    const tools = toolsResponse.data ?? toolsResponse
    for (const required of ["lead-doctor", "lead-plan", "lead-models"]) {
      if (!commands.includes(required)) throw new Error(`OpenCode did not load command: ${required}`)
    }
    for (const required of ["teamlead_doctor", "teamlead_plan", "teamlead_models"]) {
      if (!tools.includes(required)) throw new Error(`OpenCode did not load tool: ${required}`)
    }

    const pluginPath = path.join(project, ".opencode", "plugins", "teamlead.ts")
    const { TeamLeadPlugin } = await import(pathToFileURL(pluginPath).href)
    const hooks = await TeamLeadPlugin({ client, project: {}, directory, worktree: project, experimental_workspace: { register() {} }, serverUrl: new URL(instance.server.url), $: {} })
    const tool = options.command === "lead-plan" ? hooks.tool.teamlead_plan : options.command === "lead-models" ? hooks.tool.teamlead_models : hooks.tool.teamlead_doctor
    if (!tool) throw new Error(`Plugin did not expose tool for ${options.command}`)
    const args = options.command === "lead-plan" ? { goal: "Inspect the repository without editing files." } : {}
    const result = parseToolOutput(await tool.execute(args, toolContext(project)))
    if (options.command === "lead-doctor" && result.healthy !== true) throw new Error(`TeamLead doctor reported unhealthy: ${JSON.stringify(result)}`)
    return { project, commands, tools, result }
  } finally {
    server?.close()
    process.chdir(previousCwd)
    if (!options.keepProject) await removeProject(project)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const result = await runHostSmoke(options)
    console.log(JSON.stringify({ status: "passed", command: options.command, tools: result.tools.filter((tool) => tool.startsWith("teamlead_")), healthy: result.result.healthy }))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
