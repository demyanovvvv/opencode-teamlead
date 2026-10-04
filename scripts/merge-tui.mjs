import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Track JSONC syntax without treating braces, commas, or comments inside strings as structure.
function tokens(source) {
  const result = []
  for (let i = 0; i < source.length;) {
    const char = source[i]
    if (/\s/.test(char)) { i++; continue }
    if (char === "/" && source[i + 1] === "/") {
      i = source.indexOf("\n", i + 2)
      if (i < 0) break
      continue
    }
    if (char === "/" && source[i + 1] === "*") {
      i = source.indexOf("*/", i + 2)
      if (i < 0) throw new Error("Unterminated JSONC comment")
      i += 2
      continue
    }
    if (char === '"') {
      const start = i++
      while (i < source.length) {
        if (source[i] === "\\") { i += 2; continue }
        if (source[i++] === '"') break
      }
      if (source[i - 1] !== '"') throw new Error("Unterminated JSONC string")
      result.push({ value: source.slice(start, i), start, end: i })
      continue
    }
    if ("{}[],:".includes(char)) { result.push({ value: char, start: i, end: ++i }); continue }
    const start = i++
    while (i < source.length && !/[\s{}\[\],:/]/.test(source[i])) i++
    result.push({ value: source.slice(start, i), start, end: i })
  }
  return result
}

function insertPlugin(source, spec, remove = false) {
  const all = tokens(source)
  if (all[0]?.value !== "{" || all.at(-1)?.value !== "}") throw new Error("Invalid TUI configuration: expected root object")
  let depth = 0
  for (let i = 0; i < all.length; i++) {
    const item = all[i]
    if (item.value === "{" || item.value === "[") depth++
    if (item.value === "}" || item.value === "]") depth--
    if (depth !== 1 || item.value !== '"plugin"' || all[i + 1]?.value !== ":") continue
    if (all[i + 2]?.value !== "[") throw new Error("TUI plugin must be an array")
    const start = i + 2
    let nested = 1
    let end = start
    while (nested > 0 && ++end < all.length) {
      if (all[end].value === "[") nested++
      if (all[end].value === "]") nested--
    }
    if (nested) throw new Error("Unterminated TUI plugin array")
    const values = all.slice(start + 1, end).filter((token) => token.value.startsWith('"'))
    if (remove) {
      const entries = []
      let entryStart = start + 1
      let level = 0
      for (let j = start + 1; j <= end; j++) {
        const value = all[j].value
        if ((value === "," && level === 0) || j === end) {
          const entry = all.slice(entryStart, j)
          if (entry.length) entries.push({ entry, comma: j < end ? all[j] : null })
          entryStart = j + 1
        }
        if (value === "[" || value === "{") level++
        if (value === "]" || value === "}") level--
      }
      const matches = ({ entry }) => entry.length === 1 && entry[0].value.startsWith('"') && JSON.parse(entry[0].value) === spec
      const cuts = []
      for (let j = 0; j < entries.length; j++) {
        if (!matches(entries[j])) continue
        const first = j
        while (j + 1 < entries.length && matches(entries[j + 1])) j++
        const nextComma = entries[j].comma
        const previousComma = entries[first - 1]?.comma
        cuts.push([
          !nextComma && previousComma ? previousComma.start : entries[first].entry[0].start,
          nextComma ? nextComma.end : entries[j].entry.at(-1).end,
        ])
      }
      for (const [from, to] of cuts.reverse()) source = source.slice(0, from) + source.slice(to)
      return source
    }
    if (values.some((token) => { try { return JSON.parse(token.value) === spec } catch { return false } })) return source
    const last = all[end - 1]
    const prefix = last.value === "[" || last.value === "," ? "" : ","
    return source.slice(0, all[end].start) + prefix + JSON.stringify(spec) + source.slice(all[end].start)
  }
  const closing = all.at(-1)
  if (remove) return source
  const previous = all.at(-2)
  const prefix = previous.value === "{" || previous.value === "," ? "" : ","
  return source.slice(0, closing.start) + prefix + '"plugin":[' + JSON.stringify(spec) + "]" + source.slice(closing.start)
}

const root = process.argv[2]
if (!root) throw new Error("Expected OpenCode config directory")
const mode = process.argv[3]
const metadata = path.join(root, ".teamlead-install.json")
const packageFile = path.join(root, "package.json")
const dependency = "@opencode-ai/plugin"
const range = ">=1.18.30 <2.0.0"
const jsonc = path.join(root, "tui.jsonc")
const json = path.join(root, "tui.json")
const file = fs.existsSync(jsonc) ? jsonc : json
const spec = "./teamlead/tui.tsx"
const readJSON = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""))
const writeJSON = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n")

