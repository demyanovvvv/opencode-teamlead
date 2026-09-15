import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { loadState, updateState, upsertRun } from "../payload/.opencode/teamlead/state.ts"

async function root() {
  const value = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-state-"))
  await fs.mkdir(path.join(value, ".opencode", ".teamlead"), { recursive: true })
  return value
}

function run(id) {
  const now = Date.now()
  return {
    id,
    goal: id,
    mode: "direct",
    status: "completed",
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    completedAt: now,
    reviewLevel: 0,
    repairRound: 0,
    estimatedTokens: 0,
    estimatedCostUsd: 0,
    finalVerification: [],
    tasks: {},
  }
}

test("loadState discards malformed records without discarding valid records", async () => {
  const project = await root()
  try {
    const file = path.join(project, ".opencode", ".teamlead", "state.json")
    await fs.writeFile(file, JSON.stringify({
      schemaVersion: 2,
      runs: { valid: run("valid"), invalid: { id: "invalid", status: "surprise" }, malformedPatch: { ...run("malformedPatch"), integration: { phase: "verified", patchBase64: 42, patchSha256: "bad" } } },
      evidence: { good: { attempts: 1, passes: 1, repairs: 0, failures: 0, runtimeErrors: 0, totalMs: 2 }, bad: { attempts: -1 } },
      providerCircuits: { good: { failures: 1, openedUntil: 0 }, bad: { failures: "many" } },
    }))
    const state = await loadState(project)
    assert.deepEqual(Object.keys(state.runs), ["valid"])
    assert.deepEqual(Object.keys(state.evidence), ["good"])
    assert.deepEqual(Object.keys(state.providerCircuits), ["good"])
  } finally { await fs.rm(project, { recursive: true, force: true }) }
})

test("loadState discards a run with malformed nested task state", async () => {
  const project = await root()
  try {
    const file = path.join(project, ".opencode", ".teamlead", "state.json")
    await fs.writeFile(file, JSON.stringify({
      schemaVersion: 2,
      runs: {
        valid: run("valid"),
        malformed: { ...run("malformed"), tasks: { T1: { status: "completed", changedFiles: "src/a.ts" } } },
      },
      evidence: {},
      providerCircuits: {},
    }))
    assert.deepEqual(Object.keys((await loadState(project)).runs), ["valid"])
  } finally { await fs.rm(project, { recursive: true, force: true }) }
})

test("loadState discards a run with malformed review state", async () => {
  const project = await root()
  try {
    const file = path.join(project, ".opencode", ".teamlead", "state.json")
    await fs.writeFile(file, JSON.stringify({
      schemaVersion: 2,
      runs: {
        valid: run("valid"),
        malformed: { ...run("malformed"), review: { verdict: "repair", summary: 42, findings: [] } },
      },
      evidence: {},
      providerCircuits: {},
    }))
    assert.deepEqual(Object.keys((await loadState(project)).runs), ["valid"])
  } finally { await fs.rm(project, { recursive: true, force: true }) }
})

test("loadState rejects unsupported state schema versions", async () => {
  const project = await root()
  try {
    await fs.writeFile(path.join(project, ".opencode", ".teamlead", "state.json"), JSON.stringify({ schemaVersion: 99, runs: { bad: run("bad") } }))
    assert.deepEqual(await loadState(project), { schemaVersion: 2, runs: {}, evidence: {}, providerCircuits: {} })
  } finally { await fs.rm(project, { recursive: true, force: true }) }
})

test("concurrent updateState calls preserve independent runs", async () => {
  const project = await root()
  try {
    await Promise.all(Array.from({ length: 12 }, (_, index) => updateState(project, (state) => {
      upsertRun(state, run(`run-${index}`))
    })))
    const state = await loadState(project)
    assert.equal(Object.keys(state.runs).length, 12)
  } finally { await fs.rm(project, { recursive: true, force: true }) }
})

test("updateState reclaims an old lock owned by a dead process", async () => {
  const project = await root()
  try {
    const lock = path.join(project, ".opencode", ".teamlead", "state.lock")
    await fs.writeFile(lock, JSON.stringify({ pid: 999999, token: "dead", at: 0 }))
    const old = new Date(Date.now() - 11 * 60_000)
    await fs.utimes(lock, old, old)
    await updateState(project, (state) => upsertRun(state, run("recovered")))
    assert.deepEqual(Object.keys((await loadState(project)).runs), ["recovered"])
  } finally { await fs.rm(project, { recursive: true, force: true }) }
})

test("updateState reclaims an old malformed lock", { timeout: 35_000 }, async () => {
  const project = await root()
  try {
    const lock = path.join(project, ".opencode", ".teamlead", "state.lock")
    await fs.writeFile(lock, "{")
    const old = new Date(Date.now() - 11 * 60_000)
    await fs.utimes(lock, old, old)
    await updateState(project, (state) => upsertRun(state, run("recovered-malformed")))
    assert.deepEqual(Object.keys((await loadState(project)).runs), ["recovered-malformed"])
  } finally { await fs.rm(project, { recursive: true, force: true }) }
})

test("state lock records its hostname for cross-host ownership checks", async () => {
  const project = await root()
  try {
    await updateState(project, async () => {
      const lock = JSON.parse(await fs.readFile(path.join(project, ".opencode", ".teamlead", "state.lock"), "utf8"))
      assert.equal(lock.hostname, os.hostname())
    })
  } finally { await fs.rm(project, { recursive: true, force: true }) }
})
