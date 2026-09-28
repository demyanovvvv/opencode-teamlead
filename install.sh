#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCOPE=""
PROJECT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope) SCOPE="${2:-}"; shift 2 ;;
    --project) PROJECT="${2:-}"; shift 2 ;;
    -h|--help) echo "Usage: ./install.sh [PROJECT] | --scope local --project PROJECT | --scope global"; exit 0 ;;
    -*) echo "Unknown option: $1" >&2; exit 2 ;;
    *) [[ -z "$PROJECT" ]] || { echo "Project specified twice" >&2; exit 2; }; PROJECT="$1"; shift ;;
  esac
done
if [[ -z "$SCOPE" ]]; then
  if [[ -n "$PROJECT" ]]; then SCOPE="local"
  elif [[ -t 0 ]]; then
    printf 'Куда установить TeamLead?\n1) Локально в проект\n2) Глобально для пользователя\nВыбор [1]: '
    read -r choice
    [[ "$choice" == "2" ]] && SCOPE="global" || SCOPE="local"
  else echo "Specify --scope local|global" >&2; exit 2; fi
fi
[[ "$SCOPE" == "local" || "$SCOPE" == "global" ]] || { echo "--scope must be local or global" >&2; exit 2; }
if [[ "$SCOPE" == "local" ]]; then PROJECT="${PROJECT:-$PWD}"; else PROJECT="${PROJECT:-$PWD}"; fi
SRC="$ROOT/payload/.opencode"
if [[ "$SCOPE" == "global" ]]; then
  if [[ -n "${OPENCODE_CONFIG_DIR:-}" ]]; then DST="$OPENCODE_CONFIG_DIR"; elif [[ -n "${XDG_CONFIG_HOME:-}" ]]; then DST="$XDG_CONFIG_HOME/opencode"; else DST="$HOME/.config/opencode"; fi
else DST="$PROJECT/.opencode"; fi

if [[ ! -d "$PROJECT" ]]; then
  echo "Project directory does not exist: $PROJECT" >&2
  exit 2
fi

mkdir -p "$DST/plugins" "$DST/teamlead" "$DST/agents" "$DST/commands"

# Remove only command files owned by pre-v2 TeamLead releases. Do not touch unrelated user commands.
legacy_commands=(
  lead-review.md lead-dashboard.md lead-worker.md lead-dashboard-clear.md
  lead-profiler.md lead-router.md lead-adaptive.md lead-runtime.md
  lead-intelligence.md lead-execution.md lead-contracts.md lead-verify.md
  tl-dashboard.md tl-worker.md tl-dashboard-clear.md tl-settings.md tl-models.md
  tl-profiler.md tl-router.md tl-adaptive.md tl-runtime.md tl-intelligence.md
  tl-execution.md tl-contracts.md tl-verify.md
)
for file in "${legacy_commands[@]}"; do rm -f "$DST/commands/$file"; done

# Pre-v2 TeamLead used a plugin directory. It must not coexist with the single v2 entrypoint.
rm -rf "$DST/plugins/teamlead"
cp "$SRC/plugins/teamlead.ts" "$DST/plugins/teamlead.ts"
rm -rf "$DST/teamlead"
cp -R "$SRC/teamlead" "$DST/teamlead"
cp "$SRC"/agents/teamlead-*.md "$DST/agents/"
cp "$SRC"/commands/lead*.md "$DST/commands/"

if [[ "$SCOPE" == "local" && ! -f "$DST/teamlead.json" ]]; then
  cp "$SRC/teamlead.json" "$DST/teamlead.json"
  echo "Created .opencode/teamlead.json"
else
  echo "Preserved existing .opencode/teamlead.json (v2 migrates compatible v1 settings at runtime)."
fi

node "$ROOT/scripts/merge-tui.mjs" "$DST"

merge_package_js='const fs=require("fs"); const f=process.argv[1]; let x={}; try{x=JSON.parse(fs.readFileSync(f,"utf8"))}catch{}; x.private=x.private!==false; x.dependencies=x.dependencies||{}; x.dependencies["@opencode-ai/plugin"]=">=1.18.30 <2.0.0"; fs.writeFileSync(f, JSON.stringify(x,null,2)+"\n");'
if [[ ! -f "$DST/package.json" ]]; then
  cp "$SRC/package.json" "$DST/package.json"
elif command -v node >/dev/null 2>&1; then
  node -e "$merge_package_js" "$DST/package.json"
elif command -v bun >/dev/null 2>&1; then
  bun -e "$merge_package_js" "$DST/package.json"
else
  echo "WARNING: Could not merge @opencode-ai/plugin into existing .opencode/package.json (node/bun not found)." >&2
  echo '         Ensure it contains dependency "@opencode-ai/plugin": ">=1.18.30 <2.0.0" before restart.' >&2
fi

echo "Installed OpenCode TeamLead v2.1.0 ($SCOPE) into: $DST"
echo "Restart OpenCode, then run: /lead-doctor"
