#!/bin/bash
# Full QA pass: build, types, lint, unit tests, then E2E + feature checks against `next start`
# on a throwaway database. OpenAI calls go to qa/mock-openai.mjs, so QA never reaches the paid
# API, and the database starts from the schema on QA_BASE_REF (default origin/main) so
# migrations run too.
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
MOCK_PORT=${QA_MOCK_PORT:-3099}
lsof -ti tcp:$PORT,$MOCK_PORT | xargs kill 2>/dev/null
node qa/mock-openai.mjs $MOCK_PORT >"$OUT/openai.log" 2>&1 &
# Explicit env beats .env.local, so a real key there is never used.
OPENAI_API_KEY=qa-mock OPENAI_BASE_URL="http://localhost:$MOCK_PORT/v1" PROMHUB_DB="$OUT/promhub.db" \
  npx next start -p $PORT >"$OUT/server.log" 2>&1 &
for _ in $(seq 1 60); do curl -s -o /dev/null "localhost:$PORT" && break; sleep 0.5; done
export BASE="http://localhost:$PORT" DB="$OUT/promhub.db" OPENAI_LOG="$OUT/openai.log"
step e2e "node qa/e2e.mjs"; tail -1 "$OUT/e2e.log"
step features "node qa/features.mjs"; grep -E "^FAIL|통과" "$OUT/features.log"
lsof -ti tcp:$PORT,$MOCK_PORT | xargs kill 2>/dev/null
echo "logs: $OUT"
exit $FAILED
