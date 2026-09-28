import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { parseManifest, sha256, walkFiles } from "../scripts/manifest-lib.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result.stdout
}

test("manifest is current and excludes local-only files", async () => {
  const runtimeDir = path.join(root, ".opencode", ".teamlead")
  await fs.mkdir(runtimeDir, { recursive: true })
  const marker = path.join(runtimeDir, `manifest-test-${process.pid}-${Date.now()}.json`)
  try {
    await fs.writeFile(marker, JSON.stringify({ secret: "runtime-only" }))
    // Check mode must pass on the committed tree; it never rewrites the manifest,
    // so a stale manifest can never be masked by running the tests.
    run(process.execPath, ["scripts/manifest.mjs"])
    const manifest = await fs.readFile(path.join(root, "MANIFEST.sha256"), "utf8")
    assert.equal(manifest.includes("./.opencode/.teamlead/"), false)
    assert.equal(manifest.includes(path.basename(marker)), false)
    assert.equal(manifest.includes("./.opencode/package.json"), false)
    assert.equal(manifest.includes("./.opencode/package-lock.json"), false)
    assert.equal(manifest.includes("node_modules/"), false)
    assert.equal(manifest.includes("./payload/.opencode/teamlead/tui.tsx"), true)
  } finally {
    await fs.rm(runtimeDir, { recursive: true, force: true })
  }
})

test("release bundle ships a manifest that matches the archive contents", async () => {
  const packageJSON = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"))
  const name = `opencode-teamlead-v${packageJSON.version}`
  const artifact = path.join(root, "dist", `${name}.tar.gz`)
  const checksum = `${artifact}.sha256`
  try {
    run(process.execPath, ["scripts/release-bundle.mjs"])
    await fs.access(artifact)
    const entries = run("tar", ["-tzf", artifact]).trim().split(/\r?\n/)
    assert.equal(entries.some((entry) => entry.endsWith("/install.sh")), true)
    assert.equal(entries.some((entry) => entry.endsWith("/install.ps1")), true)
    assert.equal(entries.some((entry) => entry.endsWith("/payload/.opencode/plugins/teamlead.ts")), true)
    assert.equal(entries.some((entry) => entry.endsWith("/MANIFEST.sha256")), true)
    assert.equal(entries.some((entry) => entry.includes("node_modules/") || entry.includes("/.teamlead/") || entry.includes("/dist/")), false)
    const listing = run("tar", ["-tvzf", artifact]).split(/\r?\n/).find((entry) => entry.includes(`${name}/install.sh`))
    assert.match(listing ?? "", /^-rwxr-xr-x\s/)
    const digest = (await fs.readFile(checksum, "utf8")).trim()
    assert.match(digest, /^[a-f0-9]{64}  opencode-teamlead-v2\.0\.0\.tar\.gz$/)
    const firstHash = digest.split(/\s+/)[0]
    run(process.execPath, ["scripts/release-bundle.mjs"])
    const secondHash = (await fs.readFile(checksum, "utf8")).trim().split(/\s+/)[0]
    assert.equal(secondHash, firstHash, "release bundle must be byte-for-byte reproducible")

    const extraction = await fs.mkdtemp(path.join(os.tmpdir(), "teamlead-release-install-"))
    try {
      run("tar", ["-xzf", artifact, "-C", extraction])
      const bundle = path.join(extraction, name)

      // The in-archive manifest must describe exactly what the archive ships.
      const manifest = parseManifest(await fs.readFile(path.join(bundle, "MANIFEST.sha256"), "utf8"))
      const shipped = (await walkFiles(bundle)).filter((relative) => relative !== "MANIFEST.sha256")
      assert.deepEqual([...manifest.keys()].sort(), shipped.sort(), "manifest paths must match archive paths")
      for (const [relative, expected] of manifest) {
        const actual = sha256(await fs.readFile(path.join(bundle, ...relative.split("/"))))
        assert.equal(actual, expected, `manifest hash mismatch for ${relative}`)
      }

      const project = path.join(extraction, "target project")
      await fs.mkdir(project)
      if (process.platform === "win32") {
        run("pwsh.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(bundle, "install.ps1"), "-Project", project])
      } else {
        run("bash", [path.join(bundle, "install.sh"), project])
      }
      await fs.access(path.join(project, ".opencode", "plugins", "teamlead.ts"))
      await fs.access(path.join(project, ".opencode", "commands", "lead-doctor.md"))
    } finally {
      await fs.rm(extraction, { recursive: true, force: true })
    }
  } finally {
    await fs.rm(path.join(root, "dist"), { recursive: true, force: true })
  }
})
