# Handoff: taking accounts off the submitter side

Written 17 September 2026, from a full read of the code. For whoever picks this up in another
session. Everything below is verified against the files named; do not take it on trust, but do
not re-derive it either.

## What this is

Dan asked on 8 September whether the tool needs accounts at all. The answer is split, and the
split is mechanical rather than a preference:

- **A submitter does not need one.** An assessment's 12-character code is its document id, and
  a Firestore rule can grant access on the document's name.
- **An assessor does.** A rule can read a query's `limit`, its `offset` and its `orderBy`, and
  nothing about a `where` filter. So "list the assessments matching the code I typed" is not a
  rule anybody can write. Listing is granted to an identity or to everybody, and everybody
  publishes every department's draft.

So the goal is: the submitter side never mentions an account, the assessor side keeps one, and
they become two builds.

## The switch

`src/who.ts` is it. A build-time define `__EARB_ACCESS__` takes `accounts` or `code`;
`build.mjs:63` reads `EARB_ACCESS` from the environment and refuses anything else.

`who.ts` exports eight things. **One has a caller**: `hasAccounts()`, at `src/main.ts:663`,
which hides the account chip in the header. The other seven are typechecked and tree-shaken out
of the bundle, and because `setTypedName` is never called the module's own `typed` is
permanently empty.

## What is already done

- **The rules.** `deploy/firestore.rules` grants create (`:87-88`), get (`:119`) and update
  (`:147-148`) on the code. Four fields are frozen against a non-owner: `ownerEmail`,
  `fileType`, `audit`, `withdrawnAt`.
- **The request.** `src/firebase.ts:585-591`, `withCodeOrAccount()`, sends the bearer token only
  when there is one, and `getAssessment` and `putAssessment` both go through it.

## What is not done

**The one hard blocker.** `src/store.ts:241` still refuses every write when `currentUser()` is
null:

    if (!currentUser()) {
      const problem = 'Sign in before saving to the shared store.';

Every save path on the submitter side goes through it: `main.ts:447` (Save online),
`guard.ts:142` (save before replacing the draft), `views-results.ts:416` and `:482` (mark ready,
take the mark off). The store would allow all four. The client is refusing what the store
permits, which is the exact defect `withCodeOrAccount` was written to remove. **Note that
`test/firestore.ts:57` asserts this refusal**, so that test has to be rewritten first or the
suite turns red on the fix.

**Two silent ones behind it.**

- `src/main.ts:466`, `adoptSignedIn()`: a leftover Firebase session in localStorage still works
  on a code build. `hasAccounts()` hides the chip but `currentUser()` is still non-null, so the
  browser stamps `ownerEmail`, sets the assessor name and fires a roles request. Two people on
  the same page see two different tools. Also `main.ts:94`, `bootRoute()`, still sends the
  browser to the assessor sign-in when `SIDE_KEY` says `assess`.
- `src/store.ts:125`, `firestoreRecords()`: returns null with no account, so
  `warnGoneFromStore()` compares the draft against itself and can never fire. An admin deleting
  a submission leaves the submitter looking at a copy they believe is online. The rules grant
  `get` on the code, so this is buildable without an account.

**Copy that names an account on a submitter screen.** `main.ts:609` ("Sign in to save online"),
`save-badge.ts:30` (the badge's hover text), `main.ts:1317` and `:1327-1334` (the settings pane,
including a working Sign in with Google button, and `:1330` says "the store only accepts work
from somebody it knows", which is no longer true).

**Dead special case.** `main.ts:363-366` tells the reader "the store does not accept access
codes yet". `getAssessment` no longer throws the message that triggers it, so the branch is
dead and the sentence has been untrue since the rules were rewritten. Delete the ternary, keep
the arm that prints the store's own words.

**The two-build split.** `build.mjs:9-10` writes one hardcoded output path.
`deploy/publish-preview.sh` builds once, copies one file, and its up-to-date check cannot see a
new path. Proposed shape: the submitter build at the site root, the assessor build one level
down, and the crossover link at `main.ts:867` removed once the assessor address is live.

**No test builds with `EARB_ACCESS=code`.** All eight suites run against the default.

## The order to do it in

1. **Publish the rules.** Nothing below is verifiable until `deploy/check-rules.sh` prints five
   refusals and one `opens`. See `deploy/PUBLISH-THE-RULES.md`.
2. Rewrite `test/firestore.ts:57`, and add a suite that builds with `EARB_ACCESS=code`.
3. Remove the hard blocker and the two silent ones. Those three are the whole of "does the code
   route function", and all three are small.
4. The copy, and the `who.ts` exports that serve it. `wayIn()` has to be wired before the save
   badge and the settings pane can branch, so do them in one pass.
5. The two-build split, last, because it changes how the tool is published.

## House rules

Read `CLAUDE.md` at the repository root before writing anything. In short: comments say why and
never what; every fix gets a test that asserts behaviour and not the presence of a declaration;
prose is linted by `npm run lint:prose`; every user-visible string goes through `t(en, fr)`.
`npm test` is the contract and runs eight suites.
