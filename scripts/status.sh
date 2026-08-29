#!/usr/bin/env bash
# Cheap orientation. Where the map stands, who is live, what landed.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1
MAP=docs/product/capability-map.md

open=$(grep -c '^☐' "$MAP"); done_=$(grep -c '^☑' "$MAP"); tot=$((open+done_))
printf '\033[1m%s/%s boxes (%s%%)\033[0m — %s open\n\n' \
  "$done_" "$tot" "$(( tot ? done_*100/tot : 0 ))" "$open"

printf '\033[1mphases\033[0m\n'
awk '/^Phase /{if(p)printf "  %-46s %2d open  %2d done  line %d\n",p,o,c,l;p=$0;o=0;c=0;l=NR}
     /^☐/{o++} /^☑/{c++}
     END{if(p)printf "  %-46s %2d open  %2d done  line %d\n",p,o,c,l}' "$MAP"

printf '\n\033[1mnext open lines\033[0m\n'
grep -n '^☐' "$MAP" | head -8 | sed 's/^/  /'

printf '\n\033[1mworktrees\033[0m\n'
found=0
for d in .worktrees/*/; do
  [ -d "$d" ] || continue; found=1; n=$(basename "$d")
  dirty=$(git -C "$d" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  rep=".agent-runtime/report-$n.md"
  printf '  %-24s %3s changed file(s)   report: %s\n' "$n" "$dirty" \
    "$([ -f "$rep" ] && echo present || echo MISSING)"
done
[ "$found" = 0 ] && echo "  none"

printf '\n\033[1mrecent\033[0m\n'; git log --oneline -5 | sed 's/^/  /'
printf '\n\033[1mnext action\033[0m (docs/process/handoff.md)\n'
sed -n '/^## Next action/,/^## /p' docs/process/handoff.md 2>/dev/null | sed '1d;$d' | sed 's/^/  /'
