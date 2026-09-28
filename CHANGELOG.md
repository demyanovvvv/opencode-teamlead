# Changelog

## 2.1.0 — 2026-09-28

### Reliability
- Added structural persisted-state validation and locked cross-process read-modify-write updates.
- Added verified-patch persistence, SHA-256 validation, and forward/reverse recovery on resume.
- Added owner-token integration locks with conservative stale-owner detection.
- Normalized Windows roots and disabled Git EOL conversion for deterministic internal patches.

### Budgeting
- Planner attempts now reserve estimated tokens and cost before prompting.
- Documented budgeting as estimate-based and removed the nonfunctional `actualCostUsd` state field.
- `softRatio` now suppresses optional medium-level review while preserving critical review.

### Development
- Added project-specific contributor skills, contributor documentation, Node lockfile, Windows/Linux CI, and automated manifest generation/validation.
- Added reproducible host/plugin smoke checks, release archive generation with checksums, and static payload security scanning.
- `MANIFEST.sha256` and the release archive are now derived from the Git file set with LF-normalized content, so local-only files and runtime state can never leak and the bundle is byte-for-byte reproducible across checkouts.
- The release archive ships a `MANIFEST.sha256` generated from its own contents, and tests validate that manifest against every shipped file.
- Added a tag-based release workflow that verifies the tag, re-runs all gates, checks the archive checksum, and publishes the bundle and checksum.
- CI now fails if any gate rewrites `MANIFEST.sha256`, and the host E2E workflow runs a minimum/current OpenCode version matrix on Linux and Windows.

### Security
- Cancellation and timeouts now terminate the whole subprocess tree (including grandchildren) instead of only the direct child.

### TUI and workflow
- Added a native OpenCode TUI plugin with a live TeamLead prompt indicator.
- Added a TeamLead section to the Ctrl+P command palette with status, history, planning, execution, resume, models, settings, and diagnostics actions.
- Added a safe, patch-free presentation snapshot for progress and recovery-aware stale-run display.

### Installation
- Added interactive and explicit local/global installation modes to both installers.
- Global installation now installs shared code, commands, agents, and TUI integration without creating shared TeamLead settings or runtime state.
- Added idempotent `tui.json` / `tui.jsonc` registration that preserves existing JSONC comments and unrelated plugins.

### Documentation and release
- Added English/Russian cross-links and documented TUI, Ctrl+P, and installation scope behavior.
- Release artifacts now use version `2.1.0`.

### Host compatibility
- Plugin initialization no longer performs provider catalog I/O before OpenCode finishes loading the plugin.
- OpenCode 1.18.31 host smoke coverage now validates installed commands, TeamLead tools, doctor, plan, and model paths through the server SDK.

## 2.0.0

### Runtime rewrite
- Rebuilt against the real OpenCode 1.x server plugin/tool/hook model.
- Added OpenCode 1.x compatibility layer with 1.18.30 baseline and `<2` future-family range.
- Removed dependency on fictional/non-portable custom plugin TUI modules.

### Speed / cost
- Added Direct, Managed and Team adaptive execution depth.
- Added critical-path scheduler and strategy-dependent parallel width.
- Added provider-specific concurrency and cost admission.
- Conditional LLM review: low-risk strongly verified Direct tasks can finish without Reviewer.
- Project-local model evidence optimizes expected successful-task cost rather than cheapest first call.

### Safety / correctness
- Removed worker shell/task permissions.
- Added runtime WRITE SCOPE enforcement, fail-closed unknown mutation targets, path traversal and symlink escape protection.
- Model output can no longer provide raw verification shell commands.
- Trusted verification runs `executable + args[]` with `shell:false`.
- Hard model eligibility is never relaxed to an incompatible fallback.
- Provider failures are separated from verification/integration failures.
- Added cross-process Git integration lock and `git apply --check`.
- Added cancellation forwarding to OpenCode child sessions and deterministic checks.

### Git / verification
- Isolated mutating workers in Git worktrees with dirty/untracked project baseline.
- Binary patch collection, WRITE SCOPE validation and transactional primary-checkout integration.
- Targeted verification and optional final full suite.

### Compatibility / migration
- Rebuilt slash commands against the supported OpenCode Markdown command surface without relying on deprecated `subtask` metadata.
- Safe v1.x config migration maps role models/pools/budgets.
- Legacy raw `gateCommands` are explicitly discarded.

### Tests
- Added profiler/admission, router, scheduler, security, verification, migration and real Git worktree/integration tests.

### Release hardening
- Added dynamic host-level WRITE SCOPE permissions for isolated mutating workers, plus parent-hook defense in depth.
- Explicit empty connected-provider lists now fail closed instead of enabling every catalog provider.
- Rejects traversal, absolute and repository-wide WRITE SCOPE declarations before dispatch.
- Added abort forwarding to child OpenCode sessions.
- Budget estimates are reserved before concurrent worker dispatch and include failed/retried attempts conservatively.
- Fixed Linux/macOS installer JSON newline corruption during upgrades.
- Expanded deterministic runtime/integration/installer coverage to 27 passing tests in the release bundle.
- Added explicit `apply_patch` marker-path parsing so Add/Update/Move/Delete operations are checked against WRITE SCOPE before execution.
- Provider concurrency is now enforced at actual prompt time, including retries and failover, not only during wave admission.
- `/lead-settings` now rejects model IDs that are not currently connected in OpenCode.
- Final full-suite verification results are persisted in run status.
- Upgrade installers remove only known obsolete TeamLead v1 command files while preserving unrelated user commands.
