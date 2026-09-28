import fs from "node:fs"
import path from "node:path"
import { parse, modify, applyEdits } from "jsonc-parser"

const root = process.argv[2]
if (!root) throw new Error("Expected OpenCode config directory")
const jsonc = path.join(root, "tui.jsonc")
const json = path.join(root, "tui.json")
const file = fs.existsSync(jsonc) ? jsonc : json
const source = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "{}\n"
const errors = []
const current = parse(source, errors)
if (errors.length || !current || typeof current !== "object" || Array.isArray(current)) throw new Error(`Invalid TUI configuration: ${file}`)
const spec = "./teamlead/tui.tsx"
const plugins = current.plugin ?? []
if (!Array.isArray(plugins)) throw new Error("TUI plugin must be an array")
if (plugins.some((item) => (Array.isArray(item) ? item[0] : item) === spec)) process.exit(0)
const edits = modify(source, ["plugin"], [...plugins, spec], { formattingOptions: { insertSpaces: true, tabSize: 2 } })
fs.writeFileSync(file, applyEdits(source, edits))
