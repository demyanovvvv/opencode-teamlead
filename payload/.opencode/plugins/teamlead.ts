import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { registerGlobalProject } from "../teamlead/install-registry.ts"
import { TeamLeadRuntime } from "../teamlead/runtime.ts"
import { loadConfig, saveConfig } from "../teamlead/config.ts"
import { guardTool, type SessionPolicy } from "../teamlead/security.ts"
import type { PlanSubmission, ReviewSubmission, TaskSpec, WorkerRole, ModelRole } from "../teamlead/types.ts"

const z = tool.schema
const taskSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  dependsOn: z.array(z.string()).optional(),
  worker: z.enum(["codeWorker", "fileWorker", "searchWorker", "alternateWorker"]).optional(),
  kind: z.enum(["code", "debug", "tests", "refactor", "search", "research", "files", "docs"]).optional(),
  complexity: z.enum(["simple", "normal", "hard", "critical"]).optional(),
  estimatedTokens: z.number().int().positive().optional(),
  requiresTools: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  readScope: z.array(z.string()).optional(),
  writeScope: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
  provides: z.array(z.string()).optional(),
  consumes: z.array(z.string()).optional(),
})

function json(value: unknown) { return JSON.stringify(value, null, 2) }
function parseModelID(value: string): string {
  if (!value.includes("/")) throw new Error("Model ID must be provider/model")
  return value
}
function isBoundedReviewPath(value: string): boolean {
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "")
  if (!normalized || /[\x00-\x1F]/.test(normalized) || normalized.includes(":") || normalized.startsWith("/") || /[?*]/.test(normalized)) return false
  if (normalized.split("/").includes("..")) return false
  return normalized !== "."
}

