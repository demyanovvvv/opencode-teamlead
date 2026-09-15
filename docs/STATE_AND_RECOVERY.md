# State and Recovery

## Files

TeamLead stores runtime data under `.opencode/.teamlead/` in the target repository:

- `state.json` contains recent runs, model evidence, and provider circuits.
- `events.jsonl` contains coarse diagnostic events.
- `state.lock` serializes cross-process state transactions.
- `integration.lock` serializes writes to the primary checkout.

State writes use lock, reload, mutate, temporary-file write, and atomic rename. Structurally invalid run, nested task, verification, review, evidence, and circuit records are discarded during loading; valid sibling records remain available. A run with malformed nested task or review state is discarded as a unit so recovery never resumes a partial or altered DAG.

Lock files record a process ID, hostname, and owner token. Files older than ten minutes are reclaimed only when their recorded same-host process is no longer alive. Cross-host locks fail closed because their process liveness cannot be checked locally. An old lock with unreadable metadata is also reclaimable; a fresh malformed lock is retained to avoid racing a writer that has not finished recording ownership.

## Integration recovery

For a mutating task, TeamLead:

1. Collects and validates the worker patch.
2. Runs trusted checks in the isolated worktree.
3. Persists the patch, its SHA-256 hash, and the `verified` phase.
4. Integrates the patch under the integration lock.
5. Persists the `integrated` phase and completed task status.

If the process stops between steps 3 and 5, resume verifies the stored hash. A forward `git apply --check` means the patch was not applied and can be applied now. A reverse check means the patch is already present. If neither succeeds, recovery fails closed because the primary checkout has diverged.

This is transactional recovery for persisted verified patches, not general event-sourced exactly-once execution. Model prompts completed before their state write can still be charged by a provider even if local accounting did not advance.

## Retention

The state keeps the 100 most recently updated runs. Event retention is not automatically bounded; repositories with long-lived usage should archive or remove `events.jsonl` according to local policy.
