#!/usr/bin/env bash
# Remove a worker's worktree and branch.
#
#   scripts/close-worker.sh <name>...            report anything not yet in main, then stop
#   scripts/close-worker.sh --force <name>...     close anyway
#
# The check is "is this already in main?", not "is this worktree clean?" — an
# integrated worker's worktree is always dirty, since the diff is exactly what
# was applied. A file can also differ legitimately because the integrator edited
# it afterwards, which is why the script reports rather than decides.
set -uo pipefail
ROOT="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
FORCE=0
[ "${1:-}" = "--force" ] && { FORCE=1; shift; }

for NAME in "$@"; do
  WT="$ROOT/.worktrees/$NAME"
  [ -d "$WT" ] || { echo "  MISSING $NAME"; continue; }

  differ=""
  files=$( { git -C "$WT" diff --name-only HEAD
             git -C "$WT" ls-files --others --exclude-standard; } | sort -u )
  while read -r f; do
    [ -n "$f" ] || continue
    case "$f" in *.tsbuildinfo|node_modules|node_modules/*) continue ;; esac
    [ -d "$WT/$f" ] && continue
    if [ ! -e "$ROOT/$f" ] || ! cmp -s "$WT/$f" "$ROOT/$f"; then
      differ="$differ $f"
    fi
  done <<< "$files"

  if [ -n "$differ" ] && [ "$FORCE" -eq 0 ]; then
    echo "  HOLD  $NAME — differs from main:$differ"
    echo "        (integrator edits after integration are a normal cause; --force to close)"
    continue
  fi

  rm -f "$WT/node_modules"
  git -C "$WT" reset --hard -q 2>/dev/null
  git -C "$WT" clean -qfd 2>/dev/null
  git -C "$ROOT" worktree remove --force "$WT" 2>/dev/null &&
    git -C "$ROOT" branch -D "w/$NAME" >/dev/null 2>&1
  echo "  closed $NAME"
done
