export function sessionData(response: any): any {
  if (response?.error) throw new Error(typeof response.error === "string" ? response.error : JSON.stringify(response.error))
  return response?.data ?? response
}

export function extractOpenCodeVersion(response: any): string {
  const data = sessionData(response)
  return typeof data?.version === "string" && data.version.length > 0 ? data.version : "unknown"
}

export async function readOpenCodeHealth(client: any, serverUrl: URL): Promise<any> {
  if (typeof client?.global?.health === "function") return sessionData(await client.global.health())
  const response = await fetch(new URL("/global/health", serverUrl))
  if (!response.ok) throw new Error(`OpenCode health request failed with HTTP ${response.status}`)
  const health = await response.json()
  return { ...health, version: extractOpenCodeVersion(health) }
}
