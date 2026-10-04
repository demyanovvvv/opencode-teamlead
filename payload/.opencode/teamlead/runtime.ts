import crypto from "node:crypto"
import path from "node:path"
import { loadConfig } from "./config.ts"
import { savePresentation } from "./presentation.ts"
import { chooseExecutionMode, profileTask } from "./profiler.ts"
import { addContractEdges, nextWave, validateDag } from "./scheduler.ts"
import { loadCatalog, routeModel } from "./router.ts"
import { appendEvent, loadState, providerFailure, providerSuccess, recordModelOutcome, updateState, upsertRun } from "./state.ts"
import { collectPatch, createWorktree, integratePatch, recoverPatch } from "./git.ts"
import { runChecks, selectChecks } from "./verify.ts"
import type { CatalogModel, ExecutionMode, PersistentState, PlanSubmission, ReviewFinding, ReviewSubmission, RunState, TaskProfile, TaskSpec, TeamLeadConfig, WorkerRole } from "./types.ts"

export interface RuntimeCallbacks {
  registerPolicy(sessionID: string, policy: { role: "worker" | "lead" | "reviewer"; root: string; writeScope: string[]; readOnly: boolean }): void
  unregisterPolicy(sessionID: string): void
  takePlan(sessionID: string): PlanSubmission | undefined
  takeReview(sessionID: string): ReviewSubmission | undefined
}

function id(prefix: string) { return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}` }
function sessionData(response: any): any {
  if (response?.error) throw new Error(typeof response.error === "string" ? response.error : JSON.stringify(response.error))
  return response?.data ?? response
}
function safeError(error: unknown): string { return error instanceof Error ? error.message : String(error) }
function isProviderLikeError(error: unknown): boolean {
  const message = safeError(error)
  return /\b(provider|model|rate[ -]?limit|quota|timeout|network|fetch|api)\b|\b(ECONN[A-Z]*|ETIMEDOUT|ENET[A-Z]*|EAI_AGAIN)\b|\b429\b|\b5\d\d\b/i.test(message)
}

export function createRuntimeWorkerAgent(task: Pick<TaskProfile, "readOnly" | "writeScope"> & { id?: string }, runID = "runtime", attempt = 1): { id: string; content: string } {
  const taskWithID = { ...task, id: task.id ?? "task" } as TaskProfile
  const agentID = `teamlead-runtime-${runID}-${taskWithID.id}-${attempt}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 90)
  const editRules = taskWithID.readOnly
    ? "  edit: deny\n"
    : `  edit:\n    \"*\": deny\n${taskWithID.writeScope.map((scope) => `    ${JSON.stringify(scope)}: allow\n    ${JSON.stringify(scope.replace(/\/$/, "") + "/**")}: allow`).join("\n")}\n`
  const content = `---\ndescription: TeamLead isolated runtime worker\nmode: subagent\npermission:\n${editRules}  bash: deny\n  task: deny\n  external_directory: deny\n  question: deny\n  skill: deny\n  \"teamlead_*\": deny\n---\n\nYou are an isolated TeamLead worker. Complete exactly the assigned task. Do not invoke shell commands, tests, subagents, or external directories. Use file tools only. Stay strictly inside the declared WRITE SCOPE. Do not broaden scope. Make the smallest correct change and report what you changed.\n`
  return { id: agentID, content }
}

function runtimeAgent(task: TaskProfile, runID: string, attempt: number): { id: string; content: string } {
  return createRuntimeWorkerAgent(task, runID, attempt)
}

function roleAgent(role: WorkerRole): string {
  return role === "codeWorker" ? "teamlead-worker-code" : role === "fileWorker" ? "teamlead-worker-files" : role === "searchWorker" ? "teamlead-worker-search" : "teamlead-worker-alt"
}

function taskPrompt(task: TaskProfile): string {
  return [
    `TASK ${task.id}: ${task.description}`,
    `Kind: ${task.kind}; complexity: ${task.complexity}; readOnly: ${task.readOnly}`,
    task.writeScope.length ? `WRITE SCOPE (hard boundary):\n${task.writeScope.map((x) => `- ${x}`).join("\n")}` : "WRITE SCOPE: none (read-only)",
    task.readScope.length ? `Read hints:\n${task.readScope.map((x) => `- ${x}`).join("\n")}` : "",
    task.risks.length ? `Risks: ${task.risks.join(", ")}` : "",
    "Do not run tests or shell commands. The trusted TeamLead runtime performs verification. Do not edit anything outside WRITE SCOPE.",
  ].filter(Boolean).join("\n\n")
}

