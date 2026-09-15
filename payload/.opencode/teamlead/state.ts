import fs from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"
import os from "node:os"
import type { PersistentState, RunState } from "./types.ts"

export const EMPTY_STATE: PersistentState = { schemaVersion: 2, runs: {}, evidence: {}, providerCircuits: {} }

function dir(root: string) { return path.join(root, ".opencode", ".teamlead") }
function file(root: string) { return path.join(dir(root), "state.json") }

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function validVerification(value: unknown): boolean {
  if (!record(value)) return false
  return typeof value.id === "string" && typeof value.command === "string" && typeof value.ok === "boolean" &&
    (value.exitCode === null || Number.isInteger(value.exitCode)) && finiteNonNegative(value.durationMs) &&
    typeof value.stdout === "string" && typeof value.stderr === "string" &&
    (value.timedOut === undefined || typeof value.timedOut === "boolean")
}

function validReview(value: unknown): boolean {
  if (!record(value) || !["pass", "repair", "fail"].includes(String(value.verdict)) || typeof value.summary !== "string") return false
  if (!Array.isArray(value.findings)) return false
  return value.findings.every((finding) => record(finding) && typeof finding.description === "string" &&
    ["low", "medium", "high", "critical"].includes(String(finding.severity)) && strings(finding.paths))
}

function validTask(value: unknown, key: string): boolean {
  if (!record(value) || value.id !== key || typeof value.description !== "string") return false
  if (!["codeWorker", "fileWorker", "searchWorker", "alternateWorker"].includes(String(value.worker))) return false
  if (!["code", "debug", "tests", "refactor", "search", "research", "files", "docs"].includes(String(value.kind))) return false
  if (!["simple", "normal", "hard", "critical"].includes(String(value.complexity))) return false
  if (!finiteNonNegative(value.estimatedTokens) || typeof value.requiresTools !== "boolean" || typeof value.readOnly !== "boolean") return false
  if (!strings(value.readScope) || !strings(value.writeScope) || !strings(value.risks) || !finiteNonNegative(value.confidence)) return false
  return (value.dependsOn === undefined || strings(value.dependsOn)) && (value.provides === undefined || strings(value.provides)) && (value.consumes === undefined || strings(value.consumes))
}

function validRunTask(value: unknown, key: string): boolean {
  if (!record(value) || !validTask(value.task, key)) return false
  if (!["pending", "running", "completed", "failed", "cancelled"].includes(String(value.status))) return false
  if (!Number.isInteger(value.attempts) || (value.attempts as number) < 0 || !strings(value.changedFiles)) return false
  if (!Array.isArray(value.verification) || !value.verification.every(validVerification) || !validIntegration(value.integration)) return false
  return (value.model === undefined || typeof value.model === "string") && (value.provider === undefined || typeof value.provider === "string") &&
    (value.sessionID === undefined || typeof value.sessionID === "string") && (value.error === undefined || typeof value.error === "string")
}

function validRun(value: unknown, key: string): value is RunState {
  if (!record(value) || value.id !== key || typeof value.goal !== "string") return false
  if (!["direct", "managed", "team"].includes(String(value.mode))) return false
  if (!["planned", "running", "review", "repair", "repair_required", "completed", "failed", "cancelled"].includes(String(value.status))) return false
  if (!finiteNonNegative(value.createdAt) || !finiteNonNegative(value.updatedAt)) return false
  if (![0, 1, 2].includes(value.reviewLevel as number) || !Number.isInteger(value.repairRound) || (value.repairRound as number) < 0) return false
  if (!finiteNonNegative(value.estimatedTokens) || !finiteNonNegative(value.estimatedCostUsd)) return false
  return record(value.tasks) && Object.entries(value.tasks).every(([taskID, task]) => validRunTask(task, taskID)) &&
    Array.isArray(value.finalVerification) && value.finalVerification.every(validVerification) && validIntegration(value.integration) &&
    (value.review === undefined || validReview(value.review))
}

function validEvidence(value: unknown): boolean {
  if (!record(value)) return false
  return ["attempts", "passes", "repairs", "failures", "runtimeErrors", "totalMs"].every((key) => finiteNonNegative(value[key]))
}

function validCircuit(value: unknown): boolean {
  return record(value) && finiteNonNegative(value.failures) && finiteNonNegative(value.openedUntil) && (value.lastFailure === undefined || typeof value.lastFailure === "string")
}

function validIntegration(value: unknown): boolean {
  if (value === undefined) return true
  return record(value) && ["verified", "integrated"].includes(String(value.phase)) && typeof value.patchBase64 === "string" && /^[0-9a-f]{64}$/.test(String(value.patchSha256))
}

