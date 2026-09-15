import crypto from "node:crypto"
import fs from "node:fs/promises"
import { gzipSync } from "node:zlib"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const packageJSON = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"))
const name = `opencode-teamlead-v${packageJSON.version}`
const dist = path.join(root, "dist")
const artifact = path.join(dist, `${name}.tar.gz`)
const checksum = `${artifact}.sha256`
function excluded(relative, name) {
  return relative === ".git" || relative === ".opencode" || relative === ".agents" || relative === "dist" ||
    name === "node_modules" || name === ".teamlead"
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
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "")
    const size = Number.parseInt(header.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim() || "0", 8)
    if (name === entryName) {
      const modeText = `${mode.toString(8).padStart(7, "0")} `
      Buffer.from(modeText, "ascii").copy(header, 100)
      header.fill(32, 148, 156)
      let checksum = 0
      for (const value of header) checksum += value
      Buffer.from(`${checksum.toString(8).padStart(6, "0")}\0 `, "ascii").copy(header, 148)
      return
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  throw new Error(`Release archive entry not found: ${entryName}`)
}

async function copy(source, target, relative = "") {
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    const rel = relative ? `${relative}/${entry.name}` : entry.name
    if (excluded(rel, entry.name)) continue
    const from = path.join(source, entry.name)
    const to = path.join(target, entry.name)
    if (entry.isDirectory()) {
      await fs.mkdir(to, { recursive: true })
      await copy(from, to, rel)
      await fs.utimes(to, 0, 0)
    } else if (entry.isFile()) {
      await fs.copyFile(from, to)
      await fs.utimes(to, 0, 0)
      if (rel === "install.sh") await fs.chmod(to, 0o755)
    }
  }
}

run(process.execPath, ["scripts/payload-boundary.mjs"])
run(process.execPath, ["scripts/manifest.mjs"])
await fs.mkdir(dist, { recursive: true })
const staging = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-release-"))
try {
  const bundleRoot = path.join(staging, name)
  const rawTar = path.join(staging, `${name}.tar`)
  await fs.mkdir(bundleRoot)
  await copy(root, bundleRoot)
  await fs.utimes(bundleRoot, 0, 0)
  run("tar", ["-cf", rawTar, "--format=ustar", "-C", staging, name])
  const tar = await fs.readFile(rawTar)
  setTarEntryMode(tar, `${name}/install.sh`, 0o755)
  await fs.writeFile(artifact, gzipSync(tar, { mtime: 0 }))
  const digest = crypto.createHash("sha256").update(await fs.readFile(artifact)).digest("hex")
  await fs.writeFile(checksum, `${digest}  ${path.basename(artifact)}\n`)
  console.log(`${artifact}\n${checksum}`)
} finally {
  await fs.rm(staging, { recursive: true, force: true })
}
