# OpenCode TeamLead

**Adaptive task orchestration for OpenCode — focused workers, verified changes and project-local control.**

[Русский README](README_RU.md) · [Releases](https://github.com/demyanovvvv/opencode-teamlead/releases) · [Changelog](CHANGELOG.md)

TeamLead helps turn a development goal into a checked change. It selects an execution strategy, assigns bounded work, runs deterministic checks and integrates verified patches. Its objective is the fastest verified correct result at the lowest practical model cost.

## Features

- **Adaptive execution:** Direct, Managed or Team, depending on the task.
- **Model selection:** role assignments and pools, provider availability, context/tool capabilities, cost and recorded outcomes.
- **Bounded workers:** explicit read/write scopes, isolated Git worktrees and verification before integration.
- **Project-local settings and history:** independent budgets and execution records even with a global installation.
- **OpenCode integration:** slash commands, live status near the prompt and a TeamLead section in Ctrl+P when TUI plugins are supported.
- **English and Russian:** installer prompts and TeamLead UI localization.
- **Scoped removal:** dedicated uninstallers preserve unrelated OpenCode files and independent local installations.

## Execution modes

| Mode | Workflow |
| --- | --- |
| Direct | One bounded worker, affected checks and risk-based review. |
| Managed | Structured execution with targeted verification and conditional review. |
| Team | A Lead builds a task graph; non-conflicting workers execute in parallel, followed by verification and review. |

TeamLead selects the smallest useful orchestration depth. More workers are used only when they can improve the verified outcome.

## Installation

See [compatibility and requirements](docs/COMPATIBILITY.md). Download and extract a [release archive](https://github.com/demyanovvvv/opencode-teamlead/releases), or use a local checkout. Run the installer from the distribution root.

### Windows

```powershell
.\install.ps1
```

### Linux / macOS

```bash
bash ./install.sh
```

The menu lets you choose the language, **local installation in a project** or **global installation for the current user**. Local installation asks for the project directory.

For unattended installation:

```powershell
.\install.ps1 -InstallScope Local -Project C:\projects\my-app
.\install.ps1 -InstallScope Global -Language en
```

```bash
bash ./install.sh --scope local --project /path/to/my-app
bash ./install.sh --scope global --language en
```

Restart OpenCode after installation. Global installation shares code, agents and commands; settings and history stay within each project. Detailed Russian instructions: [INSTALL_RU.md](INSTALL_RU.md).

## First run

Open OpenCode in your project and run:

```text
/lead-doctor
/lead-models
/lead-settings
/lead-plan Fix the authentication bug and add a regression test
```

Inspect the plan, then start execution:

```text
/lead Fix the authentication bug and add a regression test
```

Use a Git repository for mutating tasks. Configure your model provider in OpenCode before executing model-backed work.

## Commands

| Command | Purpose |
| --- | --- |
| `/lead` | Execute a development goal. |
| `/lead-plan` | Preview the execution strategy and tasks. |
| `/lead-status` | Show execution status and history. |
| `/lead-resume` | Continue an eligible unfinished run. |
| `/lead-models` | Inspect connected models and role assignments. |
| `/lead-settings` | Configure strategy, models, concurrency, budgets and review. |
| `/lead-doctor` | Check host capabilities and installed files. |

The optional Ctrl+P menu provides shortcuts to the same workflows.

## Settings and data

- `.opencode/teamlead.json` — project settings.
- `.opencode/.teamlead/` — history, evidence, locks, patches and temporary worktrees.
- `.teamlead-projects/` in the global configuration directory — projects registered by the global plugin.

Settings include the execution strategy, role models/pools, provider concurrency, token/cost admission budgets and review depth. See [budgeting](docs/BUDGETING.md) and [state and recovery](docs/STATE_AND_RECOVERY.md).

## Uninstallation

Close OpenCode and run the uninstaller from the distribution root:

```powershell
.\uninstall.ps1
```

```bash
bash ./uninstall.sh
```

Choose local or global scope. Local removal cleans TeamLead code, settings, history, TUI registration and owned Git worktrees. Global removal also cleans registered projects' TeamLead data, while preserving independent local installations and their data. Unrelated plugins, commands and JSONC comments are preserved.

Only registered projects are included in global cleanup. Use local removal for any other project you want to clean.

## Verification and trust

Worker output is untrusted: paths and patches are checked before integration. Git worktrees isolate filesystem changes, not processes. Repository checks execute with the host user's privileges; use TeamLead with repositories you trust.

See [architecture](docs/ARCHITECTURE.md), [threat model](docs/THREAT_MODEL.md) and [testing](docs/TESTING.md) for the implemented guarantees and verification limits.

## Contributing and support

- [Contributing guide](CONTRIBUTING.md)
- [Report a bug or request a feature](https://github.com/demyanovvvv/opencode-teamlead/issues)
- [Security reporting](SECURITY.md)
- [Release validation](RELEASE_VALIDATION.md)

## License

[MIT](LICENSE) © demyanovvvv.
