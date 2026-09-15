import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { chooseExecutionMode, profileTask } from "../payload/.opencode/teamlead/profiler.ts"
import { migrateConfig } from "../payload/.opencode/teamlead/config.ts"
import { routeModel } from "../payload/.opencode/teamlead/router.ts"
import { addContractEdges, validateDag, nextWave } from "../payload/.opencode/teamlead/scheduler.ts"
import { guardTool } from "../payload/.opencode/teamlead/security.ts"
import { selectChecks } from "../payload/.opencode/teamlead/verify.ts"

const cfg = migrateConfig({ schemaVersion: 2, maxParallelWorkers: 6 })

test("admission distinguishes direct, managed and team", () => {
  assert.equal(chooseExecutionMode("Fix typo in `src/ui/button.ts`").mode, "direct")
  assert.equal(chooseExecutionMode("Fix OAuth token validation in `src/auth/token.ts`").mode, "managed")
  assert.equal(chooseExecutionMode("Redesign authentication across API frontend and tests").mode, "team")
})

test("DAG cycle is rejected", () => {
  const a = profileTask({ id: "A", description: "A", readOnly: true, dependsOn: ["B"] })
  const b = profileTask({ id: "B", description: "B", readOnly: true, dependsOn: ["A"] })
  assert.throws(() => validateDag([a,b]), /cycle/i)
})

test("critical path is preferred before unrelated short work", () => {
  const a = profileTask({ id: "A", description: "hard root", readOnly: true, complexity: "hard" })
  const b = profileTask({ id: "B", description: "child", readOnly: true, dependsOn: ["A"], complexity: "hard" })
  const c = profileTask({ id: "C", description: "short", readOnly: true, complexity: "simple" })
  const wave = nextWave([a,b,c], new Set(), new Set(), { ...cfg, maxParallelWorkers: 1 })
  assert.equal(wave[0].id, "A")
})

test("open provider circuit is a hard exclusion", () => {
  const task = profileTask({ id: "T", description: "Fix `src/x.ts`", estimatedTokens: 5000 })
  const catalog = [
    { id: "p/a", providerID: "p", modelID: "a", connected: true, toolCall: true, context: 100000 },
    { id: "q/b", providerID: "q", modelID: "b", connected: true, toolCall: true, context: 100000 },
  ]
  const state = { schemaVersion: 2, runs: {}, evidence: {}, providerCircuits: { p: { failures: 3, openedUntil: Date.now() + 60000 } } }
  assert.equal(routeModel({ role: "codeWorker", task, config: cfg, state, catalog }).model.id, "q/b")
})

test("controlled worker cannot use shell or task", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-deny-"))
  const policy = { role: "worker", root, writeScope: ["src/**"], readOnly: false }
  await assert.rejects(() => guardTool(policy, "bash", { command: "git status" }), /cannot use/i)
  await assert.rejects(() => guardTool(policy, "task", { subagent_type: "general" }), /cannot use/i)
  await fs.rm(root, { recursive: true, force: true })
})

test("symlink escape is rejected", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-link-root-"))
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-link-out-"))
  await fs.mkdir(path.join(root, "src"), { recursive: true })
  try {
    await fs.symlink(outside, path.join(root, "src", "escape"), "dir")
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true }); await fs.rm(outside, { recursive: true, force: true })
    t.skip(`symlink unavailable: ${error}`); return
  }
  const policy = { role: "worker", root, writeScope: ["src/**"], readOnly: false }
  await assert.rejects(() => guardTool(policy, "write", { path: "src/escape/pwn.txt", content: "x" }), /symlink escape/i)
  await fs.rm(root, { recursive: true, force: true }); await fs.rm(outside, { recursive: true, force: true })
})

test("targeted verification accepts only structured checks and path matches", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-verify-"))
  const config = migrateConfig({ verification: { autoDetect: false, checks: [
    { id: "auth", executable: "npm", args: ["test", "--", "auth"], paths: ["src/auth/**"] },
    { id: "ui", executable: "npm", args: ["test", "--", "ui"], paths: ["src/ui/**"] },
    { id: "unsafe", command: "npm test" }
  ] } })
  const task = profileTask({ id: "T", description: "Fix auth", writeScope: ["src/auth/token.ts"] })
  const checks = await selectChecks(root, config, task, ["src/auth/token.ts"], false)
  assert.deepEqual(checks.map(x => x.id), ["auth"])
  await fs.rm(root, { recursive: true, force: true })
})

test("strategy changes safe parallel wave width", () => {
  const tasks = Array.from({ length: 6 }, (_, i) => profileTask({
    id: `P${i + 1}`,
    description: `Read-only task ${i + 1}`,
    readOnly: true,
    complexity: "normal",
  }))
  const balanced = nextWave(tasks, new Set(), new Set(), { ...cfg, strategy: "balanced", maxParallelWorkers: 6 })
  const quality = nextWave(tasks, new Set(), new Set(), { ...cfg, strategy: "quality", maxParallelWorkers: 6 })
  const economy = nextWave(tasks, new Set(), new Set(), { ...cfg, strategy: "economy", maxParallelWorkers: 6 })
  assert.equal(balanced.length, 6)
  assert.equal(quality.length, 5)
  assert.equal(economy.length, 4)
})


test("contract provider automatically precedes consumer", () => {
  const tasks = addContractEdges([
    profileTask({ id: "A", description: "Provide auth contract", readOnly: true, provides: ["auth-api"] }),
    profileTask({ id: "B", description: "Consume auth contract", readOnly: true, consumes: ["auth-api"] }),
  ])
  assert.deepEqual(tasks.find((x) => x.id === "B").dependsOn, ["A"])
})

test("apply_patch marker paths are enforced against WRITE SCOPE", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-patch-scope-"))
  await fs.mkdir(path.join(tmp, "src"), { recursive: true })
  try {
    const policy = { role: "worker", root: tmp, writeScope: ["src/**"], readOnly: false }
    await guardTool(policy, "apply_patch", { patchText: "*** Begin Patch\n*** Add File: src/ok.ts\n*** End Patch" })
    await assert.rejects(
      guardTool(policy, "apply_patch", { patchText: "*** Begin Patch\n*** Update File: src/ok.ts\n*** Move to: ../escape.ts\n*** End Patch" }),
      /external path|WRITE SCOPE|symlink escape/,
    )
    await assert.rejects(
      guardTool(policy, "apply_patch", { patchText: "*** Begin Patch\n*** Add File: docs/nope.md\n*** End Patch" }),
      /WRITE SCOPE/,
    )
    await assert.rejects(guardTool(policy, "apply_patch", { patchText: "*** Begin Patch\n*** End Patch" }), /identify the target path/)
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
})
