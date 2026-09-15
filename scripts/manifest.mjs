import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const excluded = new Set([".git", "node_modules", ".teamlead", "dist", "MANIFEST.sha256"])

async function files(directory, relative = "") {
  const result = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const rel = relative ? `${relative}/${entry.name}` : entry.name
    if (excluded.has(entry.name) || excluded.has(rel)) continue
    if (entry.isDirectory()) result.push(...await files(path.join(directory, entry.name), rel))
    else if (entry.isFile()) result.push(rel)
  }
  return result
}

const lines = []
for (const rel of (await files(root)).sort()) {
  const digest = crypto.createHash("sha256").update(await fs.readFile(path.join(root, rel))).digest("hex")
  lines.push(`${digest}  ./${rel}`)
}
const content = `${lines.join("\n")}\n`
const manifest = path.join(root, "MANIFEST.sha256")
if (process.argv.includes("--write")) await fs.writeFile(manifest, content, "utf8")
else assert.equal(await fs.readFile(manifest, "utf8"), content, "MANIFEST.sha256 is stale; run npm run manifest:write")
