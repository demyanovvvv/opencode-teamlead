import fs from "node:fs/promises"
import path from "node:path"
import { matchesGlob } from "./glob.ts"
import { runProcess } from "./process.ts"
import type { TaskProfile, TeamLeadConfig, TrustedCheck, VerificationResult } from "./types.ts"

function configuredChecks(config: TeamLeadConfig, task: TaskProfile, changed: string[], final: boolean): TrustedCheck[] {
  return config.verification.checks.filter((check) => {
    if (final) return check.fullSuite || check.critical
    if (check.fullSuite) return false
    const kind = !check.taskKinds?.length || check.taskKinds.includes(task.kind)
    const paths = !check.paths?.length || changed.some((file) => check.paths!.some((pattern) => matchesGlob(file, pattern)))
    const contracts = !check.contracts?.length || [...(task.provides ?? []), ...(task.consumes ?? [])].some((x) => check.contracts!.includes(x))
    return kind && paths && contracts
  })
}

async function autoChecks(root: string, final: boolean): Promise<TrustedCheck[]> {
  const checks: TrustedCheck[] = []
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"))
    const scripts = pkg.scripts ?? {}
    const add = (name: string, critical = false) => { if (typeof scripts[name] === "string") checks.push({ id: `npm-${name}`, executable: "npm", args: ["run", name], timeoutMs: 900_000, fullSuite: final, critical }) }
    if (final) { add("typecheck", true); add("check", true); add("lint"); add("test", true); add("build") }
    else { add("typecheck", true); add("check", true); add("lint"); if (!checks.length) add("test", true) }
    return checks
  } catch {}
  try { await fs.access(path.join(root, "Cargo.toml")); checks.push({ id: final ? "cargo-test" : "cargo-check", executable: "cargo", args: final ? ["test", "--workspace", "--all-targets"] : ["check", "--workspace", "--all-targets"], timeoutMs: 900_000, fullSuite: final, critical: true }); return checks } catch {}
  try { await fs.access(path.join(root, "go.mod")); checks.push({ id: "go-test", executable: "go", args: ["test", "./..."], timeoutMs: 900_000, fullSuite: final, critical: true }); return checks } catch {}
  try { await fs.access(path.join(root, "pyproject.toml")); checks.push({ id: "pytest", executable: "python", args: ["-m", "pytest"], timeoutMs: 900_000, fullSuite: final, critical: true }); return checks } catch {}
  return checks
}

export async function selectChecks(root: string, config: TeamLeadConfig, task: TaskProfile, changed: string[], final: boolean): Promise<TrustedCheck[]> {
  const explicit = configuredChecks(config, task, changed, final)
  if (explicit.length || !config.verification.autoDetect) return explicit
  return autoChecks(root, final)
}

export async function runChecks(root: string, checks: TrustedCheck[], abort?: AbortSignal): Promise<VerificationResult[]> {
  const results: VerificationResult[] = []
  for (const check of checks) {
    const r = await runProcess(check.executable, check.args, { cwd: root, timeoutMs: check.timeoutMs ?? 600_000, abort })
    results.push({ id: check.id, command: [check.executable, ...check.args].join(" "), ok: r.code === 0 && !r.timedOut, exitCode: r.code, durationMs: r.durationMs, stdout: r.stdout.slice(-20_000), stderr: r.stderr.slice(-20_000), timedOut: r.timedOut })
    if (r.code !== 0 || r.timedOut) break
  }
  return results
}
