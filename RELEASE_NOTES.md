# OpenCode TeamLead 2.2.1

## English

This release fixes `/lead-doctor` version detection on OpenCode SDKs without `global.health()`, reading the version from the connected server and preserving custom build suffixes such as `1.18.35+patchline.1.2.1`.

### Highlights

- `/lead-doctor` now reports the connected OpenCode server version when the session SDK lacks a health method, with an HTTP fallback to the session server endpoint.
- Custom OpenCode build suffixes are preserved verbatim in diagnostics.

### Installation

Download `opencode-teamlead-v2.2.1.tar.gz` and its `.sha256` file from this release, verify the archive, extract it and run `install.ps1` or `bash ./install.sh`. Node.js 22.6+ is required. See [compatibility](docs/COMPATIBILITY.md) for OpenCode requirements. Restart OpenCode after installation.

### Updating and removal

Run the installer from the new distribution in the same scope. Settings, history and UI language are preserved unless language is explicitly supplied. Close OpenCode before running the uninstaller. Projects used only by older global installations must be opened after updating to enter the registry, or cleaned with local removal. Independent local installations are preserved by global removal.

## Русский

Релиз исправляет определение версии OpenCode в `/lead-doctor` для SDK без `global.health()`: версия читается с подключённого сервера с сохранением кастомных суффиксов вроде `1.18.35+patchline.1.2.1`.

- `/lead-doctor` показывает версию подключённого сервера OpenCode, если SDK сессии не имеет метода health, через HTTP-запрос к серверу сессии.
- Кастомные суффиксы сборки OpenCode сохраняются в диагностике без изменений.

Распакуйте архив и запустите `install.ps1` либо `bash ./install.sh`. Требуется Node.js 22.6+. При обновлении настройки и история сохраняются. После установки перезапустите OpenCode; перед удалением закройте его. Старые проекты глобальной установки нужно открыть после обновления для регистрации либо очистить локальным деинсталлером.

## Links

[English README](README.md) · [Русский README](README_RU.md) · [Installation](INSTALL_RU.md) · [Changelog](CHANGELOG.md) · [Validation](RELEASE_VALIDATION.md)
