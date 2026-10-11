import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")

test("global installer keeps per-project configuration and registers TUI once", async () => {
  if (process.platform === "win32") return
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-global-"))
  const target = path.join(tmp, "config", "opencode")
  try {
    const env = { ...process.env, XDG_CONFIG_HOME: path.join(tmp, "config") }
    for (let i = 0; i < 2; i++) {
      const result = spawnSync("bash", [path.join(root, "install.sh"), "--scope", "global"], { encoding: "utf8", env })
      assert.equal(result.status, 0, result.stderr)
    }
    assert.equal((await fs.readFile(path.join(target, "tui.json"), "utf8")).match(/teamlead\/tui.tsx/g)?.length, 1)
    await fs.access(path.join(target, "plugins", "teamlead.ts"))
    await assert.rejects(fs.access(path.join(target, "teamlead.json")))
    await assert.rejects(fs.access(path.join(target, ".teamlead")))
  } finally { await fs.rm(tmp, { recursive: true, force: true }) }
})

test("installer writes the selected Russian UI language", async () => {
  if (process.platform === "win32") return
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-language-"))
  const project = path.join(tmp, "project")
  await fs.mkdir(project, { recursive: true })
  try {
    const result = spawnSync("bash", [path.join(root, "install.sh"), "--scope", "local", "--project", project, "--language", "ru"], { encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(await fs.readFile(path.join(project, ".opencode", "teamlead.json"), "utf8")).language, "ru")
    assert.equal(JSON.parse(await fs.readFile(path.join(project, ".opencode", "teamlead", "language.json"), "utf8")).language, "ru")
  } finally { await fs.rm(tmp, { recursive: true, force: true }) }
})

function run(script, project) {
  const r = spawnSync("bash", [script, project], { encoding: "utf8" })
  if (r.status !== 0) throw new Error(r.stderr || r.stdout)
  return r.stdout
}

test("installer preserves existing config and unrelated plugin while normalizing SDK range", async () => {
  if (process.platform === "win32") return
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-install-"))
  const project = path.join(tmp, "project")
  const oc = path.join(project, ".opencode")
  await fs.mkdir(path.join(oc, "plugins"), { recursive: true })
  await fs.writeFile(path.join(oc, "teamlead.json"), JSON.stringify({ existing: true, models: { codeWorker: "keep/me" } }))
  await fs.writeFile(path.join(oc, "plugins", "unrelated.ts"), "export const untouched = true\n")
  await fs.mkdir(path.join(oc, "plugins", "teamlead"), { recursive: true })
  await fs.writeFile(path.join(oc, "plugins", "teamlead", "legacy.ts"), "legacy plugin\n")
  await fs.mkdir(path.join(oc, "commands"), { recursive: true })
  await fs.writeFile(path.join(oc, "commands", "lead-runtime.md"), "legacy teamlead command\n")
  await fs.writeFile(path.join(oc, "commands", "my-command.md"), "user command\n")
  await fs.writeFile(path.join(oc, "package.json"), JSON.stringify({ private: true, dependencies: { other: "1.0.0", "@opencode-ai/plugin": "1.18.30" } }))
  try {
    run(path.join(root, "install.sh"), project)
    run(path.join(root, "install.sh"), project)
    const cfg = JSON.parse(await fs.readFile(path.join(oc, "teamlead.json"), "utf8"))
    const pkg = JSON.parse(await fs.readFile(path.join(oc, "package.json"), "utf8"))
    assert.equal(cfg.models.codeWorker, "keep/me")
    assert.equal(pkg.dependencies.other, "1.0.0")
    assert.equal(pkg.dependencies["@opencode-ai/plugin"], ">=1.18.30 <2.0.0")
    await fs.access(path.join(oc, "plugins", "unrelated.ts"))
    await fs.access(path.join(oc, "plugins", "teamlead.ts"))
    await assert.rejects(fs.access(path.join(oc, "plugins", "teamlead")))
    await fs.access(path.join(oc, "commands", "my-command.md"))
    await assert.rejects(fs.access(path.join(oc, "commands", "lead-runtime.md")))
    await fs.access(path.join(oc, "commands", "lead.md"))
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
})


test("installer creates a valid fresh project installation", async () => {
  if (process.platform === "win32") return
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-install-fresh-"))
  const project = path.join(tmp, "project")
  await fs.mkdir(project, { recursive: true })
  try {
    run(path.join(root, "install.sh"), project)
    const oc = path.join(project, ".opencode")
    const cfg = JSON.parse(await fs.readFile(path.join(oc, "teamlead.json"), "utf8"))
    const pkg = JSON.parse(await fs.readFile(path.join(oc, "package.json"), "utf8"))
    assert.equal(cfg.schemaVersion, 2)
    assert.equal(pkg.dependencies["@opencode-ai/plugin"], ">=1.18.30 <2.0.0")
    for (const rel of [
      "plugins/teamlead.ts",
      "teamlead/runtime.ts",
      "agents/teamlead-lead.md",
      "agents/teamlead-reviewer.md",
      "commands/lead.md",
      "commands/lead-settings.md",
    ]) await fs.access(path.join(oc, rel))
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
})

test("PowerShell installer preserves config and is idempotent on Windows", async () => {
  if (process.platform !== "win32") return
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-install-ps-"))
  const project = path.join(tmp, "project with spaces")
  const oc = path.join(project, ".opencode")
  await fs.mkdir(path.join(oc, "plugins", "teamlead"), { recursive: true })
  await fs.mkdir(path.join(oc, "commands"), { recursive: true })
  await fs.writeFile(path.join(oc, "teamlead.json"), JSON.stringify({ existing: true, models: { codeWorker: "keep/me" } }))
  await fs.writeFile(path.join(oc, "package.json"), JSON.stringify({ private: true, dependencies: { other: "1.0.0", "@opencode-ai/plugin": "1.18.30" } }))
  await fs.writeFile(path.join(oc, "plugins", "teamlead", "legacy.ts"), "legacy plugin\n")
  await fs.writeFile(path.join(oc, "commands", "lead-runtime.md"), "legacy command\n")
  await fs.writeFile(path.join(oc, "commands", "my-command.md"), "user command\n")
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = spawnSync("pwsh.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(root, "install.ps1"), "-Project", project], { encoding: "utf8" })
      assert.equal(result.status, 0, result.stderr || result.stdout)
    }
    const cfg = JSON.parse(await fs.readFile(path.join(oc, "teamlead.json"), "utf8"))
    const pkg = JSON.parse(await fs.readFile(path.join(oc, "package.json"), "utf8"))
    assert.equal(cfg.models.codeWorker, "keep/me")
    assert.equal(pkg.dependencies.other, "1.0.0")
    assert.equal(pkg.dependencies["@opencode-ai/plugin"], ">=1.18.30 <2.0.0")
    await fs.access(path.join(oc, "plugins", "teamlead.ts"))
    await assert.rejects(fs.access(path.join(oc, "plugins", "teamlead")))
    await fs.access(path.join(oc, "commands", "my-command.md"))
    await assert.rejects(fs.access(path.join(oc, "commands", "lead-runtime.md")))
    await assert.rejects(fs.access(path.join(oc, "skills")))
  } finally { await fs.rm(tmp, { recursive: true, force: true }) }
})

test("PowerShell global installation does not create shared TeamLead settings", async () => {
  if (process.platform !== "win32") return
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-global-ps-"))
  const target = path.join(tmp, "opencode")
  try {
    const env = { ...process.env, OPENCODE_CONFIG_DIR: target }
    const result = spawnSync("pwsh", ["-NoProfile", "-File", path.join(root, "install.ps1"), "-InstallScope", "Global"], { encoding: "utf8", env })
    assert.equal(result.status, 0, result.stderr)
    await fs.access(path.join(target, "plugins", "teamlead.ts"))
    await fs.access(path.join(target, "tui.json"))
    await assert.rejects(fs.access(path.join(target, "teamlead.json")))
  } finally { await fs.rm(tmp, { recursive: true, force: true }) }
})

test("PowerShell installer preserves TUI JSONC comments and existing plugins", async () => {
  if (process.platform !== "win32") return
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-jsonc-ps-"))
  const project = path.join(tmp, "project")
  const directory = path.join(project, ".opencode")
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, "tui.jsonc"), '{\n  // keep my theme\n  "theme": "custom",\n  "plugin": ["./plugins/other.tsx"]\n}\n')
  try {
    for (let i = 0; i < 2; i++) {
      const result = spawnSync("pwsh", ["-NoProfile", "-File", path.join(root, "install.ps1"), "-InstallScope", "Local", "-Project", project], { encoding: "utf8" })
      assert.equal(result.status, 0, result.stderr)
    }
    const content = await fs.readFile(path.join(directory, "tui.jsonc"), "utf8")
    assert.match(content, /\/\/ keep my theme/)
    assert.match(content, /\.\/plugins\/other\.tsx/)
    assert.equal(content.match(/teamlead\/tui\.tsx/g)?.length, 1)
    await assert.rejects(fs.access(path.join(directory, "tui.json")))
  } finally { await fs.rm(tmp, { recursive: true, force: true }) }
})
function lifecycle(project, uninstall = false, scope = "local", env = process.env) {
  const windows = process.platform === "win32" && !process.env.TEAMLEAD_TEST_BASH
  const args = windows
    ? ["-NoProfile", "-File", path.join(root, "install.ps1"), "-InstallScope", scope === "local" ? "Local" : "Global", "-Project", project, ...(uninstall ? ["-Uninstall"] : [])]
    : [path.join(root, "install.sh"), "--scope", scope, "--project", project, ...(uninstall ? ["--uninstall"] : [])]
  const result = spawnSync(windows ? "pwsh" : process.env.TEAMLEAD_TEST_BASH || "bash", windows ? args : args.map((arg) => arg.replaceAll("\\", "/")), { encoding: "utf8", env })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout
}

