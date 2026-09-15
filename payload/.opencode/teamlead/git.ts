import fs from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"
import os from "node:os"
import { mustRun, runProcess } from "./process.ts"
import { validateChangedPaths } from "./security.ts"

export interface WorktreeTxn {
  root: string
  gitRoot: string
  baseline: string
  cleanup(): Promise<void>
}

async function git(cwd: string, args: string[], input?: Buffer | string, abort?: AbortSignal) {
  return mustRun("git", ["-c", "core.autocrlf=false", ...args], cwd, { input, abort, timeoutMs: 120_000 })
}

async function copyFileSafe(sourceRoot: string, destRoot: string, rel: string) {
  const normalizedSource = path.resolve(sourceRoot), normalizedDest = path.resolve(destRoot)
  const src = path.resolve(normalizedSource, rel), dst = path.resolve(normalizedDest, rel)
  if (!src.startsWith(normalizedSource + path.sep) || !dst.startsWith(normalizedDest + path.sep)) throw new Error(`Unsafe copy path: ${rel}`)
  const st = await fs.lstat(src)
  await fs.mkdir(path.dirname(dst), { recursive: true })
  if (st.isSymbolicLink()) await fs.symlink(await fs.readlink(src), dst)
  else if (st.isFile()) await fs.copyFile(src, dst)
}

async function overlayProjectState(primary: string, worktree: string, abort?: AbortSignal) {
  const diff = await runProcess("git", ["diff", "--binary", "HEAD"], { cwd: primary, abort, timeoutMs: 120_000 })
  if (diff.code !== 0) throw new Error(`git diff failed: ${diff.stderr}`)
  if (diff.stdout.length) await git(worktree, ["apply", "--binary", "--whitespace=nowarn", "-"], diff.stdout, abort)
  const untracked = await git(primary, ["ls-files", "--others", "--exclude-standard", "-z"], undefined, abort)
  for (const rel of untracked.stdout.split("\0").filter(Boolean)) {
    if (rel.startsWith(".opencode/.teamlead/")) continue
    await copyFileSafe(primary, worktree, rel)
  }
  // TeamLead control/agent files may be ignored by the repository; copy them into the baseline explicitly.
  for (const rel of [".opencode/agents/teamlead-lead.md", ".opencode/agents/teamlead-reviewer.md", ".opencode/agents/teamlead-worker-code.md", ".opencode/agents/teamlead-worker-files.md", ".opencode/agents/teamlead-worker-search.md", ".opencode/agents/teamlead-worker-alt.md"]) {
    try { await copyFileSafe(primary, worktree, rel) } catch {}
  }
}

export async function createWorktree(primaryRoot: string, runID: string, taskID: string, attempt: number, abort?: AbortSignal, runtimeAgent?: { id: string; content: string }): Promise<WorktreeTxn> {
  const top = (await git(primaryRoot, ["rev-parse", "--show-toplevel"], undefined, abort)).stdout.trim()
  if (!top) throw new Error("TeamLead mutating tasks require a Git worktree")
  const worktreeBase = path.join(primaryRoot, ".opencode", ".teamlead", "worktrees")
  await fs.mkdir(worktreeBase, { recursive: true })
  const safe = `${runID}-${taskID}-${attempt}-${crypto.randomBytes(3).toString("hex")}`.replace(/[^A-Za-z0-9_.-]/g, "_")
  const root = path.join(worktreeBase, safe)
  await git(top, ["worktree", "add", "--detach", root, "HEAD"], undefined, abort)
  let cleaned = false
  const cleanup = async () => {
    if (cleaned) return; cleaned = true
    await runProcess("git", ["worktree", "remove", "--force", root], { cwd: top, timeoutMs: 120_000 })
    await fs.rm(root, { recursive: true, force: true }).catch(() => {})
  }
  try {
    await overlayProjectState(top, root, abort)
    if (runtimeAgent) {
      const agentFile = path.join(root, ".opencode", "agents", `${runtimeAgent.id}.md`)
      await fs.mkdir(path.dirname(agentFile), { recursive: true })
      await fs.writeFile(agentFile, runtimeAgent.content, "utf8")
    }
    await git(root, ["add", "-A", "-f"], undefined, abort)
    await git(root, ["-c", "user.name=OpenCode TeamLead", "-c", "user.email=teamlead@localhost", "commit", "--allow-empty", "-m", "TeamLead ephemeral baseline"], undefined, abort)
    const baseline = (await git(root, ["rev-parse", "HEAD"], undefined, abort)).stdout.trim()
    return { root, gitRoot: top, baseline, cleanup }
  } catch (error) { await cleanup(); throw error }
}

