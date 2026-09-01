# GC Enterprise Architecture self-assessment

**Try it: https://myermcat.github.io/tbs-earb-self-assessment-preview/**

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

**Takes the evidence with it.** A cost model, a diagram, a compliance report. Attach the file
and an assessor opens it in place. Anything that cannot travel is recorded by location.

**Marks itself.** The file carries one classification marking and every attachment carries its
own. Saving is refused until both are set, and refused again if an attachment outranks the
file it is in.

**Gives the assessor a worklist.** A triage table weakest first, then the anomalies with a
drafted question to ask for each, then everything else folded away. On a real submission that
is single digits out of 176.

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

## No server, by design

Three constraints from the meeting that started this all point the same way. Evidence can be
Protected B or higher. Departmental laptops will not run Python and cannot install anything.
Office wireless cannot resolve internal sites.

So the page carries `default-src 'none'; connect-src 'none'`, a browser rule that blocks every
outbound request. Hosting the page changes nothing about that: the engine travels over the
network, the information never does. Answers live in the browser and in the file the person
saves. Sending it is a separate act, through a channel their department already trusts.

## The questions are data

The rubric is one JSON file: domains, weighted sections, questions, the scale, the bands.
`tools/import-rubric.mjs` regenerates it from the source workbook, so a new version of the
questions is a re-run and not a release. Every assessment records the rubric version it was
answered against.

`rubric/rubric-ids.lock.json` records what each question id meant. Ids become CSV column
names, so the importer refuses to let one point at a different question later.

## Status

A working prototype, against a draft framework. Two things are still needed from TBS: the
answer data from past assessments, which is the only real source for the dropdowns, and
sign-off on the routing thresholds. `Self-assessment tool/NOTES/Build-brief.md` tracks the
requirements and what is deliberately left out.

The repository is private because it holds a draft framework. The engine itself is
unclassified and holds no departmental information.
