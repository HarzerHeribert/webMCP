#!/usr/bin/env bash
# Create an isolated worktree for one worker. Inside .worktrees/, gitignored.
set -euo pipefail
[ $# -eq 1 ] || { echo "usage: scripts/worker.sh <name>" >&2; exit 2; }
NAME="$1"
[[ "$NAME" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "name must be kebab-case" >&2; exit 2; }
ROOT="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
WT="$ROOT/.worktrees/$NAME"
[ -d "$WT" ] && { echo "$WT exists"; exit 0; }
git -C "$ROOT" worktree add -b "w/$NAME" "$WT" >/dev/null
# Workers need installed deps; link rather than reinstall per worktree.
[ -d "$ROOT/node_modules" ] && ln -sfn "$ROOT/node_modules" "$WT/node_modules"
echo "$WT"
