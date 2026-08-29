#!/usr/bin/env bash
# Remove a worker's worktree and branch after its diff has been integrated.
set -uo pipefail
ROOT="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
for NAME in "$@"; do
  WT="$ROOT/.worktrees/$NAME"
  if [ -n "$(git -C "$WT" status --porcelain 2>/dev/null)" ]; then
    echo "  SKIP $NAME — worktree still has uncommitted changes; integrate first"
    continue
  fi
  rm -f "$WT/node_modules"
  git -C "$ROOT" worktree remove --force "$WT" 2>/dev/null && \
  git -C "$ROOT" branch -D "w/$NAME" >/dev/null 2>&1
  echo "  closed $NAME"
done