function sanitizeState(raw: unknown): PersistentState {
  const source = record(raw) ? raw : {}
  if (source.schemaVersion !== undefined && source.schemaVersion !== 2) return structuredClone(EMPTY_STATE)
  const runs = record(source.runs) ? Object.fromEntries(Object.entries(source.runs).filter(([key, value]) => validRun(value, key))) : {}
  const evidence = record(source.evidence) ? Object.fromEntries(Object.entries(source.evidence).filter(([, value]) => validEvidence(value))) : {}
  const providerCircuits = record(source.providerCircuits) ? Object.fromEntries(Object.entries(source.providerCircuits).filter(([, value]) => validCircuit(value))) : {}
  return { schemaVersion: 2, runs, evidence, providerCircuits } as PersistentState
}

export async function loadState(root: string): Promise<PersistentState> {
  try {
    return sanitizeState(JSON.parse(await fs.readFile(file(root), "utf8")))
  } catch { return structuredClone(EMPTY_STATE) }
}

export async function saveState(root: string, state: PersistentState): Promise<void> {
  await fs.mkdir(dir(root), { recursive: true })
  const target = file(root)
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(state, null, 2) + "\n")
  await fs.rename(tmp, target)
}

async function acquireStateLock(root: string): Promise<() => Promise<void>> {
  const lock = path.join(dir(root), "state.lock")
  const token = crypto.randomBytes(16).toString("hex")
  await fs.mkdir(dir(root), { recursive: true })
  const deadline = Date.now() + 30_000
  for (;;) {
    try {
      const handle = await fs.open(lock, "wx")
      await handle.writeFile(JSON.stringify({ pid: process.pid, hostname: os.hostname(), token, at: Date.now() }))
      await handle.close()
      return async () => {
        try {
          const owner = JSON.parse(await fs.readFile(lock, "utf8")) as { token?: string }
          if (owner.token === token) await fs.rm(lock, { force: true })
        } catch {}
      }
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error
      try {
        const stat = await fs.stat(lock)
        if (Date.now() - stat.mtimeMs > 10 * 60_000) {
          let alive = false
          try {
            const owner = JSON.parse(await fs.readFile(lock, "utf8")) as { pid?: number; hostname?: string }
            if (typeof owner.hostname === "string" && owner.hostname !== os.hostname()) alive = true
            else if (owner.pid === process.pid) alive = true
            else if (typeof owner.pid === "number") {
              try { process.kill(owner.pid, 0); alive = true } catch (signalError: any) { alive = signalError?.code === "EPERM" }
            }
          } catch {}
          if (!alive) { await fs.rm(lock, { force: true }); continue }
        }
      } catch {}
      if (Date.now() >= deadline) throw new Error("Timed out waiting for TeamLead state lock")
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
}

export async function updateState(root: string, mutation: (state: PersistentState) => void | Promise<void>): Promise<PersistentState> {
  const release = await acquireStateLock(root)
  try {
    const state = await loadState(root)
    await mutation(state)
    await saveState(root, state)
    return state
  } finally { await release() }
}

export async function appendEvent(root: string, event: Record<string, unknown>): Promise<void> {
  await fs.mkdir(dir(root), { recursive: true })
  await fs.appendFile(path.join(dir(root), "events.jsonl"), JSON.stringify({ time: Date.now(), ...event }) + "\n")
}

export function upsertRun(state: PersistentState, run: RunState): void {
  run.updatedAt = Date.now()
  state.runs[run.id] = run
  const ids = Object.values(state.runs).sort((a, b) => b.updatedAt - a.updatedAt)
  for (const old of ids.slice(100)) delete state.runs[old.id]
}

export function recordModelOutcome(state: PersistentState, model: string, outcome: "pass" | "repair" | "failure" | "runtime_error", durationMs: number): void {
  const e = state.evidence[model] ?? { attempts: 0, passes: 0, repairs: 0, failures: 0, runtimeErrors: 0, totalMs: 0 }
  e.attempts++
  e.totalMs += Math.max(0, durationMs)
  if (outcome === "pass") e.passes++
  else if (outcome === "repair") e.repairs++
  else if (outcome === "runtime_error") e.runtimeErrors++
  else e.failures++
  state.evidence[model] = e
}

export function providerFailure(state: PersistentState, providerID: string, message: string): void {
  const c = state.providerCircuits[providerID] ?? { failures: 0, openedUntil: 0 }
  c.failures++
  c.lastFailure = message.slice(0, 500)
  if (c.failures >= 3) c.openedUntil = Date.now() + Math.min(5 * 60_000, 30_000 * 2 ** (c.failures - 3))
  state.providerCircuits[providerID] = c
}

export function providerSuccess(state: PersistentState, providerID: string): void {
  const c = state.providerCircuits[providerID]
  if (!c) return
  c.failures = Math.max(0, c.failures - 1)
  if (c.failures < 3) c.openedUntil = 0
}
