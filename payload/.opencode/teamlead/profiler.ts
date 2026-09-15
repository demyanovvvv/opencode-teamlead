import type { Complexity, ExecutionMode, TaskKind, TaskProfile, TaskSpec, WorkerRole } from "./types.ts"
import { normalizeProjectPath } from "./glob.ts"

const PATH = /(?:`([^`]+)`|((?:\.?\.?\/)?(?:[A-Za-z0-9_.@-]+\/)+[A-Za-z0-9_.@*?\[\]-]+(?:\.[A-Za-z0-9]+)?))/g

export function inferPaths(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(PATH)) {
    const raw = (match[1] ?? match[2] ?? "").trim()
    if (!raw || raw.includes(" ") || /^(https?:|[A-Za-z]+:\/\/)/i.test(raw)) continue
    const normalized = normalizeProjectPath(raw)
    if (!normalized || normalized.startsWith("../") || normalized === "..") continue
    if (normalized.startsWith("/")) continue
    found.add(normalized)
  }
  return [...found].slice(0, 24)
}


function sanitizeScopeList(values: string[] | undefined, label: string): string[] | undefined {
  if (values === undefined) return undefined
  const out: string[] = []
  for (const raw of values) {
    if (typeof raw !== "string") throw new Error(`${label} entries must be strings`)
    const scope = normalizeProjectPath(raw.trim())
    const segments = scope.split("/")
    const repositoryWide = scope === "*" || scope === "**" || scope === "**/*"
    const unsafe = !scope || /[\x00-\x1F]/.test(scope) || scope.includes(":") || scope.startsWith("/") || /^[A-Za-z]:\//.test(scope) || segments.includes("..")
    if (unsafe || repositoryWide) throw new Error(`Unsafe or unbounded ${label}: ${raw}`)
    if (scope.length > 500) throw new Error(`${label} entry is too long`)
    out.push(scope)
  }
  return [...new Set(out)].slice(0, 64)
}

function has(text: string, re: RegExp): boolean { return re.test(text) }

function inferKind(text: string): TaskKind {
  if (has(text, /\b(test|tests|spec|regression|pytest|vitest|jest)\b/i)) return "tests"
  if (has(text, /\b(debug|bug|fix|broken|error|issue|crash)\b/i)) return "debug"
  if (has(text, /\b(refactor|cleanup|restructure|rename)\b/i)) return "refactor"
  if (has(text, /\b(research|investigate|compare|documentation online|docs api)\b/i)) return "research"
  if (has(text, /\b(search|find|locate|inspect|analy[sz]e|explain|review)\b/i)) return "search"
  if (has(text, /\b(readme|documentation|docs|markdown|changelog)\b/i)) return "docs"
  if (has(text, /\b(config|json|yaml|toml|env|file|copy|move)\b/i)) return "files"
  return "code"
}

function inferReadOnly(text: string, kind: TaskKind): boolean {
  if (["search", "research"].includes(kind) && !has(text, /\b(update|edit|write|change|fix|implement|add|remove|create|modify)\b/i)) return true
  return has(text, /\b(read[- ]only|do not edit|without changes|analy[sz]e only|review only)\b/i)
}

function inferRisks(text: string): string[] {
  const risks: string[] = []
  const table: Array<[RegExp, string]> = [
    [/\b(auth|oauth|token|password|permission|security|crypto|secret)\b/i, "security"],
    [/\b(database|schema|migration|sql|transaction)\b/i, "database"],
    [/\b(concurrency|race|thread|async|lock|deadlock)\b/i, "concurrency"],
    [/\b(public api|breaking|backward compat|protocol|contract)\b/i, "public-contract"],
    [/\b(architecture|cross[- ]cutting|redesign|rewrite)\b/i, "architecture"],
    [/\b(package-lock|pnpm-lock|yarn.lock|Cargo.lock|dependency|dependencies)\b/i, "shared-state"],
  ]
  for (const [re, name] of table) if (re.test(text)) risks.push(name)
  return risks
}

function complexity(text: string, paths: string[], risks: string[]): Complexity {
  if (risks.some((x) => ["security", "database", "concurrency", "public-contract"].includes(x)) && has(text, /\b(redesign|rewrite|migration|architecture|critical)\b/i)) return "critical"
  if (risks.length >= 2 || paths.length >= 5 || has(text, /\b(redesign|rewrite|across|end[- ]to[- ]end|cross[- ]cutting)\b/i)) return "hard"
  if (paths.length >= 2 || text.length > 450 || risks.length === 1) return "normal"
  return "simple"
}

function worker(kind: TaskKind, readOnly: boolean): WorkerRole {
  if (readOnly) return "searchWorker"
  if (["docs", "files"].includes(kind)) return "fileWorker"
  return "codeWorker"
}

export function profileTask(input: TaskSpec): TaskProfile {
  const text = input.description
  const paths = inferPaths(text)
  const kind = input.kind ?? inferKind(text)
  const readOnly = input.readOnly ?? inferReadOnly(text, kind)
  const risks = [...new Set([...(input.risks ?? []), ...inferRisks(text)])]
  const inferredComplexity = complexity(text, paths, risks)
  const c = input.complexity ?? inferredComplexity
  const explicitWriteScope = sanitizeScopeList(input.writeScope, "WRITE SCOPE")
  const explicitReadScope = sanitizeScopeList(input.readScope, "read scope")
  const writeScope = readOnly ? [] : (explicitWriteScope ?? paths)
  const readScope = explicitReadScope ?? paths
  const tokenBase = c === "simple" ? 8_000 : c === "normal" ? 20_000 : c === "hard" ? 48_000 : 80_000
  return {
    ...input,
    dependsOn: [...new Set(input.dependsOn ?? [])],
    worker: input.worker ?? worker(kind, readOnly),
    kind,
    complexity: c,
    estimatedTokens: input.estimatedTokens ?? tokenBase + Math.min(text.length * 15, 10_000),
    requiresTools: input.requiresTools ?? true,
    readOnly,
    readScope,
    writeScope,
    risks,
    confidence: input.writeScope?.length || readOnly ? 0.95 : paths.length ? 0.82 : 0.58,
  }
}

export function chooseExecutionMode(goal: string, explicitTasks?: TaskSpec[]): { mode: ExecutionMode; profile?: TaskProfile; reasons: string[] } {
  if (explicitTasks && explicitTasks.length > 1) return { mode: "team", reasons: ["multiple explicit tasks"] }
  const profile = profileTask(explicitTasks?.[0] ?? { id: "T1", description: goal })
  const reasons: string[] = []
  if (!profile.readOnly && profile.writeScope.length === 0) {
    reasons.push("mutating goal has no defensible WRITE SCOPE")
    return { mode: "team", profile, reasons }
  }
  if (profile.complexity === "hard" || profile.complexity === "critical" || profile.risks.includes("architecture") || /\b(across|multi[- ]module|redesign|rewrite|whole project|monorepo)\b/i.test(goal)) {
    reasons.push("cross-cutting or high-complexity work")
    return { mode: "team", profile, reasons }
  }
  if (profile.complexity === "simple" && profile.risks.length === 0 && profile.writeScope.length <= 2) {
    reasons.push("small bounded low-risk task")
    return { mode: "direct", profile, reasons }
  }
  reasons.push("bounded task benefits from targeted verification/review")
  return { mode: "managed", profile, reasons }
}