function entry(scriptRoot, args = [], options = {}, uninstall = false) {
  const windows = process.platform === "win32" && !process.env.TEAMLEAD_TEST_BASH
  const script = path.join(scriptRoot, `${uninstall ? "uninstall" : "install"}.${windows ? "ps1" : "sh"}`)
  const parameters = windows ? args : args.map((arg) => arg.replaceAll("\\", "/"))
  return spawnSync(windows ? "pwsh" : process.env.TEAMLEAD_TEST_BASH || "bash", windows ? ["-NoProfile", "-File", script, ...parameters] : [script.replaceAll("\\", "/"), ...parameters], { encoding: "utf8", ...options, ...(options.input && !windows ? { input: options.input.replaceAll("\\", "/") } : {}) })
}

const scopeArgs = (scope, project) => process.platform === "win32" && !process.env.TEAMLEAD_TEST_BASH
  ? ["-InstallScope", scope === "global" ? "Global" : "Local", ...(project ? ["-Project", project] : [])]
  : ["--scope", scope, ...(project ? ["--project", project] : [])]

test("update reads the distribution version and preserves project settings", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-version-"))
  const project = path.join(tmp, "project with spaces")
  const distribution = path.join(tmp, "distribution")
  try {
    await fs.mkdir(project)
    lifecycle(project)
    const settings = '{"strategy":"quality","language":"ru"}\n'
    await fs.writeFile(path.join(project, ".opencode", "teamlead.json"), settings)
    await fs.mkdir(distribution)
    for (const name of ["payload", "scripts", "install.ps1", "install.sh"]) await fs.cp(path.join(root, name), path.join(distribution, name), { recursive: true })
    await fs.writeFile(path.join(distribution, "package.json"), '{"version":"9.8.7"}')
    const result = entry(distribution, scopeArgs("local", project))
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.match(result.stdout, /9\.8\.7/)
    assert.equal(JSON.parse(await fs.readFile(path.join(project, ".opencode", ".teamlead-install.json"), "utf8")).version, "9.8.7")
    assert.equal(await fs.readFile(path.join(project, ".opencode", "teamlead.json"), "utf8"), settings)
  } finally { await fs.rm(tmp, { recursive: true, force: true }) }
})

