# Security policy

## Reporting a vulnerability

Please do not publish credentials, private source code or exploit details in a public issue. Use [GitHub private vulnerability reporting](https://github.com/demyanovvvv/opencode-teamlead/security/advisories/new) when available. If that option is unavailable, open an issue requesting a private contact channel without including sensitive details.

Include the affected release, operating system, OpenCode and Node.js versions, reproduction steps, expected behavior and impact. Use a minimal repository without real credentials. Reports concerning path escapes, permissions, command execution, persistence or Git integration are particularly useful.

Fixes target the latest published release; older releases do not have a separate maintenance commitment. No response-time SLA is currently provided.

## Trust boundaries

TeamLead treats model output as untrusted and checks scopes and patches before integration. Repository verification executes project code with host privileges. Git worktrees isolate filesystem changes, not processes. Installation and project-registry state are user-controlled trusted configuration.

See [THREAT_MODEL.md](docs/THREAT_MODEL.md) for guarantees and limitations.

## По-русски

Не публикуйте токены, закрытый код и подробности эксплуатации в открытом issue. Используйте закрытое сообщение об уязвимости по ссылке выше, если оно доступно. Иначе создайте issue с запросом приватного канала связи без чувствительных деталей. Укажите релиз, окружение, шаги воспроизведения и последствия. Исправления выпускаются для актуального релиза; гарантированного срока ответа нет.
