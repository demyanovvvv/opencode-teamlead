# Contributing

## Setup

Use Node.js 22 or newer:

```bash
npm ci
npm run verify
```

The source package is in the repository root. The files installed into user projects are under `payload/.opencode/`.

## Development rules

- Add a failing regression test before changing runtime behavior.
- Keep the public plugin entrypoint in `plugins/teamlead.ts`; internal modules are not auto-loaded plugins.
- Preserve worker isolation, bounded WRITE SCOPE, structured verification, and fail-closed routing.
- Update shared persistent state only through the locked `updateState` transaction.
- Do not add contributor skills to `payload/` or enable the `skill` tool for runtime workers.
- Use structured executable/argument checks. Never add model-provided shell commands.

Project-specific contributor skills live in `.opencode/skills/`. The external `create-opencode-plugin` skill installed under `.agents/skills/` provides general OpenCode plugin references.

## Pull request checks

Run:

```bash
npm run verify
npm run manifest:write
npm run manifest:check
```

Document behavior changes in `CHANGELOG.md`. Update architecture, threat-model, budgeting, recovery, compatibility, or testing documentation when their guarantees change.

Do not add or change a license header until the copyright owner has been confirmed.
