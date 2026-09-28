#!/usr/bin/env bash
# Publishes deploy/firestore.rules to Firestore, from the file, without the clipboard.
#
#   bash deploy/publish-rules.sh
#
# WHY THIS EXISTS. The rules used to be published by pasting them into the Firebase console.
# That crosses the machine's clipboard, which every window and every session shares. On
# 21 September 2026 a paste put one line of somebody else's text into the rules editor: the
# clipboard had been overwritten between the copy and the paste. It was caught before Publish
# was pressed, and publishing it would have replaced every access rule with a broken line.
#
# This never leaves the file. It reads deploy/firestore.rules and sends it to Google.
#
# BEFORE RUNNING IT, prove the change against a Firestore that enforces it:
#
#   cd '../Self-assessment tool' && npm run test:rules
#
# That starts Google's emulator with this same file. check-rules.sh below runs afterwards
# and can only probe the live store for what must be refused; the emulator is the only
# place a rule that must ALLOW something can be tested without writing to production.
#
# ONCE, ON A NEW MACHINE:
#   npm install -g firebase-tools
#   firebase login
#
# The login opens a browser and is Mariia's to do. Nothing here asks for a password.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v firebase >/dev/null 2>&1; then
  echo "The Firebase CLI is not installed. Run: npm install -g firebase-tools" >&2
  exit 1
fi
if ! firebase projects:list >/dev/null 2>&1; then
  echo "Not signed in to Firebase. Run: firebase login" >&2
  exit 1
fi

echo "Publishing $HERE/firestore.rules"
firebase deploy --only firestore:rules --project tbs-earb-self-assessment --config "$HERE/firebase.json"

echo
echo "Checking the published rules from outside, with no sign-in."
bash "$HERE/check-rules.sh"