function plannerPrompt(goal: string): string {
  return `Plan the following engineering goal as a bounded DAG and submit it by calling teamlead_submit_plan exactly once. Do not edit files. Every mutating task MUST have a non-empty project-relative writeScope. Prefer the fewest tasks that enable safe parallelism. Declare dependencies. Use provides/consumes for public contracts when useful. Do not invent paths: inspect the repository first.\n\nGOAL:\n${goal}`
}

function reviewPrompt(run: RunState, level: 1 | 2): string {
  const files = Object.values(run.tasks).flatMap((x) => x.changedFiles)
  return `Independently review the implemented TeamLead run and call teamlead_submit_review exactly once. Do not edit files. Review level ${level}. Check correctness, regressions, tests, compatibility, and scope discipline${level === 2 ? ", with extra attention to security, contracts, concurrency, database and architecture risks" : ""}. Return PASS only when there are no actionable correctness findings. For every REPAIR finding, include a bounded list of project-relative paths that a repair worker may edit; never use broad '*' scope.\n\nGOAL: ${run.goal}\nCHANGED FILES:\n${[...new Set(files)].map((x) => `- ${x}`).join("\n") || "- none"}`
}

export class TeamLeadRuntime {
  private config!: TeamLeadConfig
  private state!: PersistentState
  private catalog: CatalogModel[] = []
  private readonly root: string
  private readonly client: any
  private readonly callbacks: RuntimeCallbacks
  private readonly providerInFlight = new Map<string, number>()
  private readonly providerWaiters = new Map<string, Array<() => void>>()
  constructor(root: string, client: any, callbacks: RuntimeCallbacks) {
    this.root = root
    this.client = client
    this.callbacks = callbacks
  }

  async init(): Promise<void> {
    this.config = await loadConfig(this.root)
    this.state = await loadState(this.root)
  }

  async refresh(): Promise<void> {
    this.config = await loadConfig(this.root)
    this.state = await loadState(this.root)
    this.catalog = await loadCatalog(this.client, this.root)
  }

  getConfig() { return structuredClone(this.config) }
  getState() { return structuredClone(this.state) }
  getCatalog() { return structuredClone(this.catalog) }

  private async persist(run?: RunState, event?: Record<string, unknown>) {
    this.state = await updateState(this.root, (state) => {
      if (run) upsertRun(state, structuredClone(run))
    })
    if (event) await appendEvent(this.root, event)
    if (run) await savePresentation(this.root, Object.values(this.state.runs), run.id).catch(() => {})
  }

  private async persistProviderSuccess(providerID: string): Promise<void> {
    this.state = await updateState(this.root, (state) => providerSuccess(state, providerID))
  }

  private async persistOutcome(model: string, providerID: string, outcome: "pass" | "repair" | "failure" | "runtime_error", durationMs: number, providerResult?: "success" | string): Promise<void> {
    this.state = await updateState(this.root, (state) => {
      recordModelOutcome(state, model, outcome, durationMs)
      if (providerResult === "success") providerSuccess(state, providerID)
      else if (providerResult) providerFailure(state, providerID, providerResult)
    })
  }

  private async createSession(directory: string, title: string, parentID?: string): Promise<string> {
    const response = await this.client.session.create({ query: { directory }, body: { title, ...(parentID ? { parentID } : {}) } })
    const data = sessionData(response)
    if (!data?.id) throw new Error("OpenCode session.create returned no session id")
    return data.id
  }

