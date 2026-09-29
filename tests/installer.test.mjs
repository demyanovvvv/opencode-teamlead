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
