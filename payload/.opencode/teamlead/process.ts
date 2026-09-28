import { spawn, spawnSync } from "node:child_process"

export interface ProcessResult { code: number | null; stdout: string; stderr: string; timedOut: boolean; durationMs: number }

// Kill the whole process tree: descendants otherwise survive the parent kill,
// leak resources, and can keep writing inside the WRITE SCOPE after cancel.
function killTree(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return
  if (process.platform === "win32") {
    try { spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }) } catch {}
    return
  }
  try { process.kill(-child.pid, signal) } catch { try { child.kill(signal) } catch {} }
}

export function runProcess(executable: string, args: string[], options: { cwd: string; timeoutMs?: number; abort?: AbortSignal; input?: Buffer | string }): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const child = spawn(executable, args, { cwd: options.cwd, shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"] })
    const stdout: Buffer[] = [], stderr: Buffer[] = []
    let timedOut = false, settled = false, killRequested = false, forceKillTimer: NodeJS.Timeout | undefined
    const cleanup = () => {
      clearTimeout(timer)
      if (forceKillTimer) clearTimeout(forceKillTimer)
      options.abort?.removeEventListener("abort", onAbort)
    }
    const finish = (code: number | null) => {
      if (settled) return; settled = true
      cleanup()
      resolve({ code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8"), timedOut, durationMs: Date.now() - started })
    }
    child.stdout?.on("data", (x) => stdout.push(Buffer.from(x)))
    child.stderr?.on("data", (x) => stderr.push(Buffer.from(x)))
    child.once("error", (error) => { if (!settled) { settled = true; cleanup(); reject(error) } })
    child.once("close", finish)
    if (options.input !== undefined) { child.stdin?.end(options.input) }
    const kill = () => {
      if (killRequested) return
      killRequested = true
      killTree(child, "SIGTERM")
      forceKillTimer = setTimeout(() => killTree(child, "SIGKILL"), 1500)
      forceKillTimer.unref()
    }
    const onAbort = () => kill()
    options.abort?.addEventListener("abort", onAbort, { once: true })
    const timer = setTimeout(() => { timedOut = true; kill() }, options.timeoutMs ?? 600_000)
    timer.unref()
    if (options.abort?.aborted) onAbort()
  })
}

export async function mustRun(executable: string, args: string[], cwd: string, options: { timeoutMs?: number; abort?: AbortSignal; input?: Buffer | string } = {}): Promise<ProcessResult> {
  const result = await runProcess(executable, args, { cwd, ...options })
  if (result.code !== 0) throw new Error(`${executable} ${args.join(" ")} failed (${result.code}): ${result.stderr || result.stdout}`)
  return result
}