test("standalone installer and uninstaller prompt for scope and local project", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-menu-"))
  const project = path.join(tmp, "project with spaces")
  try {
    await fs.mkdir(project)
    const install = entry(root, [], { cwd: tmp, input: `1\n1\n${project}\n` })
    assert.equal(install.status, 0, install.stderr || install.stdout)
    await fs.access(path.join(project, ".opencode", "plugins", "teamlead.ts"))
    const uninstall = entry(root, [], { cwd: tmp, input: `1\n1\n${project}\n` }, true)
    assert.equal(uninstall.status, 0, uninstall.stderr || uninstall.stdout)
    assert.match(uninstall.stdout, /removed|uninstall|удал/i)
    await assert.rejects(fs.access(path.join(project, ".opencode")))
  } finally { await fs.rm(tmp, { recursive: true, force: true }) }
})

test("uninstall removes registered Git worktrees and installer-created dependency artifacts", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-remove-worktrees-"))
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: tmp, encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout
  }
  try {
    git("init")
    git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "initial")
    lifecycle(tmp)
    const oc = path.join(tmp, ".opencode")
    // Git canonicalizes Windows drive letters; the caller's spelling can differ.
    const worktree = path.join(oc, ".teamlead", "worktrees", "orphan")
    await fs.mkdir(path.dirname(worktree), { recursive: true })
    git("worktree", "add", "--detach", worktree, "HEAD")
    await fs.mkdir(path.join(oc, "node_modules", "@opencode-ai", "plugin"), { recursive: true })
    await fs.writeFile(path.join(oc, "bun.lock"), "generated dependency lock")
    const removal = lifecycle(process.platform === "win32" ? tmp.replace(/^[a-z]:/i, (drive) => drive.toLowerCase()) : tmp, true)
    const remaining = git("worktree", "list", "--porcelain")
    assert.equal(remaining.includes("orphan"), false, `${removal}\n${remaining}`)
    await assert.rejects(fs.access(oc))
  } finally { await fs.rm(tmp, { recursive: true, force: true }) }
})

