import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gitTrackedFiles, readNormalized, renderManifest, sha256 } from "./manifest-lib.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const manifest = path.join(root, "MANIFEST.sha256")

// The manifest is derived from the Git file set so local-only artifacts can never
// leak in, and hashes LF-normalized content so it is stable across checkouts.
const tracked = gitTrackedFiles(root).filter((relative) => relative !== "MANIFEST.sha256").sort()
const entries = []
for (const relative of tracked) entries.push([relative, sha256(await readNormalized(root, relative))])
const content = renderManifest(entries)

if (process.argv.includes("--write")) await fs.writeFile(manifest, content, "utf8")
else assert.equal(await fs.readFile(manifest, "utf8"), content, "MANIFEST.sha256 is stale; run npm run manifest:write")
