# GC architecture self-assessment - prototype

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
npm test           # 36 logic checks + 42 UI checks against the built file
npm run check      # typecheck only
```

`dist/index.html` is the whole product. Open it directly, email it, put it on a share,
or serve it from GitHub Pages. It behaves identically in all four cases.

## Why one file with no server

Three constraints from the meeting all point the same way.

- **Classification.** The process is unclassified, results may be Protected, and evidence
  can be Secret or higher. A hosted form that ingests evidence would need an accreditation
  nobody wants to pay for. Offline sidesteps the question.
- **The laptop.** Locked down. Python will not run. Assume no install, no runtime, no key.
- **The network.** Wireless cannot resolve internal sites. An externally hosted app is not
  a delivery channel you can rely on.

So: no backend, no build step at the user's end, no dependency at runtime. The page carries
`default-src 'none'; connect-src 'none'`, which means it *cannot* fetch, XHR, open a socket
or submit a form anywhere, even if someone later added code that tried. Verified by a test.

## Marking and evidence

The file carries one classification marking; every attachment carries its own. **Saving is
refused** until the file is marked, until every attachment is marked, and unless the file's
marking is at least as high as everything inside it. Scores themselves are not marked - a
number is not sensitive, the text and the files are. The marking appears as a banner at the
top and bottom of the page and on anything printed.

Evidence can be **attached** (held in the file as base64, opened by the assessor in place -
15 MB per file, 50 MB total) or **pointed at** (a path, a URL, a system name), for anything
that cannot travel. A high score backed only by a pointer raises a flag for the assessor.

## Where the data lives

There is no database. Persistence is two separate things:

1. **Autosave into the browser** (`localStorage`), so closing the tab does not lose work.
   Per-browser, per-machine, invisible to everyone else.
2. **Save to a file** - the `.json` the submitter keeps and sends on, through whatever
   channel they already use. Reopening that file restores everything.

Attachments ride inside that same file, so there is one artefact to send and the assessor
does not have to email anybody to see the evidence.

## What is in here

```
rubric/rubric.v0-standin.json   The questions, weights, scale, bands, stages. DATA, not code.
rubric/RUBRIC-CONTRACT.md       What a valid rubric file must contain.
src/types.ts                    Shapes.
src/rubric.ts                   Rubric validation - refuses a bad file rather than half-loading it.
src/scoring.ts                  Weighted roll-up, stage weighting, bands, weakest/strongest.
src/flags.ts                    The anomaly detector. This is the assessor's new job.
src/storage.ts                  Autosave, file save/load, download.
src/csv.ts                      One row per assessment, for trend analysis in Excel.
src/views-submit.ts             The questionnaire.
src/views-results.ts            The submitter's result and backlog.
src/views-review.ts             Triage list and per-submission audit.
src/main.ts                     Shell, navigation, rubric swapping.
build.mjs                       Bundles everything into dist/index.html.
test/smoke.ts                   Scoring, banding, flags, CSV, round-trip.
test/ui.mjs                     Drives the built file in a real DOM, end to end.
```

## The rubric is data

Dan writes the questions, the weights and the ladder. The app renders whatever it is handed.
A new version of the rubric is a new JSON file, not a new release of the app - and the home
page has a **Load a rubric file** control so he can drop his own in and see it immediately.

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

## Bands

Dan's spoken numbers, in `rubric.bands`, **not signed off by anyone**:

| Score | Band | Suggested routing |
|---|---|---|
| 8.5+ | Showcase | No board slot. TBS may ask to showcase. |
| 6.0+ | Hall pass | No GC EARB appearance required, subject to audit sample. |
| 3.0+ | Routine | No board time. Spot-check only. |
| under 3.0 | Bring it to the board | Attend, explain why, and bring the plan. |

The tool always words this as a suggestion and says TBS confirms routing.

## Open questions for Dan

- Confirm or change the band thresholds. A self-scored hall pass is a real gaming
  incentive; recommend auditing a random sample of hall-pass cases from day one, which
  also builds the calibration data stage 3 will need.
- Are the four architecture domains and their 30/20/25/25 weights right?
- Does his scale have per-question ladders, or one shared ladder? The app supports both.
- How should the file reach TBS - email, GCdocs, SharePoint, a GitHub issue?
- Second storage path: GitHub for now, as agreed. What is the non-Microsoft fallback later?

## Hosted engine, local information

The right model, and the one the build already supports: **host the engine, keep the
information local.** The page is code. It carries `default-src 'none'; connect-src 'none'`,
so it cannot transmit anything no matter where it was loaded from - hosted or opened off a
USB stick, the data behaviour is identical. Answers live in the browser and in the file the
person chooses to save.

Two things hosting genuinely changes, both worth knowing:

- **Version drift goes away.** A hosted copy means everyone answers the current rubric.
  Files scatter and people fill in stale ones - which is why every assessment records the
  rubric version it was answered against.
- **A department has to trust the copy.** Fine for a demo. For real Protected B use expect to
  be asked for a GC-controlled location, or just the file. The home page states where it was
  loaded from and how to verify the CSP, so the claim is checkable rather than asserted.

`deploy/github-pages-workflow.yml` publishes it, and is **not active yet**. What becomes
public is not data but the **176 questions** - Dan's DRAFT framework. That is a sequencing
decision for him, not a security one. `deploy/README.md` has the steps.

## Notifications

Hosting does not enable them. A static page cannot send mail whether or not it sits at a URL,
and the CSP forbids the attempt. Two layers instead:

- **Now:** *Draft the email* opens the person's own mail client with the message written.
- **Later, separate:** reminders and follow-ups come from whoever holds the intake, using
  **GC Notify** - which is already in Dan's own rubric at application question Q33. It never
  touches evidence. Adding a *submit* button that posts to that intake would work too, but it
  puts data back on the network, so submission stays manual.

## Status

Prototype. The rubric is a stand-in written from wording Dan read aloud - four questions
use his exact phrasing, the rest are plausible inventions, and **every picklist is invented**
rather than derived from the ~800 past assessments. Replace `rubric/` before showing this
to anyone outside the team as though the content were real.