// Fail before mutation if an installer path traverses a symbolic link/junction.
function rejectLink(target) {
  let stat
  try { stat = fs.lstatSync(target) } catch (error) {
    if (error.code === "ENOENT") return
    throw error
  }
  if (stat.isSymbolicLink()) throw new Error(`Linked installer path: ${target}`)
}
for (let current = path.resolve(root); ; current = path.dirname(current)) {
  rejectLink(current)
  if (path.dirname(current) === current) break
}
for (const relative of ["plugins", "plugins/teamlead.ts", "plugins/teamlead", "agents", "commands", "teamlead", ".teamlead", "teamlead.json", ".teamlead-install.json", "package.json", "tui.json", "tui.jsonc"]) {
  rejectLink(path.join(root, relative))
}

if (mode === "prepare") {
  // Validate shared configuration before replacing installed files.
  if (fs.existsSync(file)) insertPlugin(fs.readFileSync(file, "utf8"), spec)
  const pkg = fs.existsSync(packageFile) ? readJSON(packageFile) : null
  if (!fs.existsSync(metadata)) {
    fs.mkdirSync(root, { recursive: true })
    writeJSON(metadata, {
      packageCreated: pkg === null,
      dependencyPresent: Object.hasOwn(pkg?.dependencies ?? {}, dependency),
      dependencyValue: pkg?.dependencies?.[dependency],
      tuiCreated: !fs.existsSync(file),
      tuiFile: path.basename(file),
    })
  }
  const agents = path.join(root, "agents")
  if (fs.existsSync(agents)) for (const name of fs.readdirSync(agents)) {
    if (/^teamlead-.*\.md$/.test(name)) fs.rmSync(path.join(agents, name), { force: true })
  }
  process.exit(0)
}

if (mode === "uninstall") {
  const saved = fs.existsSync(metadata) ? readJSON(metadata) : null
  // Compute shared-file changes first: malformed configuration must not cause partial removal.
  const tuiChanges = []
  for (const target of [json, jsonc]) {
    if (!fs.existsSync(target)) continue
    const source = insertPlugin(fs.readFileSync(target, "utf8"), spec, true)
    const empty = tokens(source).every((token) => ["{", "}", '"plugin"', '"$schema"', '"https://opencode.ai/tui.json"', ":", "[", "]", ","].includes(token.value))
    tuiChanges.push([target, source, saved?.tuiCreated && saved.tuiFile === path.basename(target) && empty])
  }
  let pkg = fs.existsSync(packageFile) ? readJSON(packageFile) : null
  if (pkg?.dependencies?.[dependency] === range) {
    if (saved?.dependencyPresent) pkg.dependencies[dependency] = saved.dependencyValue
    else delete pkg.dependencies[dependency]
    if (!Object.keys(pkg.dependencies).length) delete pkg.dependencies
  }
  for (const [target, source, remove] of tuiChanges) {
    if (remove) fs.rmSync(target)
    else fs.writeFileSync(target, source)
  }
  if (pkg) {
    if (saved?.packageCreated && Object.keys(pkg).every((key) => key === "private" || (key === "type" && pkg.type === "module"))) fs.rmSync(packageFile)
    else writeJSON(packageFile, pkg)
  }
  const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../payload/.opencode")
  // Use the shipped command list rather than a broad lead* wildcard over user commands.
  const commands = fs.readdirSync(path.join(source, "commands")).filter((name) => /^lead.*\.md$/.test(name))
  commands.push("lead-review.md", "lead-dashboard.md", "lead-worker.md", "lead-dashboard-clear.md", ...["profiler", "router", "adaptive", "runtime", "intelligence", "execution", "contracts", "verify"].map((name) => `lead-${name}.md`), ...["dashboard", "worker", "dashboard-clear", "settings", "models", "profiler", "router", "adaptive", "runtime", "intelligence", "execution", "contracts", "verify"].map((name) => `tl-${name}.md`))
  for (const name of commands) fs.rmSync(path.join(root, "commands", name), { force: true })
  const agents = path.join(root, "agents")
  if (fs.existsSync(agents)) for (const name of fs.readdirSync(agents)) {
    if (/^teamlead-.*\.md$/.test(name)) fs.rmSync(path.join(agents, name), { force: true })
  }
  for (const relative of ["plugins/teamlead.ts", "plugins/teamlead", "teamlead", "teamlead.json", ".teamlead", ".teamlead-install.json"]) fs.rmSync(path.join(root, relative), { recursive: true, force: true })
  for (const relative of ["plugins", "agents", "commands", ""]) {
    const target = path.join(root, relative)
    if (fs.existsSync(target) && !fs.readdirSync(target).length) fs.rmdirSync(target)
  }
  process.exit(0)
}

const source = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : '{\n  "$schema": "https://opencode.ai/tui.json",\n  "plugin": []\n}\n'
fs.writeFileSync(file, insertPlugin(source, spec))
