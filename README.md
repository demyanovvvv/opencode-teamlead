# OpenCode TeamLead v2.1.1

**Production Adaptive Development Accelerator for OpenCode 1.x.**

[Русский README](README_RU.md) · [Installation guide in Russian](INSTALL_RU.md) · [Release notes](RELEASE_NOTES.md)

TeamLead optimizes one outcome: **the fastest verified correct change at the lowest practical total model cost**. It does not try to maximize agent count. It chooses the minimum orchestration depth needed for the task.

Version 2.1.1 adds bilingual TeamLead UI and installer prompts. Choose English or Russian during an interactive install, or pass `--language en|ru` / `-Language en|ru`; existing project settings remain preserved during updates.

## Compatibility

- Compatibility baseline: **OpenCode >= 1.18.30 and < 2.0.0**.
- The runtime is designed for future `1.x.x` releases through public OpenCode APIs and capability detection, not exact-version branching.
- Built around the OpenCode 1.x plugin contract (`PluginInput.client`, hooks, custom tools, agents and `.opencode/commands`).
- Includes an optional native TUI plugin with a live TeamLead indicator and Ctrl+P command menu.
- `/lead-doctor` reports the detected OpenCode version and required runtime capabilities.

Official references used by this implementation:
- https://opencode.ai/docs/plugins/
- https://opencode.ai/docs/commands/
- https://opencode.ai/docs/agents/
- https://opencode.ai/docs/permissions/

## What changed from TeamLead v1.x

v2 is a rewrite of the runtime, not another layer on the old monolith.

### Adaptive execution depth

TeamLead automatically chooses:

- **Direct** — one bounded worker + minimal affected verification.
- **Managed** — one worker + targeted verification + conditional review.
- **Team** — Lead-planned DAG + safe parallel workers + final verification + review/repair.

Small tasks therefore do not pay for an unnecessary planner, reviewer or swarm.

### Model-agnostic routing

Any connected OpenCode model may be assigned to any role. TeamLead never infers quality from names such as GPT, Claude, Fable, MiniMax, GLM or DeepSeek.

Routing uses:

- hard eligibility: provider/model availability, tool-call support, context capacity;
- user model pools;
- project-local first-pass/repair/failure evidence;
- expected cost of successful work;
- provider circuit state;
- selected policy: `fast`, `balanced`, `economy`, `quality`.

Hard eligibility is never silently relaxed.

### Safety model

Mutating child workers:

- cannot use `bash`/shell;
- cannot spawn `task` subagents;
- cannot access external directories;
- are runtime-bound to their assigned `WRITE SCOPE`;
- fail closed if a mutating tool's target path cannot be identified;
- reject lexical path traversal and symlink escapes;
- edit an isolated Git worktree rather than the primary checkout.

Only the trusted TeamLead runtime runs verification programs, using structured `{ executable, args[] }` definitions and `spawn(..., { shell: false })`. Model output cannot become a raw host shell command.

### Transactional Git integration

For mutating tasks:

1. Create isolated worktree.
2. Overlay the current dirty/untracked project state into an ephemeral baseline.
3. Run the worker there.
4. Collect the worker-only binary patch.
5. Validate changed files against `WRITE SCOPE`.
6. Run targeted deterministic checks.
7. Acquire cross-process integration lock.
8. Run `git apply --check`.
9. Apply patch to primary checkout.

A failed verification or integration check leaves the primary checkout unchanged by that worker attempt.

### Scheduler

Team mode uses:

- DAG validation and cycle detection;
- critical-path prioritization;
- adaptive parallel cap;
- write-scope conflict serialization;
- provider-specific concurrency limits;
- budget admission before a wave;
- bounded retries with another eligible model.

`maxParallelWorkers` is a ceiling, not a target.

### Targeted verification

TeamLead safely auto-detects common project checks:

- Node: `typecheck`, `check`, `lint`, `test`, `build` scripts;
- Rust: `cargo test --workspace --all-targets`;
- Go: `go test ./...`;
- Python: `python -m pytest`.

Custom trusted checks can be configured structurally in `.opencode/teamlead.json`; arbitrary model-generated command strings are not part of the tool schema.

