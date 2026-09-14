#!/usr/bin/env bash
# Checks the published Firestore rules from the outside, the way a stranger would.
#
#   bash deploy/check-rules.sh
#
# A rules mistake is invisible from inside the tool, because the tool always has somebody
# signed in. Every call below carries no token at all, and each one names what it expects.
# Anything that comes back the other way means the rules need republishing:
#
#   firebase deploy --only firestore:rules
#
# The write attempts are refused before anything is created, so running this leaves the
# store exactly as it was.
#
# ONE OF THESE IS EXPECTED TO SUCCEED, and that is the point of this file.
#
# Reading one assessment by its access code is granted to anybody who can name it, because the
# name IS the code. What must stay closed is listing: a stranger may open the one assessment
# whose twelve characters they were sent, and may never ask what else is in there. So the
# listing probe is the one that matters, and it is checked twice.
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

# A get on a name nobody holds. Firestore answers NOT_FOUND for a document that is not there,
# which is what this should say: the rule let the request through and there was nothing behind
# it. PERMISSION_DENIED here would mean the code route is closed and sharing does not work.
opens() {
  local name="$1" body="$2" status
  status="$(printf '%s' "$body" | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: print('UNREADABLE'); raise SystemExit
e=d.get('error')
print(e.get('status','?') if e else 'ALLOWED')
")"
  if [ "$status" = "NOT_FOUND" ] || [ "$status" = "ALLOWED" ]; then
    echo "  opens    $name  ($status)"
  else
    echo "  CLOSED   $name  ($status)"
    FAIL=1
  fi
}

echo "Checking $PID with no sign-in."
refused "list every assessment"   "$(curl -s "$BASE/assessments?key=$KEY")"
refused "list with a page size"   "$(curl -s "$BASE/assessments?pageSize=1&key=$KEY")"
refused "read the roles"          "$(curl -s "$BASE/roles?key=$KEY")"
refused "create an assessment"    "$(curl -s -X POST "$BASE/assessments?documentId=RULESCHECK99&key=$KEY" \
  -H 'Content-Type: application/json' -d '{"fields":{"probe":{"stringValue":"x"}}}')"
refused "make yourself an admin"  "$(curl -s -X POST "$BASE/roles?documentId=rules-check@example.com&key=$KEY" \
  -H 'Content-Type: application/json' -d '{"fields":{"role":{"stringValue":"admin"}}}')"
opens   "open one by its code"    "$(curl -s "$BASE/assessments/RULESCHECKNOSUCHDOC?key=$KEY")"

if [ "$FAIL" = "0" ]; then
  echo "Listing is closed and opening one by its code works. That is the shape it should be."
else
  echo "Something is the wrong way round. Read the lines above before anybody else uses this."
  exit 1
fi
