# Threat Model

## Protected assets

- user's primary checkout;
- files outside the project;
- Git branch/index/history;
- host command execution;
- model/provider credentials inherited by OpenCode;
- correctness of accepted code.

## Trust assumptions

TeamLead assumes the developer intentionally runs OpenCode on a **trusted development repository**. Tests/builds can execute project code with the user's OS privileges; Git worktrees isolate filesystem changes, not processes. For untrusted repositories, run OpenCode/TeamLead inside an OS/container sandbox and disable automatic verification until checks are reviewed.

## Model trust

Worker output is untrusted. Security does not depend on the worker obeying prose instructions.

Defense layers:

1. Mutating TeamLead agents deny `bash`, `task`, external directory and TeamLead recursive tools.
2. Work is performed in an isolated worktree.
3. Worker-only patch is computed after execution.
4. Every changed path is validated against WRITE SCOPE.
5. Traversal and realpath/symlink escape checks fail closed.
6. Declared contract ordering plus changed-path/WRITE-SCOPE drift checks run before integration.
7. Trusted deterministic checks run before integration.
8. Primary checkout integration uses a cross-process lock and `git apply --check`.
9. Verified patches are persisted with SHA-256 hashes before integration and recovered with forward/reverse applicability checks.
10. State mutations use a separate cross-process lock and atomic replacement.

## Command injection

The model-facing schemas contain no raw verification command. Trusted checks are represented as an executable plus argument vector and run with `shell:false`.

User/project configured checks are trusted configuration. Auto-detected package/test commands execute project code; they are therefore appropriate only for a repository the developer trusts.

Trusted child processes observe run cancellation, including a signal already aborted before process startup, and request termination immediately instead of waiting for the command timeout.

## Known boundary

A test/build process may execute arbitrary code from the worktree. TeamLead v2.0 does not implement OS-level process/container sandboxing. Use container/VM isolation for hostile repositories or highly adversarial models.


Lock files contain an owner token, process ID, and hostname. A lock is removed only by its owner; stale integration locks are reclaimed only when an old same-host process is no longer alive. Cross-host liveness cannot be proven from a local filesystem and therefore fails closed.
## Installer ownership

Install/update/uninstall target the selected local or global OpenCode configuration directory. Node.js 22.6+ runs the common lifecycle implementation from the local distribution; it does not download updates. Shared installer paths, owned command/agent files and their ancestors reject symbolic links/junctions before mutation. Cleanup uses shipped/legacy/recorded command names (recorded basenames are validated) and the reserved `teamlead-*.md` agent namespace. It preserves unrelated plugins and commands, removes only the TeamLead TUI specifier while keeping JSONC comments, and records the original SDK dependency for restoration. Dependency artifacts are removed only when absent before installation and no unrelated package requirements remain in an installer-created package.

Global startup records explicitly used projects in a locked registry with matching installation UUID markers. Global uninstall validates registry filename hashes, absolute project paths, installation UUIDs, project ownership markers and linked paths before cleanup. It preserves independent local installations and does not discover projects by scanning the filesystem. The registry is user-writable trusted installation state, not a boundary against a malicious same-user process. Git worktree removal is limited to registered paths under the project's `.opencode/.teamlead/worktrees/`, using fixed Git argument vectors with `shell:false`. Close OpenCode before removal so active processes do not recreate runtime state.
