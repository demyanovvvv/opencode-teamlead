import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { spawnSync } from "node:child_process"

export function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex")
}

export async function walkFiles(directory, relative = "") {
  const result = []
  const entries = await fs.readdir(directory, { withFileTypes: true })
  entries.sort((a, b) => a.name.localeCompare(b.name, "en"))
  for (const entry of entries) {
    const rel = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) result.push(...await walkFiles(path.join(directory, entry.name), rel))
    else if (entry.isFile()) result.push(rel)
  }
  return result
}

// The release file set is everything Git would commit: tracked files plus
// untracked files that are not ignored. Ignored artifacts (node_modules, dist,
// runtime state) and local-only files can never leak into the manifest/archive.
export function gitTrackedFiles(root) {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, maxBuffer: 1 << 28 })
  if (result.status !== 0) throw new Error(result.stderr?.toString("utf8") || "git ls-files failed")
  return [...new Set(result.stdout.toString("utf8").split("\0").filter(Boolean))]
}

function isBinary(buffer) {
  return buffer.subarray(0, 8000).includes(0)
}

// Normalize text to LF so hashes and archives are identical regardless of the
// checkout's core.autocrlf / core.eol settings. Binary content is untouched.
export function normalizeContent(buffer) {
  if (isBinary(buffer)) return buffer
  return Buffer.from(buffer.toString("utf8").replace(/\r\n/g, "\n"), "utf8")
}

export async function readNormalized(root, relative) {
  return normalizeContent(await fs.readFile(path.join(root, ...relative.split("/"))))
}

export function renderManifest(entries) {
  return entries.map(([rel, digest]) => `${digest}  ./${rel}`).join("\n") + "\n"
}

export function parseManifest(content) {
  const entries = new Map()
  for (const line of content.trim().split(/\r?\n/)) {
    if (!line) continue
    const match = /^([0-9a-f]{64}) {2}\.\/(.+)$/.exec(line)
    if (!match) throw new Error(`Malformed MANIFEST.sha256 line: ${line}`)
    entries.set(match[2], match[1])
  }
  return entries
}