export const TeamLeadPlugin: Plugin = async ({ client, directory, worktree }) => {
  const root = path.resolve(worktree || directory)
  await registerGlobalProject(root, path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."))
  const policies = new Map<string, SessionPolicy>()
  const plans = new Map<string, PlanSubmission>()
  const reviews = new Map<string, ReviewSubmission>()
  const runtime = new TeamLeadRuntime(root, client, {
    registerPolicy(sessionID, policy) { policies.set(sessionID, policy) },
    unregisterPolicy(sessionID) { policies.delete(sessionID) },
    takePlan(sessionID) { const value = plans.get(sessionID); plans.delete(sessionID); return value },
    takeReview(sessionID) { const value = reviews.get(sessionID); reviews.delete(sessionID); return value },
  })
  await runtime.init()

  return {
    tool: {
      teamlead_plan: tool({
        description: "Preview TeamLead adaptive execution mode and bounded task profile without editing files.",
        args: { goal: z.string().min(1), tasks: z.array(taskSchema).optional() },
        async execute(args) { return json(runtime.preview(args.goal, args.tasks as TaskSpec[] | undefined)) },
      }),
      teamlead_execute: tool({
        description: "Execute an engineering goal through TeamLead Direct/Managed/Team orchestration, isolated workers, verification and conditional review.",
        args: { goal: z.string().min(1), tasks: z.array(taskSchema).optional() },
        async execute(args, context) {
          const run = await runtime.execute({ goal: args.goal, tasks: args.tasks as TaskSpec[] | undefined, parentSessionID: context.sessionID, abort: context.abort })
          return json(run)
        },
      }),
      teamlead_resume: tool({
        description: "Resume a persisted non-terminal TeamLead run.",
        args: { runID: z.string().optional() },
        async execute(args, context) {
          const state = runtime.getState()
          const runID = args.runID ?? Object.values(state.runs).filter((r) => !["completed", "failed", "cancelled"].includes(r.status)).sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id
          if (!runID) throw new Error("No resumable TeamLead run found")
          const existing = state.runs[runID]
          if (!existing) throw new Error(`Unknown run: ${runID}`)
          const run = await runtime.execute({ goal: existing.goal, parentSessionID: context.sessionID, abort: context.abort, resumeRunID: runID })
          return json(run)
        },
      }),
      teamlead_status: tool({
        description: "Show a TeamLead run status, or recent runs if runID is omitted.",
        args: { runID: z.string().optional() },
        async execute(args) {
          const state = runtime.getState()
          if (args.runID) return json(state.runs[args.runID] ?? { error: "not found", runID: args.runID })
          return json(Object.values(state.runs).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10))
        },
      }),
      teamlead_models: tool({
        description: "List connected OpenCode models and current TeamLead role assignments/pools.",
        args: {},
        async execute() {
          await runtime.refresh()
          const config = runtime.getConfig()
          return json({ models: runtime.getCatalog(), assignments: config.models, pools: config.workerPools, strategy: config.strategy })
        },
      }),
      teamlead_settings: tool({
        description: "Read or safely change TeamLead settings. Use this after a question/menu interaction; do not edit teamlead.json manually when this tool fits.",
        args: {
          action: z.enum(["show", "set_strategy", "set_role_model", "set_pool", "set_max_parallel", "set_provider_limit", "set_budget", "set_review", "reset"]).default("show"),
          strategy: z.enum(["fast", "balanced", "economy", "quality"]).optional(),
          role: z.enum(["orchestrator", "reviewer", "codeWorker", "fileWorker", "searchWorker", "alternateWorker"]).optional(),
          model: z.string().nullable().optional(),
          models: z.array(z.string()).optional(),
          provider: z.string().optional(),
          value: z.number().optional(),
          maxCostUsd: z.number().min(0).optional(), maxTokens: z.number().min(0).optional(), maxRunMinutes: z.number().min(0).optional(), softRatio: z.number().min(0.1).max(1).optional(),
          reviewEnabled: z.boolean().optional(), mediumLevel: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(), criticalLevel: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
        },
        async execute(args) {
          let config = await loadConfig(root)
          if (args.action === "set_role_model" || args.action === "set_pool") {
            await runtime.refresh()
            const connected = new Set(runtime.getCatalog().filter((item) => item.connected).map((item) => item.id))
            const requested = args.action === "set_role_model"
              ? (args.model == null ? [] : [parseModelID(args.model)])
              : ((args.models ?? []) as string[]).map(parseModelID)
            const unavailable = requested.filter((modelID) => !connected.has(modelID))
            if (unavailable.length) throw new Error(`Model(s) are not currently connected in OpenCode: ${unavailable.join(", ")}. Run /lead-models and choose an available model.`)
          }
          if (args.action === "reset") {
            const { DEFAULT_CONFIG } = await import("../teamlead/config.ts")
            config = structuredClone(DEFAULT_CONFIG)
          } else if (args.action === "set_strategy") {
            if (!args.strategy) throw new Error("strategy is required")
            config.strategy = args.strategy
          } else if (args.action === "set_role_model") {
            if (!args.role) throw new Error("role is required")
            config.models[args.role as ModelRole] = args.model == null ? null : parseModelID(args.model)
          } else if (args.action === "set_pool") {
            if (!args.role || ["orchestrator", "reviewer"].includes(args.role)) throw new Error("worker role is required")
            config.workerPools[args.role as WorkerRole] = [...new Set<string>(((args.models ?? []) as string[]).map(parseModelID))]
          } else if (args.action === "set_max_parallel") {
            if (!args.value) throw new Error("value is required")
            config.maxParallelWorkers = Math.max(1, Math.min(32, Math.round(args.value)))
          } else if (args.action === "set_provider_limit") {
            if (!args.provider || !args.value) throw new Error("provider and positive value are required")
            config.providerConcurrency[args.provider] = Math.max(1, Math.min(32, Math.round(args.value)))
          } else if (args.action === "set_budget") {
            if (args.maxCostUsd !== undefined) config.budget.maxCostUsd = args.maxCostUsd
            if (args.maxTokens !== undefined) config.budget.maxTokens = Math.round(args.maxTokens)
            if (args.maxRunMinutes !== undefined) config.budget.maxRunMinutes = args.maxRunMinutes
            if (args.softRatio !== undefined) config.budget.softRatio = args.softRatio
          } else if (args.action === "set_review") {
            if (args.reviewEnabled !== undefined) config.review.enabled = args.reviewEnabled
            if (args.mediumLevel !== undefined) config.review.mediumLevel = args.mediumLevel
            if (args.criticalLevel !== undefined) config.review.criticalLevel = args.criticalLevel
          }
          if (args.action !== "show") { await saveConfig(root, config); await runtime.refresh() }
          return json(config)
        },
      }),
      teamlead_submit_plan: tool({
        description: "Planner-only typed handoff: submit a complete bounded TeamLead DAG. Mutating tasks without WRITE SCOPE are rejected by runtime.",
        args: { tasks: z.array(taskSchema).min(1), rationale: z.string().optional() },
        async execute(args, context) {
          const policy = policies.get(context.sessionID)
          if (policy?.role !== "lead") throw new Error("teamlead_submit_plan is accepted only from the active TeamLead planner session")
          plans.set(context.sessionID, { tasks: args.tasks as TaskSpec[], rationale: args.rationale })
          return "Plan accepted by TeamLead runtime."
        },
      }),
      teamlead_submit_review: tool({
        description: "Reviewer-only typed handoff: submit pass/repair/fail plus bounded findings.",
        args: {
          verdict: z.enum(["pass", "repair", "fail"]), summary: z.string().min(1),
          findings: z.array(z.object({ description: z.string().min(1), severity: z.enum(["low", "medium", "high", "critical"]), paths: z.array(z.string()) })).default([]),
        },
        async execute(args, context) {
          const policy = policies.get(context.sessionID)
          if (policy?.role !== "reviewer") throw new Error("teamlead_submit_review is accepted only from the active TeamLead reviewer session")
          if (args.verdict === "repair" && (!args.findings.length || args.findings.some((f: { paths: string[] }) => f.paths.length === 0 || f.paths.some((p) => !isBoundedReviewPath(p))))) throw new Error("REPAIR requires concrete bounded project-relative paths without traversal or wildcards")
          reviews.set(context.sessionID, args as ReviewSubmission)
          return "Review verdict accepted by TeamLead runtime."
        },
      }),
      teamlead_doctor: tool({
        description: "Check OpenCode compatibility, TeamLead files, Git support and required SDK capabilities.",
        args: {},
        async execute() {
          let health: any = { healthy: true, version: "unknown" }
          if (typeof client?.global?.health === "function") {
            try { health = sessionData(await client.global.health()) } catch (error) { health = { healthy: false, version: "unknown", error: String(error) } }
          }
          const capabilities = {
            sessionCreate: typeof client?.session?.create === "function",
            sessionPrompt: typeof client?.session?.prompt === "function",
            sessionMessages: typeof client?.session?.messages === "function",
            sessionAbort: typeof client?.session?.abort === "function",
            providerList: typeof client?.provider?.list === "function",
          }
          const requiredOK = capabilities.sessionCreate && capabilities.sessionPrompt && capabilities.sessionMessages && capabilities.providerList
          const files = ["plugins/teamlead.ts", "teamlead/runtime.ts", "agents/teamlead-lead.md", "agents/teamlead-reviewer.md", "commands/lead.md"]
          const installed: Record<string, boolean> = {}
          for (const rel of files) { try { await fs.access(path.join(root, ".opencode", rel)); installed[rel] = true } catch { installed[rel] = false } }
          let git = false
          try { const { runProcess } = await import("../teamlead/process.ts"); git = (await runProcess("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, timeoutMs: 10_000 })).code === 0 } catch {}
          const version = String(health?.version ?? "unknown").replace(/^v/, "")
          const parts = version.split(".").map((x: string) => Number.parseInt(x, 10))
          const supportedFamily = version === "unknown" || (parts[0] === 1 && (parts[1] > 18 || (parts[1] === 18 && (parts[2] ?? 0) >= 30)))
          return json({ healthy: health?.healthy !== false && requiredOK && supportedFamily, opencodeVersion: version, supportedFamily, baseline: ">=1.18.30 <2.0.0", capabilities, files: installed, gitWorktreeAvailable: git, notes: ["Real OpenCode E2E on this target remains authoritative.", "Mutating TeamLead tasks require Git worktree support."] })
        },
      }),
    },
    "tool.execute.before": async (input, output) => {
      const policy = policies.get(input.sessionID)
      if (policy) await guardTool(policy, input.tool, output.args)
    },
    event: async ({ event }) => {
      if (event.type !== "session.error") return
      const props = (event as any).properties ?? {}
      const sessionID = props.sessionID ?? props.id
      if (!sessionID || !policies.has(sessionID)) return
      // Runtime catches request errors directly; this event hook is intentionally observational only.
    },
  }
}

export default TeamLeadPlugin

function sessionData(response: any): any {
  if (response?.error) throw new Error(typeof response.error === "string" ? response.error : JSON.stringify(response.error))
  return response?.data ?? response
}