test("global uninstall clears registered projects but preserves independent local installations", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-global-projects-"))
  const global = path.join(tmp, "global")
  const projects = [path.join(tmp, "global-project"), path.join(tmp, "local-project")]
  try {
    for (const project of projects) await fs.mkdir(project)
    const env = { ...process.env, OPENCODE_CONFIG_DIR: global }
    lifecycle(tmp, false, "global", env)
    const { registerGlobalProject } = await import("../payload/.opencode/teamlead/install-registry.ts")
    await Promise.all(projects.map((project) => registerGlobalProject(project, global)))
    for (const project of projects) await fs.writeFile(path.join(project, ".opencode", "teamlead.json"), '{"language":"ru"}')
    lifecycle(projects[1])
    const result = entry(root, scopeArgs("global"), { env }, true)
    assert.equal(result.status, 0, result.stderr || result.stdout)
    await assert.rejects(fs.access(global))
    await assert.rejects(fs.access(path.join(projects[0], ".opencode")))
    await fs.access(path.join(projects[1], ".opencode", "plugins", "teamlead.ts"))
    assert.equal(await fs.readFile(path.join(projects[1], ".opencode", "teamlead.json"), "utf8"), '{"language":"ru"}')
  } finally { await fs.rm(tmp, { recursive: true, force: true }) }
})

