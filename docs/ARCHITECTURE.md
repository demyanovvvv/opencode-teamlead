# TeamLead v2 Architecture

## Product invariant

TeamLead optimizes **time-to-verified-change** and **cost-per-verified-change** without weakening correctness. More agents are used only when their expected benefit exceeds orchestration/integration overhead.

## Execution modes

- **Direct:** deterministic profiler → one bounded worker → targeted trusted checks → conditional review.
- **Managed:** one bounded worker planned/profiled with more context → targeted checks → conditional review/repair.
- **Team:** read-only Lead produces a bounded DAG → critical-path/safe-wave scheduler → parallel isolated workers → transactional integration → final checks → review/repair.

Execution mode is chosen by deterministic profiling first; a Lead call is paid for only when a bounded safe task cannot be inferred cheaply.

## Control plane

`plugins/teamlead.ts` is the only auto-loaded plugin entrypoint. It exposes typed TeamLead tools. `.opencode/commands/lead*.md` map slash commands to those tools. Internal modules under `.opencode/teamlead/` are regular modules, not plugins.

## Model routing

1. Build candidate set from role default/pool/current model.
2. Hard-filter by model ID validity, provider circuit, context capacity and tool capability.
3. Score only eligible models using project-local success/repair evidence, catalog cost, provider health and policy (`fast`, `balanced`, `economy`, `quality`).
4. If zero eligible models remain, block/split/re-plan; do not relax hard constraints.

No model family names are used as quality signals.

## Scheduler

The scheduler validates the DAG, computes critical-path weights and creates a wave subject to:

- unresolved dependencies;
- overlapping WRITE SCOPE serialization;
- global `maxParallelWorkers` ceiling;
- provider-specific concurrency at wave admission and a strict runtime semaphore around each provider prompt;
- strategy-dependent wave width;
- budget admission.

## Mutating worker transaction

1. Require bounded WRITE SCOPE.
2. Create detached Git worktree.
3. Overlay current tracked dirty state and untracked files into an ephemeral baseline.
4. Run worker with `bash`, `task`, external directory and TeamLead-recursion denied.
5. Stage worktree changes and collect a binary delta relative to baseline.
6. Validate every changed path against WRITE SCOPE.
7. Enforce plan drift by validating every changed path against the declared WRITE SCOPE; task-level contract edges inform ordering and verification selection.
8. Run affected trusted verification checks with `shell:false`.
9. Acquire repository-level integration lock.
10. `git apply --check` against current primary checkout.
11. Apply only if still conflict-free.
12. Clean the worktree.

A failed attempt does not apply that attempt's patch to the primary checkout.

## Task Contract Graph

Tasks may declare `provides` and `consumes` contract IDs. Provider→consumer edges are automatically added to the DAG before validation/scheduling, and trusted verification checks may target those contract IDs. v2.0.0 intentionally does not claim a persistent repository-wide contract registry or automatic replay of already-completed consumers after an undeclared external contract change.

## Verification

Verification definitions are structured (`executable`, `args[]`, path/contract/task filters); model output has no raw command field. Auto-detected project checks are a convenience for trusted development repositories. Final full-suite checks are separated from low-cost affected checks.

## Conditional Reviewer

The runtime recalculates review admission using actual evidence after implementation:

- strong targeted verification + low risk can end at review level 0;
- medium risk/weak coverage uses level 1;
- contract/high-risk/repaired work uses level 2.

The reviewer must return JSON-schema structured output. Repair findings without bounded project-relative paths stop as `repair_required` rather than granting broad write access.

## Persistence / resume

`.opencode/.teamlead/state.json` stores runs, provider circuit state and routing evidence. Locked read-modify-write transactions prevent concurrent runtimes from replacing each other's snapshots. `events.jsonl` records coarse runtime events. Verified patches and their hashes are persisted before integration; `/lead-resume` uses forward/reverse Git applicability checks to recover an unapplied or already-applied patch. TeamLead deliberately does not claim full event-sourced exactly-once execution for every model-prompt micro-step. See `STATE_AND_RECOVERY.md`.
