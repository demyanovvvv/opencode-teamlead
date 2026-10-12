import test from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import { extractOpenCodeVersion, readOpenCodeHealth } from "../payload/.opencode/teamlead/doctor.ts"

test("doctor preserves custom OpenCode version suffixes", () => {
  assert.equal(extractOpenCodeVersion({ data: { version: "1.18.35+patchline.1.2.1" } }), "1.18.35+patchline.1.2.1")
})

test("doctor queries the connected server when the v1 SDK has no health method", async (t) => {
  const server = http.createServer((request, response) => {
    assert.equal(request.url, "/global/health")
    response.setHeader("Content-Type", "application/json")
    response.end(JSON.stringify({ healthy: true, version: "1.18.35+patchline.1.2.1" }))
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const result = await readOpenCodeHealth({ global: {} }, new URL(`http://127.0.0.1:${server.address().port}`))
  assert.equal(result.version, "1.18.35+patchline.1.2.1")
  assert.equal(result.healthy, true)
})

test("doctor uses an available SDK health method without an HTTP fallback", async () => {
  const result = await readOpenCodeHealth({ global: { health: async () => ({ data: { healthy: true, version: "1.18.35+custom.2" } }) } }, new URL("http://127.0.0.1:1"))
  assert.equal(result.version, "1.18.35+custom.2")
})