test("global cleanup rejects forged registry entries before removing installed code", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-registry-forgery-"))
  const global = path.join(tmp, "global")
  const victim = path.join(tmp, "victim")
  try {
    const env = { ...process.env, OPENCODE_CONFIG_DIR: global }
    lifecycle(tmp, false, "global", env)
    await fs.mkdir(path.join(victim, ".opencode", ".teamlead"), { recursive: true })
    await fs.writeFile(path.join(victim, ".opencode", "teamlead.json"), "keep")
    await fs.mkdir(path.join(global, ".teamlead-projects"), { recursive: true })
    await fs.writeFile(path.join(global, ".teamlead-projects", "forged.json"), JSON.stringify({ project: victim, installationId: "forged" }))
    const result = entry(root, scopeArgs("global"), { env }, true)
    assert.notEqual(result.status, 0)
    await fs.access(path.join(global, "plugins", "teamlead.ts"))
    assert.equal(await fs.readFile(path.join(victim, ".opencode", "teamlead.json"), "utf8"), "keep")
  } finally { await fs.rm(tmp, { recursive: true, force: true }) }
})

test("global registration is concurrent, survives repeated installs and skips internal worktrees", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-concurrent-registry-"))
  const global = path.join(tmp, "global")
  try {
    const env = { ...process.env, OPENCODE_CONFIG_DIR: global }
    lifecycle(tmp, false, "global", env)
    const projects = await Promise.all(Array.from({ length: 8 }, async (_, index) => {
      const project = path.join(tmp, `project-${index}`)
      await fs.mkdir(project)
      return project
    }))
    const { registerGlobalProject } = await import("../payload/.opencode/teamlead/install-registry.ts")
    await Promise.all(projects.map((project) => registerGlobalProject(project, global)))
    const before = JSON.parse(await fs.readFile(path.join(global, ".teamlead-install.json"), "utf8")).installationId
    lifecycle(tmp, false, "global", env)
    assert.equal(JSON.parse(await fs.readFile(path.join(global, ".teamlead-install.json"), "utf8")).installationId, before)
    await registerGlobalProject(path.join(projects[0], ".opencode", ".teamlead", "worktrees", "worker"), global)
    assert.equal((await fs.readdir(path.join(global, ".teamlead-projects"))).length, 8)
    lifecycle(tmp, true, "global", env)
    for (const project of projects) await assert.rejects(fs.access(path.join(project, ".opencode")))
  } finally { await fs.rm(tmp, { recursive: true, force: true }) }
})

test("installer rejects linked owned files before overwriting a file outside the target", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-owned-link-"))
  try {
    const outside = path.join(tmp, "outside.md")
    const target = path.join(tmp, "project")
    await fs.mkdir(path.join(target, ".opencode", "commands"), { recursive: true })
    await fs.writeFile(outside, "keep")
    try { await fs.symlink(outside, path.join(target, ".opencode", "commands", "lead.md")) }
    catch (error) { if (process.platform === "win32" && error.code === "EPERM") return; throw error }
    const result = entry(root, scopeArgs("local", target))
    assert.notEqual(result.status, 0)
    assert.equal(await fs.readFile(outside, "utf8"), "keep")
    await assert.rejects(fs.access(path.join(target, ".opencode", "plugins", "teamlead.ts")))
  } finally { await fs.rm(tmp, { recursive: true, force: true }) }
})

