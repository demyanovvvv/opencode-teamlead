# Release validation — 2.2.1

## Qualification scope

Release qualification covers TypeScript compatibility, deterministic runtime tests, installer lifecycle, payload boundaries, static security checks, manifest consistency and reproducible archive generation. PowerShell and Git Bash lifecycle tests are run on Windows; GitHub CI additionally qualifies Linux and Windows independently.

## Required commands

```bash
npm ci
npm run rules:check
npm run verify
npm run payload:check
npm run security:scan
npm run manifest:check
npm run release:bundle
npm run e2e:host
npm run e2e:host:plan
git diff --check
```

The manifest is generated with `npm run manifest:write` only after release files are final. Verification must then check it without rewriting it.

## Installer and archive checks

- Local/global installation and standalone uninstallation.
- Interactive scope and project selection.
- Local-distribution version transitions with preserved settings and language.
- Removal of obsolete recorded commands and agents.
- Git worktree removal and unregistration.
- SDK dependency restoration and owned dependency-artifact cleanup.
- Concurrent global registration, internal worktree exclusion and independent local installation preservation.
- Rejection of forged registry entries and linked paths.
- Reproducible archive with an in-archive manifest, external SHA-256 checksum and executable Bash installation/removal scripts.

## Evidence and limits

The local required gates and both shell lifecycle suites passed on 2026-10-12 before release preparation. The release commit is re-qualified with the same gates; authoritative output is retained in the GitHub Actions CI and Release runs associated with the release tag.

Host smoke covers installed plugin loading, `/lead-doctor` and deterministic `/lead-plan` behavior against the available OpenCode host. The local doctor smoke reported the connected custom server version `1.18.35+patchline.1.3.0`, a supported family and all required capabilities and files. Mock runtime tests cover mutating worker execution, verification and integration. A live model-backed mutating `/lead` run and Windows PowerShell 5.1 are not qualified by these checks. See [TESTING.md](docs/TESTING.md) and [COMPATIBILITY.md](docs/COMPATIBILITY.md).
