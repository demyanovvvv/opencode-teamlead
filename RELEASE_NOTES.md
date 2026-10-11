# OpenCode TeamLead 2.2.0

## English

This release adds a shared installation/removal lifecycle and complete scoped cleanup, with refreshed bilingual documentation.

### Highlights

- Standalone `uninstall.ps1` and `uninstall.sh` with local/global selection and local project prompts.
- Installation and updates use the local distribution; package metadata supplies the version and records the installed version and owned commands.
- Global plugin startup registers projects under an owner-token lock. Global removal cleans registered project data while preserving independent local installations.
- Owned Git worktrees are removed through Git, including their registrations.
- Original SDK dependencies are restored; generated dependency artifacts are removed only when their ownership and package requirements permit it.
- Installer paths reject symbolic links/junctions, and malformed registry entries stop cleanup before project data is removed.
- English and Russian README guides, MIT licensing, security reporting and GitHub contribution templates.
- Worker permission hardening and expanded deterministic security coverage.

### Installation

Download `opencode-teamlead-v2.2.0.tar.gz` and its `.sha256` file from this release, verify the archive, extract it and run `install.ps1` or `bash ./install.sh`. Node.js 22.6+ is required. See [compatibility](docs/COMPATIBILITY.md) for OpenCode requirements. Restart OpenCode after installation.

### Updating and removal

Run the installer from the new distribution in the same scope. Settings, history and UI language are preserved unless language is explicitly supplied. Close OpenCode before running the uninstaller. Projects used only by older global installations must be opened after updating to enter the registry, or cleaned with local removal. Independent local installations are preserved by global removal.

## Русский

Релиз добавляет общую логику установки и полного удаления по выбранной области, а также обновлённую двуязычную документацию.

- Отдельные `uninstall.ps1` и `uninstall.sh` предлагают локальную или глобальную область и путь к локальному проекту.
- Установка и обновление работают из локальной папки дистрибутива. Версия берётся из `package.json` и сохраняется вместе со списком установленных команд.
- Глобальный плагин регистрирует проекты с блокировкой реестра. Глобальное удаление очищает их данные, сохраняя самостоятельные локальные установки.
- Временные Git worktree удаляются вместе с регистрацией в Git.
- Исходные зависимости восстанавливаются; созданные артефакты зависимостей удаляются при подтверждённом владении и отсутствии других требований пакета.
- Проверяются ссылки и записи реестра; усилены разрешения исполнителей и проверки безопасности.
- Подготовлены README на двух языках, лицензия MIT и документы для участников GitHub.

Распакуйте архив и запустите `install.ps1` либо `bash ./install.sh`. Требуется Node.js 22.6+. При обновлении настройки и история сохраняются. После установки перезапустите OpenCode; перед удалением закройте его. Старые проекты глобальной установки нужно открыть после обновления для регистрации либо очистить локальным деинсталлером.

## Links

[English README](README.md) · [Русский README](README_RU.md) · [Installation](INSTALL_RU.md) · [Changelog](CHANGELOG.md) · [Validation](RELEASE_VALIDATION.md)
