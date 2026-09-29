import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { chooseExecutionMode, inferPaths, profileTask } from "../payload/.opencode/teamlead/profiler.ts"
import { migrateConfig } from "../payload/.opencode/teamlead/config.ts"
import { catalogFromProviderResponse, routeModel } from "../payload/.opencode/teamlead/router.ts"
import { nextWave, validateDag } from "../payload/.opencode/teamlead/scheduler.ts"
import { guardTool, validateChangedPaths } from "../payload/.opencode/teamlead/security.ts"

const state = { schemaVersion: 2, runs: {}, evidence: {}, providerCircuits: {} }
const config = migrateConfig({ schemaVersion: 2 })

test("profiler extracts concrete scope and selects direct for small bounded fix", () => {
  assert.deepEqual(inferPaths("Fix `src/ui/button.ts` now"), ["src/ui/button.ts"])
  const result = chooseExecutionMode("Fix bug in `src/ui/button.ts`")
  assert.equal(result.mode, "direct")
  assert.deepEqual(result.profile.writeScope, ["src/ui/button.ts"])
})

test("profiler escalates unbounded mutation to team", () => {
  const result = chooseExecutionMode("Update the authentication implementation")
  assert.equal(result.mode, "team")
  assert.match(result.reasons.join(" "), /WRITE SCOPE/)
})

test("migration preserves useful model config and discards raw commands", () => {
  const cfg = migrateConfig({ strongModel: "p/lead", reviewerModel: "p/review", gateCommands: ["rm -rf /"], verification: { checks: [{ id: "bad", command: "npm test" }, { id: "ok", executable: "npm", args: ["test"] }] } })
  assert.equal(cfg.models.orchestrator, "p/lead")
  assert.equal(cfg.models.reviewer, "p/review")
  assert.equal(cfg.verification.checks.length, 1)
  assert.equal(cfg.verification.checks[0].id, "ok")
})

test("language defaults to English and accepts Russian preference", () => {
  assert.equal(migrateConfig({}).language, "en")
  assert.equal(migrateConfig({ language: "ru" }).language, "ru")
  assert.equal(migrateConfig({ language: "de" }).language, "en")
})

test("router never relaxes tool/context hard eligibility", () => {
  const catalog = catalogFromProviderResponse({ connected: ["p"], all: [{ id: "p", models: {
    tiny: { id: "tiny", tool_call: true, limit: { context: 4000 }, cost: { input: 0.1, output: 0.2 } },
    noTools: { id: "noTools", tool_call: false, limit: { context: 100000 } },
    good: { id: "good", tool_call: true, limit: { context: 100000 }, cost: { input: 1, output: 2 } }
  }}] })
  const task = profileTask({ id: "T", description: "Fix `src/a.ts`", estimatedTokens: 10000 })
  const route = routeModel({ role: "codeWorker", task, config, state, catalog })
  assert.equal(route.model.id, "p/good")
})

test("scheduler serializes overlapping write scopes", () => {
  const a = profileTask({ id: "A", description: "Edit A", writeScope: ["src/auth/**"] })
  const b = profileTask({ id: "B", description: "Edit B", writeScope: ["src/auth/token.ts"] })
  const c = profileTask({ id: "C", description: "Edit C", writeScope: ["src/ui/**"] })
  validateDag([a,b,c])
  const wave = nextWave([a,b,c], new Set(), new Set(), { ...config, maxParallelWorkers: 3 })
  assert.equal(wave.length, 2)
  assert.ok(wave.some(x => x.id === "C"))
  assert.notEqual(wave.some(x => x.id === "A"), wave.some(x => x.id === "B"))
})

test("security fails closed for unknown mutation target and traversal", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-security-"))
  const policy = { role: "worker", root, writeScope: ["src/**"], readOnly: false }
  await assert.rejects(() => guardTool(policy, "edit", { oldString: "x", newString: "y" }), /identify the target path/)
  await assert.rejects(() => guardTool(policy, "write", { path: "../escape.txt", content: "x" }), /external path/)
  await fs.mkdir(path.join(root, "src"), { recursive: true })
  await fs.writeFile(path.join(root, "src", "ok.ts"), "x")
  await guardTool(policy, "edit", { filePath: "src/ok.ts", oldString: "x", newString: "y" })
  await assert.rejects(() => validateChangedPaths(root, ["README.md"], ["src/**"]), /outside WRITE SCOPE/)
  await fs.rm(root, { recursive: true, force: true })
})

test("explicit empty connected-provider list does not silently enable providers", () => {
  const catalog = catalogFromProviderResponse({ connected: [], all: [{ id: "p", models: { m: { id: "m", tool_call: true, limit: { context: 100000 } } } }] })
  assert.equal(catalog[0].connected, false)
  const task = profileTask({ id: "T", description: "Fix `src/a.ts`", estimatedTokens: 5000 })
  assert.throws(() => routeModel({ role: "codeWorker", task, config, state, catalog }), /No eligible model/)
})

test("explicit WRITE SCOPE rejects traversal, absolute and repository-wide grants", () => {
  assert.throws(() => profileTask({ id: "T", description: "edit", writeScope: ["../outside/**"] }), /Unsafe or unbounded WRITE SCOPE/)
  assert.throws(() => profileTask({ id: "T", description: "edit", writeScope: ["/tmp/x"] }), /Unsafe or unbounded WRITE SCOPE/)
  assert.throws(() => profileTask({ id: "T", description: "edit", writeScope: ["**"] }), /Unsafe or unbounded WRITE SCOPE/)
  assert.deepEqual(profileTask({ id: "T", description: "edit", writeScope: ["src/auth/**"] }).writeScope, ["src/auth/**"])
})
