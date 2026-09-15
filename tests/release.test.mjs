import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("release manifest excludes runtime TeamLead state", async () => {
  const runtimeDir = path.join(root, ".opencode", ".teamlead")
  await fs.mkdir(runtimeDir, { recursive: true })
  const marker = path.join(runtimeDir, `manifest-test-${process.pid}-${Date.now()}.json`)
  try {
    await fs.writeFile(marker, JSON.stringify({ secret: "runtime-only" }))
    const result = spawnSync(process.execPath, ["scripts/manifest.mjs", "--write"], { cwd: root, encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const manifest = await fs.readFile(path.join(root, "MANIFEST.sha256"), "utf8")
    assert.equal(manifest.includes(".opencode/.teamlead/"), false)
    assert.equal(manifest.includes(path.basename(marker)), false)
  } finally {
    await fs.rm(runtimeDir, { recursive: true, force: true })
    const restore = spawnSync(process.execPath, ["scripts/manifest.mjs", "--write"], { cwd: root, encoding: "utf8" })
    if (restore.status !== 0) throw new Error(restore.stderr || restore.stdout)
  }
})
