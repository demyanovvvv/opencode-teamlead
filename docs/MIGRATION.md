# Migration from TeamLead v1.x

## Installer behavior

The installer removes the legacy `.opencode/plugins/teamlead/` plugin directory and installs a single v2 entrypoint `.opencode/plugins/teamlead.ts`. Existing `.opencode/teamlead.json` is preserved.

## Config migration

At runtime v2 maps legacy role fields where possible:

- `strongModel` / `models.lead` → `models.orchestrator`;
- `reviewerModel` → reviewer;
- legacy worker model fields → matching worker roles;
- existing worker pools → v2 worker pools.

Legacy arbitrary `gateCommands` are **not migrated**. Old verification entries are retained only when already represented structurally as `executable` plus `args[]`.

## UI migration

Pre-v2 experimental custom TUI/plugin-route files are not used. OpenCode 1.x compatible commands replace them:

- `/lead-settings`
- `/lead-models`
- `/lead-status`
- `/lead-doctor`

## Recommended sequence

1. Back up the project or commit current work.
2. Run the v2 installer.
3. Restart OpenCode.
4. Run `/lead-doctor`.
5. Run `/lead-models`.
6. Review `/lead-settings` and reassign models/pools if necessary.
7. Run `/lead-plan` on a representative task before the first large v2 run.
