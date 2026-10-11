#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCOPE=""; PROJECT=""; LANGUAGE=""; UNINSTALL=false; LANGUAGE_EXPLICIT=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope|--project|--language)
      [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || { echo "Missing value for $1" >&2; exit 2; }
      case "$1" in --scope) SCOPE="$2" ;; --project) PROJECT="$2" ;; --language) LANGUAGE="$2"; LANGUAGE_EXPLICIT=true ;; esac
      shift 2 ;;
    --uninstall) UNINSTALL=true; shift ;;
    -h|--help) echo "Usage: ./install.sh [PROJECT] [--scope local|global] [--project PROJECT] [--language en|ru] [--uninstall]"; exit 0 ;;
    -*) echo "Unknown option: $1" >&2; exit 2 ;;
    *) [[ -z "$PROJECT" ]] || { echo "Project specified twice" >&2; exit 2; }; PROJECT="$1"; shift ;;
  esac
done
[[ -z "$LANGUAGE" || "$LANGUAGE" == en || "$LANGUAGE" == ru ]] || { echo "--language must be en or ru" >&2; exit 2; }
if [[ -z "$LANGUAGE" && -z "$SCOPE" && -z "$PROJECT" ]]; then
  printf 'Language / Язык:\n1) English\n2) Русский\nChoice [1]: '
  read -r choice || { echo "Specify --scope local|global for unattended use" >&2; exit 2; }
  [[ "$choice" == 2 ]] && LANGUAGE=ru || LANGUAGE=en
fi
LANGUAGE="${LANGUAGE:-en}"
if [[ -z "$SCOPE" ]]; then
  if [[ -n "$PROJECT" ]]; then SCOPE=local
  else
    if [[ "$UNINSTALL" == true ]]; then
      [[ "$LANGUAGE" == ru ]] && printf 'Откуда удалить TeamLead?\n' || printf 'Where should TeamLead be uninstalled?\n'
    else
      [[ "$LANGUAGE" == ru ]] && printf 'Куда установить TeamLead?\n' || printf 'Where should TeamLead be installed?\n'
    fi
    [[ "$LANGUAGE" == ru ]] && printf '1) Локально в проекте\n2) Глобально для пользователя\nВыбор [1]: ' || printf '1) Locally in a project\n2) Globally for this user\nChoice [1]: '
    read -r choice || { echo "Specify --scope local|global" >&2; exit 2; }
    [[ -z "$choice" || "$choice" == 1 || "$choice" == 2 ]] || { echo "Invalid scope selection" >&2; exit 2; }
    [[ "$choice" == 2 ]] && SCOPE=global || SCOPE=local
  fi
fi
[[ "$SCOPE" == local || "$SCOPE" == global ]] || { echo "--scope must be local or global" >&2; exit 2; }
if [[ "$SCOPE" == local ]]; then
  if [[ -z "$PROJECT" ]]; then
    [[ "$LANGUAGE" == ru ]] && printf 'Путь к проекту [%s]: ' "$PWD" || printf 'Project directory [%s]: ' "$PWD"
    read -r PROJECT || { echo "Specify --project PROJECT" >&2; exit 2; }
    PROJECT="${PROJECT:-$PWD}"
  fi
  [[ -d "$PROJECT" ]] || { echo "Project directory does not exist: $PROJECT" >&2; exit 2; }
  DST="$PROJECT/.opencode"
else
  DST="${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode}"
fi
MODE=install
[[ "$UNINSTALL" != true ]] || MODE=uninstall
node --experimental-strip-types "$ROOT/scripts/install-lifecycle.mjs" "$MODE" "$DST" "$SCOPE" "$LANGUAGE" "$LANGUAGE_EXPLICIT"
