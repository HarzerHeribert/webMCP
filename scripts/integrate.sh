#!/usr/bin/env bash
# Apply finished workers' worktree diffs onto the main checkout — the mechanical
# half of integration, and only that half.
#
# IT DOES:   refuse a dirty tree, refuse a non-ancestor base, refuse any file two
#            worktrees both touched, apply, copy untracked deliverables, run the gate.
# IT NEVER:  commit, tick a box, write the handoff, or say "ready".
#
# Pass every finished worker in ONE call. The interactions between patches are
# the part no worker can see, and they only appear once the diffs share a tree.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

DRY=0; NAMES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --all) for d in .worktrees/*/; do [ -d "$d" ] || continue
             n=$(basename "$d")
             [ -n "$(git -C "$d" status --porcelain 2>/dev/null)" ] && NAMES+=("$n"); done ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) NAMES+=("$1") ;;
  esac; shift
done
[ ${#NAMES[@]} -gt 0 ] || { echo "integrate: name a worktree, or --all"; exit 1; }

if [ -n "$(git status --porcelain)" ]; then
  echo "integrate: main checkout is dirty. Commit or stash first — applying onto a"
  echo "  dirty tree makes 'what did this worker change' unanswerable."; exit 1
fi

fail=0
printf '\033[1m=== %d worktree(s) ===\033[0m\n' "${#NAMES[@]}"
for n in "${NAMES[@]}"; do
  wt=".worktrees/$n"
  [ -d "$wt" ] || { printf '  \033[31mMISSING   %s\033[0m (pass a name, not a path)\n' "$n"; fail=1; continue; }
  base=$(git -C "$wt" rev-parse HEAD 2>/dev/null)
  if git merge-base --is-ancestor "$base" HEAD 2>/dev/null; then
    printf '  %-24s base %s  ancestor-ok\n' "$n" "$(git rev-parse --short "$base")"
  else
    printf '  %-24s base %s  \033[31mNOT AN ANCESTOR — rebase it first\033[0m\n' "$n" "$(git rev-parse --short "$base")"
    fail=1
  fi
done

printf '\n\033[1m=== file overlap ===\033[0m\n'
overlap=$(for n in "${NAMES[@]}"; do
    git -C ".worktrees/$n" status --porcelain 2>/dev/null | awk -v W="$n" '{print $NF, W}'
  done | sort | awk '{f[$1]=f[$1]" "$2} END{for(k in f){if(split(f[k],a," ")>1)print "  "k" ->"f[k]}}')
if [ -n "$overlap" ]; then
  printf '\033[33m%s\033[0m\n' "$overlap"
  echo "  Two workers touched one file: either a partition failure or a co-edit."
  echo "  Either way you decide, not this script."; fail=1
else
  echo "  none — partitions are disjoint"
fi

[ "$fail" -ne 0 ] && { echo; echo "integrate: refusing to apply, see above"; exit 1; }
[ "$DRY" -eq 1 ] && { echo; echo "integrate: --dry-run, nothing applied"; exit 0; }

echo
for n in "${NAMES[@]}"; do
  wt=".worktrees/$n"; patch=$(mktemp)
  git -C "$wt" diff HEAD > "$patch"
  if [ -s "$patch" ]; then
    if git apply --check "$patch" 2>/dev/null && git apply "$patch"; then
      printf '  applied  %-24s %s\n' "$n" "$(git -C "$wt" diff --shortstat HEAD)"
    else
      printf '  \033[31mFAILED   %s — patch does not apply\033[0m\n' "$n"; rm -f "$patch"; exit 1
    fi
  fi
  rm -f "$patch"
  # Untracked files are invisible to `git diff` and are frequently the whole
  # package — a tests-only worker has no tracked changes at all.
  git -C "$wt" ls-files --others --exclude-standard | while read -r f; do
    [ -n "$f" ] || continue
    mkdir -p "$(dirname "./$f")"; cp "$wt/$f" "./$f"
    printf '  copied   %-24s %s\n' "$n" "$f"
  done
done

echo; scripts/check.sh; rc=$?
echo
printf '\033[1m=== NOW READ THE DIFF. This script judged nothing. ===\033[0m\n'
git diff --stat
cat <<'NEXT'

Still yours, and not delegable:
  * read every applied diff against what the capability actually promises
  * run the demo in a real browser — the gate does not know what "pristine" means
  * rule on every box, update the handoff, commit
NEXT
exit "$rc"
