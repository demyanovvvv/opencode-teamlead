import fs from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { atomicJSON, readInstallation, registrationName, rejectLinkedPath, withRegistryLock } from "../payload/.opencode/teamlead/install-registry.ts"

const distribution = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const payload = path.join(distribution, "payload", ".opencode")
const artifacts = ["node_modules", "bun.lock", "bun.lockb", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"]
const legacyCommands = ["lead-review", "lead-dashboard", "lead-worker", "lead-dashboard-clear", ...["profiler", "router", "adaptive", "runtime", "intelligence", "execution", "contracts", "verify"].map((name) => `lead-${name}`), ...["dashboard", "worker", "dashboard-clear", "settings", "models", "profiler", "router", "adaptive", "runtime", "intelligence", "execution", "contracts", "verify"].map((name) => `tl-${name}`)].map((name) => `${name}.md`)
const exists = async (file) => Boolean(await fs.lstat(file).catch((error) => { if (error.code !== "ENOENT") throw error }))
const readJSON = async (file) => JSON.parse((await fs.readFile(file, "utf8")).replace(/^\uFEFF/, ""))

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: false, timeout: 120_000 })
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout || `${command} failed`)
  return result.stdout
}
const merge = (directory, mode) => run(process.execPath, [path.join(distribution, "scripts", "merge-tui.mjs"), directory, ...(mode ? [mode] : [])])

async function validateTarget(directory) {
  await rejectLinkedPath(directory)
  for (const relative of ["plugins", "plugins/teamlead.ts", "plugins/teamlead", "agents", "commands", "teamlead", "teamlead.json", ".teamlead", ".teamlead/global-install.json", ".teamlead/worktrees", ".teamlead-install.json", ".teamlead-projects", ...artifacts]) await rejectLinkedPath(path.join(directory, relative))
  // Never replace the canonical payload from which installation reads its files.
  if (path.resolve(directory) === payload) throw new Error("Cannot install or uninstall inside the distribution payload")
  for (const folder of ["commands", "agents"]) {
    const target = path.join(directory, folder)
    if (await exists(target)) for (const name of await fs.readdir(target)) {
      if ((folder === "agents" && /^teamlead-.*\.md$/.test(name)) || (folder === "commands" && (/^lead.*\.md$/.test(name) || legacyCommands.includes(name)))) await rejectLinkedPath(path.join(target, name))
    }
  }
}

async function worktrees(directory) {
  const base = path.join(directory, ".teamlead", "worktrees")
  if (!await exists(base)) return []
  const entries = await fs.readdir(base)
  for (const name of entries) await rejectLinkedPath(path.join(base, name))
  const project = path.dirname(directory)
  const result = spawnSync("git", ["worktree", "list", "--porcelain"], { cwd: project, encoding: "utf8", shell: false, timeout: 120_000 })
  if (result.status !== 0) {
    for (const name of entries) if (await exists(path.join(base, name, ".git"))) throw new Error(`Cannot verify Git worktree: ${path.join(base, name)}`)
    return []
  }
  const registered = [...result.stdout.matchAll(/^worktree (.+)$/gm)].map((match) => path.resolve(match[1].trim()))
  const comparisonPath = (file) => process.platform === "win32" ? file.toLowerCase() : file
  const owned = registered.filter((file) => comparisonPath(file).startsWith(comparisonPath(path.resolve(base)) + path.sep))
  for (const file of owned) await rejectLinkedPath(file)
  return owned.map((file) => ({ project, file }))
}

async function cleanupData(directory, registered) {
  for (const { project, file } of registered) run("git", ["worktree", "remove", "--force", "--", file], project)
  for (const name of ["teamlead.json", ".teamlead"]) await fs.rm(path.join(directory, name), { recursive: true, force: true })
  if (await exists(directory) && !(await fs.readdir(directory)).length) await fs.rmdir(directory)
}

async function uninstall(directory, scope) {
  await validateTarget(directory)
  const saved = await readInstallation(directory)
  merge(directory, "check-uninstall")
  const ownWorktrees = await worktrees(directory)
  const removeArtifacts = []
  if (saved?.packageCreated && await exists(path.join(directory, "package.json"))) {
    const pkg = await readJSON(path.join(directory, "package.json"))
    const dependencies = { ...pkg.dependencies }
    if (dependencies["@opencode-ai/plugin"] === ">=1.18.30 <2.0.0") delete dependencies["@opencode-ai/plugin"]
    if (!Object.keys(dependencies).length && Object.keys(pkg).every((key) => ["private", "type", "dependencies"].includes(key))) {
      for (const name of artifacts) if (saved.artifactsBefore?.[name] === false) removeArtifacts.push(name)
    }
  }
  if (scope === "global" && await exists(path.join(directory, ".teamlead-projects"))) {
    await withRegistryLock(directory, async () => {
      const registry = path.join(directory, ".teamlead-projects")
      const targets = []
      for (const name of await fs.readdir(registry)) {
        if (name === "registry.lock") continue
        const entry = path.join(registry, name)
        await rejectLinkedPath(entry)
        if (!/^[a-f0-9]{64}\.json$/.test(name)) throw new Error(`Invalid project registry entry: ${name}`)
        const registration = await readJSON(entry)
        if (typeof registration.project !== "string" || !path.isAbsolute(registration.project) || registrationName(registration.project) !== name || !saved?.installationId || registration.installationId !== saved.installationId) throw new Error(`Invalid project registration: ${name}`)
        const local = path.join(registration.project, ".opencode")
        await validateTarget(local)
        if (!await exists(registration.project)) { targets.push({ entry }); continue }
        // Independent local installations own their settings and history.
        if (await exists(path.join(local, "plugins", "teamlead.ts")) || (await readInstallation(local))?.scope === "local") { targets.push({ entry }); continue }
        const marker = path.join(local, ".teamlead", "global-install.json")
        if (!await exists(marker)) {
          if (await exists(path.join(local, "teamlead.json")) || await exists(path.join(local, ".teamlead"))) throw new Error(`Missing global ownership marker: ${local}`)
          targets.push({ entry }); continue
        }
        const owner = await readJSON(marker)
        if (owner.installationId !== saved.installationId || path.resolve(owner.directory) !== path.resolve(directory)) throw new Error(`Global ownership mismatch: ${local}`)
        targets.push({ entry, local, worktrees: await worktrees(local) })
      }
      // Validate every entry before removing any project's data.
      for (const target of targets) {
        if (target.local) await cleanupData(target.local, target.worktrees)
        await fs.rm(target.entry)
      }
      // Prevent a waiting startup from registering after the uninstall lock is released.
      await atomicJSON(path.join(directory, ".teamlead-install.json"), { ...saved, scope: "uninstalling" })
    })
    await fs.rmdir(path.join(directory, ".teamlead-projects"))
  }
  for (const { project, file } of ownWorktrees) run("git", ["worktree", "remove", "--force", "--", file], project)
  for (const name of removeArtifacts) await fs.rm(path.join(directory, name), { recursive: true, force: true })
  merge(directory, "uninstall")
  console.log(`Removed OpenCode TeamLead from: ${directory}`)
}

