# OpenCode 1.x Compatibility

## Contract

TeamLead v2 targets the OpenCode **1.x** public plugin/SDK family with a tested compatibility baseline of **1.18.30** and a package range `<2.0.0`.

It does not branch on an exact patch version for feature behavior. `/lead-doctor` checks the public SDK capabilities required by the runtime and reports missing capabilities.

Required capabilities:

- session create;
- session prompt;
- session messages.
- provider listing.

Optional capabilities are used only when present. A missing security-critical requirement must fail closed rather than silently enabling an unsafe path.

## Stable UX surface used

- project plugins under `.opencode/plugins/`;
- custom plugin tools;
- project agents under `.opencode/agents/`;
- custom commands under `.opencode/commands/`;
- agent permissions;
- OpenCode SDK client passed to a plugin.

TeamLead core does not depend on a custom plugin TUI module. Settings are available through `/lead-settings`; when the built-in `question` tool exists in the active 1.x session, the command asks the host agent to use it for an interactive menu and otherwise falls back to text.

## Release validation policy

For future releases, CI should test at least:

1. minimum supported 1.x;
2. current stable 1.x;
3. newest 1.x selected for release qualification.

The build bundle includes local static/mock compatibility tests, but a real OpenCode installation is the authoritative E2E environment.


Repository CI runs the deterministic type/test/manifest gate on Linux and Windows with Node.js 22. Real OpenCode smoke tests remain a release qualification step because the mock SDK fixture cannot prove host behavior.
