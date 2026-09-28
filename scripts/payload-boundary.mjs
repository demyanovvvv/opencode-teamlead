import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const payload = path.join(root, "payload", ".opencode")

async function walk(directory, relative = "") {
  const result = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const rel = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) result.push(...await walk(path.join(directory, entry.name), rel))
    else if (entry.isFile()) result.push(rel)
  }
  return result
}

const files = await walk(payload)
const packageJSON = JSON.parse(await fs.readFile(path.join(payload, "package.json"), "utf8"))
assert.equal(packageJSON.dependencies?.["@opencode-ai/plugin"], ">=1.18.30 <2.0.0", "Payload SDK range must remain OpenCode 1.x compatible")
assert.equal(files.some((file) => file.startsWith("skills/") || file.startsWith(".agents/")), false, "Contributor skills must not be installed into payload")
assert.equal(files.some((file) => file.includes("CONTRIBUTING.md") || file.includes("STATE_AND_RECOVERY.md")), false, "Contributor docs must not be installed into payload")
assert.equal(files.some((file) => file.startsWith(".teamlead/") || file.includes("/.teamlead/")), false, "Runtime state must not be installed into payload")
for (const required of [
  "plugins/teamlead.ts",
  "teamlead/tui.tsx",
  "teamlead/config.ts",
  "teamlead/git.ts",
  "teamlead/process.ts",
  "teamlead/runtime.ts",
  "teamlead/security.ts",
  "teamlead/state.ts",
  "commands/lead.md",
  "commands/lead-doctor.md",
  "commands/lead-plan.md",
  "agents/teamlead-lead.md",
  "agents/teamlead-reviewer.md",
]) assert.ok(files.includes(required), `Required payload file is missing: ${required}`)
console.log(`Payload boundary OK (${files.length} files)`)
