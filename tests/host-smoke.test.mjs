import test from "node:test"
import assert from "node:assert/strict"
import { parseArgs } from "../scripts/host-smoke.mjs"

test("host smoke argument parsing validates command and timeout", () => {
  assert.deepEqual(parseArgs(["--command", "lead-plan", "--timeout-ms", "5000", "--keep-project"]), {
    command: "lead-plan",
    timeoutMs: 5000,
    keepProject: true,
  })
  assert.throws(() => parseArgs(["--command", "../unsafe"]), /lead-doctor, lead-plan, or lead-models/)
  assert.throws(() => parseArgs(["--timeout-ms", "999"]), /between 1000/)
})
