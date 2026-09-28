import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runProcess } from "../payload/.opencode/teamlead/process.ts"

test("runProcess honors a signal that was already aborted", async () => {
  const controller = new AbortController()
  controller.abort()
  const result = await runProcess(process.execPath, ["-e", "setTimeout(() => {}, 10_000)"], {
    cwd: path.resolve("."),
    abort: controller.signal,
    timeoutMs: 1_000,
  })
  assert.equal(result.timedOut, false)
  assert.ok(result.durationMs < 750, `pre-aborted process took ${result.durationMs}ms`)
})

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === "EPERM"
  }
}

async function waitForGone(pid, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return !isAlive(pid)
}

test("runProcess terminates the whole process tree on timeout", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-proc-tree-"))
  const pidFile = path.join(dir, "grandchild.pid")
  const parent = [
    "const { spawn } = require('node:child_process')",
    "const fs = require('node:fs')",
    "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })",
    `fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid))`,
    "setInterval(() => {}, 1000)",
  ].join(";")
  let grandchild
  try {
    const result = await runProcess(process.execPath, ["-e", parent], { cwd: dir, timeoutMs: 1_500 })
    assert.equal(result.timedOut, true)
    grandchild = Number((await fs.readFile(pidFile, "utf8")).trim())
    assert.ok(Number.isInteger(grandchild) && grandchild > 0, "expected the grandchild pid")
    assert.ok(await waitForGone(grandchild), `grandchild ${grandchild} survived the timeout kill`)
  } finally {
    if (grandchild) { try { process.kill(grandchild, "SIGKILL") } catch {} }
    await fs.rm(dir, { recursive: true, force: true })
  }
})
