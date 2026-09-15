# Testing

From the TeamLead source bundle:

```bash
npm ci
npm run verify
```

The release suite covers:

- adaptive Direct / Managed / Team admission;
- profiler path/scope inference and rejection of unsafe/unbounded WRITE SCOPE;
- hard model context/tool/provider-connectivity eligibility;
- provider circuit exclusion;
- DAG cycle detection, critical-path priority, task contract edges and strategy-dependent parallel width;
- write-scope conflict scheduling;
- safe v1 configuration migration and dropping legacy raw command strings;
- targeted structured verification selection;
- shell/task denial, traversal protection, symlink-escape protection and `apply_patch` marker-path enforcement;
- real Git worktree dirty-baseline + worker-only patch integration;
- Linux/macOS installer upgrade preservation;
- full runtime worker → worktree → patch → verification → integration → structured review flow with a mock OpenCode SDK client;
- failing trusted verification leaves the primary checkout unchanged;
- strong verified Direct work can skip an unnecessary LLM Reviewer;
- Team mode consumes a typed Lead DAG handoff;
- strict provider-request concurrency under parallel task execution.
- selective validation of malformed persisted records and locked concurrent updates;
- nested task/review state validation and stale malformed-lock recovery;
- planner budget admission before the first model prompt;
- persisted verified-patch crash recovery;
- pre-aborted trusted subprocess cancellation;
- Windows-safe path normalization and deterministic Git EOL handling.
- PowerShell installation into a Windows path containing spaces;
- payload boundary check excluding contributor skills and documentation.

`npm run typecheck` compiles the plugin against the bundled public-API compatibility fixture. The mock client tests orchestration glue, not the complete OpenCode binary. Run `npm run payload:check` to ensure contributor-only files cannot enter the installable payload. A release should additionally run `/lead-doctor` and a representative `/lead-plan`/`/lead` smoke test inside the target OpenCode 1.x installation; if headless invocation hangs, inspect host/provider configuration before qualifying the release.

The PowerShell installer is included for Windows. The automated test runs when `pwsh.exe` is available on Windows; validation with Windows PowerShell 5.1 remains a target-machine release qualification step when that host is supported.
