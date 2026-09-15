#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="${1:-$PWD}"
SRC="$ROOT/payload/.opencode"
DST="$PROJECT/.opencode"

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

if [[ ! -f "$DST/teamlead.json" ]]; then
  cp "$SRC/teamlead.json" "$DST/teamlead.json"
  echo "Created .opencode/teamlead.json"
else
  echo "Preserved existing .opencode/teamlead.json (v2 migrates compatible v1 settings at runtime)."
fi

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

echo "Installed OpenCode TeamLead v2.0.0 into: $PROJECT"
echo "Restart OpenCode, then run: /lead-doctor"
