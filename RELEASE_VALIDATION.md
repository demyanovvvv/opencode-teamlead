# TeamLead v2.1.0 release validation

Release build validation completed on 2026-09-28.

- TypeScript compatibility check: PASS.
- Deterministic/unit/integration/release/security suite: 44/44 PASS.
- Real temporary Git repository/worktree transaction test: PASS.
- Full mock OpenCode runtime worker -> worktree -> verification -> integration -> review: PASS.
- Provider failover: PASS.
- Strict provider concurrency at actual prompt time: PASS.
- Locked concurrent state updates, nested task/review malformed-record validation, and stale malformed-lock recovery: PASS.
- Planner budget admission before prompting: PASS.
- Persisted verified-patch recovery: PASS.
- Linux and Windows CI definition: PASS.
- Automated release manifest validation: PASS (derived from the Git file set; local-only files and runtime state excluded).
- Deterministic release bundle creation and archive content validation: PASS (byte-for-byte reproducible; in-archive manifest validated against every shipped file).
- Release manifest drift guard in CI: PASS (gates must not rewrite `MANIFEST.sha256`).
- Payload required-file, SDK-range, and runtime-state boundary validation: PASS.
- Static payload/installer security scan: PASS.
- WRITE SCOPE traversal / symlink / unbounded-scope rejection: PASS.
- `apply_patch` marker path enforcement: PASS.
- Failing trusted verification leaves primary checkout unchanged: PASS.
- Pre-aborted trusted subprocesses terminate immediately without waiting for timeout: PASS.
- Timeout/cancellation terminates the full subprocess tree, including grandchildren: PASS.
- Absolute, Windows drive, and UNC paths cannot escape the project root: PASS.
- Linux/macOS fresh installer smoke test: PASS.
- Linux/macOS upgrade/preservation installer smoke test: PASS.
- Static scan for `shell:true`, `child_process.exec`, `eval`, `new Function`: PASS (none found in plugin/runtime source).
- PowerShell installer smoke test with a path containing spaces: PASS.
- Local/global installer scope selection and global per-project state isolation: PASS.
- Idempotent `tui.json` / `tui.jsonc` registration with unrelated plugin/comment preservation: PASS.
- TUI presentation snapshot excludes patches and provider logs: PASS.
- Release archive installation from the generated `.tar.gz` bundle: PASS.
- Real OpenCode `1.18.31` server host smoke: PASS; clean installed payload exposed `lead-doctor`, `lead-plan`, `lead-models`, and all TeamLead tools.
- Real OpenCode `1.18.31` TeamLead doctor tool: PASS (`healthy: true`).
- Real OpenCode `1.18.31` TeamLead plan/model tool paths: PASS without a model prompt.
- Real OpenCode `1.18.30` server host smoke: PASS using the published Windows x64 platform binary; clean installed payload exposed all TeamLead tools and doctor returned `healthy: true`.
- Real mutating `/lead` with a live provider remains a target-environment qualification step; it is not claimed by the deterministic host harness.
