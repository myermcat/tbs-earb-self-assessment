# GC Enterprise Architecture self-assessment

## The two addresses

The tool is two products and two published pages. Neither links to the other, because neither
screen may describe the other, so both live here.

| | |
| **The submitter's tool** | **https://myermcat.github.io/tbs-earb-self-assessment-preview/** |
| **The assessor's tool** | **https://myermcat.github.io/tbs-earb-self-assessment-preview/assessor/** |

A submitter needs no account at all: an assessment carries a twelve-character access code, the
code is the record's own name in the store, and whoever holds it can open that one assessment
and nothing else. An assessor signs in, because listing every submission is a right that can
only be granted to an identity.

A department scores its own architecture against the Government of Canada Enterprise
Architecture framework, points to evidence it already holds, and produces a structured file.
Assessors audit the handful of answers that do not add up.

It replaces a PowerPoint template and a score deck built by hand.

```
Self-assessment tool/          the app. TypeScript, builds to one offline HTML file
EARB target state knowledge base/   Dan's source material, and read-once notes on it
deploy/                        the GitHub Pages workflow, dormant until the content is cleared
```

## What it does

**Fills itself in at home.** 176 questions across four architecture domains, answered by the
team that runs the service. Progress is kept as you go, so nobody has to finish in one sitting.

**Scores against a published scale.** Eleven rungs from Absent to Symbiotic, each with a
description, so a low score arrives with a plain account of what would improve it.

**Points at the evidence.** A cost model, a diagram, a compliance report. The answer carries a
link to where that artefact already lives, and a note that the assessor has been given access.
Attaching an unclassified file is the fallback for anything that cannot be linked.

**Holds nothing classified.** Everything in the tool is unclassified, and that is the rule, not
a setting. The classification picker is still there to catch the case where somebody's evidence
is not: choose anything above unclassified and the tool explains how to send that to the
assessor by email instead, and asks them to confirm they have read it.

**Gives the assessor a worklist.** A triage table weakest first, then the anomalies with a
drafted question to ask for each, then everything else folded away. On a real submission that
is single digits out of 176. Changing a score needs a reason, and every change is kept: who
scored what, when, and why, all of it visible on the line it belongs to.

**Rolls the portfolio up on one page.** An admin view averages every record by domain and by
subject, lists them weakest first, and recalculates from the answers as it draws, so there is
no stored number to go stale.

**Comes out as data.** One JSON file per assessment and one CSV row, so trend analysis across
the portfolio becomes possible for the first time.

## Running it

```bash
cd "Self-assessment tool"
npm install
npm run build      # writes dist/index.html
npm test           # prose lint, 56 logic checks, 103 UI checks against the built file
```

`dist/index.html` is the whole product. Open it directly, attach it to an email, put it on a
share, or serve it from a URL. It behaves the same way in all four cases.

## Where the answers live

Today: in the browser, and in a file. The page autosaves to `localStorage` as you type, so a
closed tab loses nothing, and *Save a file* produces the `.json` that carries the whole
assessment. The page also carries `default-src 'none'; connect-src 'none'`, a browser rule
that blocks every outbound request, so it cannot transmit even if code were added that tried.

Next: one store, online. Since nothing in the tool is classified, the records can live in one
place, which removes the two problems files create - a submitter and an assessor working from
different copies, and Dan collecting files to see how the portfolio is doing. That needs a
small write endpoint, because GitHub Pages serves static files and cannot accept a write. The
seam is `src/store.ts`, the CSP opens to exactly that one origin, and nothing else changes:
the dashboard already computes its numbers the same way from whatever it can reach.

Departmental laptops will not run Python and cannot install anything, so whatever gets built
stays a page plus an endpoint - no runtime at the user's end.

## The questions are data

The rubric is one JSON file: domains, weighted sections, questions, the scale, the bands.
`tools/import-rubric.mjs` regenerates it from the source workbook, so a new version of the
questions is a re-run and not a release. Every assessment records the rubric version it was
answered against.

`rubric/rubric-ids.lock.json` records what each question id meant. Ids become CSV column
names, so the importer refuses to let one point at a different question later.

## Status

A working prototype against a draft question set. Open the backlog in a browser to see what
is built, what is next, and what is waiting on somebody:
`Self-assessment tool/NOTES/backlog.html`.

Two things are still needed from Dan: the answer data from past assessments, which is the
only real source for the dropdowns, and sign-off on the routing thresholds. The tool labels
both as provisional wherever they show, so nothing reads as settled that is not.
