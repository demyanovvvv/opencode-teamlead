import fs from "node:fs/promises"
import { gzipSync } from "node:zlib"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { gitTrackedFiles, readNormalized, renderManifest, sha256 } from "./manifest-lib.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const packageJSON = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"))
const name = `opencode-teamlead-v${packageJSON.version}`
const dist = path.join(root, "dist")
const artifact = path.join(dist, `${name}.tar.gz`)
const checksum = `${artifact}.sha256`
const manifestName = "MANIFEST.sha256"

function excluded(relative) {
  const [top] = relative.split("/")
  return top === ".git" || top === ".opencode" || top === ".agents" || top === "dist" || top === "node_modules"
}

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
}

function setTarEntryMode(archive, entryName, mode) {
  let offset = 0
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    if (header.every((value) => value === 0)) break
    const entry = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "")
    const size = Number.parseInt(header.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim() || "0", 8)
    if (entry === entryName) {
      Buffer.from(`${mode.toString(8).padStart(7, "0")} `, "ascii").copy(header, 100)
      header.fill(32, 148, 156)
      let sum = 0
      for (const value of header) sum += value
      Buffer.from(`${sum.toString(8).padStart(6, "0")}\0 `, "ascii").copy(header, 148)
      return
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  throw new Error(`Release archive entry not found: ${entryName}`)
}

run(process.execPath, ["scripts/payload-boundary.mjs"])

// Stage the archive from the Git file set with LF-normalized content so the
// release is reproducible across checkouts (line endings) and never ships
// local-only files or runtime state.
const tracked = gitTrackedFiles(root).filter((relative) => !excluded(relative) && relative !== manifestName).sort()
const contents = new Map()
for (const relative of tracked) contents.set(relative, await readNormalized(root, relative))

await fs.mkdir(dist, { recursive: true })
const staging = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-release-"))
try {
  const bundleRoot = path.join(staging, name)
  await fs.mkdir(bundleRoot)
  const directories = new Set([bundleRoot])
  for (const relative of tracked) {
    const target = path.join(bundleRoot, ...relative.split("/"))
    const parent = path.dirname(target)
    await fs.mkdir(parent, { recursive: true })
    for (let dir = parent; dir.startsWith(bundleRoot) && dir !== path.dirname(bundleRoot); dir = path.dirname(dir)) directories.add(dir)
    await fs.writeFile(target, contents.get(relative))
    await fs.utimes(target, 0, 0)
    if (relative === "install.sh") await fs.chmod(target, 0o755)
  }

  // The in-archive manifest describes exactly the files shipped in the archive.
  await fs.writeFile(path.join(bundleRoot, manifestName), renderManifest(tracked.map((relative) => [relative, sha256(contents.get(relative))])))
  await fs.utimes(path.join(bundleRoot, manifestName), 0, 0)

  // Normalize directory mtimes last (deepest first) so the archive is reproducible.
  for (const dir of [...directories].sort((a, b) => b.length - a.length)) await fs.utimes(dir, 0, 0)

  const rawTar = path.join(staging, `${name}.tar`)
  run("tar", ["-cf", rawTar, "--format=ustar", "-C", staging, name])
  const tar = await fs.readFile(rawTar)
  setTarEntryMode(tar, `${name}/install.sh`, 0o755)
  await fs.writeFile(artifact, gzipSync(tar, { mtime: 0 }))
  const digest = sha256(await fs.readFile(artifact))
  await fs.writeFile(checksum, `${digest}  ${path.basename(artifact)}\n`)
  console.log(`${artifact}\n${checksum}`)
} finally {
  await fs.rm(staging, { recursive: true, force: true })
}
