# GC architecture self-assessment - prototype

**Live: https://myermcat.github.io/tbs-earb-self-assessment-preview/**

Replaces the GC EARB assessment template and the hand-built score deck. A department
scores itself against a published rubric, points at evidence it already has, and produces
a structured file. Assessors audit the anomalies instead of reading a deck.

From Dan Cooper, 2026-08-26. Full record of that meeting is in
`../TBS library (Claude Input)/Meeting transcripts/Dan. Aug 26. New project.json`.

## Run it

```
npm install
npm run build      # writes dist/index.html - one self-contained file
npm run dev        # same, rebuilding on save
npm test           # prose lint, then the logic, UI and print suites against the built file
npm run check      # typecheck only
```

`dist/index.html` is the whole product. Open it directly, email it, put it on a share,
or serve it from GitHub Pages. It behaves identically in all four cases.

## Who can open an assessment, and how

**There are no accounts for the people filling this in.** Dan asked for that on 8 September,
and this is how it works.

Every assessment gets a **reference code** the moment it is created: twelve characters from a
32-letter alphabet with I, O, 0 and 1 left out, so it can be read down a phone.

    KFRM-92TX-BQ7H

That code is the assessment's name in the store. The rule is one sentence: **if you can name
an assessment, you can open it and change it.** So whoever holds the code is in, with no
account, no sign-in and nothing to set up, and sharing an assessment means sending somebody
the code.

What nobody can do without an account is ask **what assessments exist**. There is no listing,
no directory and no browsing. That is the property the whole design rests on, and it is not a
choice: a Firestore rule can read a query's limit, its offset and its ordering, and nothing
about a filter, so "list the ones matching the code I typed" is not a rule anybody can write.
Listing is granted to a person or to nobody, and it is granted to assessors, who therefore
keep accounts.

**How safe.** A stranger cannot find an assessment: they would have to guess twelve characters
out of a billion billion. Somebody holding a code cannot delete anything, list anything, take
ownership, or touch an assessor's verdict, and Google enforces that rather than this page
hoping. Every save online asks for a name and a work email, kept with that version, so an
assessor reading a version can see whose it is.

**What it costs, and it is written down as a risk.** A code is a key whose lock cannot be
changed. Forward it to the wrong person and they have it permanently. Say it out loud when you
send one.

**Emails quote the first four characters only.** A subject line is logged, forwarded, quoted
back in replies and answerable to access-to-information, and the whole code opens the
assessment. Four characters is enough to find the thread in Outlook and eight characters short
of opening anything.

## Domains and topics, which are two different things

A **domain** is one of the four parts of the GC EA framework: Business, Data, Application,
Technology. Every question lives in exactly one. They carry 25% each and they produce the
overall score. That is the spine, and it has to stay a clean split or the arithmetic stops
meaning anything.

A **topic** is a subject label, and a question can carry as many as apply. There are nine, named
by Dan on 8 September: the four domain names, plus Security, Privacy, Financial, Accessibility
and Official Languages.

Both exist because "how are we doing on security?" cannot be answered from the four domains.
Security questions are scattered across all four, so a department that is weak on security sees
four numbers that each look fine.

**The arithmetic.** A question counts **once** in the overall score, through its domain. It
counts at **full weight** inside **every** topic it carries. The two do not reconcile and the
results page says so. Today: 176 questions, 222 topic memberships; 132 carry only their own
domain, 42 carry two, 2 carry three.

**How Dan fills them in.** His workbook has one tab per domain. A question stays on its one
tab, and a `Topics` column on that row lists the subjects **beyond** its own domain:

| Tab | Q# | Assessment Question | Topics |
|---|---|---|---|
| Data & Info | Q27 | Are data retention and disposition policies enforced... | `Security, Privacy` |
| Data & Info | Q28 | Are data quality rules defined and measured... | |

The column is found by its header, so it can sit anywhere in the sheet. Comma or semicolon
separated, case and spacing ignored. A blank cell is the normal case. **A question is never
duplicated into a second tab** — that would count it twice in the overall score and move the
department's number for no reason but how we filed it. A name that is not one of the nine
refuses the whole import and says which question and which name.

    node tools/import-rubric.mjs

## Everything in it is unclassified

Dan settled this on 2026-09-01: nothing classified goes into the tool at all. That one rule
removes most of the design problem. There is no second engine, no local-only mode, no
marking-dependent behaviour, and no recall path to build for something that leaked online.

The classification picker stays, for one job: catching the case where somebody's **evidence**
is classified. Choose anything above unclassified and a panel explains what to do instead -
send that artefact to the assessor by email, with a subject line the tool writes for you, and
note in the answer that you did. It asks for an explicit *I understand* before continuing.

