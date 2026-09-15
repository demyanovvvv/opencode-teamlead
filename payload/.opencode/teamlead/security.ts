import fs from "node:fs/promises"
import path from "node:path"
import { inAnyScope, normalizeProjectPath, relativeTo } from "./glob.ts"

export type ControlledSessionRole = "worker" | "lead" | "reviewer"
export interface SessionPolicy {
  role: ControlledSessionRole
  root: string
  writeScope: string[]
  readOnly: boolean
}

const FILE_TOOLS = new Set(["read", "edit", "write", "apply_patch", "patch", "glob", "grep", "list"])
const MUTATING_TOOLS = new Set(["edit", "write", "apply_patch", "patch"])
const DENIED_EXEC = new Set(["bash", "shell", "task"])
const PATH_KEYS = new Set(["path", "file", "filePath", "filepath", "filename", "target", "directory", "cwd"])

function collectPaths(value: unknown, keyHint = "", out: string[] = []): string[] {
  if (typeof value === "string" && PATH_KEYS.has(keyHint)) out.push(value)
  else if (Array.isArray(value)) for (const item of value) collectPaths(item, keyHint, out)
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value as Record<string, unknown>)) collectPaths(item, key, out)
  return out
}

function collectPatchPaths(args: unknown): string[] {
  if (!args || typeof args !== "object") return []
  const patchText = (args as Record<string, unknown>).patchText
  if (typeof patchText !== "string" || !patchText.trim()) return []
  const out: string[] = []
  for (const line of patchText.split(/\r?\n/)) {
    const match = /^\*\*\* (?:Add File|Update File|Delete File|Move to):\s*(.+?)\s*$/.exec(line)
    if (!match) continue
    const value = match[1].trim()
    if (value) out.push(value)
  }
  return [...new Set(out)]
}

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target)
  return rel === "" || (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel))
}

async function resolveNoEscape(root: string, raw: string): Promise<{ absolute: string; relative: string }> {
  const candidate = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(root, raw)
  if (!isInside(root, candidate)) throw new Error(`TeamLead blocked external path: ${raw}`)
  let probe = candidate
  const suffix: string[] = []
  for (;;) {
    try {
      const real = await fs.realpath(probe)
      const rebuilt = path.resolve(real, ...suffix.reverse())
      const rootReal = await fs.realpath(root)
      if (!isInside(rootReal, rebuilt)) throw new Error(`TeamLead blocked symlink escape: ${raw}`)
      return { absolute: rebuilt, relative: relativeTo(rootReal, rebuilt) }
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error
      const parent = path.dirname(probe)
      if (parent === probe) throw error
      suffix.push(path.basename(probe)); probe = parent
    }
  }
}

export async function guardTool(policy: SessionPolicy, tool: string, args: unknown): Promise<void> {
  const lower = tool.toLowerCase()
  if (DENIED_EXEC.has(lower)) throw new Error(`TeamLead ${policy.role} sessions cannot use ${tool}`)
  if (lower.startsWith("teamlead_") && !((policy.role === "lead" && lower === "teamlead_submit_plan") || (policy.role === "reviewer" && lower === "teamlead_submit_review"))) {
    throw new Error(`TeamLead recursion is disabled in controlled ${policy.role} sessions`)
  }
  if (policy.role !== "worker" && MUTATING_TOOLS.has(lower)) throw new Error(`${policy.role} is read-only`)
  if (policy.readOnly && MUTATING_TOOLS.has(lower)) throw new Error("This worker is read-only")
  if (!FILE_TOOLS.has(lower)) return
  const rawPaths = lower === "apply_patch" || lower === "patch"
    ? [...new Set([...collectPaths(args), ...collectPatchPaths(args)])]
    : collectPaths(args)
  if (MUTATING_TOOLS.has(lower) && rawPaths.length === 0) throw new Error(`TeamLead could not identify the target path for mutating tool ${tool}; failing closed`)
  for (const raw of rawPaths) {
    if (!raw || /[*?]/.test(raw) && ["glob", "grep", "list"].includes(lower)) continue
    const resolved = await resolveNoEscape(policy.root, raw)
    if (MUTATING_TOOLS.has(lower)) {
      const rel = normalizeProjectPath(resolved.relative)
      if (!inAnyScope(rel, policy.writeScope)) throw new Error(`WRITE SCOPE violation: ${rel || raw}`)
    }
  }
}

export async function validateChangedPaths(root: string, changed: string[], writeScope: string[]): Promise<void> {
  if (!writeScope.length && changed.length) throw new Error("Mutation produced files but WRITE SCOPE is empty")
  for (const file of changed) {
    const resolved = await resolveNoEscape(root, file)
    if (!inAnyScope(resolved.relative, writeScope)) throw new Error(`Patch changes ${resolved.relative}, outside WRITE SCOPE`)
  }
}
