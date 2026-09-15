import path from "node:path"

export function normalizeProjectPath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "")
  return normalized === "." ? "" : normalized
}

export function globToRegExp(pattern: string): RegExp {
  let input = normalizeProjectPath(pattern)
  let out = "^"
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    const next = input[i + 1]
    if (ch === "*" && next === "*") {
      i++
      if (input[i + 1] === "/") {
        i++
        out += "(?:.*/)?"
      } else out += ".*"
    } else if (ch === "*") out += "[^/]*"
    else if (ch === "?") out += "[^/]"
    else if (".+^$()[]{}|\\".includes(ch)) out += `\\${ch}`
    else out += ch
  }
  return new RegExp(out + "$")
}

export function matchesGlob(value: string, pattern: string): boolean {
  const v = normalizeProjectPath(value)
  const p = normalizeProjectPath(pattern)
  if (!p) return v === ""
  if (!/[?*]/.test(p)) return v === p || v.startsWith(p.endsWith("/") ? p : p + "/")
  return globToRegExp(p).test(v)
}

export function inAnyScope(value: string, scopes: string[]): boolean {
  return scopes.some((scope) => matchesGlob(value, scope))
}

export function scopesConflict(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false
  for (const left of a) {
    for (const right of b) {
      const l = normalizeProjectPath(left)
      const r = normalizeProjectPath(right)
      if (matchesGlob(l, r) || matchesGlob(r, l)) return true
      const lp = l.split(/[?*]/, 1)[0].replace(/\/$/, "")
      const rp = r.split(/[?*]/, 1)[0].replace(/\/$/, "")
      if (lp && rp && (lp === rp || lp.startsWith(rp + "/") || rp.startsWith(lp + "/"))) return true
    }
  }
  return false
}

export function relativeTo(root: string, target: string): string {
  return normalizeProjectPath(path.relative(root, target))
}
