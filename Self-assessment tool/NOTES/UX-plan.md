# The next round of UX work: plan, decisions, and defects found

Written 2026-08-28, at the point work paused. Everything described as done is committed and
pushed. Everything under "Build order" is not started.

Four independent designs were explored and scored by three judges on different criteria, and
two analyses looked separately at splitting the submitter and assessor audiences. The raw
output is in `NOTES/design-exploration/raw-proposals-and-verdicts.json`, 226 KB, which holds
the full text of all nine. Read it before implementing; the summaries below are lossy.

---

## Defects the exploration found in what is already shipped

These are confirmed against the source, not opinions. Two of them mean a claim already made
to Mariia was wrong.

**1. Fixed. Printing lost every score.** `src/styles.css:553` hides `button` with
`display: none !important` in print. The score selector IS eleven buttons, so a printed
assessment shows the questions and nothing that was answered. The fix has two halves: narrow
the rule to `button:not(.sec-toggle)`, and write the chosen value into a `data-print`
attribute that prints via `content: attr(data-print)`.

**2. Fixed. Printing lost collapsed sections entirely.** `src/styles.css:558` has
`details { display: block } details > summary { display: none }`. Hiding the summary hides the
section title and its score, and `display: block` on a `<details>` does **not** reveal a closed
one in Blink or WebKit. So a section left folded prints as a heading-less blank. Delete that
line as a print mechanism and either force sections open before print or drop `<details>` on
the submit side.

**3. Fixed. Typed values did not print.** Form controls print their initial markup, not what was typed,
so the justification textareas print empty. The fix is to mirror the value into a print-only
`<p>` on `input`, gated by a `.has-content` class.

**4. Fixed. A screen reader read "Business Architecture 5.2".** The score pill is inside the domain
`<h2>` and the section `<h3>`. Move it out into a sibling with an `.sr-only` "out of 10".

**5. Fixed. `nav.path` had no accessible name**, so a screen reader announces "navigation, navigation"
once the second nav is added.

**6. Four sections share the id `defining-the-current-state`,** one per domain. `cssId()`
namespaces by domain and sanitises. Nothing currently builds a DOM id from a section id, since
the rail navigates by closure rather than by anchor, so the collision has no live consequence. one per domain. Any DOM id,
anchor, `aria-controls` or storage key built from a section id will collide. Namespace every
one as `${domain.id}--${section.id}` and sanitise with `replace(/[^A-Za-z0-9_-]/g, '_')`.

**7. Fixed. Every score click rebuilt the whole page.** `repaintApp()` runs `paint()`, which clears
`#app` and rebuilds it, measured at about 4,049 nodes on the Business Architecture page. All
four proposals independently identified this as the blocker: sticky headers, user-controlled
collapse state, surviving input focus and any completion animation are impossible until a score
click patches a known set of nodes instead. **Do this first, alone, and run `npm test` before
touching any CSS.** Keep the valve both winning proposals specify: compare `canSave(a)` before
and after, and fall back to a full repaint when it flips, so the marking gate can never go
stale.

---

## Decision 1: the questionnaire

**Winner, taken as the spine: progressive disclosure as a workbook.** Two of the three judges
picked it (9 and 8 out of 10); the third preferred the numbered-outline proposal and scored
this one 7. Grafts from the other three are listed below and are not optional.

- **21 stops.** The overview plus each of the 20 weighted sections becomes its own page, so a
  page holds 3 to 14 questions and can be finished. This is the answer to "it all blends into
  one vertical sheet": there is no 20,000-pixel sheet left to blend.
- **The domain tab strip moves inside the existing `.chrome` block** and becomes a 38px row of
  Excel-style tabs, always on screen. This answers "like in Excel, they would always be seen".
  Cost is 38px of the sticky budget; the payoff is the domain and its progress visible for the
  whole scroll, where today it disappears after the first 174px.
- **A sticky section rail** in the left margin lists the current domain's sections with a count
  and a track each, so the sections she could not find are permanently visible and cost no
  vertical space.
- **The question becomes a white card on a grey ground**, with a number in a left gutter, a
  status edge coloured by `--s0..--s10`, and its answer controls inside a tinted answer box.
  Two alternations of ground, each backed by a border, so tint is never the only cue.
- **Invert the evidence tint.** `.evidence` is currently the only tinted block inside a
  question, which is why the evidence reads as the separated thing and the question does not.

## Decision 2: progress, and what "answered" means

Committed answers to the questions Mariia asked directly.

- **A question is answered when it has a score.** `typeof ans.score === 'number'`. Nothing else.
- **Justification is not mandatory. Evidence is not mandatory.** Neither is required to save,
  and neither affects progress. They affect the assessor's flags, which is the right lever: a
  9 with nothing cited already raises a question for the assessor, and the person is not blocked.
- **Not applicable removes a question from the numerator and the denominator both.** This is
  already exactly `Result.answered / Result.scoreable`, so progress and score can never
  disagree and nothing new is computed.
- **Changing an answered question to a different score does not move the bar.** It was answered
  before and it is answered after. Only clearing it back to nothing moves the bar down.
