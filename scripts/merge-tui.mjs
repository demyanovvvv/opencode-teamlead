import fs from "node:fs"
import path from "node:path"

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

function insertPlugin(source, spec) {
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
    if (values.some((token) => { try { return JSON.parse(token.value) === spec } catch { return false } })) return source
    const last = all[end - 1]
    const prefix = last.value === "[" || last.value === "," ? "" : ","
    return source.slice(0, all[end].start) + prefix + JSON.stringify(spec) + source.slice(all[end].start)
  }
  const closing = all.at(-1)
  const previous = all.at(-2)
  const prefix = previous.value === "{" || previous.value === "," ? "" : ","
  return source.slice(0, closing.start) + prefix + '"plugin":[' + JSON.stringify(spec) + "]" + source.slice(closing.start)
}

const root = process.argv[2]
if (!root) throw new Error("Expected OpenCode config directory")
const jsonc = path.join(root, "tui.jsonc")
const json = path.join(root, "tui.json")
const file = fs.existsSync(jsonc) ? jsonc : json
const source = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "{}\n"
const spec = "./teamlead/tui.tsx"
const updated = insertPlugin(source, spec)
if (updated !== source || !fs.existsSync(file)) fs.writeFileSync(file, updated)