  private async acquireProvider(providerID: string, abort?: AbortSignal): Promise<() => void> {
    const limit = Math.max(1, this.config.providerConcurrency[providerID] ?? this.config.maxParallelWorkers)
    while ((this.providerInFlight.get(providerID) ?? 0) >= limit) {
      if (abort?.aborted) throw new Error("Run aborted while waiting for provider capacity")
      await new Promise<void>((resolve, reject) => {
        const waiters = this.providerWaiters.get(providerID) ?? []
        let settled = false
        const wake = () => {
          if (settled) return
          settled = true
          abort?.removeEventListener("abort", onAbort)
          resolve()
        }
        const onAbort = () => {
          if (settled) return
          settled = true
          const current = this.providerWaiters.get(providerID)
          if (current) {
            const index = current.indexOf(wake)
            if (index >= 0) current.splice(index, 1)
          }
          reject(new Error("Run aborted while waiting for provider capacity"))
        }
        waiters.push(wake)
        this.providerWaiters.set(providerID, waiters)
        abort?.addEventListener("abort", onAbort, { once: true })
      })
    }
    this.providerInFlight.set(providerID, (this.providerInFlight.get(providerID) ?? 0) + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      const next = Math.max(0, (this.providerInFlight.get(providerID) ?? 1) - 1)
      if (next === 0) this.providerInFlight.delete(providerID)
      else this.providerInFlight.set(providerID, next)
      const waiters = this.providerWaiters.get(providerID)
      const wake = waiters?.shift()
      if (waiters && waiters.length === 0) this.providerWaiters.delete(providerID)
      wake?.()
    }
  }

  private async promptSession(sessionID: string, directory: string, agent: string, model: CatalogModel, text: string, abort?: AbortSignal): Promise<any> {
    if (abort?.aborted) { await this.abortSession(sessionID, directory); throw new Error("Run aborted") }
    const releaseProvider = await this.acquireProvider(model.providerID, abort)
    const onAbort = () => { void this.abortSession(sessionID, directory) }
    abort?.addEventListener("abort", onAbort, { once: true })
    try {
      const response = await this.client.session.prompt({
        path: { id: sessionID }, query: { directory },
        body: { agent, model: { providerID: model.providerID, modelID: model.modelID }, parts: [{ type: "text", text }] },
      })
      return sessionData(response)
    } finally {
      abort?.removeEventListener("abort", onAbort)
      releaseProvider()
    }
  }

  private async abortSession(sessionID: string, directory: string) {
    try { await this.client.session.abort({ path: { id: sessionID }, query: { directory } }) } catch {}
  }

  preview(goal: string, tasks?: TaskSpec[]) {
    const admission = chooseExecutionMode(goal, tasks)
    const profiled = tasks?.map(profileTask) ?? (admission.profile ? [admission.profile] : [])
    return { mode: admission.mode, reasons: admission.reasons, tasks: profiled }
  }

  private reserveBudget(task: TaskProfile, estimatedCost: number, run: RunState): void {
    const b = this.config.budget
    if (b.maxTokens > 0 && run.estimatedTokens + task.estimatedTokens > b.maxTokens) throw new Error(`Token budget would be exceeded by ${task.id}`)
    if (b.maxCostUsd > 0 && run.estimatedCostUsd + estimatedCost > b.maxCostUsd) throw new Error(`Cost budget would be exceeded by ${task.id}`)
    if (b.maxRunMinutes > 0 && run.startedAt && Date.now() - run.startedAt > b.maxRunMinutes * 60_000) throw new Error("Run time budget exceeded")
    // Reserve before the first await so concurrently admitted workers cannot collectively overshoot the configured estimate budget.
    // Failed/retried attempts remain charged conservatively because they may already have consumed provider tokens.
    run.estimatedTokens += task.estimatedTokens
    run.estimatedCostUsd += estimatedCost
  }

  private softBudgetReached(run: RunState): boolean {
    const { maxTokens, maxCostUsd, maxRunMinutes, softRatio } = this.config.budget
    return maxTokens > 0 && run.estimatedTokens >= maxTokens * softRatio
      || maxCostUsd > 0 && run.estimatedCostUsd >= maxCostUsd * softRatio
      || maxRunMinutes > 0 && !!run.startedAt && Date.now() - run.startedAt >= maxRunMinutes * 60_000 * softRatio
  }