### Conditional review

Reviewer depth is risk-based:

- Level 0 — low-risk, small, strongly verified change: no LLM reviewer.
- Level 1 — normal managed/team review.
- Level 2 — security/auth/database/concurrency/architecture/public-contract work.

Reviewer verdict is submitted through the typed `teamlead_submit_review` tool instead of prose parsing.

## Installation

Русская инструкция: [INSTALL_RU.md](INSTALL_RU.md).

### Linux / macOS

```bash
./install.sh /path/to/project
# explicit local install
./install.sh --scope local --project /path/to/project
# global install for the current user
./install.sh --scope global
# explicit Russian UI and installer language
./install.sh --scope local --language ru --project /path/to/project
```

### Windows PowerShell

```powershell
.\install.ps1 -Project C:\path\to\project
# explicit local install
.\install.ps1 -InstallScope Local -Project C:\path\to\project
# global install for the current user
.\install.ps1 -InstallScope Global
# explicit Russian UI and installer language
.\install.ps1 -InstallScope Local -Language ru -Project C:\path\to\project
```

The installer supports **project-local** and **global** installation. In both modes runtime state and `teamlead.json` remain project-local, so projects keep independent settings, history, Git worktrees, and budgets. Restart OpenCode after installation/update.

The installer:

- installs one auto-loaded plugin entrypoint: `.opencode/plugins/teamlead.ts`;
- installs internal modules under `.opencode/teamlead/`;
- installs TeamLead agents and slash commands;
- preserves an existing `.opencode/teamlead.json`;
- removes the legacy `.opencode/plugins/teamlead/` folder used by pre-v2 builds;
- leaves unrelated OpenCode files untouched;
- registers the TUI indicator and Ctrl+P TeamLead menu through `tui.json` or `tui.jsonc`.

For global installation, use `--scope global` (or `-InstallScope Global` on PowerShell). Global code, commands, agents, and TUI are installed into the current user's OpenCode configuration directory. Use `OPENCODE_CONFIG_DIR` to override that directory.

After installation, restart OpenCode. The TUI indicator appears beside the prompt, and Ctrl+P contains a TeamLead category with status, history, planning, execution, resume, model, settings, and diagnostics actions. If TUI plugins are unavailable in the host, the server plugin and slash commands remain usable.

The v2 loader safely migrates useful v1.x settings in memory. Legacy raw `gateCommands` are deliberately ignored and never promoted to trusted commands.

## First run

```text
/lead-doctor
/lead-models
/lead-settings
```

Then:

```text
/lead Fix the refresh-token bug and add the appropriate regression test
```

For a large change:

```text
/lead-plan Redesign the authentication flow across API, frontend and tests
```

Review the preview, then run `/lead ...`.

## Commands

| Command | Purpose |
|---|---|
| `/lead <goal>` | Execute with adaptive Direct / Managed / Team mode |
| `/lead-plan <goal>` | Preview execution depth and tasks; no edits |
| `/lead-status [runID]` | Recent run status, cost, models and results |
| `/lead-models` | Connected OpenCode models, role assignments and worker pools |
| `/lead-settings [request]` | Visual/interactive settings through OpenCode's built-in `question` UI when available; typed-tool fallback otherwise |
| `/lead-resume [runID]` | Continue unfinished implementation tasks |
| `/lead-doctor` | Compatibility and safety diagnostics |

The same actions are also available from the **TeamLead** section of the OpenCode Ctrl+P command palette when the TUI plugin is enabled.

## Model configuration

By default every role inherits/uses eligible connected models. No brand is hard-coded.

Example project config:

```json
{
  "schemaVersion": 2,
  "language": "en",
  "strategy": "balanced",
  "models": {
    "orchestrator": null,
    "reviewer": null,
    "codeWorker": null,
    "fileWorker": null,
    "searchWorker": null,
    "alternateWorker": null
  },
  "workerPools": {
    "codeWorker": [],
    "fileWorker": [],
    "searchWorker": [],
    "alternateWorker": []
  },
  "maxParallelWorkers": 6,
  "providerConcurrency": {},
  "review": {
    "enabled": true,
    "mediumLevel": 1,
    "criticalLevel": 2
  },
  "budget": {
    "maxCostUsd": 0,
    "maxTokens": 0,
    "maxRunMinutes": 0,
    "softRatio": 0.8
  }
}
```

