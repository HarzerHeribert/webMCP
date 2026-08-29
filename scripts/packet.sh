#!/usr/bin/env bash
# Emit a task packet skeleton. It quotes the box lines verbatim so the worker
# never opens the capability map, and names its own report path absolutely so
# the report does not vanish into the worktree.
#   scripts/packet.sh <name> [--lines N,M,...] [--recon] [--force]
set -euo pipefail
NAME=""; LINES=""; RECON=false; FORCE=false
while [ $# -gt 0 ]; do
  case "$1" in
    --lines) LINES="$2"; shift 2 ;;
    --recon) RECON=true; shift ;;
    --force) FORCE=true; shift ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) NAME="$1"; shift ;;
  esac
done
[ -n "$NAME" ] || { echo "usage: scripts/packet.sh <name> [--lines N,M] [--recon]" >&2; exit 2; }
[[ "$NAME" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "name must be kebab-case" >&2; exit 2; }
ROOT="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
MAP="$ROOT/docs/product/capability-map.md"
OUT="$ROOT/.agent-runtime/packet-$NAME.md"
REPORT="$ROOT/.agent-runtime/report-$NAME.md"
WT="$ROOT/.worktrees/$NAME"
[ -e "$OUT" ] && [ "$FORCE" != true ] && { echo "$OUT exists — --force to overwrite" >&2; exit 1; }

BOXES=""
if [ -n "$LINES" ]; then
  IFS=',' read -r -a NUMS <<<"$LINES"
  for n in "${NUMS[@]}"; do
    n="${n//[[:space:]]/}"
    line=$(sed -n "${n}p" "$MAP")
    case "$line" in
      ☐*|☑*) BOXES="${BOXES}- **map:${n}** ${line}
" ;;
      *) echo "packet: map line $n is not a box line: $line" >&2; exit 1 ;;
    esac
  done
fi

mkdir -p "$ROOT/.agent-runtime"
{
printf '# TASK PACKET — %s\n\n' "$(echo "$NAME" | tr '[:lower:]' '[:upper:]')"
printf 'ROLE: %s\n' "$($RECON && echo 'recon — read-only' || echo 'implementer — Sonnet tier')"
printf 'WORKTREE: `%s` (branch `w/%s`)\n' "$WT" "$NAME"
printf 'REPORT TO: `%s`\n\n' "$REPORT"
cat <<'EOF'
## READ ONLY THIS

1. `CLAUDE.md`
2. this packet
3. TODO: the spec sections this task actually needs, by filename. **Not the whole pack.**

Do not open `docs/product/capability-map.md` — your lines are quoted below.

EOF
if [ -n "$BOXES" ]; then printf '## YOUR BOX LINES\n\n%s\n' "$BOXES"; fi
printf '## OBJECTIVE\n\nTODO\n\n'
printf '## EXPECTED FILES\n\n**YOURS — nothing else**\n\n    %s (new)\nTODO: your real target files, one per line.\n\n' "$REPORT"
printf '## FORBIDDEN FILES\n\n    docs/product/capability-map.md   never edit the map\n    docs/process/handoff.md          never edit the handoff\nTODO: name this round'"'"'s other live workers'"'"' files here.\n\n'
printf '## REQUIRED BEHAVIOR\n\nTODO\n\n## ACCEPTANCE\n\nTODO — for a SEC line this must include a forged call that is refused.\n\n'
printf '## VERIFICATION\n\n    scripts/check.sh\n\n'
cat <<'EOF'
## STOP CONDITIONS

- Stop if the design is ambiguous — report, do not invent product behaviour.
- Stop before touching a file outside EXPECTED FILES.
- Do not commit. Do not edit the map or the handoff.

## REPORT — end with this block

```facts
task: <name>
status: complete | partial | blocked
lines:
  - id: <map line number>
    verdict: closed | open | blocked
    evidence: "<test name, browser step, or manual: what you saw>"
    limits: "<what this does NOT prove>"
gate: "scripts/check.sh: green | red — <what failed>"
surprises:
  - "<anything the packet got wrong about current code>"
```
EOF
} > "$OUT"
echo "$OUT"
