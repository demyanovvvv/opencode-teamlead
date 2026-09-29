import type { RunState } from "./types.ts"
import fs from "node:fs/promises"
import path from "node:path"

export async function savePresentation(root: string, runs: RunState[], activeRunID?: string): Promise<void> {
  const file = path.join(root, ".opencode", ".teamlead", "presentation.json")
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  try {
    await fs.writeFile(tmp, JSON.stringify(runs.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10).map((run) => ({
      ...summarizeRun(run), heartbeatAt: run.id === activeRunID ? Date.now() : undefined,
    }))) + "\n")
    await fs.rename(tmp, file)
  } finally { await fs.rm(tmp, { force: true }) }
}

export function selectRun(runs: RunState[], sessionID?: string): RunState | undefined {
  const sorted = [...runs].sort((a, b) => b.updatedAt - a.updatedAt)
  if (sessionID) return sorted.find((run) => run.parentSessionID === sessionID)
  return sorted[0]
}

export function summarizeRun(run: RunState, live = true) {
  const tasks = Object.values(run.tasks)
  return {
    id: run.id, goal: run.goal, mode: run.mode, status: run.status, phase: run.phase,
    parentSessionID: run.parentSessionID, updatedAt: run.updatedAt,
    total: tasks.length, completed: tasks.filter((task) => task.status === "completed").length,
    active: live ? tasks.filter((task) => task.status === "running").length : 0,
    interrupted: !live && ["running", "review", "repair"].includes(run.status),
    estimatedTokens: run.estimatedTokens, estimatedCostUsd: run.estimatedCostUsd,
    tasks: tasks.map((task) => ({ id: task.task.id, status: task.status, model: task.model, changedFiles: task.changedFiles })),
    error: run.error,
  }
}

export function formatIndicator(summary?: ReturnType<typeof summarizeRun>, compact = false, language: "en" | "ru" = "en"): string {
  if (!summary) return language === "ru" ? "● TL Готов" : "● TL Ready"
  if (summary.interrupted) return language === "ru" ? "! TL Прерван" : "! TL Interrupted"
  const state = summary.status === "completed" ? "✓" : summary.status === "failed" || summary.status === "cancelled" || summary.status === "repair_required" ? "✕" : "◐"
  const phases = language === "ru"
    ? { review: "Ревью", planned: "План", completed: "Готово", failed: "Ошибка", cancelled: "Отмена", repair_required: "Исправить" }
    : { review: "Review", planned: "Planned", completed: "Done", failed: "Failed", cancelled: "Cancelled", repair_required: "Repair needed" }
  if (compact) return `${state} TL ${summary.completed}/${summary.total}`
  if (summary.phase === "verification") return `${state} TL ${summary.completed}/${summary.total} · ${language === "ru" ? "проверка" : "verify"}`
  if (summary.status !== "running" && summary.status !== "repair") return `${state} TL ${phases[summary.status as keyof typeof phases] ?? summary.status}`
  const mode = language === "ru" && summary.mode === "team" ? "команда" : summary.mode
  return `${state} TL ${summary.completed}/${summary.total} · ${mode}`
}