  private async planWithLead(run: RunState, goal: string, parentSessionID: string | undefined, abort?: AbortSignal): Promise<TaskProfile[]> {
    const synthetic = profileTask({ id: "PLAN", description: goal, readOnly: true, kind: "search", complexity: "hard", estimatedTokens: 48_000 })
    const attempted = new Set<string>()
    let lastError: unknown
    for (let attempt = 1; attempt <= this.config.maxAttemptsPerTask; attempt++) {
      let decision
      try { decision = routeModel({ role: "orchestrator", task: synthetic, config: this.config, state: this.state, catalog: this.catalog, exclude: attempted }) }
      catch (error) { throw lastError ?? error }
      attempted.add(decision.model.id)
      this.reserveBudget(synthetic, decision.estimatedCostUsd, run)
      const sid = await this.createSession(this.root, `TeamLead planner ${attempt}`, parentSessionID)
      this.callbacks.registerPolicy(sid, { role: "lead", root: this.root, writeScope: [], readOnly: true })
      try {
        if (abort?.aborted) throw new Error("Run aborted")
        await this.promptSession(sid, this.root, "teamlead-lead", decision.model, plannerPrompt(goal), abort)
        const submission = this.callbacks.takePlan(sid)
        if (!submission) throw new Error("Lead completed without teamlead_submit_plan; no prose-plan fallback is allowed")
        const tasks = addContractEdges(submission.tasks.map(profileTask))
        for (const task of tasks) if (!task.readOnly && task.writeScope.length === 0) throw new Error(`Lead task ${task.id} is mutating but has no WRITE SCOPE`)
        validateDag(tasks)
        await this.persistProviderSuccess(decision.model.providerID)
        return tasks
      } catch (error) {
        lastError = error
        if (isProviderLikeError(error)) this.state = await updateState(this.root, (state) => providerFailure(state, decision.model.providerID, safeError(error)))
        if (abort?.aborted || attempt >= this.config.maxAttemptsPerTask) throw error
      } finally {
        this.callbacks.unregisterPolicy(sid)
        if (abort?.aborted) await this.abortSession(sid, this.root)
      }
    }
    throw lastError ?? new Error("TeamLead planner failed")
  }

  private async executeReadOnlyTask(run: RunState, task: TaskProfile, parentSessionID: string | undefined, abort?: AbortSignal): Promise<void> {
    const attempted = new Set<string>()
    const tstate = run.tasks[task.id]
    for (let attempt = 1; attempt <= this.config.maxAttemptsPerTask; attempt++) {
      tstate.attempts = attempt
      const decision = routeModel({ role: task.worker, task, config: this.config, state: this.state, catalog: this.catalog, exclude: attempted })
      attempted.add(decision.model.id); this.reserveBudget(task, decision.estimatedCostUsd, run)
      const sid = await this.createSession(this.root, `TeamLead ${task.id}`, parentSessionID)
      tstate.sessionID = sid; tstate.model = decision.model.id; tstate.provider = decision.model.providerID; tstate.status = "running"
      await this.persist(run, { type: "task.started", runID: run.id, taskID: task.id })
      this.callbacks.registerPolicy(sid, { role: "worker", root: this.root, writeScope: [], readOnly: true })
      const started = Date.now()
      try {
        await this.promptSession(sid, this.root, roleAgent(task.worker), decision.model, taskPrompt(task), abort)
        tstate.status = "completed"
        await this.persist(run, { type: "task.completed", runID: run.id, taskID: task.id })
        await this.persistOutcome(decision.model.id, decision.model.providerID, "pass", Date.now() - started, "success")
        return
      } catch (error) {
        const message = safeError(error); tstate.error = message; tstate.status = abort?.aborted ? "cancelled" : "failed"
        const providerLike = isProviderLikeError(error)
        if (providerLike) await this.persistOutcome(decision.model.id, decision.model.providerID, "runtime_error", Date.now() - started, message)
        else await this.persistOutcome(decision.model.id, decision.model.providerID, "failure", Date.now() - started)
        if (attempt >= this.config.maxAttemptsPerTask || !providerLike || abort?.aborted) throw error
      } finally { this.callbacks.unregisterPolicy(sid); if (abort?.aborted) await this.abortSession(sid, this.root) }
    }
  }

