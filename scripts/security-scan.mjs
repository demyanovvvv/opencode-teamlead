import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const targets = [
  path.join(root, "payload", ".opencode"),
  path.join(root, "install.sh"),
  path.join(root, "install.ps1"),
]
const forbidden = [
  { label: "shell:true", pattern: /\bshell\s*:\s*true\b/gi },
  { label: "child_process.exec", pattern: /\bchild_process\.exec(?:File|Sync)?\b/gi },
  { label: "eval", pattern: /\beval\s*\(/g },
  { label: "new Function", pattern: /\bnew\s+Function\s*\(/g },
]

async function files(target, relative = "") {
  const stat = await fs.stat(target)
  if (stat.isFile()) return [{ path: target, relative }]
  const result = []
  for (const entry of await fs.readdir(target, { withFileTypes: true })) {
    const entryPath = path.join(target, entry.name)
    const entryRelative = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) result.push(...await files(entryPath, entryRelative))
    else if (entry.isFile()) result.push({ path: entryPath, relative: entryRelative })
  }
  return result
}

const scanned = (await Promise.all(targets.map((target) => files(target)))).flat()
const findings = []
for (const entry of scanned) {
  const content = await fs.readFile(entry.path, "utf8")
  for (const rule of forbidden) {
    if (rule.pattern.test(content)) findings.push(`${entry.relative}: ${rule.label}`)
    rule.pattern.lastIndex = 0
  }
}
assert.deepEqual(findings, [], `Forbidden execution patterns found:\n${findings.join("\n")}`)
console.log(`Security scan OK (${scanned.length} files)`)
