# OpenCode TeamLead v2.1.1 — установка

TeamLead v2 поддерживает локальную и глобальную установку и рассчитан на OpenCode `>= 1.18.30` и `< 2.0.0`.

[Русский README](README_RU.md) · [English documentation](README.md).

## Windows

1. Распакуйте архив.
2. Откройте PowerShell в папке распакованного TeamLead.
3. Выполните:

```powershell
.\install.ps1 -Project C:\путь\к\вашему\проекту
# явно локально
.\install.ps1 -InstallScope Local -Project C:\путь\к\вашему\проекту
# глобально для текущего пользователя
.\install.ps1 -InstallScope Global
# выбрать русский язык явно
.\install.ps1 -InstallScope Local -Language ru -Project C:\путь\к\вашему\проекту
```

4. Перезапустите OpenCode в этом проекте.
5. Выполните:

```text
/lead-doctor
/lead-models
/lead-settings
```

`/lead-settings` использует встроенный интерфейс `question` OpenCode, когда он доступен, поэтому модели и основные параметры можно назначать интерактивно прямо в OpenCode.

## Linux / macOS

```bash
chmod +x ./install.sh
./install.sh /path/to/project
# явно локально
./install.sh --scope local --project /path/to/project
# глобально для текущего пользователя
./install.sh --scope global
# выбрать русский язык явно
./install.sh --scope local --language ru --project /path/to/project
```

После установки перезапустите OpenCode и выполните:

```text
/lead-doctor
/lead-models
/lead-settings
```

При глобальной установке код, команды, агенты, индикатор и меню Ctrl+P доступны во всех проектах. Файлы `.opencode/teamlead.json` и `.opencode/.teamlead/` всегда остаются локальными для каждого проекта.

После установки перезапустите OpenCode. Индикатор TeamLead появляется рядом с полем ввода, а в Ctrl+P появляется раздел TeamLead со статусом, историей, планированием, запуском, продолжением, моделями, настройками и диагностикой.

## Первый запуск

Сначала можно посмотреть план без изменений:

```text
/lead-plan Исправь ошибку авторизации и добавь регрессионный тест
```

Затем выполнить задачу:

```text
/lead Исправь ошибку авторизации и добавь регрессионный тест
```

## Обновление с TeamLead v1.x

Повторно запустите тот же установщик. Он:

- сохраняет существующий `.opencode/teamlead.json`;
- заменяет реализацию TeamLead;
- удаляет старый каталог `.opencode/plugins/teamlead/`;
- удаляет только известные устаревшие TeamLead-команды v1.x;
- не удаляет сторонние плагины и пользовательские команды.

Старые произвольные `gateCommands` из v1.x намеренно не переносятся в доверенные команды. В v2 проверки задаются структурой `executable + args[]`.
