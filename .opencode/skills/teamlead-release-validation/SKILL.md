---
name: teamlead-release-validation
description: Validate an OpenCode TeamLead release across types, tests, installers, payload boundaries, documentation, and checksums.
compatibility: opencode
---

# TeamLead Release Validation

## Gate

1. Use Node.js 22 and run `npm ci`.
2. Run `npm run verify` on Windows and Linux.
3. Run `npm run manifest:write` only after all release files are final.
4. Run `npm run manifest:check` and confirm a clean result.
5. Verify both installers are idempotent and preserve an existing `teamlead.json`.
6. Confirm `.agents/` and root `.opencode/skills/` are not copied into `payload/`.
7. Smoke-test `/lead-doctor`, `/lead-plan`, and `/lead` against the minimum and current supported OpenCode 1.x versions when available.
8. Confirm README, changelog, compatibility, threat model, budgeting, and recovery docs match implemented behavior.

Block a release on any failed critical verification, stale manifest, unsafe installer change, or undocumented compatibility change.
