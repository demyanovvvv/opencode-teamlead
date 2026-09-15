import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createWorktree, collectPatch, integratePatch } from "../payload/.opencode/teamlead/git.ts"

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" })
  if (r.status !== 0) throw new Error(r.stderr || r.stdout)
  return r.stdout.trim()
}

test("real git worktree preserves dirty baseline and integrates worker-only patch", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-git-"))
  git(root, "init")
  git(root, "config", "user.email", "test@example.com")
  git(root, "config", "user.name", "Test")
  await fs.mkdir(path.join(root, "src"), { recursive: true })
  await fs.writeFile(path.join(root, "src", "a.txt"), "base\n")
  git(root, "add", "."); git(root, "commit", "-m", "base")
  await fs.writeFile(path.join(root, "src", "a.txt"), "dirty user state\n")
  const txn = await createWorktree(root, "runx", "T1", 1)
  try {
    assert.equal(await fs.readFile(path.join(txn.root, "src", "a.txt"), "utf8"), "dirty user state\n")
    await fs.writeFile(path.join(txn.root, "src", "a.txt"), "worker result\n")
    const { patch, changed } = await collectPatch(txn, ["src/a.txt"])
    assert.deepEqual(changed, ["src/a.txt"])
    const lock = path.join(root, ".opencode", ".teamlead", "integration.lock")
    await fs.mkdir(path.dirname(lock), { recursive: true })
    await fs.writeFile(lock, "{")
    const old = new Date(Date.now() - 11 * 60_000)
    await fs.utimes(lock, old, old)
    await integratePatch(root, patch)
    assert.equal(await fs.readFile(path.join(root, "src", "a.txt"), "utf8"), "worker result\n")
  } finally {
    await txn.cleanup()
    await fs.rm(root, { recursive: true, force: true })
  }
})
