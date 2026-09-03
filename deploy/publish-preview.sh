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

echo "Building..."
( cd "$HERE/Self-assessment tool" && npm run --silent build )
( cd "$HERE/Self-assessment tool" && node tools/build-backlog.mjs >/dev/null )
( cd "$HERE/Self-assessment tool" && node tools/build-requirements.mjs >/dev/null )

echo "Cloning $REPO..."
git clone --quiet --depth 1 "https://github.com/$REPO.git" "$WORK/site"

cp "$HERE/Self-assessment tool/dist/index.html" "$WORK/site/docs/index.html"

# The backlog travels with the build, so it can be opened from a link rather than a file path.
# It names colleagues and the state of internal decisions. Nothing in it is protected, and
# nothing of Dan's question set is in it beyond counts.
cp "$HERE/Self-assessment tool/NOTES/backlog.html" "$WORK/site/docs/backlog.html"
cp "$HERE/Self-assessment tool/NOTES/requirements.html" "$WORK/site/docs/requirements.html"

cd "$WORK/site"
if git diff --quiet; then
  echo "Already up to date. Nothing to publish."
  exit 0
fi

git add docs/index.html docs/backlog.html docs/requirements.html
git commit --quiet -m "Preview build $(date -u '+%Y-%m-%d %H:%M UTC')"
git push --quiet
echo "Published. GitHub Pages takes a minute or two to pick it up."