  private async executeMutatingTask(run: RunState, task: TaskProfile, parentSessionID: string | undefined, abort?: AbortSignal): Promise<void> {
    const attempted = new Set<string>(), tstate = run.tasks[task.id]
    if (tstate.integration?.phase === "verified") {
      const patch = Buffer.from(tstate.integration.patchBase64, "base64")
      if (crypto.createHash("sha256").update(patch).digest("hex") !== tstate.integration.patchSha256) throw new Error(`Persisted patch hash mismatch for ${task.id}`)
      await recoverPatch(this.root, patch, abort)
      tstate.integration.phase = "integrated"
      tstate.status = "completed"
      await this.persist(run, { type: "task.integration_recovered", runID: run.id, taskID: task.id })
      return
    }
    for (let attempt = 1; attempt <= this.config.maxAttemptsPerTask; attempt++) {
      tstate.attempts = attempt
      const decision = routeModel({ role: task.worker, task, config: this.config, state: this.state, catalog: this.catalog, exclude: attempted })
      attempted.add(decision.model.id); this.reserveBudget(task, decision.estimatedCostUsd, run)
      const agent = runtimeAgent(task, run.id, attempt)
      const txn = await createWorktree(this.root, run.id, task.id, attempt, abort, agent)
      let sid: string | undefined
      const started = Date.now()
      try {
        sid = await this.createSession(txn.root, `TeamLead ${task.id}`, parentSessionID)
        tstate.sessionID = sid; tstate.model = decision.model.id; tstate.provider = decision.model.providerID; tstate.status = "running"
        await this.persist(run, { type: "task.started", runID: run.id, taskID: task.id })
        // Defense in depth: host-level dynamic agent permissions plus the parent plugin guard when this session is visible to the same plugin instance.
        this.callbacks.registerPolicy(sid, { role: "worker", root: txn.root, writeScope: task.writeScope, readOnly: false })
        await this.promptSession(sid, txn.root, agent.id, decision.model, taskPrompt(task), abort)
        const { patch, changed } = await collectPatch(txn, task.writeScope, abort)
        tstate.changedFiles = changed
        const checks = await selectChecks(txn.root, this.config, task, changed, false)
        const verification = await runChecks(txn.root, checks, abort)
        tstate.verification = verification
        if (verification.some((x) => !x.ok)) throw new Error(`Verification failed for ${task.id}: ${verification.find((x) => !x.ok)?.id}`)
        tstate.integration = { phase: "verified", patchBase64: patch.toString("base64"), patchSha256: crypto.createHash("sha256").update(patch).digest("hex") }
        await this.persist(run, { type: "task.verified", runID: run.id, taskID: task.id, patchSha256: tstate.integration.patchSha256 })
        await integratePatch(this.root, patch, abort)
        tstate.integration.phase = "integrated"
        tstate.status = "completed"
        await this.persist(run, { type: "task.integrated", runID: run.id, taskID: task.id, patchSha256: tstate.integration.patchSha256 })
        await this.persistOutcome(decision.model.id, decision.model.providerID, "pass", Date.now() - started, "success")
        return
      } catch (error) {
        const message = safeError(error); tstate.error = message; tstate.status = abort?.aborted ? "cancelled" : "failed"
        const providerLike = isProviderLikeError(error)
        if (providerLike) await this.persistOutcome(decision.model.id, decision.model.providerID, "runtime_error", Date.now() - started, message)
        else await this.persistOutcome(decision.model.id, decision.model.providerID, "failure", Date.now() - started)
        if (attempt >= this.config.maxAttemptsPerTask || !providerLike || abort?.aborted) throw error
      } finally {
        if (sid) this.callbacks.unregisterPolicy(sid)
        if (sid && abort?.aborted) await this.abortSession(sid, txn.root)
        await txn.cleanup()
      }
    }
  }

  private async executeTask(run: RunState, task: TaskProfile, parentSessionID: string | undefined, abort?: AbortSignal) {
    if (task.readOnly) await this.executeReadOnlyTask(run, task, parentSessionID, abort)
    else await this.executeMutatingTask(run, task, parentSessionID, abort)
  }

  private async executeDag(run: RunState, tasks: TaskProfile[], parentSessionID?: string, abort?: AbortSignal): Promise<void> {
    validateDag(tasks)
    const taskIDs = new Set(tasks.map((task) => task.id))
    const completed = new Set<string>()
    for (const state of Object.values(run.tasks)) if (taskIDs.has(state.task.id) && state.status === "completed") completed.add(state.task.id)
    while (tasks.some((task) => !completed.has(task.id))) {
      if (abort?.aborted) throw new Error("Run aborted")
      const pending = tasks.filter((t) => !completed.has(t.id))
      if (!pending.length) break
      const wave = nextWave(tasks, completed, new Set(), this.config)
      if (!wave.length) throw new Error("Scheduler made no progress; unresolved dependencies or unsafe scope")
      // Provider limits are enforced conservatively by routing first and admitting only a prefix when needed.
      const admitted: TaskProfile[] = []
      const providerUse = new Map<string, number>()
      for (const task of wave) {
        try {
          const decision = routeModel({ role: task.worker, task, config: this.config, state: this.state, catalog: this.catalog })
          const limit = this.config.providerConcurrency[decision.model.providerID] ?? this.config.maxParallelWorkers
          const used = providerUse.get(decision.model.providerID) ?? 0
          if (used < limit) { admitted.push(task); providerUse.set(decision.model.providerID, used + 1) }
        } catch { admitted.push(task) }
      }
      const results = await Promise.allSettled(admitted.map(async (task) => {
        await this.executeTask(run, task, parentSessionID, abort)
        completed.add(task.id)
        await this.persist(run, { type: "task.completed", runID: run.id, taskID: task.id })
      }))
      const rejected = results.find((x): x is PromiseRejectedResult => x.status === "rejected")
      if (rejected) throw rejected.reason
    }
  }

