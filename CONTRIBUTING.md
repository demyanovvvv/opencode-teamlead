# Contributing

Read `AGENTS.md` first. It is the normative project guide for repository layout,
scope, security invariants, change classes, and completion criteria. The rules
below explain the human contributor workflow; specialized runtime and release
skills provide additional checks for those areas.

## Setup

Use Node.js 22.6 or newer:

```bash
npm ci
npm run verify
```

The source package is in the repository root. The files installed into user projects are under `payload/.opencode/`.

## Development rules

- Locate the affected subsystem, classify the change risk, and define a bounded project-relative scope before editing.
- Add a meaningful failing regression test before changing runtime behavior when practical.
- Prefer the smallest compatible diff. Do not combine unrelated cleanup, renames, or formatting with a behavioral change.
- Preserve the shipped boundary: runtime belongs in `payload/.opencode/`; contributor material belongs outside `payload/`.
- Preserve worker isolation, bounded `WRITE SCOPE`, structured verification, fail-closed routing, and locked state transactions.
- Use structured executable/argument checks. Never add model-provided shell commands.
- If a necessary change is outside the current scope, stop and create a new bounded task instead of widening scope implicitly.

Project-specific contributor skills live in `.opencode/skills/`. The external `create-opencode-plugin` skill installed under `.agents/skills/` provides general OpenCode plugin references.

## Pull request checks

Run:

```bash
npm run rules:check
npm run verify
npm run manifest:check
npm run payload:check
npm run security:scan
npm run release:bundle
git diff --check
```

Run `npm run manifest:write` only after all release files are final; then run
`npm run manifest:check` again and inspect the manifest diff.

Document behavior changes in `CHANGELOG.md`. Update architecture, threat-model, budgeting, recovery, compatibility, or testing documentation when their guarantees change.

Do not claim that a test, review, release gate, or compatibility check passed
without current command output or trusted tool evidence.

The project is licensed under [MIT](LICENSE). Preserve copyright notices; do not assign third-party contributions to a different owner without confirmation. Use the issue and pull request templates, and follow [SECURITY.md](SECURITY.md) for vulnerability reports.
