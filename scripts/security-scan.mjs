import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const targets = [
  path.join(root, "payload", ".opencode"),
  path.join(root, "install.sh"),
  path.join(root, "install.ps1"),
  path.join(root, "uninstall.sh"),
  path.join(root, "uninstall.ps1"),
  path.join(root, "scripts", "install-lifecycle.mjs"),
  path.join(root, "scripts", "merge-tui.mjs"),
]
const forbidden = [
  { label: "shell:true", pattern: /\bshell\s*:\s*true\b/gi },
  { label: "child_process", pattern: /(?:(?<![.\w])(?:exec|execFile|execSync|execFileSync)\s*\(|\bimport\s*\{[^}]*\b(?:exec|execFile|execSync|execFileSync)\b[^}]*\}\s*from\s*["'](?:node:)?child_process["']|\b(?:exec|execFile|execSync|execFileSync)\s*:\s*\w+)/g },
  { label: "child_process", pattern: /(?:\b(?:child_process|childProcess)\s*\.\s*(?:exec|execFile|execSync|execFileSync)\b|\b(?:exec|execFile|execSync|execFileSync)\b[^;\n]*=\s*require\s*\(\s*["'](?:node:)?child_process["']|require\s*\(\s*["'](?:node:)?child_process["']\s*\)\s*\.\s*(?:exec|execFile|execSync|execFileSync)\b)/g },
  { label: "eval", pattern: /\beval\s*\(/g },
  { label: "new Function", pattern: /\bnew\s+Function\s*\(/g },
]

export function scanText(content) {
  const findings = []
  for (const rule of forbidden) {
    if (rule.pattern.test(content)) findings.push(rule.label)
    rule.pattern.lastIndex = 0
  }
  if (findings.length) throw new Error(`Forbidden execution patterns found: ${findings.join(", ")}`)
}

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

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const scanned = (await Promise.all(targets.map((target) => files(target)))).flat()
  const findings = []
  for (const entry of scanned) {
    const content = await fs.readFile(entry.path, "utf8")
    try { scanText(content) } catch (error) { findings.push(`${entry.relative}: ${error instanceof Error ? error.message : String(error)}`) }
  }
  assert.deepEqual(findings, [], `Forbidden execution patterns found:\n${findings.join("\n")}`)
  console.log(`Security scan OK (${scanned.length} files)`)
}
