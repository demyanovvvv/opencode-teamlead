# OpenCode TeamLead v2.1.2

TeamLead v2.1.2 refreshes the bilingual English/Russian documentation and release metadata while retaining the localized UI and installer support. Execution settings and run history stay isolated per project in either installation mode.

## Highlights

- **Live status at the prompt:** see the execution mode, phase, completed tasks, and active workers without opening the run log. An interrupted run is distinguished from a live one after a restart.
- **TeamLead in Ctrl+P:** open status and history, plan or execute a goal, resume a run, and reach models, settings, and diagnostics from the command palette. Existing `/lead*` commands remain available.
- **Choose installation scope:** both installers support local and global installation. Global installation shares the plugin, commands, agents, and TUI integration across projects while retaining each project's `.opencode/teamlead.json` and `.opencode/.teamlead/` state.
- **Safe updates:** TUI registration is idempotent and preserves unrelated plugins and comments in existing `tui.jsonc` files.
- **Runtime reliability:** persisted-state validation, cross-process state locks, verified-patch recovery, stricter budget admission, and subprocess-tree cancellation are included in this release.
- **Bilingual experience:** choose English or Russian interactively, or select the language explicitly in the shell installer; existing project settings are preserved during updates.
- **Updated documentation:** English and Russian README files, installation guidance, and release metadata are aligned with the current patch release.

## Installation

Download `opencode-teamlead-v2.1.2.tar.gz` and verify it using the accompanying `.sha256` file. Extract the archive and run one of the following commands from its root:

```bash
./install.sh --scope local --project /path/to/project
./install.sh --scope global
```

```powershell
.\install.ps1 -InstallScope Local -Project C:\path\to\project
.\install.ps1 -InstallScope Global
.\install.ps1 -InstallScope Local -Language ru -Project C:\path\to\project
```

Restart OpenCode, then use **Ctrl+P → TeamLead** or run `/lead-doctor`. The supported host family is OpenCode `>=1.18.30 <2.0.0`; TUI integration depends on the host's TUI plugin support.

Documentation: [English README](https://github.com/demyanovvvv/opencode-teamlead/blob/v2.1.2/README.md) · [Russian README](https://github.com/demyanovvvv/opencode-teamlead/blob/v2.1.2/README_RU.md) · [Russian installation guide](https://github.com/demyanovvvv/opencode-teamlead/blob/v2.1.2/INSTALL_RU.md) · [Changelog](https://github.com/demyanovvvv/opencode-teamlead/blob/v2.1.2/CHANGELOG.md).
