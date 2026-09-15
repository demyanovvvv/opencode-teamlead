# Contributor Skills

Skills used to develop TeamLead are intentionally separate from the installable payload.

## External skill

`create-opencode-plugin` from `igorwarzocha/opencode-workflows` is installed locally under `.agents/skills/`. It was selected because it covers OpenCode SDK verification, hooks, custom tools, testing, and publishing, and its listed skills.sh security audits pass.

## Project skills

- `teamlead-runtime-development` defines runtime invariants and test mapping.
- `teamlead-security-review` defines the project-specific threat review.
- `teamlead-release-validation` defines the release gate.

These skills live under the root `.opencode/skills/`. They are not copied by `install.sh` or `install.ps1`. Runtime agents continue to deny the `skill` tool because an arbitrary installed skill is outside their bounded permission model.

`npm run payload:check` is the automated boundary guard for this separation.

Restart OpenCode after changing a skill so it is reloaded.
