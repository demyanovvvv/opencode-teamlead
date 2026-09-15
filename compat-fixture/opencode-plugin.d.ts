declare module "@opencode-ai/plugin" {
  export interface ToolContext {
    sessionID: string
    messageID: string
    agent: string
    directory: string
    worktree: string
    abort: AbortSignal
    metadata(input: { title?: string; metadata?: Record<string, any> }): void
    ask(input: any): Promise<void>
  }
  export interface PluginInput {
    client: any
    project: any
    directory: string
    worktree: string
    experimental_workspace: { register(type: string, adapter: any): void }
    serverUrl: URL
    $: any
  }
  export interface Hooks {
    dispose?: () => Promise<void>
    event?: (input: { event: { type: string; properties?: any } }) => Promise<void>
    tool?: Record<string, any>
    "tool.execute.before"?: (input: { tool: string; sessionID: string; callID: string }, output: { args: any }) => Promise<void>
    "tool.execute.after"?: (input: { tool: string; sessionID: string; callID: string; args: any }, output: any) => Promise<void>
  }
  export type Plugin = (input: PluginInput, options?: Record<string, unknown>) => Promise<Hooks>
  type ToolFactory = ((input: {
    description: string
    args: Record<string, any>
    execute(args: any, context: ToolContext): Promise<any>
  }) => any) & { schema: any }
  export const tool: ToolFactory
}
