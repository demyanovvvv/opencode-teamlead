import fs from "node:fs/promises"
import path from "node:path"
import type { ModelRole, TeamLeadConfig, TrustedCheck, WorkerRole } from "./types.ts"

const modelRoles: ModelRole[] = ["orchestrator", "reviewer", "codeWorker", "fileWorker", "searchWorker", "alternateWorker"]
const workerRoles: WorkerRole[] = ["codeWorker", "fileWorker", "searchWorker", "alternateWorker"]

export const DEFAULT_CONFIG: TeamLeadConfig = {
  schemaVersion: 2,
  strategy: "balanced",
  models: {
    orchestrator: null,
    reviewer: null,
    codeWorker: null,
    fileWorker: null,
    searchWorker: null,
    alternateWorker: null,
  },
  workerPools: { codeWorker: [], fileWorker: [], searchWorker: [], alternateWorker: [] },
  modelProfiles: {},
  maxParallelWorkers: 6,
  providerConcurrency: {},
  maxAttemptsPerTask: 2,
  maxRepairRounds: 2,
  review: { enabled: true, mediumLevel: 1, criticalLevel: 2 },
  budget: { maxCostUsd: 0, maxTokens: 0, maxRunMinutes: 0, softRatio: 0.8 },
  verification: { autoDetect: true, finalFullSuite: true, checks: [] },
}

function number(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((x): x is string => typeof x === "string" && x.trim().length > 0))] : []
}

function sanitizeCheck(value: unknown): TrustedCheck | undefined {
  if (!value || typeof value !== "object") return
  const x = value as Record<string, unknown>
  if (typeof x.id !== "string" || typeof x.executable !== "string" || !Array.isArray(x.args)) return
  if (!x.args.every((arg) => typeof arg === "string")) return
  return {
    id: x.id,
    executable: x.executable,
    args: x.args as string[],
    paths: strings(x.paths),
    contracts: strings(x.contracts),
    taskKinds: strings(x.taskKinds) as TrustedCheck["taskKinds"],
    timeoutMs: number(x.timeoutMs, 600_000, 1_000, 3_600_000),
    fullSuite: x.fullSuite === true,
    critical: x.critical === true,
  }
}

export function migrateConfig(raw: unknown): TeamLeadConfig {
  const x = raw && typeof raw === "object" ? raw as Record<string, any> : {}
  const cfg = structuredClone(DEFAULT_CONFIG)
  const oldModels = x.models && typeof x.models === "object" ? x.models : {}
  const legacy: Record<string, unknown> = {
    orchestrator: oldModels.orchestrator ?? oldModels.lead ?? x.strongModel,
    reviewer: oldModels.reviewer ?? x.reviewerModel,
    codeWorker: oldModels.codeWorker ?? x.workerModel,
    fileWorker: oldModels.fileWorker,
    searchWorker: oldModels.searchWorker,
    alternateWorker: oldModels.alternateWorker,
  }
  for (const role of modelRoles) cfg.models[role] = typeof legacy[role] === "string" ? legacy[role] as string : null

  const pools = x.workerPools && typeof x.workerPools === "object" ? x.workerPools : {}
  for (const role of workerRoles) cfg.workerPools[role] = strings(pools[role]).slice(0, 32)

  if (["fast", "balanced", "economy", "quality"].includes(x.strategy)) cfg.strategy = x.strategy
  else if (["economy", "reliability", "context"].includes(x.router?.strategy)) cfg.strategy = x.router.strategy === "economy" ? "economy" : x.router.strategy === "reliability" ? "quality" : "balanced"

  if (x.modelProfiles && typeof x.modelProfiles === "object") {
    for (const [id, profile] of Object.entries(x.modelProfiles as Record<string, any>)) {
      if (!profile || typeof profile !== "object") continue
      cfg.modelProfiles[id] = {
        disabled: profile.disabled === true,
        preference: number(profile.preference, 1, 0.1, 10),
        strengths: strings(profile.strengths),
      }
    }
  }

  cfg.maxParallelWorkers = Math.round(number(x.maxParallelWorkers, cfg.maxParallelWorkers, 1, 32))
  cfg.maxAttemptsPerTask = Math.round(number(x.maxAttemptsPerTask, cfg.maxAttemptsPerTask, 1, 5))
  cfg.maxRepairRounds = Math.round(number(x.maxRepairRounds, cfg.maxRepairRounds, 0, 5))
  if (x.providerConcurrency && typeof x.providerConcurrency === "object") {
    for (const [id, limit] of Object.entries(x.providerConcurrency)) {
      const n = Math.round(number(limit, 0, 0, 32))
      if (n > 0) cfg.providerConcurrency[id] = n
    }
  }

  const review = x.review && typeof x.review === "object" ? x.review : {}
  cfg.review.enabled = review.enabled !== false
  cfg.review.mediumLevel = [0, 1, 2].includes(review.mediumLevel) ? review.mediumLevel : 1
  cfg.review.criticalLevel = [0, 1, 2].includes(review.criticalLevel) ? review.criticalLevel : 2

  const budget = x.budget && typeof x.budget === "object" ? x.budget : {}
  cfg.budget.maxCostUsd = number(budget.maxCostUsd, 0, 0)
  cfg.budget.maxTokens = Math.round(number(budget.maxTokens, 0, 0))
  cfg.budget.maxRunMinutes = number(budget.maxRunMinutes, 0, 0)
  cfg.budget.softRatio = number(budget.softRatio, 0.8, 0.1, 1)

  const verification = x.verification && typeof x.verification === "object" ? x.verification : {}
  cfg.verification.autoDetect = verification.autoDetect !== false
  cfg.verification.finalFullSuite = verification.finalFullSuite !== false
  const checks = Array.isArray(verification.checks) ? verification.checks.map(sanitizeCheck).filter(Boolean) as TrustedCheck[] : []
  cfg.verification.checks = checks
  // Security invariant: legacy raw gateCommands/command strings are intentionally discarded.
  return cfg
}

export function configPath(projectRoot: string): string {
  return path.join(projectRoot, ".opencode", "teamlead.json")
}

export async function loadConfig(projectRoot: string): Promise<TeamLeadConfig> {
  try {
    const raw = JSON.parse(await fs.readFile(configPath(projectRoot), "utf8"))
    return migrateConfig(raw)
  } catch {
    return structuredClone(DEFAULT_CONFIG)
  }
}

export async function saveConfig(projectRoot: string, config: TeamLeadConfig): Promise<void> {
  const file = configPath(projectRoot)
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(config, null, 2) + "\n", "utf8")
  await fs.rename(tmp, file)
}