`0` budget limits mean unlimited. These are estimate-based admission controls, not provider billing limits. `softRatio` suppresses optional medium-level review after the threshold; critical review is never skipped. See `docs/BUDGETING.md`.

Use `/lead-models` to get exact connected model IDs, then for example:

```text
/lead-settings assign provider/model-name to codeWorker
```

or configure a worker pool through the settings flow.

## Trusted verification checks

A project may define a trusted check directly in `teamlead.json`:

```json
{
  "verification": {
    "autoDetect": true,
    "finalFullSuite": true,
    "checks": [
      {
        "id": "auth-tests",
        "executable": "npm",
        "args": ["test", "--", "auth"],
        "paths": ["src/auth/**", "tests/auth/**"],
        "timeoutMs": 600000
      }
    ]
  }
}
```

There is intentionally no `command: "..."` field.

## Tests included in this bundle

The repository includes deterministic tests for:

- Direct / Managed / Team admission;
- profiler scope inference;
- hard router context constraints;
- provider circuit exclusion;
- critical-path scheduling;
- safe-wave write conflict serialization;
- strategy-dependent parallelism;
- WRITE SCOPE enforcement;
- path traversal;
- symlink escape;
- shell denial;
- fail-closed unknown mutation target;
- v1.x configuration migration and raw-command dropping;
- targeted verification selection;
- real temporary Git worktree baseline + patch integration;
- full runtime worker → worktree → patch → verification → integration → structured review flow;
- failing trusted verification leaves the primary checkout unchanged;
- strong Direct verification skips an unnecessary LLM Reviewer;
- typed Lead DAG handoff in Team mode;
- installer upgrade preservation and SDK-range normalization;
- explicit disconnected-provider handling and rejection of unbounded WRITE SCOPE;
- `apply_patch` Add/Update/Move/Delete marker extraction with WRITE SCOPE enforcement;
- actual provider-request concurrency enforcement, including retry/failover;
- structural state validation and concurrent state updates;
- persisted verified-patch recovery without duplicate worker execution.

Run the full local release verification with:

```bash
npm ci
npm run verify
npm run payload:check
npm run security:scan
npm run manifest:check
npm run release:bundle
```

`npm run typecheck` uses the bundled compatibility fixture for the public OpenCode 1.18.30 plugin surface; `npm test` runs deterministic unit/integration tests, including real temporary Git repositories/worktrees. `npm run e2e:host` installs the payload into a clean temporary Git project and checks the real OpenCode server's command/tool registry plus `/lead-doctor`; `npm run e2e:host:plan` and the `lead-models` variant exercise the installed plan/model paths without requiring a model prompt. Set up provider credentials separately before qualifying a real mutating `/lead` run.

## Known limitations in v2.1.1

- The TeamLead TUI requires an OpenCode host with TUI plugin support; the server tools and slash commands remain available on hosts without it.
- Provider health in the stable 1.18.30 hook surface is based mainly on session errors rather than request-level HTTP latency telemetry. TeamLead must not invent unavailable hooks.
- `/lead-resume` recovers persisted verified patches across integration crashes, but TeamLead is not a general event-sourced exactly-once engine for every model-prompt micro-step.
- Cost and token figures are routing estimates. TeamLead does not claim provider-billing accuracy.
- The automated host smoke harness qualifies OpenCode server/plugin loading, `/lead-doctor`, `/lead-plan`, and `/lead-models`. A real mutating `/lead` run still depends on the target provider, model credentials, and a trusted test repository.
- global installation shares code and UI only; TeamLead settings and state remain project-local by design.

See `docs/ARCHITECTURE.md`, `docs/THREAT_MODEL.md`, `docs/COMPATIBILITY.md`, `docs/MIGRATION.md`, `docs/BUDGETING.md`, and `docs/STATE_AND_RECOVERY.md` for details. Contributor setup and local skills are documented in `CONTRIBUTING.md` and `docs/SKILLS.md`.
