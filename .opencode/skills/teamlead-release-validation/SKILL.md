---
name: teamlead-release-validation
description: Validate an OpenCode TeamLead release across types, tests, installers, payload boundaries, documentation, and checksums.
compatibility: opencode
---

# TeamLead Release Validation

## Gate

1. Read `AGENTS.md`, release documentation, and the affected release/install tests.
2. Use Node.js 22 and run `npm ci`.
3. Run `npm run rules:check`, `npm run verify`, `npm run payload:check`, and `npm run security:scan`.
4. Run `npm run manifest:write` only after all release files are final.
5. Run `npm run manifest:check` and confirm a clean result; never hand-edit `MANIFEST.sha256`.
5. Verify both installers are idempotent and preserve an existing `teamlead.json`.
6. Confirm `.agents/` and root `.opencode/skills/` are not copied into `payload/`.
7. Smoke-test `/lead-doctor`, `/lead-plan`, and `/lead` against the minimum and current supported OpenCode 1.x versions when available.
9. Confirm README, changelog, compatibility, threat model, budgeting, recovery, and testing docs match implemented behavior.

Block a release on any failed critical verification, stale manifest, unsafe installer change, or undocumented compatibility change.