export async function collectPatch(txn: WorktreeTxn, writeScope: string[], abort?: AbortSignal): Promise<{ patch: Buffer; changed: string[] }> {
  await git(txn.root, ["add", "-A"], undefined, abort)
  const names = await git(txn.root, ["diff", "--cached", "--name-only", "-z", txn.baseline], undefined, abort)
  const changed = names.stdout.split("\0").filter(Boolean).map((x) => x.replaceAll("\\", "/"))
  await validateChangedPaths(txn.root, changed, writeScope)
  const patchResult = await runProcess("git", ["diff", "--cached", "--binary", txn.baseline], { cwd: txn.root, timeoutMs: 120_000, abort })
  if (patchResult.code !== 0) throw new Error(`Failed to collect patch: ${patchResult.stderr}`)
  return { patch: Buffer.from(patchResult.stdout, "utf8"), changed }
}

async function acquireLock(root: string, abort?: AbortSignal): Promise<() => Promise<void>> {
  const dir = path.join(root, ".opencode", ".teamlead")
  const lock = path.join(dir, "integration.lock")
  await fs.mkdir(dir, { recursive: true })
  const deadline = Date.now() + 30_000
  const token = crypto.randomBytes(16).toString("hex")
  for (;;) {
    if (abort?.aborted) throw new Error("Aborted while waiting for integration lock")
    try {
      const handle = await fs.open(lock, "wx")
      await handle.writeFile(JSON.stringify({ pid: process.pid, hostname: os.hostname(), token, at: Date.now() }))
      await handle.close()
      return async () => {
        try {
          const owner = JSON.parse(await fs.readFile(lock, "utf8")) as { token?: string }
          if (owner.token === token) await fs.rm(lock, { force: true })
        } catch {}
      }
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error
      try {
        const st = await fs.stat(lock)
        if (Date.now() - st.mtimeMs > 10 * 60_000) {
          let alive = false
          try {
            const owner = JSON.parse(await fs.readFile(lock, "utf8")) as { pid?: number; hostname?: string }
            alive = owner.hostname !== os.hostname() || typeof owner.pid !== "number"
            if (!alive && typeof owner.pid === "number") {
              try { process.kill(owner.pid, 0); alive = true } catch (signalError: any) { alive = signalError?.code === "EPERM" }
            }
          } catch {}
          if (!alive) { await fs.rm(lock, { force: true }); continue }
        }
      } catch {}
      if (Date.now() >= deadline) throw new Error("Timed out waiting for TeamLead integration lock")
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}

export async function integratePatch(primaryRoot: string, patch: Buffer, abort?: AbortSignal): Promise<void> {
  if (!patch.length) return
  const release = await acquireLock(primaryRoot, abort)
  try {
    await git(primaryRoot, ["apply", "--check", "--binary", "--whitespace=nowarn", "-"], patch, abort)
    await git(primaryRoot, ["apply", "--binary", "--whitespace=nowarn", "-"], patch, abort)
  } finally { await release() }
}

export async function recoverPatch(primaryRoot: string, patch: Buffer, abort?: AbortSignal): Promise<"applied" | "already_applied"> {
  if (!patch.length) return "already_applied"
  const release = await acquireLock(primaryRoot, abort)
  try {
    const applicable = await runProcess("git", ["-c", "core.autocrlf=false", "apply", "--check", "--binary", "--whitespace=nowarn", "-"], { cwd: primaryRoot, input: patch, abort, timeoutMs: 120_000 })
    if (applicable.code === 0) {
      await git(primaryRoot, ["apply", "--binary", "--whitespace=nowarn", "-"], patch, abort)
      return "applied"
    }
    const reversed = await runProcess("git", ["-c", "core.autocrlf=false", "apply", "--reverse", "--check", "--binary", "--whitespace=nowarn", "-"], { cwd: primaryRoot, input: patch, abort, timeoutMs: 120_000 })
    if (reversed.code === 0) return "already_applied"
    throw new Error("Cannot recover TeamLead patch: primary checkout no longer matches either side of the persisted patch")
  } finally { await release() }
}