async function install(directory, scope, language, explicitLanguage) {
  await validateTarget(directory)
  const version = (await readJSON(path.join(distribution, "package.json"))).version
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) throw new Error("Invalid distribution version")
  const updating = await exists(path.join(directory, "plugins", "teamlead.ts"))
  const previous = await readInstallation(directory)
  if (!explicitLanguage && await exists(path.join(directory, "teamlead", "language.json"))) language = (await readJSON(path.join(directory, "teamlead", "language.json"))).language
  if (!["en", "ru"].includes(language)) throw new Error("Invalid UI language")
  const before = Object.fromEntries(await Promise.all(artifacts.map(async (name) => [name, await exists(path.join(directory, name))])))
  const recordedCommands = previous?.commands ?? []
  if (!Array.isArray(recordedCommands) || recordedCommands.some((name) => typeof name !== "string" || !/^lead[\w-]*\.md$/.test(name))) throw new Error("Invalid installed command metadata")
  merge(directory, "prepare")
  const metadata = await readJSON(path.join(directory, ".teamlead-install.json"))
  metadata.artifactsBefore ??= before
  for (const name of ["plugins", "agents", "commands"]) await fs.mkdir(path.join(directory, name), { recursive: true })
  for (const name of legacyCommands) await fs.rm(path.join(directory, "commands", name), { force: true })
  for (const name of recordedCommands) {
    await fs.rm(path.join(directory, "commands", name), { force: true })
  }
  await fs.rm(path.join(directory, "plugins", "teamlead"), { recursive: true, force: true })
  await fs.copyFile(path.join(payload, "plugins", "teamlead.ts"), path.join(directory, "plugins", "teamlead.ts"))
  await fs.rm(path.join(directory, "teamlead"), { recursive: true, force: true })
  await fs.cp(path.join(payload, "teamlead"), path.join(directory, "teamlead"), { recursive: true })
  await atomicJSON(path.join(directory, "teamlead", "language.json"), { language })
  for (const name of await fs.readdir(path.join(payload, "agents"))) if (/^teamlead-.*\.md$/.test(name)) await fs.copyFile(path.join(payload, "agents", name), path.join(directory, "agents", name))
  const commands = (await fs.readdir(path.join(payload, "commands"))).filter((name) => /^lead.*\.md$/.test(name))
  for (const name of commands) await fs.copyFile(path.join(payload, "commands", name), path.join(directory, "commands", name))
  const config = path.join(directory, "teamlead.json")
  if (scope === "local" && !await exists(config)) {
    const settings = await readJSON(path.join(payload, "teamlead.json"))
    settings.language = language
    await atomicJSON(config, settings)
  }
  merge(directory)
  const packageFile = path.join(directory, "package.json")
  const pkg = await exists(packageFile) ? await readJSON(packageFile) : await readJSON(path.join(payload, "package.json"))
  pkg.private ??= true
  pkg.dependencies ??= {}
  pkg.dependencies["@opencode-ai/plugin"] = ">=1.18.30 <2.0.0"
  await atomicJSON(packageFile, pkg)
  await atomicJSON(path.join(directory, ".teamlead-install.json"), { ...metadata, version, scope, commands, installationId: metadata.installationId ?? crypto.randomUUID() })
  console.log(`${updating ? "Updated" : "Installed"} OpenCode TeamLead ${updating ? `v${previous?.version ?? "unknown"} -> ` : ""}v${version} (${scope}) into: ${directory}`)
  console.log("Restart OpenCode, then run: /lead-doctor")
}

const [mode, directory, scope, language = "en", explicitLanguage = "false"] = process.argv.slice(2)
if (!["install", "uninstall"].includes(mode) || !directory || !["local", "global"].includes(scope)) throw new Error("Expected install|uninstall DIRECTORY local|global [LANGUAGE] [EXPLICIT_LANGUAGE]")
if (mode === "uninstall") await uninstall(path.resolve(directory), scope)
else await install(path.resolve(directory), scope, language, explicitLanguage === "true")
