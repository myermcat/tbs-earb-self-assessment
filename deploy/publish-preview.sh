#!/usr/bin/env bash
# Publishes the built page to the public preview site.
#
#   https://myermcat.github.io/tbs-earb-self-assessment-preview/
#
# Two repositories on purpose. This one is private and its history holds Dan's draft framework
# deck and the GC data position paper. The preview repository is public and holds only the
# built HTML file, so publishing the tool never publishes the source material.
#
#   bash deploy/publish-preview.sh
set -euo pipefail

REPO="myermcat/tbs-earb-self-assessment-preview"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# The store this build talks to. A Firebase web key identifies the project and authorises
# nothing on its own, which is Google's own position, so it lives here rather than in a secret
# store. Take this file away and the build goes back to reaching nothing at all.
# The file is not in git. Recreate it from the Firebase console: Project settings, the web app,
# SDK setup and configuration, then copy apiKey and projectId into it.
if [ -f "$HERE/deploy/firebase-config.json" ]; then
  EARB_FIREBASE="$(tr -d '\n' < "$HERE/deploy/firebase-config.json")"
  export EARB_FIREBASE
else
  echo "WARNING: deploy/firebase-config.json is missing."
  echo "         This build will reach no store at all, and the page will say so."
  echo "         Press Return to publish it anyway, or Ctrl-C to stop."
  read -r _
fi

# The gate. This script is how the tool actually reaches people, and it used to build and push
# without running a single test.
echo "Testing..."
( cd "$HERE/Self-assessment tool" && npm test >/dev/null ) || {
  echo "Tests failed. Nothing published. Run npm test in the tool directory to see what."
  exit 1
}

# Two pages, because the tool is two products.
#
# The submitter's runs on access codes and has no account in it anywhere: an assessment is
# reached by the twelve characters that are its name in the store, which the published rules
# grant on. The assessor's keeps accounts, because no Firestore rule can grant a list on a
# filter, so "show me every submission" is a right given to an identity or to everybody, and
# everybody means every department's draft is public.
#
# Same site, one folder apart, so Google's sign-in needs no new address registered.
echo "Building the submitter's page..."
( cd "$HERE/Self-assessment tool" && EARB_ACCESS=code npm run --silent build )
echo "Building the assessor's page..."
( cd "$HERE/Self-assessment tool" && EARB_ACCESS=accounts EARB_SIDE=assess EARB_OUT=dist/assessor.html npm run --silent build )
( cd "$HERE/Self-assessment tool" && node tools/build-backlog.mjs >/dev/null )
( cd "$HERE/Self-assessment tool" && node tools/build-requirements.mjs >/dev/null )

echo "Cloning $REPO..."
git clone --quiet --depth 1 "https://github.com/$REPO.git" "$WORK/site"

cp "$HERE/Self-assessment tool/dist/index.html" "$WORK/site/docs/index.html"
mkdir -p "$WORK/site/docs/assessor"
cp "$HERE/Self-assessment tool/dist/assessor.html" "$WORK/site/docs/assessor/index.html"

# The backlog travels with the build, so it can be opened from a link rather than a file path.
# It names colleagues and the state of internal decisions. Nothing in it is protected, and
# nothing of Dan's question set is in it beyond counts.
cp "$HERE/Self-assessment tool/NOTES/backlog.html" "$WORK/site/docs/backlog.html"
cp "$HERE/Self-assessment tool/NOTES/requirements.html" "$WORK/site/docs/requirements.html"
# The explanation of domains and categories, which is the page somebody presents. It needs no
# sign-in, because the people who have to read it are in meetings and not in the tool.
#
# The source is written as a fragment, because it is also published as a Claude artifact and
# that wraps it. Standing on its own it needs a document around it, and that is all this does.
{
  printf '%s\n' '<!doctype html>' '<html lang="en">' '<head>' \
    '<meta charset="utf-8">' \
    '<meta name="viewport" content="width=device-width, initial-scale=1">' \
    '</head>' '<body>'
  cat "$HERE/Self-assessment tool/NOTES/domains-and-categories.html"
  printf '%s\n' '</body>' '</html>'
} > "$WORK/site/docs/domains-and-categories.html"

cd "$WORK/site"
# Staged before the check, because a page published for the first time is a new file and
# `git diff` says nothing at all about those. The assessor's page was exactly that, and this
# script would have reported everything up to date while publishing nothing.
git add -A docs
if git diff --cached --quiet; then
  echo "Already up to date. Nothing to publish."
  exit 0
fi

git commit --quiet -m "Preview build $(date -u '+%Y-%m-%d %H:%M UTC')"
git push --quiet
echo "Published. GitHub Pages takes a minute or two to pick it up."
