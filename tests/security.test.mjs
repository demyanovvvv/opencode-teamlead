import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRuntimeWorkerAgent } from "../payload/.opencode/teamlead/runtime.ts"
import { scanText } from "../scripts/security-scan.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("release security scan passes for payload and installers", () => {
  const result = spawnSync(process.execPath, ["scripts/security-scan.mjs"], { cwd: root, encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /Security scan OK/)
})
test("runtime workers deny skills and TeamLead recursion", () => {
  const agent = createRuntimeWorkerAgent({ id: "run-task", readOnly: false, writeScope: ["src/app.ts"] })
  assert.match(agent.content, /skill: deny/)
  assert.ok(agent.content.includes('"teamlead_*": deny'))
})

test("security scanner rejects direct child-process execution forms", () => {
  assert.throws(() => scanText('import { execFile } from "node:child_process"; execFile("git", [])'), /child_process/)
  assert.throws(() => scanText('const { execSync } = require("node:child_process"); execSync("git status")'), /child_process/)
  assert.throws(() => scanText('spawn("git", [], { shell: true })'), /shell:true/)
})
