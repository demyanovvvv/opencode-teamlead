export type Strategy = "fast" | "balanced" | "economy" | "quality"
export type ExecutionMode = "direct" | "managed" | "team"
export type WorkerRole = "codeWorker" | "fileWorker" | "searchWorker" | "alternateWorker"
export type ModelRole = "orchestrator" | "reviewer" | WorkerRole
export type TaskKind = "code" | "debug" | "tests" | "refactor" | "search" | "research" | "files" | "docs"
export type Complexity = "simple" | "normal" | "hard" | "critical"

export interface TaskSpec {
  id: string
  description: string
  dependsOn?: string[]
  worker?: WorkerRole
  kind?: TaskKind
  complexity?: Complexity
  estimatedTokens?: number
  requiresTools?: boolean
  readOnly?: boolean
  readScope?: string[]
  writeScope?: string[]
  risks?: string[]
  provides?: string[]
  consumes?: string[]
}

export interface TaskProfile extends TaskSpec {
  worker: WorkerRole
  kind: TaskKind
  complexity: Complexity
  estimatedTokens: number
  requiresTools: boolean
  readOnly: boolean
  readScope: string[]
  writeScope: string[]
  risks: string[]
  confidence: number
}

export interface ModelProfileConfig {
  disabled?: boolean
  preference?: number
  strengths?: string[]
}

export interface TrustedCheck {
  id: string
  executable: string
  args: string[]
  paths?: string[]
  contracts?: string[]
  taskKinds?: TaskKind[]
  timeoutMs?: number
  fullSuite?: boolean
  critical?: boolean
}

export interface TeamLeadConfig {
  schemaVersion: 2
  language: "en" | "ru"
  strategy: Strategy
  models: Record<ModelRole, string | null>
  workerPools: Record<WorkerRole, string[]>
  modelProfiles: Record<string, ModelProfileConfig>
  maxParallelWorkers: number
  providerConcurrency: Record<string, number>
  maxAttemptsPerTask: number
  maxRepairRounds: number
  review: {
    enabled: boolean
    mediumLevel: 0 | 1 | 2
    criticalLevel: 0 | 1 | 2
  }
  budget: {
    maxCostUsd: number
    maxTokens: number
    maxRunMinutes: number
    softRatio: number
  }
  verification: {
    autoDetect: boolean
    finalFullSuite: boolean
    checks: TrustedCheck[]
  }
}

export interface CatalogModel {
  id: string
  providerID: string
  modelID: string
  name?: string
  connected: boolean
  toolCall?: boolean
  context?: number
  inputCost?: number
  outputCost?: number
}

export interface ModelEvidence {
  attempts: number
  passes: number
  repairs: number
  failures: number
  runtimeErrors: number
  totalMs: number
}

export interface ProviderCircuit {
  failures: number
  openedUntil: number
  lastFailure?: string
}

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled"

export interface RunTaskState {
  task: TaskProfile
  status: TaskStatus
  model?: string
  provider?: string
  sessionID?: string
  attempts: number
  changedFiles: string[]
  verification: VerificationResult[]
  integration?: {
    phase: "verified" | "integrated"
    patchBase64: string
    patchSha256: string
  }
  error?: string
}

export interface VerificationResult {
  id: string
  command: string
  ok: boolean
  exitCode: number | null
  durationMs: number
  stdout: string
  stderr: string
  timedOut?: boolean
}

export interface ReviewFinding {
  description: string
  severity: "low" | "medium" | "high" | "critical"
  paths: string[]
}

export interface ReviewSubmission {
  verdict: "pass" | "repair" | "fail"
  summary: string
  findings: ReviewFinding[]
}

export interface PlanSubmission {
  tasks: TaskSpec[]
  rationale?: string
}

export interface RunState {
  id: string
  goal: string
  mode: ExecutionMode
  status: "planned" | "running" | "review" | "repair" | "repair_required" | "completed" | "failed" | "cancelled"
  phase?: "verification"
  parentSessionID?: string
  createdAt: number
  updatedAt: number
  startedAt?: number
  completedAt?: number
  reviewLevel: 0 | 1 | 2
  repairRound: number
  estimatedTokens: number
  estimatedCostUsd: number
  finalVerification: VerificationResult[]
  tasks: Record<string, RunTaskState>
  error?: string
  review?: ReviewSubmission
}

export interface PersistentState {
  schemaVersion: 2
  runs: Record<string, RunState>
  evidence: Record<string, ModelEvidence>
  providerCircuits: Record<string, ProviderCircuit>
}

export interface RouteDecision {
  model: CatalogModel
  score: number
  estimatedCostUsd: number
  reasons: string[]
}