Evidence is therefore a **link to where the artefact already lives**, plus a note that the
assessor has been given access. Attaching an unclassified file is still possible for the case
where nothing can be linked, and it is offered as the alternative rather than the default. A
high score with nothing cited raises a flag for the assessor either way.

## Where the answers live

**Today.** Two places, neither of them a server:

1. **Autosave into the browser** (`localStorage`), so closing the tab does not lose work.
   Per-browser, per-machine, invisible to everyone else.
2. **Save to a file** - the `.json` the submitter keeps and sends on. Reopening it restores
   everything.

The page carries `default-src 'none'; connect-src 'none'`, so it cannot fetch, XHR, open a
socket or submit a form anywhere, even if someone later added code that tried. Verified by a
test.

**Next: one store, online.** Since nothing in it is classified, the records can live in one
place, which kills the two problems files create - a submitter and an assessor editing
different copies, and Dan collecting files to see how the portfolio is doing. GitHub Pages
serves static files and cannot accept a write, so this needs a small write endpoint. An Azure
Function is the cheapest route: `canada-ca/TBS-OCIO-ESP` already builds through Azure
Pipelines, so the account, the tenancy and the approval path exist.

`src/store.ts` is that seam, and it is deliberately one constant away from live:

- `ENDPOINT` is `null`, so `listRecords()` reads the draft in this browser plus whatever the
  assessor opened this session.
- With an endpoint it reads the store instead and falls back to the local sources when the
  request fails.
- The CSP then opens to exactly that one origin. One line in `build.mjs`.

The dashboard is built against that call, so it needs no change when the store appears - and
it says on the page which of the two it is reading.

## Two people on one record

Not solved, and the tool does not pretend otherwise. With a store, a submitter and an assessor
can be on the same question at the same time. The shape that fits what is already built: the
audit trail is append-only, so neither person's number or reason is overwritten, and each line
shows that it was edited and by whom. What is missing is the live signal - telling the other
person it happened while they are looking at it. That is in the backlog, not in the code.

## What is in here

```
rubric/rubric.v1-dan.json       The questions, weights, scale, bands, stages. DATA, not code.
rubric/rubric-ids.lock.json     What each question id meant. Ids are CSV columns; they cannot move.
rubric/RUBRIC-CONTRACT.md       What a valid rubric file must contain.
tools/import-rubric.mjs         Regenerates the rubric from Dan's workbook.
src/types.ts                    Shapes.
src/rubric.ts                   Rubric validation - refuses a bad file rather than half-loading it.
src/scoring.ts                  Weighted roll-up, stage weighting, bands, weakest/strongest.
src/flags.ts                    The anomaly detector. This is the assessor's new job.
src/storage.ts                  Autosave, file save/load, download, save-state reporting.
src/store.ts                    The seam where the hosted store goes. One constant from live.
src/marking.ts                  Classification markings and the classified-evidence panel.
src/csv.ts                      One row per assessment, for trend analysis in Excel.
src/views-submit.ts             The questionnaire.
src/views-results.ts            The submitter's result and backlog.
src/views-review.ts             Triage list, per-submission audit, the edit exchange.
src/views-dashboard.ts          The admin view: the portfolio on one page.
src/main.ts                     Shell, navigation, rubric swapping.
build.mjs                       Bundles everything into dist/index.html.
test/smoke.ts                   Scoring, banding, flags, CSV, round-trip.
test/ui.mjs                     Drives the built file in a real DOM, end to end.
```

## The rubric is data

Dan writes the questions, the weights and the ladder. The app renders whatever it is handed.
A new version of the rubric is a new JSON file, not a new release of the app. The control that
loads one lives in Settings **on the assessor side**: replacing the question set clears every
answer, so it belongs to whoever maintains the instrument, not to somebody filling one in.

Every assessment records the rubric version it was answered against, so a two-year-old
submission stays interpretable after the questions change.

## Design

One stylesheet, `src/styles.css`, inlined at build time. No web fonts and no CDN - the page
has to work with the network cable out, so the system font stack and an inline SVG favicon
are the whole of it. Light and dark both supported through `prefers-color-scheme`.

The score colours are **Dan's own**, from the Assessment Scale sheet: eleven of them, black
through to purple, used on the selector, the pills and the domain bars rather than a
three-colour red-amber-green of our invention.

## Scoring

- Each question is scored 0-10 against a ladder of anchored descriptors. The ladder is
  visible to the submitter: it is the guidance, not just the scale.
- Question weight is multiplied by a **lifecycle-stage factor**. `low-ok` counts a quarter,
  `expected` counts full, `critical` counts half again. Weights are re-normalised after,
  so every assessment still scores out of 10. A discovery team is not punished for not
  knowing its costs; a mature service is.
