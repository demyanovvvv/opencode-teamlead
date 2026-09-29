import test from "node:test"
import assert from "node:assert/strict"
import { summarizeRun, selectRun, formatIndicator } from "../payload/.opencode/teamlead/presentation.ts"
import { savePresentation } from "../payload/.opencode/teamlead/presentation.ts"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const run = (overrides = {}) => ({
  id: "run_one", goal: "Fix login", mode: "team", status: "running", parentSessionID: "session_a",
  createdAt: 1, updatedAt: 2, startedAt: 1, reviewLevel: 0, repairRound: 0,
  estimatedTokens: 120, estimatedCostUsd: 0.01, finalVerification: [],
  tasks: { a: { task: { id: "a" }, status: "completed", changedFiles: ["src/a.ts"], model: "p/m" }, b: { task: { id: "b" }, status: "running", changedFiles: [] } },
  ...overrides,
})

test("summary counts tasks without exposing persisted patches or provider logs", () => {
  const summary = summarizeRun(run({ tasks: { ...run().tasks, c: { task: { id: "c" }, status: "pending", changedFiles: [], integration: { patchBase64: "secret" } } } }))
  assert.equal(summary.completed, 1)
  assert.equal(summary.active, 1)
  assert.equal(summary.total, 3)
  assert.equal(JSON.stringify(summary).includes("secret"), false)
  assert.equal(formatIndicator(summary), "◐ TL 1/3 · team")
  assert.equal(formatIndicator(summary, true), "◐ TL 1/3")
  assert.equal(formatIndicator(summary, false, "ru"), "◐ TL 1/3 · команда")
})

test("selection prefers current session, and stale running records are not live", () => {
  const runs = [run({ id: "other", parentSessionID: "session_b", updatedAt: 9 }), run()]
  assert.equal(selectRun(runs, "session_a")?.id, "run_one")
  assert.equal(formatIndicator(summarizeRun(runs[1], false)), "! TL Interrupted")
  assert.equal(formatIndicator(summarizeRun(runs[1], false), false, "ru"), "! TL Прерван")
})

test("presentation persists several session runs without patch contents", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-display-"))
  try {
    await savePresentation(root, [run(), run({ id: "another", parentSessionID: "session_b" })], "run_one")
    const saved = JSON.parse(await fs.readFile(path.join(root, ".opencode", ".teamlead", "presentation.json"), "utf8"))
    assert.equal(saved.length, 2)
    assert.equal(saved.find((item) => item.id === "another").heartbeatAt, undefined)
    assert.equal(typeof saved.find((item) => item.id === "run_one").heartbeatAt, "number")
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})