  private reviewLevel(run: RunState): 0 | 1 | 2 {
    if (!this.config.review.enabled) return 0
    const tasks = Object.values(run.tasks)
    if (tasks.some((t) => t.task.risks.some((r) => ["security", "database", "concurrency", "public-contract", "architecture"].includes(r))) || run.repairRound > 0) return this.config.review.criticalLevel
    if (this.softBudgetReached(run)) return 0
    const strongVerification = tasks.every((t) => t.task.readOnly || t.verification.length > 0 && t.verification.every((v) => v.ok))
    if (run.mode === "direct" && strongVerification && tasks.every((t) => t.task.complexity === "simple")) return 0
    return this.config.review.mediumLevel
  }

  private async finalVerification(run: RunState, abort?: AbortSignal) {
    run.finalVerification ??= []
    if (!this.config.verification.finalFullSuite) return
    const mutating = Object.values(run.tasks).filter((x) => !x.task.readOnly)
    if (!mutating.length) return
    const synthetic = profileTask({ id: "FINAL", description: run.goal, kind: "code", complexity: "normal", writeScope: ["__none__"] })
    const changed = [...new Set(mutating.flatMap((x) => x.changedFiles))]
    const checks = await selectChecks(this.root, this.config, synthetic, changed, true)
    const results = await runChecks(this.root, checks, abort)
    run.finalVerification = results
    if (results.some((x) => !x.ok)) throw new Error(`Final verification failed: ${results.find((x) => !x.ok)?.id}`)
  }

  private async review(run: RunState, parentSessionID: string | undefined, abort?: AbortSignal): Promise<ReviewSubmission | undefined> {
    const level = this.reviewLevel(run); run.reviewLevel = level
    if (level === 0) return
    const task = profileTask({ id: "REVIEW", description: run.goal, readOnly: true, kind: "search", complexity: level === 2 ? "critical" : "normal", estimatedTokens: level === 2 ? 48_000 : 24_000 })
    const attempted = new Set<string>()
    let lastError: unknown
    for (let attempt = 1; attempt <= this.config.maxAttemptsPerTask; attempt++) {
      let decision
      try { decision = routeModel({ role: "reviewer", task, config: this.config, state: this.state, catalog: this.catalog, exclude: attempted }) }
      catch (error) { throw lastError ?? error }
      attempted.add(decision.model.id)
      this.reserveBudget(task, decision.estimatedCostUsd, run)
      const sid = await this.createSession(this.root, `TeamLead review ${run.id} ${attempt}`, parentSessionID)
      this.callbacks.registerPolicy(sid, { role: "reviewer", root: this.root, writeScope: [], readOnly: true })
      try {
        await this.promptSession(sid, this.root, "teamlead-reviewer", decision.model, reviewPrompt(run, level as 1 | 2), abort)
        const submission = this.callbacks.takeReview(sid)
        if (!submission) throw new Error("Reviewer completed without teamlead_submit_review; no prose-verdict fallback is allowed")
        await this.persistProviderSuccess(decision.model.providerID)
        run.review = submission
        return submission
      } catch (error) {
        lastError = error
        if (isProviderLikeError(error)) this.state = await updateState(this.root, (state) => providerFailure(state, decision.model.providerID, safeError(error)))
        if (abort?.aborted || attempt >= this.config.maxAttemptsPerTask) throw error
      } finally {
        this.callbacks.unregisterPolicy(sid)
        if (abort?.aborted) await this.abortSession(sid, this.root)
      }
    }
    throw lastError ?? new Error("TeamLead reviewer failed")
  }

