#!/usr/bin/env bash
# The gate. There is no CI; this is the whole of due diligence.
#   scripts/check.sh          typecheck + lint + unit/integration
#   scripts/check.sh --full   ...and the browser tests
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1
FULL=0; [ "${1:-}" = "--full" ] && FULL=1
fail=0
run() {
  printf '\033[1m» %s\033[0m\n' "$1"; shift
  if "$@"; then printf '  \033[32mok\033[0m\n\n'; else printf '  \033[31mFAILED\033[0m\n\n'; fail=1; fi
}
[ -f package.json ] || { echo "check: no package.json yet — nothing to gate"; exit 0; }

# The deployed function is a committed bundle. If it has drifted from its source,
# production is running code nobody reviewed — which is exactly how the API
# shipped broken while every local check was green.
printf '\033[1m» api bundle is current\033[0m\n'
if npm run --silent build:api >/dev/null 2>&1 && git diff --quiet -- api/index.js; then
  printf '  \033[32mok\033[0m\n\n'
else
  printf '  \033[31mFAILED — api/index.js differs from server/vercel-entry.ts; commit the rebuild\033[0m\n\n'
  fail=1
fi
run "typecheck"   npm run --silent typecheck
run "lint"        npm run --silent lint
run "unit + integration" npm run --silent test
if [ "$FULL" = 1 ]; then
  run "build"   npm run --silent build
  run "browser" npm run --silent test:e2e
fi
if [ "$fail" -ne 0 ]; then printf '\033[31mGATE RED\033[0m\n'; else printf '\033[32mGATE GREEN\033[0m%s\n' "$([ "$FULL" = 1 ] || echo '  (browser tests not run — pass --full)')"; fi
exit "$fail"
