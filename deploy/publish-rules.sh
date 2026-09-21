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
