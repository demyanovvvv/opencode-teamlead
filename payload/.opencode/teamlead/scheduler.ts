import { scopesConflict } from "./glob.ts"
import type { TaskProfile, TeamLeadConfig } from "./types.ts"

const weight = { simple: 1, normal: 2, hard: 4, critical: 7 } as const

export function validateDag(tasks: TaskProfile[]): void {
  const ids = new Set(tasks.map((t) => t.id))
  if (ids.size !== tasks.length) throw new Error("Task IDs must be unique")
  for (const task of tasks) for (const dep of task.dependsOn ?? []) if (!ids.has(dep)) throw new Error(`Task ${task.id} depends on missing task ${dep}`)
  const visiting = new Set<string>(), visited = new Set<string>(), byID = new Map(tasks.map((t) => [t.id, t]))
  const visit = (id: string) => {
    if (visited.has(id)) return
    if (visiting.has(id)) throw new Error(`DAG cycle detected at ${id}`)
    visiting.add(id)
    for (const dep of byID.get(id)?.dependsOn ?? []) visit(dep)
    visiting.delete(id); visited.add(id)
  }
  for (const task of tasks) visit(task.id)
}

export function addContractEdges(tasks: TaskProfile[]): TaskProfile[] {
  const providers = new Map<string, string[]>()
  for (const task of tasks) for (const contract of task.provides ?? []) providers.set(contract, [...(providers.get(contract) ?? []), task.id])
  return tasks.map((task) => {
    const deps = new Set(task.dependsOn ?? [])
    for (const contract of task.consumes ?? []) for (const provider of providers.get(contract) ?? []) if (provider !== task.id) deps.add(provider)
    return { ...task, dependsOn: [...deps] }
  })
}

function criticalPath(tasks: TaskProfile[]): Map<string, number> {
  const children = new Map<string, string[]>()
  for (const task of tasks) for (const dep of task.dependsOn ?? []) children.set(dep, [...(children.get(dep) ?? []), task.id])
  const byID = new Map(tasks.map((t) => [t.id, t])), memo = new Map<string, number>()
  const walk = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!
    const own = weight[byID.get(id)!.complexity]
    const child = Math.max(0, ...(children.get(id) ?? []).map(walk))
    const result = own + child; memo.set(id, result); return result
  }
  for (const task of tasks) walk(task.id)
  return memo
}

export function nextWave(tasks: TaskProfile[], completed: Set<string>, running: Set<string>, config: TeamLeadConfig): TaskProfile[] {
  const cp = criticalPath(tasks)
  const ready = tasks.filter((task) => !completed.has(task.id) && !running.has(task.id) && (task.dependsOn ?? []).every((id) => completed.has(id)))
    .sort((a, b) => (cp.get(b.id) ?? 0) - (cp.get(a.id) ?? 0) || a.id.localeCompare(b.id))
  const policyCap = config.strategy === "quality" ? Math.max(1, Math.ceil(config.maxParallelWorkers * 0.75)) : config.strategy === "economy" ? Math.max(1, Math.ceil(config.maxParallelWorkers * 0.6)) : config.maxParallelWorkers
  const wave: TaskProfile[] = []
  for (const candidate of ready) {
    if (wave.length >= policyCap) break
    if (!candidate.readOnly && candidate.writeScope.length === 0) continue
    if (candidate.risks.includes("shared-state") && wave.length) continue
    const conflict = wave.some((picked) => !candidate.readOnly && !picked.readOnly && scopesConflict(candidate.writeScope, picked.writeScope))
    if (!conflict) wave.push(candidate)
  }
  return wave
}
