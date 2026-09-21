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
# The page for showing the tool to a room. Its own address, its own invented pool, and it never
# reaches the store. It asks nobody to sign in, which is safe only because of that.
echo "Building the demonstration page..."
# Built with NO store address at all. isDemo() already short-circuits the two reads, but a page
# that cannot name the store is a stronger promise than a page that chooses not to ask it: with
# no config there is no endpoint compiled in, so no path through this page reaches real work.
( cd "$HERE/Self-assessment tool" && EARB_FIREBASE= EARB_DEMO=1 EARB_ACCESS=accounts EARB_SIDE=assess EARB_OUT=dist/demo.html npm run --silent build )
# Nobody's address goes onto the open internet.
#
# npm test cannot catch this. Its hosted suite builds with a stand-in Firebase config, so it
# never sees the real one, and the gate there passed happily while a real address sat in the
# published page. This is the only place the true config and the true build meet.
for page in dist/index.html dist/assessor.html dist/demo.html; do
  found="$(grep -oiE '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' "$HERE/Self-assessment tool/$page" \
    | sort -u \
    | grep -viE '^(someone|you|vous|name|nom|test|first\.last)@' \
    | grep -viE '@(department\.gc\.ca|ministere\.gc\.ca|tbs-sct\.gc\.ca|tc\.gc\.ca|dfo-mpo\.gc\.ca|b\.gc\.ca|sen\.parl\.gc\.ca|example\.)' || true)"
  if [ -n "$found" ]; then
    echo >&2
    echo "REFUSING TO PUBLISH. $page carries somebody's address:" >&2
    echo "$found" | sed 's/^/  /' >&2
    echo >&2
    echo "An address compiled into the page is public the moment the page is, and it is a grant" >&2
    echo "nobody can take away: remove the person from the roles collection and the page still" >&2
    echo "lets them in, because it carries its own answer. Take it out of" >&2
    echo "deploy/firebase-config.json and out of src/, then publish again." >&2
    exit 1
  fi
done

# The two real pages are never the demonstration build.
#
# The demonstration asks nobody to sign in, which is safe only because it reads an invented pool
# and carries no store address. The same flag on a page that does reach the store would open
# every department's submission to anybody holding the address. npm test cannot catch this: CI
# builds one page, so the check there skips the other two silently.
for page in dist/index.html dist/assessor.html; do
  if grep -q 'demo-banner"' "$HERE/Self-assessment tool/$page" 2>/dev/null \
     && grep -q 'EARB_DEMO' "$HERE/Self-assessment tool/$page" 2>/dev/null; then
    echo >&2
    echo "REFUSING TO PUBLISH. $page looks like a demonstration build." >&2
    echo "A page that reaches the real store must ask who somebody is." >&2
    exit 1
  fi
done

( cd "$HERE/Self-assessment tool" && node tools/build-backlog.mjs >/dev/null )
( cd "$HERE/Self-assessment tool" && node tools/build-requirements.mjs >/dev/null )

echo "Cloning $REPO..."
git clone --quiet --depth 1 "https://github.com/$REPO.git" "$WORK/site"

cp "$HERE/Self-assessment tool/dist/index.html" "$WORK/site/docs/index.html"
mkdir -p "$WORK/site/docs/assessor"
cp "$HERE/Self-assessment tool/dist/assessor.html" "$WORK/site/docs/assessor/index.html"
mkdir -p "$WORK/site/docs/demo"
cp "$HERE/Self-assessment tool/dist/demo.html" "$WORK/site/docs/demo/index.html"

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
