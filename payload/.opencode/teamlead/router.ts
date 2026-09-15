import type { CatalogModel, ModelRole, PersistentState, RouteDecision, Strategy, TaskProfile, TeamLeadConfig } from "./types.ts"

export function catalogFromProviderResponse(data: any): CatalogModel[] {
  if (!data) return []
  const hasConnectedList = Array.isArray(data.connected)
  const connected = new Set<string>(hasConnectedList ? data.connected : [])
  const providers = Array.isArray(data.all) ? data.all : Object.values(data.all ?? {})
  const out: CatalogModel[] = []
  for (const provider of providers as any[]) {
    if (!provider || typeof provider.id !== "string") continue
    for (const [key, model] of Object.entries(provider.models ?? {})) {
      const m = model as any
      const modelID = typeof m.id === "string" ? m.id : key
      const id = `${provider.id}/${modelID}`
      out.push({
        id,
        providerID: provider.id,
        modelID,
        name: typeof m.name === "string" ? m.name : modelID,
        connected: hasConnectedList ? connected.has(provider.id) : true,
        toolCall: m.tool_call ?? m.toolCall ?? m.capabilities?.toolcall ?? true,
        context: Number(m.limit?.context ?? m.context ?? m.contextWindow ?? 0) || undefined,
        inputCost: Number(m.cost?.input ?? 0) || undefined,
        outputCost: Number(m.cost?.output ?? 0) || undefined,
      })
    }
  }
  return out
}

export async function loadCatalog(client: any, directory: string): Promise<CatalogModel[]> {
  const response = await client.provider.list({ query: { directory } })
  return catalogFromProviderResponse(response?.data ?? response)
}

export function estimateCost(model: CatalogModel, tokens: number): number {
  if (!model.inputCost && !model.outputCost) return 0
  const input = model.inputCost ?? model.outputCost ?? 0
  const output = model.outputCost ?? input
  return (tokens / 1_000_000) * (input * 0.7 + output * 0.3)
}

function reliability(state: PersistentState, id: string): number {
  const e = state.evidence[id]
  if (!e || e.attempts < 1) return 0.72
  // Beta-like prior avoids overfitting a single lucky/failed attempt.
  return (e.passes + 0.45 * e.repairs + 3) / (e.attempts + 4)
}

function normalizedCost(model: CatalogModel, tokens: number): number {
  const value = estimateCost(model, tokens)
  return value <= 0 ? 0.4 : Math.min(1, value / Math.max(0.01, value + 0.05))
}

function score(strategy: Strategy, model: CatalogModel, task: TaskProfile, state: PersistentState, preference: number): { value: number; reasons: string[] } {
  const rel = reliability(state, model.id)
  const cost = normalizedCost(model, task.estimatedTokens)
  const latency = state.evidence[model.id]?.attempts ? Math.min(1, (state.evidence[model.id].totalMs / state.evidence[model.id].attempts) / 120_000) : 0.45
  const contextHeadroom = model.context ? Math.min(1, Math.max(0, (model.context - task.estimatedTokens) / model.context)) : 0.5
  let value: number
  if (strategy === "economy") value = rel * 0.40 + (1 - cost) * 0.45 + contextHeadroom * 0.10 + (1 - latency) * 0.05
  else if (strategy === "fast") value = rel * 0.35 + (1 - latency) * 0.40 + (1 - cost) * 0.15 + contextHeadroom * 0.10
  else if (strategy === "quality") value = rel * 0.65 + contextHeadroom * 0.20 + (1 - cost) * 0.05 + (1 - latency) * 0.10
  else value = rel * 0.50 + (1 - cost) * 0.20 + (1 - latency) * 0.15 + contextHeadroom * 0.15
  value *= preference
  return { value, reasons: [`reliability=${rel.toFixed(2)}`, `context=${contextHeadroom.toFixed(2)}`, `policy=${strategy}`] }
}

export function routeModel(input: {
  role: ModelRole
  task: TaskProfile
  config: TeamLeadConfig
  state: PersistentState
  catalog: CatalogModel[]
  exclude?: Set<string>
}): RouteDecision {
  const { role, task, config, state, catalog } = input
  const explicit = config.models[role]
  const pool = role === "orchestrator" || role === "reviewer" ? [] : config.workerPools[role]
  const requested = pool.length ? pool : explicit ? [explicit] : []
  const candidates = requested.length ? catalog.filter((m) => requested.includes(m.id)) : catalog
  const rejected: string[] = []
  const eligible = candidates.filter((m) => {
    if (input.exclude?.has(m.id)) { rejected.push(`${m.id}: already attempted`); return false }
    if (!m.connected) { rejected.push(`${m.id}: provider disconnected`); return false }
    if (config.modelProfiles[m.id]?.disabled) { rejected.push(`${m.id}: disabled`); return false }
    const circuit = state.providerCircuits[m.providerID]
    if (circuit && circuit.openedUntil > Date.now()) { rejected.push(`${m.id}: provider circuit open`); return false }
    if (task.requiresTools && m.toolCall === false) { rejected.push(`${m.id}: tool calls unsupported`); return false }
    if (m.context && m.context < Math.ceil(task.estimatedTokens * 1.15)) { rejected.push(`${m.id}: insufficient context`); return false }
    return true
  })
  if (!eligible.length) {
    const configured = requested.length ? ` configured candidates: ${requested.join(", ")}.` : ""
    throw new Error(`No eligible model for ${role}.${configured}${rejected.length ? ` Rejected: ${rejected.join("; ")}` : ""}`)
  }
  const ranked = eligible.map((model) => {
    const s = score(config.strategy, model, task, state, config.modelProfiles[model.id]?.preference ?? 1)
    return { model, score: s.value, estimatedCostUsd: estimateCost(model, task.estimatedTokens), reasons: s.reasons }
  }).sort((a, b) => b.score - a.score || a.estimatedCostUsd - b.estimatedCostUsd || a.model.id.localeCompare(b.model.id))
  return ranked[0]
}
