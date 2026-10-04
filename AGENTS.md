# Project Rules

## Rule precedence

Apply rules in this order:

1. System and platform restrictions.
2. This root `AGENTS.md`.
3. A more specific `AGENTS.md` in the file's directory tree.
4. The applicable project skill under `.opencode/skills/`.
5. The current task instructions.

When rules conflict, the stricter safety, scope, or verification requirement wins. Never weaken a repository invariant to make a task fit.

## Project objective

Deliver the fastest verified correct change at the lowest practical total model cost. Prefer the smallest complete change, evidence-based decisions, bounded tasks, and deterministic verification over unnecessary orchestration or broad cleanup.

## Repository map

- `payload/.opencode/` — canonical shipped runtime, agents, commands, configuration, and internal modules.
- `payload/.opencode/plugins/teamlead.ts` — the only auto-loaded TeamLead plugin entrypoint.
- `payload/.opencode/teamlead/` — regular internal runtime modules; these are not plugins.
- `tests/` — regression, integration, security, installer, Git, process, presentation, and release tests.
- `scripts/` — trusted repository-side validation and release tooling.
- `docs/` — architecture, threat model, budgeting, recovery, compatibility, skills, and testing guarantees.
- `.opencode/skills/` — contributor-only project skills; never copy them into `payload/`.
- `.agents/` — local/external contributor skills; never copy them into `payload/`.
- `.github/workflows/` — CI and host compatibility workflows.
- `MANIFEST.sha256` and release bundles — derived release artifacts; do not hand-edit them.

## Source and payload boundaries

`payload/` is the shipped boundary. Runtime behavior belongs in `payload/.opencode/`; contributor guidance belongs in the root, `docs/`, `.opencode/skills/`, or `.agents/`. Do not add tests, scripts, contributor skills, repository metadata, or local runtime state to the payload. Changes to shipped files require payload and manifest validation.

## Standard development workflow

1. Read this file, the applicable local rules, the relevant architecture/security documentation, and affected tests.
2. Locate symbols and affected paths before broad reads. Identify the change class and risk level.
3. Define a concrete, project-relative scope. Never widen scope implicitly.
4. Add or update a meaningful regression test before changing runtime behavior; confirm the test exercises the intended failure when practical.
5. Make the smallest compatible implementation or documentation change.
6. Run targeted checks, then the required repository gates for the change class.
7. Update documentation and `CHANGELOG.md` when behavior, guarantees, compatibility, or release contents change.
8. Inspect the final diff, path set, generated artifacts, and working-tree status.
9. Report only evidence-backed results. Do not claim a check passed without current output from the trusted command or tool.

## Change classes and minimum validation

| Change class | Minimum validation |
| --- | --- |
| Documentation/rules | `npm run rules:check`, link/path review, `git diff --check` |
| TypeScript runtime/plugin | `npm run typecheck`, affected tests, `npm run verify` |
| Routing, profiling, scheduling | `tests/core.test.mjs`, `tests/advanced.test.mjs`, `npm run verify` |
| State, locks, persistence, recovery | `tests/state.test.mjs`, affected runtime tests, security review |
| Process execution/cancellation | `tests/process.test.mjs`, `tests/security.test.mjs`, `npm run security:scan` |
| Git/worktree/integration | `tests/git.test.mjs`, affected runtime tests |
| Installer or payload boundary | `tests/installer.test.mjs`, `npm run payload:check` |
| Release/manifest/bundle | `npm run manifest:check`, `npm run release:bundle`, release validation |
| OpenCode compatibility | host smoke workflow or `npm run e2e:host` when available |

For high-risk changes involving permissions, `WRITE SCOPE`, subprocesses, persistence, recovery, Git integration, installers, or release packaging, run the full verification and security gates before completion.

## Runtime and security invariants

- Treat all model and worker output as untrusted.
- Never use model-provided executables, raw shell commands, or unrestricted paths.
- Mutating tasks require bounded, non-empty, project-relative `WRITE SCOPE`.
- Never relax context, tool, provider, permission, scope, or budget constraints to obtain a route.
- Reserve estimated budget before every model prompt, including planning, retry, failover, review, and repair prompts.
- Update shared state only through the locked `updateState` transaction.
- Persist and validate verified patches before integration; recovery must fail closed when neither forward nor reverse applicability is valid.
- Trusted commands use argument vectors with `shell:false`; verification can execute repository code with host privileges.
- Worktrees isolate filesystem changes, not processes. Do not describe them as a process sandbox.
- Never allow workers, planners, or reviewers to spawn subagents, recurse into TeamLead, or access external directories.

## Documentation synchronization

Update the matching document when its guarantee changes:

- architecture, routing, scheduler, or control plane → `docs/ARCHITECTURE.md`;
- state, locking, persistence, or recovery → `docs/STATE_AND_RECOVERY.md`;
- threat boundaries or command/path safety → `docs/THREAT_MODEL.md`;
- budget admission or cost policy → `docs/BUDGETING.md`;
- OpenCode/platform support → `docs/COMPATIBILITY.md`;
- test coverage or validation commands → `docs/TESTING.md`;
- shipped behavior or user-visible changes → `CHANGELOG.md` and relevant README/install docs;
- release process or artifacts → `RELEASE_VALIDATION.md`.

## Forbidden actions

- Do not edit unrelated files or perform opportunistic cleanup.
- Do not widen a worker scope because a broader change seems convenient.
- Do not replace state snapshots loaded before asynchronous work.
- Do not hand-edit generated manifests or release archives.
- Do not add contributor skills or repository-only files to `payload/`.
- Do not claim tests, reviews, releases, or compatibility checks passed without evidence.

## Completion criteria

A task is complete only when the requested behavior is implemented, relevant tests and gates pass, documentation is synchronized, no scope or security invariant is violated, generated artifacts are consistent, and the final diff contains only intended changes.