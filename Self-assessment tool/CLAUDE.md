# Working on this codebase

The GC Enterprise Architecture self-assessment tool, for the Treasury Board Secretariat.
It replaces the GC EARB architecture PowerPoint template and the score deck built by hand
after it. Dan Weekes-Hall owns the rubric; the instrument is ours.

**If another session may be working in this repository, read `NOTES/OWNERS.md` first.** It
carries the branching and pulling rules, and they exist because they were broken.

Read `NOTES/requirements.html` before proposing anything. It is the record of what has been
decided and by whom, and it is kept current the day a decision is made.

## Shape

One self-contained `dist/index.html`. Plain TypeScript, no framework, no runtime dependency,
nothing to install at the user end, because departmental laptops will not run anything that
has to be installed. esbuild inlines everything.

Two sides that share a build: the submitter fills in 176 questions, the assessor reads the
pool and writes an audit. They are separate products and neither screen may describe the other.

The store is Cloud Firestore over REST, with no SDK. Rules are in `deploy/firestore.rules` and
are part of the design, not configuration: read them before changing anything about access.

## How the code is written

This is not the house style of most TypeScript, and the difference is deliberate.

**Comments say why, never what.** The code already says what. A comment earns its place by
recording the thing the next person cannot see: the defect this shape prevents, the option
that was rejected, the constraint from outside. If you are writing a comment that restates the
line below it, delete it.

**Every fix has a gate.** A defect that was found once will be found again unless a test
refuses it. Tests assert behaviour and computed values, never the presence of a declaration:
a gate that greps for `scrollbar-width: thin` passes on a page where a later rule cancels it,
which happened.

**Prose is linted.** `npm run lint:prose` runs on every build. No em dashes, no "rather than",
no "instead of", no antithesis. Say the true thing plainly and stop.

**The user's words go in the comment.** When a defect was reported, quote how it was reported.
"the preview is longer horizontally than the box given for it" is more useful to the next
person than "layout bug".

**Both languages, or neither.** Every string a user sees goes through `t(en, fr)`.

## Running it

    npm install
    npm run dev          # esbuild watch
    npm test             # eight suites: prose, types, logic, store, UI, routes, sharing, code
    npm run build

`npm test` is the contract. It runs in CI on every push and every pull request. If it is red,
nothing else matters until it is green.

**jsdom cannot answer a question about colour.** It does not resolve `var()`, it does not
evaluate `@media` in `getComputedStyle`, and it returns nothing for a background that a
stylesheet sets. A claim about what a screen looks like has to be measured in a real engine, so
`.claude/launch.json` serves `dist/` and the page can be driven and read there. A defect found
that way still gets a gate in `npm test`: read the stylesheet as the last rule that has anything
to say about the property, the way `test/hosted.mjs` already does, rather than grepping for a
declaration that a later rule may be cancelling.

## Publishing

    bash ../deploy/publish-preview.sh

Two repositories on purpose. The preview repository holds only the built HTML and is what
GitHub Pages serves. This one holds the source.

Both have been public since 21 September 2026. This one was private until then because a
recorded meeting with a named colleague was in its history; the history was rewritten that day
and a fresh clone was searched to confirm it is gone. The source PDFs were never committed at
all, because `.gitignore` has always excluded them.

A commit here therefore publishes. `publish-preview.sh` carries the two gates that keep the
preview site clean: it refuses to publish any page with a real address compiled into it, and it
names the address it found, and it refuses to publish a demonstration build to either of the
two real pages. Both gates exist because a real address was compiled into the published HTML
once.

## Commits

Mariia's git identity on every commit. The message says what changed and why, in the same
voice as the comments: what was wrong, what it is now, and what was rejected.
