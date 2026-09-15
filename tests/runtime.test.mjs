import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { TeamLeadRuntime } from "../payload/.opencode/teamlead/runtime.ts"
import { loadState, saveState } from "../payload/.opencode/teamlead/state.ts"

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" })
  if (r.status !== 0) throw new Error(r.stderr || r.stdout)
  return r.stdout.trim()
}

async function repo() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-runtime-"))
  git(root, "init")
  git(root, "config", "user.email", "test@example.com")
  git(root, "config", "user.name", "Test")
  await fs.mkdir(path.join(root, "src"), { recursive: true })
  await fs.writeFile(path.join(root, "src", "a.txt"), "base\n")
  git(root, "add", "."); git(root, "commit", "-m", "base")
  return root
}

test("runtime initialization does not require a provider catalog", async () => {
  const root = await repo()
  let providerListCalls = 0
  const runtime = new TeamLeadRuntime(root, {
    provider: {
      list: async () => {
        providerListCalls += 1
        throw new Error("provider unavailable")
      },
    },
  }, {
    registerPolicy() {},
    unregisterPolicy() {},
    takePlan() {},
    takeReview() {},
  })

  await runtime.init()

  assert.equal(providerListCalls, 0)
  assert.deepEqual(runtime.getCatalog(), [])
})

function harness(root, { workerText = "fixed\n", planTasks, twoProviders = false, failProviderOnce } = {}) {
  let seq = 0
  let reviewerPrompts = 0
  let plannerPrompts = 0
  const failedProviders = new Set()
  const reviews = new Map()
  const plans = new Map()
  const policies = new Map()
  const providerList = twoProviders
    ? { connected: ["a", "b"], all: [
        { id: "a", models: { m: { id: "m", tool_call: true, limit: { context: 200000 }, cost: { input: 0.1, output: 0.2 } } } },
        { id: "b", models: { m: { id: "m", tool_call: true, limit: { context: 200000 }, cost: { input: 0.1, output: 0.2 } } } },
      ] }
    : { connected: ["mock"], all: [{ id: "mock", models: { m: { id: "m", tool_call: true, limit: { context: 200000 }, cost: { input: 0.1, output: 0.2 } } } }] }
  const client = {
    provider: { list: async () => ({ data: providerList }) },
    session: {
      create: async () => ({ data: { id: `s${++seq}` } }),
      abort: async () => ({ data: true }),
      prompt: async ({ path: pathArg, query, body }) => {
        if (failProviderOnce && body.model?.providerID === failProviderOnce && !failedProviders.has(failProviderOnce)) {
          failedProviders.add(failProviderOnce)
          throw new Error("provider timeout")
        }
        if (String(body.agent).startsWith("teamlead-runtime-")) {
          await fs.writeFile(path.join(query.directory, "src", "a.txt"), workerText)
        } else if (body.agent === "teamlead-lead") {
          plannerPrompts++
          plans.set(pathArg.id, { tasks: planTasks ?? [{ id: "T1", description: "Edit src/a.txt", writeScope: ["src/a.txt"] }], rationale: "bounded" })
        } else if (body.agent === "teamlead-reviewer") {
          reviewerPrompts++
          reviews.set(pathArg.id, { verdict: "pass", summary: "ok", findings: [] })
        }
        return { data: { parts: [{ type: "text", text: "ok" }] } }
      },
      messages: async () => ({ data: [] }),
    },
  }
  const callbacks = {
    registerPolicy(id, policy) { policies.set(id, policy) },
    unregisterPolicy(id) { policies.delete(id) },
    takePlan(id) { const x = plans.get(id); plans.delete(id); return x },
    takeReview(id) { const x = reviews.get(id); reviews.delete(id); return x },
  }
  return { client, callbacks, get reviewerPrompts() { return reviewerPrompts }, get plannerPrompts() { return plannerPrompts } }
}

async function writeConfig(root, config) {
  await fs.mkdir(path.join(root, ".opencode"), { recursive: true })
  await fs.writeFile(path.join(root, ".opencode", "teamlead.json"), JSON.stringify({ schemaVersion: 2, ...config }, null, 2))
}