- Not applicable and unanswered questions leave the denominator rather than scoring zero.
  Unanswered is reported separately as completeness, and flagged.
- Domain scores roll up by domain weight into one overall score, then into a band.
- Ten questions are **yes/no** rather than a ladder. A *no* scores zero and colours its
  question, its section, the rail row and the domain tab red. It stops nothing: it marks
  where a reader should look first. Which questions these are is our reading of the wording
  and is labelled provisional until Dan confirms it.
- Questions also carry **topics** - security, privacy, cost, data, business, technology - so
  the same answers can be cut across the domains. Security questions sit in all four domains,
  which means a department weak on security cannot see it in the domain bars: the weakness is
  spread over four numbers that each look fine. A question counts fully in each topic it
  belongs to, and once in the overall, so the topic scores do not add up to the overall. The
  page says so.

## Bands

Dan's spoken numbers, in `rubric.bands`, **not signed off by anyone**:

| Score | Band | Suggested routing |
|---|---|---|
| 8.5+ | Showcase | No board slot. TBS may ask to showcase. |
| 6.0+ | Hall pass | No GC EARB appearance required, subject to audit sample. |
| 3.0+ | Routine | No board time. Spot-check only. |
| under 3.0 | Bring it to the board | Attend, explain why, and bring the plan. |

The tool always words this as a suggestion and says TBS confirms routing.

## The assessor's rules

- **A changed score needs a reason.** The file cannot be saved while one is missing, and the
  button says how many are outstanding.
- **Nothing is overwritten.** Each change appends to that question's history with a name, a
  time and the reason. Two assessors disagreeing leaves both accounts on the line.
- **The line says it was edited, and by whom**, before anyone opens anything.
- **Agree with all** marks a whole section as agreed without touching a score. It skips any
  question whose changed score has no reason yet.
- **Names are not verified.** There is no authentication. The assessor side opens on a screen
  shaped like a sign-in that says it is a mockup, the departmental-account button is visibly
  disabled, and everything the session produces is labelled `unverified`.

## Open questions for Dan

- Confirm or change the band thresholds. A self-scored hall pass is a real gaming
  incentive; recommend auditing a random sample of hall-pass cases from day one, which
  also builds the calibration data stage 3 will need.
- Are the four architecture domains and their 30/20/25/25 weights right?
- Does his scale have per-question ladders, or one shared ladder? The app supports both.
- How should the file reach TBS - email, GCdocs, SharePoint, a GitHub issue?
- Second storage path: GitHub for now, as agreed. What is the non-Microsoft fallback later?

## Hosting

The preview above is `dist/index.html` published to a public repo by
`../deploy/publish-preview.sh`. What is public there is not data but the **176 questions**,
Dan's draft framework, which is a sequencing decision for him.

The code itself is meant to live in `canada-ca`. Two routes, and the cheap one was found by
checking what that organization already does:

- **Publish into `canada-ca/TBS-OCIO-ESP`,** which already serves
  `canada-ca.github.io/TBS-OCIO-ESP/earb-forward-agenda/` from a folder holding one
  `index.html`. We have push access. One commit publishes this tool the same way. What it
  costs: that repo is public, so the 176 draft questions become public with it, which is
  Dan's decision.
- **A repository of its own,** which needs permission to create repositories in `canada-ca`.
  Nick Couture holds that; the route he named is an issue on `canada-ca/welcome`.

Worth knowing before planning on a private repo: all 35 Pages sites in `canada-ca` are served
from public repositories, and no private repository there serves one. GitHub will not serve
Pages from a private repository on a free plan at all, which is why the preview above lives in
its own public repository.

Version drift is the one thing hosting settles on its own. A hosted copy means everyone
answers the current rubric; files scatter and people fill in stale ones, which is why every
assessment records the version it was answered against.

## Notifications

A static page cannot send mail, and the CSP forbids the attempt, so today the only mechanism
is *Draft the email*: it opens the person's own mail client with the message already written.

Once a write endpoint exists it can send. **GC Notify** is the service to use - it is already
in Dan's own rubric at application question Q33. What triggers a notification is Dan's to
decide and he has not: submission, assignment, a changed score, and a reminder are four
different decisions.

## Status

Prototype, against Dan's own question set: `rubric/rubric.v1-dan.json` is generated from his
six-sheet workbook by `tools/import-rubric.mjs`, so the 176 questions and their weights are
his. Three things in it are still ours and are labelled that way in the app - the routing
thresholds, which questions are yes/no, and the topic grouping. **Every picklist is invented**
rather than derived from the 700-odd past assessments, which is the one piece of data only Dan
can hand over.

The backlog is the live picture of what is built, what is next, and what is waiting on
somebody: open `NOTES/backlog.html` in a browser.