  private repairTasks(findings: ReviewFinding[], round: number): TaskProfile[] {
    return findings.map((finding, index) => {
      const paths = [...new Set(finding.paths.map((x) => x.replaceAll("\\", "/")).filter((x) => x && !x.startsWith("/") && !x.startsWith("../") && !/[?*]/.test(x)))]
      if (!paths.length) throw new Error(`Repair finding has no bounded concrete project-relative paths: ${finding.description}`)
      return profileTask({ id: `R${round}_${index + 1}`, description: `Repair reviewer finding: ${finding.description}`, writeScope: paths, worker: "codeWorker", complexity: finding.severity === "critical" ? "critical" : finding.severity === "high" ? "hard" : "normal", risks: finding.severity === "critical" ? ["review-critical"] : [] })
    })
  }

  async execute(input: { goal: string; tasks?: TaskSpec[]; parentSessionID?: string; abort?: AbortSignal; resumeRunID?: string }): Promise<RunState> {
    await this.refresh()
    const admission = chooseExecutionMode(input.goal, input.tasks)
    const runID = input.resumeRunID ?? id("run")
    let run = input.resumeRunID ? this.state.runs[input.resumeRunID] : undefined
    if (input.resumeRunID && !run) throw new Error(`Unknown run: ${input.resumeRunID}`)
    let tasks: TaskProfile[] = []
    if (run) {
      tasks = Object.values(run.tasks).map((x) => x.task)
      run.status = "running"; run.startedAt ??= Date.now(); run.error = undefined; run.finalVerification ??= []
    } else {
      run = {
        id: runID, goal: input.goal, mode: admission.mode, status: "running", parentSessionID: input.parentSessionID,
        createdAt: Date.now(), updatedAt: Date.now(), startedAt: Date.now(), reviewLevel: 0, repairRound: 0,
        estimatedTokens: 0, estimatedCostUsd: 0, finalVerification: [], tasks: {},
      }
    }
    await this.persist(run, { type: "run.started", runID: run.id, mode: run.mode })
    const heartbeat = setInterval(() => { void savePresentation(this.root, Object.values(this.state.runs), run.id).catch(() => {}) }, 2000)
    try {
      if (!tasks.length) {
        if (input.tasks?.length) tasks = addContractEdges(input.tasks.map(profileTask))
        else if (admission.mode === "team") tasks = await this.planWithLead(run, input.goal, input.parentSessionID, input.abort)
        else tasks = [admission.profile!]
        validateDag(tasks)
        run.tasks = Object.fromEntries(tasks.map((task) => [task.id, { task, status: "pending", attempts: 0, changedFiles: [], verification: [] }]))
        await this.persist(run, { type: "run.planned", runID: run.id, taskCount: tasks.length })
      }
      await this.executeDag(run, tasks, input.parentSessionID, input.abort)
       run.phase = "verification"; await this.persist(run)
       await this.finalVerification(run, input.abort)
       run.phase = undefined
      run.status = "review"; await this.persist(run)
      let review = await this.review(run, input.parentSessionID, input.abort)
      while (review?.verdict === "repair" && run.repairRound < this.config.maxRepairRounds) {
        run.repairRound++
        const repairs = this.repairTasks(review.findings, run.repairRound)
        for (const task of repairs) run.tasks[task.id] = { task, status: "pending", attempts: 0, changedFiles: [], verification: [] }
        run.status = "repair"; await this.persist(run, { type: "run.repair", runID: run.id, round: run.repairRound })
        await this.executeDag(run, repairs, input.parentSessionID, input.abort)
         run.phase = "verification"; await this.persist(run)
         await this.finalVerification(run, input.abort)
         run.phase = undefined
        review = await this.review(run, input.parentSessionID, input.abort)
      }
      if (review?.verdict === "repair") { run.status = "repair_required"; run.error = "Reviewer still requests repair after configured repair rounds" }
      else if (review?.verdict === "fail") { run.status = "failed"; run.error = review.summary }
      else { run.status = "completed"; run.completedAt = Date.now() }
      await this.persist(run, { type: "run.finished", runID: run.id, status: run.status })
      return run
    } catch (error) {
      run.status = input.abort?.aborted ? "cancelled" : "failed"; run.error = safeError(error); run.completedAt = Date.now()
      await this.persist(run, { type: "run.failed", runID: run.id, error: run.error })
      return run
    } finally { clearInterval(heartbeat) }
  }
}
