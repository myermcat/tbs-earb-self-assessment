#!/usr/bin/env bash
# Checks the published Firestore rules from the outside, the way a stranger would.
#
#   bash deploy/check-rules.sh
#
# A rules mistake is invisible from inside the tool, because the tool always has somebody
# signed in. These four calls carry no token at all. All four have to be refused. Anything
# that succeeds means the store is open to the internet and the rules need republishing:
#
#   firebase deploy --only firestore:rules
#
# The write attempts are refused before anything is created, so running this leaves the
# store exactly as it was.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CFG="$HERE/deploy/firebase-config.json"
if [ ! -f "$CFG" ]; then
  echo "deploy/firebase-config.json is missing. Recreate it from the Firebase console:"
  echo "Project settings, the web app, SDK setup and configuration."
  exit 2
fi

KEY="$(python3 -c "import json;print(json.load(open('$CFG'))['apiKey'])")"
PID="$(python3 -c "import json;print(json.load(open('$CFG'))['projectId'])")"
BASE="https://firestore.googleapis.com/v1/projects/$PID/databases/(default)/documents"
FAIL=0

refused() { # name, curl output
  local name="$1" body="$2" status
  status="$(printf '%s' "$body" | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: print('UNREADABLE'); raise SystemExit
e=d.get('error')
print(e.get('status','?') if e else 'ALLOWED')
")"
  if [ "$status" = "PERMISSION_DENIED" ]; then
    echo "  refused  $name"
  else
    echo "  OPEN     $name  ($status)"
    FAIL=1
  fi
}

echo "Checking $PID with no sign-in."
refused "read every assessment"  "$(curl -s "$BASE/assessments?key=$KEY")"
refused "read the roles"         "$(curl -s "$BASE/roles?key=$KEY")"
refused "write an assessment"    "$(curl -s -X POST "$BASE/assessments?documentId=rules-check&key=$KEY" \
  -H 'Content-Type: application/json' -d '{"fields":{"probe":{"stringValue":"x"}}}')"
refused "make yourself an admin" "$(curl -s -X POST "$BASE/roles?documentId=rules-check@example.com&key=$KEY" \
  -H 'Content-Type: application/json' -d '{"fields":{"role":{"stringValue":"admin"}}}')"

if [ "$FAIL" = "0" ]; then
  echo "All four refused. The store is closed to anybody who has not signed in."
else
  echo "Something was allowed. Republish the rules before anybody else uses this."
  exit 1
fi
