---
name: teamlead-runtime-development
description: Develop or review the OpenCode TeamLead runtime, scheduler, router, persistence, budgeting, and recovery logic while preserving its safety invariants.
compatibility: opencode
---

# TeamLead Runtime Development

Use this skill for changes under `payload/.opencode/teamlead/` or `payload/.opencode/plugins/teamlead.ts`.

## Required workflow

1. Read `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/STATE_AND_RECOVERY.md`, and the affected tests.
2. Classify the change and define a bounded project-relative scope before editing.
3. Add a regression test and run it to confirm the expected failure when practical.
4. Make the smallest implementation change that passes the new test.
5. Run the affected test mapping and `npm run verify`.
6. If shipped or release files changed, run `npm run payload:check`, then `npm run manifest:write` only after the release files are final, followed by `npm run manifest:check`.
7. Report changed paths, assumptions, unresolved issues, and current verification evidence.

## Runtime invariants

- Model names are not quality signals. Route only from capabilities, configuration, evidence, provider health, context, and cost.
- Reserve estimated budget before every model prompt, including planner, retry, failover, reviewer, and repair prompts.
- Never relax context, tool, provider, WRITE SCOPE, or budget constraints to obtain a route.
- Persist verified patches before integration. Resume must use the persisted hash and forward/reverse applicability checks rather than rerunning a worker blindly.
- Update shared state through `updateState`; never replace a state snapshot loaded before another asynchronous operation.
- Keep model output untrusted. Workers do not execute trusted checks and cannot expand their own permissions.
- Keep the plugin entrypoint thin. Domain behavior belongs in the modules under `teamlead/`.
- Never widen a worker scope to accommodate a convenient implementation; stop and request a new bounded task.

## Test mapping

- Routing/profiling/scheduling: `tests/core.test.mjs`, `tests/advanced.test.mjs`.
- Runtime lifecycle and budget: `tests/runtime.test.mjs`.
- Persistence and concurrency: `tests/state.test.mjs`.
- Git isolation and integration: `tests/git.test.mjs`.
- Permissions and installer behavior: `tests/installer.test.mjs` and security tests.
