#!/usr/bin/env bash
# Remove a worker's worktree and branch once its work is in main.
#
# The guard is deliberately "is this already integrated?", not "is this
# worktree clean?". An integrated worker's worktree is always dirty — the diff
# is exactly what was applied — so refusing on dirtiness would refuse every
# worker that ever finished. It compares content instead.
set -uo pipefail
ROOT="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
for NAME in "$@"; do
  WT="$ROOT/.worktrees/$NAME"
  [ -d "$WT" ] || { echo "  MISSING $NAME"; continue; }

  unmerged=""
  while read -r f; do
    [ -n "$f" ] || continue
    case "$f" in *.tsbuildinfo|node_modules|node_modules/*) continue ;; esac
    if [ ! -e "$ROOT/$f" ] || ! cmp -s "$WT/$f" "$ROOT/$f"; then
      unmerged="$unmerged $f"
    fi
  done < <(git -C "$WT" status --porcelain | awk '{print $NF}')

  if [ -n "$unmerged" ]; then
    echo "  SKIP $NAME — these differ from main, integrate first:$unmerged"
    continue
  fi

  rm -f "$WT/node_modules"
  git -C "$WT" reset --hard -q 2>/dev/null
  git -C "$WT" clean -qfd 2>/dev/null
  git -C "$ROOT" worktree remove --force "$WT" 2>/dev/null &&
    git -C "$ROOT" branch -D "w/$NAME" >/dev/null 2>&1
  echo "  closed $NAME"
done
