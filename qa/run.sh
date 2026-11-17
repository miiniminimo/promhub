#!/bin/bash
# Full QA pass: build, types, lint, unit tests, then E2E + feature checks against `next start`
# on a throwaway database. The AI is forced offline so QA never calls the paid API, and the
# database starts from the schema on QA_BASE_REF (default origin/main) so migrations run too.
#   npm run qa            # everything
#   QA_PORT=3100 npm run qa
cd "$(dirname "$0")/.." || exit 1
PORT=${QA_PORT:-3005}
OUT=$(mktemp -d -t promhub-qa)
FAILED=0
step() { if eval "$2" >"$OUT/$1.log" 2>&1; then echo "OK    $1"; else echo "FAIL  $1"; tail -25 "$OUT/$1.log"; FAILED=1; fi; }

step build "npm run build"
step types "npx tsc --noEmit"
step lint "npx eslint ."
step unit "node --experimental-strip-types --no-warnings qa/unit.ts"; tail -1 "$OUT/unit.log"
[ $FAILED = 1 ] && exit 1

git show "${QA_BASE_REF:-origin/main}:src/lib/server/schema.sql" 2>/dev/null | sqlite3 "$OUT/promhub.db"
lsof -ti tcp:$PORT | xargs kill 2>/dev/null
PROMHUB_AI_DEMO=1 PROMHUB_DB="$OUT/promhub.db" npx next start -p $PORT >"$OUT/server.log" 2>&1 &
for _ in $(seq 1 60); do curl -s -o /dev/null "localhost:$PORT" && break; sleep 0.5; done
export BASE="http://localhost:$PORT" DB="$OUT/promhub.db"
step e2e "node qa/e2e.mjs"; tail -1 "$OUT/e2e.log"
step features "node qa/features.mjs"; grep -E "^FAIL|통과" "$OUT/features.log"
lsof -ti tcp:$PORT | xargs kill 2>/dev/null
echo "logs: $OUT"
exit $FAILED
