# Working in this repository

The GC Enterprise Architecture assessment, for the Treasury Board of Canada Secretariat. Two
pieces of work live here: the **tool** that replaces the PowerPoint template, and the **concept
case** that argues for doing it. Dan Weekes-Hall owns the rubric.

**If you are working on the tool, read `Self-assessment tool/CLAUDE.md` as well.** It carries
the code house style, and `Self-assessment tool/NOTES/OWNERS.md` carries the branching rules for
two sessions working at once.

## What is in the repository, and what only exists here

**The repository holds the tool and nothing else.** `Self-assessment tool/`, `deploy/`, and the
files at the root. Everything else in this folder is working material that stays on this
machine: it is in `.gitignore` and it is not pushed anywhere.

That matters for one reason worth knowing before anybody proposes making the repository public.
A recorded meeting with a named colleague was tracked until 21 September 2026. Untracking the
file does not remove it from the history, so the repository cannot be made public as it stands,
whatever is in the working tree today.

## Every folder, and what is in it

This list exists because it was missing. A session asked to work on the concept case read a
folder map that named three of the six folders. It never learned that a recorded meeting with
the programme lead was already in the repository, and it wrote a document without that meeting.

| Folder | What it holds |
|---|---|
| `Self-assessment tool/` | The app. TypeScript, builds to one offline HTML file. Has its own CLAUDE.md. |
| `Concept case/` | The concept case PDF and a README. Everything else, including the source text, the builder, the presenter deck and the working notes, is in `Concept case/Claude working files/`. **The README carries a list of claims that were corrected on 21 September 2026. Read it before editing the document.** |
| `Colleague meeting transcripts/` | Recorded reviews with the programme lead. **Primary evidence for anything anybody said.** Quote from these. A remembered version of a quote has been wrong several times. |
| `EARB target state knowledge base/` | Dan's source material, plus read-once notes on the PDFs. |
| `Categories spreadsheet/` | The workbook where it is decided what each question is about. Has its own README. The live copy is on Google Sheets at one address that never changes. |
| `deploy/` | Firestore rules, the publish script, and the GitHub Pages workflow. |

## How a folder is arranged

A rule for folders, and not for the source tree of a repository, where the layout is the
build's to decide.

**What Mariia reads sits at the top of the folder. Everything that exists only so the work can
be done goes one level down, into a folder named for what it is.** Opening `Concept case/`
should show the concept case PDF and a README, and nothing else. The .docx behind the PDF, the
source text the builder reads, the builder itself, the presenter deck, the extracted slides, the
research notes and the blank template are all working files, and they belong in a subfolder.

Reference material counts as a working file even when it is a polished PDF. The presenter deck
is read by whoever writes the document and never by Mariia, so it belongs below.

The test is what somebody sees when they open the folder and want the thing it is named after.
If they have to skip past five files to reach it, the folder has been arranged around the
person who built it. Arrange it around the person who opens it.

## Which source wins, and why it matters

Two artefacts describe the assessment and they are **not** the same thing. Confusing them puts
untrue statements into a document that goes to the Secretariat.

**The presenter deck is the instrument.**
`Concept case/Claude working files/2026-08-05_GC_EARB_Presenter_GENERAL_EN.pdf` is the template
a department fills in and brings to the board. Anything about what the assessment asks of a
department, or how the board scores it, is answered here first. It is extracted to text and
JSON in the `slides/` folder beside it by `convert-slides.py`, so nobody has to open the PDF
again.

**The spreadsheet is a recent export.** It is no part of the instrument. The
`EARB target state knowledge base/GC_EA_Assessment_Tool(*).csv` files carry the 176 questions,
the eleven-rung scale and the section weights. They were produced recently and with AI help.

So: a defect found only in the CSV is a defect in the CSV. Writing that the assessment "has
carried this for years" needs the deck to show it, and the deck does not carry section weights
at all. Say which artefact a finding came from, every time.

## Anything that removes something

**Every act that takes something away lives in the settings Danger zone, and nowhere else.** No
screen somebody works on every day carries a control that destroys. This is stricter than
GitHub, which puts access removal on an ordinary page with a plain Remove button beside each
name. It is our rule and we chose it, so do not go looking for the precedent.

Three things that are not destruction and stay where they are: taking a row off this browser's
own list, detaching a piece of evidence from an answer, and anything that edits only the copy in
front of the person doing it.

**A window that asks somebody to type a confirming string never prints that string.** Printing
it turns the typing into a copy exercise and the guard becomes decoration. GitHub renders its
own confirming text so it cannot be selected, and the complaints about that in its forums are
the feature working. Pass `showPhrase: false` to `confirmTyped` for anything in the danger zone.

**Nothing in a removal window narrows the search.** No list, no autocomplete, no match count, no
"did you mean", no tick when half the name is right. A hint is a pick list with one item in it. A
near miss and a wild guess produce the same message. The full rule, and why each part of it is
there, is in the header of `Self-assessment tool/src/danger-people.ts`. Read it before adding
anything helpful.

## Writing

Prose that anybody outside this repository will read follows
`Claude Hub/Claude -- TBS/TBS summer (DLG)/TBS (Claude Output)/Skills/source (unpacked, 2026-08-11)/tbs-playbook-page-writer-mariia/references/writing-rules.md`,
sections 3 and 4. **The voice is dry, concrete and declarative.** The bans that catch most
drafts:

<!-- lint-off -->
- Antithesis, the "X, not Y" shape in all its forms.
- Em dashes and en dashes.
- Dramatic one-line fragments.
- Three short sentences where the third reverses the first two, which those rules name as the
  most reliable tell of machine prose.
- Metaphor where the literal thing would do. If a reader could ask "what do you actually mean
  by that", replace it.
<!-- lint-on -->

**Expand every acronym on its first use**, with the short form in brackets, and never leave an
unexpanded one in a heading. This is the rule that lapses most often. It applies to any report
in any project, and it is written up in `Claude Hub/Document house rules.md`.

Document layout follows `Claude Hub/Document house rules.md`.

## The concept case

**Read `Concept case/README.md` before changing a word of it.** It lists the claims that were
written into this document and later found to be untrue, so that an older draft or an older
summary cannot put them back.

The working files are one level down, in `Concept case/Claude working files/`.
`draft-content.md` there is the source text, and the builder reads it, so words change there and
nowhere else. `Template (as published by TBS)/` beside it holds the official template it is
written into, in both official languages.

`python3 "Concept case/Claude working files/build-concept-case.py"` writes the .docx beside
itself and the PDF one level up, at the top of `Concept case/`, which is where Mariia opens it.

It is an internal document. It has no business owner at assistant deputy minister level and is
not being submitted to anybody, and the sections that would matter for a real submission say so.
