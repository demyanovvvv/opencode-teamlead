---
description: Interactive TeamLead model, routing, budget and review settings
---

First call `teamlead_settings` with `action: "show"` and `teamlead_models`.

If `$ARGUMENTS` contains a concrete setting change, interpret it conservatively and apply exactly that change with `teamlead_settings`, then show the new configuration.

If `$ARGUMENTS` is empty, use OpenCode's built-in `question` tool when available to present a compact interactive menu for: strategy, role model defaults, worker pools, max parallel workers, provider limits, budget, and review depth. Apply the user's selection with `teamlead_settings`. If the `question` tool is unavailable, print the same choices as a short textual menu and explain example `/lead-settings ...` commands. Never edit `.opencode/teamlead.json` directly when the typed settings tool can perform the change.
