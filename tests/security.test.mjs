import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("release security scan passes for payload and installers", () => {
  const result = spawnSync(process.execPath, ["scripts/security-scan.mjs"], { cwd: root, encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /Security scan OK/)
})
