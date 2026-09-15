import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")

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
