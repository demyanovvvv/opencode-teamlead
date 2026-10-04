import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

async function read(relative) {
  return fs.readFile(path.join(root, relative), "utf8")
}

async function exists(relative) {
  try {
    await fs.access(path.join(root, relative))
    return true
  } catch {
    return false
  }
}

const rootRules = await read("AGENTS.md")
const contributing = await read("CONTRIBUTING.md")
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

for (const heading of [
  "## Rule precedence",
  "## Repository map",
  "## Source and payload boundaries",
  "## Standard development workflow",
  "## Change classes and minimum validation",
  "## Runtime and security invariants",
  "## Documentation synchronization",
  "## Completion criteria",
]) {
  assert.match(rootRules, new RegExp(`^${escaped(heading)}$`, "m"), `AGENTS.md is missing ${heading}`)
}

for (const required of ["AGENTS.md", "npm run rules:check", "npm run verify"]) {
  assert.match(contributing, new RegExp(escaped(required)), `CONTRIBUTING.md is missing ${required}`)
}

for (const required of [
  "AGENTS.md",
  ".opencode/skills/teamlead-runtime-development/SKILL.md",
  ".opencode/skills/teamlead-security-review/SKILL.md",
  ".opencode/skills/teamlead-release-validation/SKILL.md",
]) {
  assert.equal(await exists(required), true, `Required rules file is missing: ${required}`)
}

const payloadFiles = await fs.readdir(path.join(root, "payload", ".opencode"), { withFileTypes: true })
assert.equal(payloadFiles.some((entry) => entry.name === "skills" || entry.name === ".agents"), false, "Contributor skill directories must not be shipped")

console.log("Rules structure check passed")