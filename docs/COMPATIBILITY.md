# OpenCode 1.x Compatibility

## Contract

TeamLead v2 targets the OpenCode **1.x** public plugin/SDK family with a tested compatibility baseline of **1.18.30** and a package range `<2.0.0`.

It does not branch on an exact patch version for feature behavior. `/lead-doctor` checks the public SDK capabilities required by the runtime and reports missing capabilities. It reads the connected server version from the SDK when available and falls back to the plugin server endpoint, preserving custom build suffixes such as `1.18.35+patchline.1.2.1`.

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
- optional TUI plugins configured through `tui.json`;
- agent permissions;
- OpenCode SDK client passed to a plugin.

The server plugin remains compatible with the stable 1.x server surface. OpenCode 1.18.31+ also loads the optional TeamLead TUI module from `tui.json`; it provides the prompt indicator and Ctrl+P menu. If TUI plugin loading is unavailable, server tools and slash commands remain usable.

## Release validation policy

Install/uninstall entrypoints require Node.js 22.6+ with native type stripping (passed explicitly by both shells). Bash and PowerShell share the same lifecycle implementation. Global configuration resolution respects `OPENCODE_CONFIG_DIR`, then `XDG_CONFIG_HOME`, then `~/.config/opencode`. Restart OpenCode after installing or updating; close it before removing the plugin.

For future releases, the manual host workflow should test at least:

1. minimum supported 1.x;
2. current stable 1.x;
3. newest 1.x selected for release qualification.

The build bundle includes local static/mock compatibility tests, but a real OpenCode installation is the authoritative E2E environment.


Repository CI runs the deterministic type/test/payload/security/manifest/bundle gate on Linux and Windows with Node.js 22 and fails if any gate rewrites the committed `MANIFEST.sha256`. The manual host workflow runs the real OpenCode server/plugin smoke checks against a version matrix (Linux `1.18.30` and `1.18.31`, Windows `1.18.31`) and accepts an optional extra version. The mock SDK fixture cannot prove host behavior, and a real mutating `/lead` run still requires provider credentials.

The release environment qualified OpenCode `1.18.30` and `1.18.31` through the real server SDK. On Windows, `1.18.30` must be installed with its platform-specific optional binary package; the npm wrapper tarball alone contains a placeholder launcher and cannot be executed by itself.

Tag pushes matching `v<version>` run the release workflow, which re-runs every gate, verifies the tag equals `package.json`, checks the archive checksum, and publishes the `.tar.gz` plus `.sha256` to the GitHub release.