test("installer updates owned files and uninstall removes TeamLead while preserving user files", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-lifecycle-"))
  const oc = path.join(tmp, ".opencode")
  try {
    await fs.mkdir(path.join(oc, "commands"), { recursive: true })
    await fs.writeFile(path.join(oc, "commands", "my-command.md"), "user command")
    const originalPackage = { private: false, dependencies: { other: "1.0.0", "@opencode-ai/plugin": "original" } }
    await fs.writeFile(path.join(oc, "package.json"), JSON.stringify(originalPackage))
    await fs.writeFile(path.join(oc, "tui.jsonc"), '{\n// keep this comment\n"theme":"custom", "plugin":["other.ts"],\n}\n')
    lifecycle(tmp)
    await fs.writeFile(path.join(oc, "teamlead", "language.json"), '{"language":"ru"}')
    await fs.writeFile(path.join(oc, "agents", "teamlead-obsolete.md"), "obsolete")
    await fs.writeFile(path.join(oc, "commands", "lead-obsolete.md"), "obsolete")
    const metadataFile = path.join(oc, ".teamlead-install.json")
    const metadata = JSON.parse(await fs.readFile(metadataFile, "utf8"))
    metadata.commands.push("lead-obsolete.md")
    await fs.writeFile(metadataFile, JSON.stringify(metadata))
    await fs.writeFile(path.join(oc, "teamlead", "obsolete.ts"), "obsolete")
    await fs.writeFile(path.join(oc, "plugins", "teamlead.ts"), "old code")
    assert.match(lifecycle(tmp), /Updated|Обновл/)
    await assert.rejects(fs.access(path.join(oc, "agents", "teamlead-obsolete.md")))
    await assert.rejects(fs.access(path.join(oc, "commands", "lead-obsolete.md")))
    await assert.rejects(fs.access(path.join(oc, "teamlead", "obsolete.ts")))
    assert.equal(JSON.parse(await fs.readFile(path.join(oc, "teamlead", "language.json"), "utf8")).language, "ru")
    assert.equal(await fs.readFile(path.join(oc, "plugins", "teamlead.ts"), "utf8"), await fs.readFile(path.join(root, "payload", ".opencode", "plugins", "teamlead.ts"), "utf8"))
    await fs.mkdir(path.join(oc, ".teamlead"), { recursive: true })
    await fs.writeFile(path.join(oc, ".teamlead", "state.json"), "{}")
    lifecycle(tmp, true)
    lifecycle(tmp, true)
    for (const rel of ["teamlead", "teamlead.json", ".teamlead", ".teamlead-install.json", "plugins/teamlead.ts", "commands/lead.md", "agents/teamlead-lead.md"])
      await assert.rejects(fs.access(path.join(oc, rel)))
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(oc, "package.json"), "utf8")), originalPackage)
    assert.equal(await fs.readFile(path.join(oc, "commands", "my-command.md"), "utf8"), "user command")
    const tui = await fs.readFile(path.join(oc, "tui.jsonc"), "utf8")
    assert.match(tui, /keep this comment/)
    assert.match(tui, /other.ts/)
    assert.doesNotMatch(tui, /teamlead/)
  } finally { await fs.rm(tmp, { recursive: true, force: true }) }
})

test("fresh uninstall removes installer-created configuration and global uninstall stays project-local", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-uninstall-"))
  try {
    lifecycle(tmp)
    lifecycle(tmp, true)
    await assert.rejects(fs.access(path.join(tmp, ".opencode")))
    const global = path.join(tmp, "global")
    const env = { ...process.env, OPENCODE_CONFIG_DIR: global }
    lifecycle(tmp, false, "global", env)
    await fs.mkdir(path.join(tmp, ".opencode", ".teamlead"), { recursive: true })
    lifecycle(tmp, true, "global", env)
    await assert.rejects(fs.access(global))
    await fs.access(path.join(tmp, ".opencode", ".teamlead"))
  } finally { await fs.rm(tmp, { recursive: true, force: true }) }
})
test("uninstall removes duplicate TUI registrations and rejects linked shared directories", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-uninstall-links-"))
  const oc = path.join(tmp, ".opencode")
  const outside = path.join(tmp, "outside")
  try {
    lifecycle(tmp)
    await fs.writeFile(path.join(oc, "tui.json"), '{"plugin":["other.ts","./teamlead/tui.tsx","./teamlead/tui.tsx"]}')
    lifecycle(tmp, true)
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(oc, "tui.json"), "utf8")).plugin, ["other.ts"])
    await fs.mkdir(outside)
    await fs.mkdir(oc, { recursive: true })
    await fs.symlink(outside, path.join(oc, "commands"), process.platform === "win32" ? "junction" : "dir")
    await fs.writeFile(path.join(outside, "lead.md"), "keep")
    const result = spawnSync(process.execPath, [path.join(root, "scripts", "merge-tui.mjs"), oc, "uninstall"], { encoding: "utf8" })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Linked installer path/)
    assert.equal(await fs.readFile(path.join(outside, "lead.md"), "utf8"), "keep")
  } finally { await fs.rm(tmp, { recursive: true, force: true }) }
})
