import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import crypto from "node:crypto"

export interface ProjectRegistration { project: string; installationId: string }
export interface Installation { scope?: string; installationId?: string; version?: string }

export async function rejectLinkedPath(target: string): Promise<void> {
  for (let current = path.resolve(target); ; current = path.dirname(current)) {
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) throw new Error(`Linked installer path: ${current}`)
    } catch (error: any) { if (error.code !== "ENOENT") throw error }
    if (path.dirname(current) === current) break
  }
}

export async function readInstallation(directory: string): Promise<Installation | undefined> {
  const file = path.join(directory, ".teamlead-install.json")
  await rejectLinkedPath(file)
  try { return JSON.parse(await fs.readFile(file, "utf8")) }
  catch (error: any) { if (error.code === "ENOENT") return undefined; throw error }
}

export function registrationName(project: string): string {
  return crypto.createHash("sha256").update(path.resolve(project)).digest("hex") + ".json"
}

export async function atomicJSON(file: string, value: unknown): Promise<void> {
  await rejectLinkedPath(file)
  const temporary = `${file}.${crypto.randomBytes(12).toString("hex")}.tmp`
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx" })
    await fs.rename(temporary, file)
  } finally { await fs.rm(temporary, { force: true }) }
}

// Every registry update reloads under this owner-token lock before atomic writes.
export async function withRegistryLock<T>(directory: string, action: () => Promise<T>): Promise<T> {
  const registry = path.join(directory, ".teamlead-projects")
  const lock = path.join(registry, "registry.lock")
  await rejectLinkedPath(lock)
  await fs.mkdir(registry, { recursive: true })
  const token = crypto.randomBytes(16).toString("hex")
  const deadline = Date.now() + 30_000
  for (;;) {
    try {
      const handle = await fs.open(lock, "wx")
      await handle.writeFile(JSON.stringify({ token, pid: process.pid, hostname: os.hostname() }))
      await handle.close()
      break
    } catch (error: any) {
      if (error.code === "ENOENT") { await fs.mkdir(registry, { recursive: true }); continue }
      if (error.code !== "EEXIST") throw error
      if (Date.now() >= deadline) throw new Error("Timed out waiting for TeamLead registry lock")
      await rejectLinkedPath(lock)
      const stat = await fs.stat(lock).catch(() => undefined)
      if (stat && Date.now() - stat.mtimeMs > 10 * 60_000) {
        let stale = false
        try {
          const owner = JSON.parse(await fs.readFile(lock, "utf8"))
          if (owner.hostname === os.hostname() && Number.isInteger(owner.pid) && owner.pid > 0) {
            try { process.kill(owner.pid, 0) } catch (error: any) { stale = error.code === "ESRCH" }
          }
        } catch {}
        if (stale) { await fs.rm(lock, { force: true }); continue }
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
  try { return await action() }
  finally {
    const owner = JSON.parse(await fs.readFile(lock, "utf8"))
    if (owner.token === token) await fs.rm(lock, { force: true })
  }
}

export async function registerGlobalProject(project: string, directory: string): Promise<void> {
  project = path.resolve(project)
  directory = path.resolve(directory)
  if (project.replaceAll("\\", "/").includes("/.opencode/.teamlead/worktrees/")) return
  const installation = await readInstallation(directory)
  if (installation?.scope !== "global" || !installation.installationId) return
  const local = path.join(project, ".opencode")
  await rejectLinkedPath(path.join(local, "plugins", "teamlead.ts"))
  if (await fs.stat(path.join(local, "plugins", "teamlead.ts")).catch(() => undefined)) return
  await withRegistryLock(directory, async () => {
    const current = await readInstallation(directory)
    if (current?.scope !== "global" || current.installationId !== installation.installationId) return
    const marker = path.join(local, ".teamlead", "global-install.json")
    await rejectLinkedPath(marker)
    await fs.mkdir(path.dirname(marker), { recursive: true })
    await atomicJSON(marker, { directory, installationId: installation.installationId })
    await atomicJSON(path.join(directory, ".teamlead-projects", registrationName(project)), { project, installationId: installation.installationId })
  })
}
