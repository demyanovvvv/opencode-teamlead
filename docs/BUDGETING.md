# Budgeting

TeamLead budgets are estimate-based admission controls, not provider billing limits.

## Limits

- `maxTokens` limits reserved estimated tokens.
- `maxCostUsd` limits estimated cost calculated from catalog prices.
- `maxRunMinutes` limits elapsed run time checked before model admission.
- `softRatio` marks the fraction at which optional medium-level review is skipped. Critical review remains mandatory.

A value of `0` disables the corresponding hard limit. Estimates are reserved before every planner, worker, retry, failover, reviewer, and repair prompt. Failed attempts remain reserved because they may have consumed provider resources.

TeamLead deliberately does not expose `actualCostUsd`: OpenCode 1.x provider/message usage is not treated as a stable billing source by this runtime. Consult provider billing for actual charges.

Budget checks cannot cancel provider work already accepted, and a process crash can occur after provider usage but before local persistence. Configure limits below the provider-side ceiling when a strict financial boundary is required.
