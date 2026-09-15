# TeamLead v2.0.0 release validation

Release build validation completed on 2026-09-14.

- TypeScript compatibility check: PASS.
- Deterministic/unit/integration suite: 40/40 PASS.
- Real temporary Git repository/worktree transaction test: PASS.
- Full mock OpenCode runtime worker -> worktree -> verification -> integration -> review: PASS.
- Provider failover: PASS.
- Strict provider concurrency at actual prompt time: PASS.
- Locked concurrent state updates, nested task/review malformed-record validation, and stale malformed-lock recovery: PASS.
- Planner budget admission before prompting: PASS.
- Persisted verified-patch recovery: PASS.
- Linux and Windows CI definition: PASS.
- Automated release manifest validation: PASS.
- Payload required-file, SDK-range, and runtime-state boundary validation: PASS.
- WRITE SCOPE traversal / symlink / unbounded-scope rejection: PASS.
- `apply_patch` marker path enforcement: PASS.
- Failing trusted verification leaves primary checkout unchanged: PASS.
- Pre-aborted trusted subprocesses terminate immediately without waiting for timeout: PASS.
- Linux/macOS fresh installer smoke test: PASS.
- Linux/macOS upgrade/preservation installer smoke test: PASS.
- Static scan for `shell:true`, `child_process.exec`, `eval`, `new Function`: PASS (none found in plugin/runtime source).
- PowerShell installer smoke test with a path containing spaces: PASS.
- OpenCode binary `1.18.31` is installed in the validation environment, but headless command/debug invocations did not produce a result within the timeout; `/lead-doctor` plus representative `/lead-plan`/`/lead` runs remain an unresolved host smoke-test blocker.