test("full runtime integrates isolated worker patch and completes structured review", async () => {
  const root = await repo()
  const h = harness(root)
  try {
    const runtime = new TeamLeadRuntime(root, h.client, h.callbacks)
    await runtime.init()
    const run = await runtime.execute({ goal: "Fix bug in `src/a.txt`" })
    assert.equal(run.status, "completed")
    assert.equal(run.mode, "direct")
    assert.equal(await fs.readFile(path.join(root, "src", "a.txt"), "utf8"), "fixed\n")
    assert.equal(h.reviewerPrompts, 1)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test("failing trusted verification leaves primary checkout unchanged", async () => {
  const root = await repo()
  await writeConfig(root, { verification: { autoDetect: false, finalFullSuite: false, checks: [{ id: "fail", executable: process.execPath, args: ["-e", "process.exit(1)"], paths: ["src/**"] }] } })
  const h = harness(root)
  try {
    const runtime = new TeamLeadRuntime(root, h.client, h.callbacks)
    await runtime.init()
    const run = await runtime.execute({ goal: "Fix bug in `src/a.txt`" })
    assert.equal(run.status, "failed")
    assert.match(run.error ?? "", /Verification failed/)
    assert.equal(await fs.readFile(path.join(root, "src", "a.txt"), "utf8"), "base\n")
    assert.equal(h.reviewerPrompts, 0)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test("strong direct verification skips unnecessary LLM reviewer", async () => {
  const root = await repo()
  await writeConfig(root, { verification: { autoDetect: false, finalFullSuite: false, checks: [{ id: "pass", executable: process.execPath, args: ["-e", "process.exit(0)"], paths: ["src/**"] }] } })
  const h = harness(root)
  try {
    const runtime = new TeamLeadRuntime(root, h.client, h.callbacks)
    await runtime.init()
    const run = await runtime.execute({ goal: "Fix bug in `src/a.txt`" })
    assert.equal(run.status, "completed")
    assert.equal(run.reviewLevel, 0)
    assert.equal(h.reviewerPrompts, 0)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})


test("team mode uses typed Lead DAG before worker execution", async () => {
  const root = await repo()
  const h = harness(root)
  try {
    const runtime = new TeamLeadRuntime(root, h.client, h.callbacks)
    await runtime.init()
    const run = await runtime.execute({ goal: "Redesign architecture across API and frontend" })
    assert.equal(run.status, "completed")
    assert.equal(run.mode, "team")
    assert.equal(h.plannerPrompts, 1)
    assert.equal(await fs.readFile(path.join(root, "src", "a.txt"), "utf8"), "fixed\n")
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test("team planner is rejected before prompting when its token budget cannot be reserved", async () => {
  const root = await repo()
  await writeConfig(root, { budget: { maxTokens: 47_999 } })
  const h = harness(root)
  try {
    const runtime = new TeamLeadRuntime(root, h.client, h.callbacks)
    await runtime.init()
    const run = await runtime.execute({ goal: "Redesign architecture across API and frontend" })
    assert.equal(run.status, "failed")
    assert.match(run.error ?? "", /Token budget/)
    assert.equal(h.plannerPrompts, 0)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})


test("worker provider failure fails over to another eligible connected model", async () => {
  const root = await repo()
  const h = harness(root, { twoProviders: true, failProviderOnce: "a" })
  try {
    const runtime = new TeamLeadRuntime(root, h.client, h.callbacks)
    await runtime.init()
    const run = await runtime.execute({ goal: "Fix bug in `src/a.txt`" })
    assert.equal(run.status, "completed")
    assert.equal(run.tasks.T1.attempts, 2)
    assert.equal(run.tasks.T1.provider, "b")
    assert.equal(await fs.readFile(path.join(root, "src", "a.txt"), "utf8"), "fixed\n")
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test("provider concurrency is enforced at actual prompt time", async () => {
  const root = await repo()
  await writeConfig(root, { providerConcurrency: { mock: 1 }, review: { enabled: false, mediumLevel: 0, criticalLevel: 0 }, verification: { autoDetect: false, finalFullSuite: false, checks: [] } })
  const h = harness(root)
  const originalPrompt = h.client.session.prompt
  let active = 0
  let maxActive = 0
  h.client.session.prompt = async (args) => {
    active++
    maxActive = Math.max(maxActive, active)
    await new Promise((resolve) => setTimeout(resolve, 25))
    try { return await originalPrompt(args) }
    finally { active-- }
  }
  try {
    const runtime = new TeamLeadRuntime(root, h.client, h.callbacks)
    await runtime.init()
    const run = await runtime.execute({
      goal: "Inspect two independent areas",
      tasks: [
        { id: "T1", description: "Inspect src/a.txt only", readOnly: true, kind: "search" },
        { id: "T2", description: "Inspect src/a.txt independently", readOnly: true, kind: "search" },
      ],
    })
    assert.equal(run.status, "completed")
    assert.equal(maxActive, 1)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test("resume completes a verified patch without prompting a worker again", async () => {
  const root = await repo()
  const h = harness(root)
  try {
    const runtime = new TeamLeadRuntime(root, h.client, h.callbacks)
    await runtime.init()
    const first = await runtime.execute({ goal: "Fix bug in `src/a.txt`" })
    const state = await loadState(root)
    const task = state.runs[first.id].tasks.T1
    task.status = "running"
    task.integration.phase = "verified"
    state.runs[first.id].status = "failed"
    await saveState(root, state)
    let prompts = 0
    const original = h.client.session.prompt
    h.client.session.prompt = async (args) => { prompts++; return original(args) }
    const resumed = await runtime.execute({ goal: first.goal, resumeRunID: first.id })
    assert.equal(resumed.status, "completed")
    assert.equal(prompts, 1, "only the reviewer may be prompted after recovery")
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})