- **Two bars, not one.** One question in 176 is 0.57% of a bar, which is invisible. The median
  section is 9 questions, so a section bar moves about 11% per answer and is where the
  completion animation belongs. The overall bar goes in the sticky chrome as a 4px strip.
- **The completion reward appears on a pinned element**, so it is visible however far down the
  page the person is. A flourish 4,000px above the fold is not a reward.
- **Process colour and score colour stay separate.** Grey to green for answered versus not.
  Dan's eleven-colour ramp only for what a score means.
- **Announce progress to a screen reader on a 600ms debounce**, count only, plus a sentence on
  section completion.

## Decision 3: the classification marking gate

Mariia's objection was exact: *"where can I mark it? you tell me to do this and not tell me
how... why do you put in this note that is avoidable? code against the fool. It has to be, like
no way for you not to mark your document."*

- **The control goes where the person is told they need it.** The gate message in the sticky
  footer carries the five marking chips inline. No navigation, no hunting.
- **"Come back and fix it" is replaced by a jump that focuses the marking control**, so the
  instruction and the means are the same click.
- **Marking stays the only hard gate**, and Dan should be told that out loud, not left to discover it. All four proposals independently reached the same conclusion and all four refused
  to gate on justification or evidence.

## Decision 4: the two audiences

Both analyses converged independently, including the one asked to argue against separating them.

**One file, one build, split by a `side` variable in `main.ts`.**

- `type Side = 'submit' | 'assess'`, defaulting to `'submit'`. The existing `Mode` splits along
  it: home, submit and results belong to the submitter; review belongs to the assessor; settings
  belongs to neither.
- At boot, read `location.hash === '#assessor'` first, then a localStorage key, in the same
  try/catch shape `loadDraft` already uses. Blocked storage means the submitter side, which is
  the right default for the majority.
- The submitter's path becomes **Start › Fill it in › My results**, which is where "see my
  results" belongs and answers her question about it directly.
- The assessor's path becomes **Submissions › Review**.
- One line under the hero crosses over: "Reviewing submissions for TBS? Open the assessor side."
- Setting a hash on a `file://` URL does not reload the page, so this works offline.

**Not two builds.** Doubling the publishing story for a tool that is one HTML file, to serve one
manager and two assessors, is not worth it. The header split gives the whole benefit.

---

## Build order

Steps 1 to 8 are done and pushed. Step 9 is folded into the others as each was built.

1. **Done. Narrow the repaint.** Alone, with `npm test` green before and after. Everything else
   depends on it.
2. **Done. Print fixes.** Defects 1, 2 and 3 above. `test/print.mjs` holds them.
3. **Done. Accessibility fixes.** Defects 4 and 5, plus the score row became a radio group
   with one tab stop and arrow keys, down from 1,936 tab stops. `cssId()` added for defect 6,
   ready for the section ids that step 5 introduces.
4. **Done. The `side` split** in `main.ts`. Submitter path is Start, Fill it in, My results.
   Assessor path is Submissions, behind a badge, with a crossover offered once on the start
   page and a way back in the header.
5. **Done. 21 stops**, one weighted section per page, with the domain tabs inside the sticky
   chrome and a section rail that never scrolls away. The tabs are one scrolling row: a
   wrapping grid took 270px of a 900px viewport at a narrow width.
6. **Done. The question card**, its status edge in the score's own colour, and the tint
   inversion. The answering sits on tinted ground and the evidence on the card's own, which is
   the way round it should have been.
7. **Done. Two progress bars** in the pinned footer, section and whole, with the completion
   flash on the section bar and `prefers-reduced-motion` respected.
8. **Done. The marking chips are in the gate**, so being told to mark the file and being able
   to are the same click.
9. **Done, as each step was built.** The stale-readout test asserts every readout agrees after
   a score change and after a not-applicable toggle, plus a churn budget, plus `npm run
   measure` for the real numbers.

## Deliberately not building

Named here because "i also dont wanna overcomplicate it" is a requirement, and because an
unstated omission reads as an oversight.

- **No search across questions.** 21 stops with a permanent rail makes it unnecessary.
- **No `<table>` for the questionnaire.** Table navigation mode intercepts the arrow keys the
  score row needs. It is a list that looks like a sheet.
- **No virtual scrolling.** 14 questions a page is not enough to need it.
- **No second build for the assessor.**
- **No tamper detection on the saved file.** Settled earlier: a submitter can set any score in
  the form, so a hash catches nothing.

## One more defect, found while fixing the others

`el()` renders a boolean `true` as an empty attribute. That is right for `hidden` and
`disabled` and wrong for ARIA, because `aria-hidden=""` hides nothing. Every decorative element
in the header and the hero was affected and nothing showed it. Fixed in the helper, with a test
asserting no `aria-*` attribute is ever rendered empty.

## Environment guards, confirmed by probing jsdom 29.1.1

The UI tests run in jsdom, which has **no** `IntersectionObserver`, `ResizeObserver`,
`matchMedia` or `Element.scrollIntoView`, and returns zeros from `getBoundingClientRect`. Guard
every one with `typeof x === 'function'`, and guard any measured `--chrome-h` with `h > 0` so
the static fallback holds in tests. Disconnect observers at the top of each paint, or twenty
accumulate per repaint.
