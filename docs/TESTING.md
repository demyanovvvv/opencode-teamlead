# Testing

From the TeamLead source bundle:

```bash
npm ci
npm run verify
npm run payload:check
npm run security:scan
npm run manifest:check
npm run release:bundle
npm run e2e:host:plan
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
- host compatibility smoke for plugin loading, commands, tools, and typed planning; mutating host execution requires a real model/session fixture and is not part of the deterministic host smoke;
- failing trusted verification leaves the primary checkout unchanged;
- strong verified Direct work can skip an unnecessary LLM Reviewer;
- Team mode consumes a typed Lead DAG handoff;
- strict provider-request concurrency under parallel task execution.
- selective validation of malformed persisted records and locked concurrent updates;
- nested task/review state validation and stale malformed-lock recovery;
- planner budget admission before the first model prompt;
- persisted verified-patch crash recovery;
- pre-aborted trusted subprocess cancellation;
- full subprocess-tree termination on timeout/cancellation, including grandchildren;
- absolute, Windows drive, and UNC path escape rejection;
- Windows-safe path normalization and deterministic Git EOL handling.
- PowerShell installation into a Windows path containing spaces;
- payload boundary check excluding contributor skills and documentation;
- manifest generation excluding local-only files plus byte-for-byte reproducible release bundle with an in-archive manifest validated against every shipped file.

`npm run typecheck` compiles the plugin against the bundled public-API compatibility fixture. The mock client tests orchestration glue, not the complete OpenCode binary. Run `npm run payload:check` to ensure contributor-only files cannot enter the installable payload. `npm run security:scan` checks the payload and installers for forbidden dynamic or shell execution patterns. `npm run e2e:host`, `npm run e2e:host:plan`, and `npm run e2e:host -- --command lead-models` qualify the installed payload through the real OpenCode server SDK without relying on an agent response. A real mutating `/lead` run remains a target-machine qualification step because it requires a configured provider and model.

The PowerShell installer is included for Windows. The automated test runs when `pwsh.exe` is available on Windows; validation with Windows PowerShell 5.1 remains a target-machine release qualification step when that host is supported.
`tests/installer.test.mjs` also exercises distribution version transitions, interactive scope/project selection, standalone removal, language/settings preservation, SDK dependency restoration, JSONC registration cleanup, fresh-install cleanup, Git worktree unregistration, generated dependency artifact removal, concurrent global project registration, independent local installation preservation, forged-registry rejection and linked-path rejection. Lifecycle tests use PowerShell on Windows and Bash elsewhere. To exercise Bash lifecycle on Windows with Git Bash, set `TEAMLEAD_TEST_BASH` to its executable path and run `node --experimental-strip-types --test tests/installer.test.mjs`. The security scan includes both shell entrypoints, the shared lifecycle implementation and JSONC helper.

## Host E2E workflow

The manual `.github/workflows/host-e2e.yml` workflow installs an OpenCode 1.x version and runs the same doctor, plan, and model smoke commands. It runs a version matrix (Linux `1.18.30` and `1.18.31`, Windows `1.18.31`) and accepts an optional extra version through the `opencode-version` input. Provider credentials are not required for these host/plugin checks. A release qualification that includes `/lead` must use a separate trusted test repository with provider credentials supplied through the target OpenCode configuration.

## Release workflow

Pushing a tag matching `v<version>` triggers `.github/workflows/release.yml`. It requires the tag to equal the `package.json` version, re-runs `npm run verify`, `payload:check`, `security:scan`, `manifest:check`, and the manifest drift guard, builds the bundle, verifies the archive checksum, and publishes the `.tar.gz` and `.sha256` to a GitHub release.
