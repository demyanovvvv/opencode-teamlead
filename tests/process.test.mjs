import test from "node:test"
import assert from "node:assert/strict"
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
