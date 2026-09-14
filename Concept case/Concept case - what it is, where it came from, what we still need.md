# Concept case: what it is, where it came from, what we still need

Research note, 14 September 2026. Written after Dan named the concept case as the priority.

---

## The access question, settled

**The template is public and nothing about it is restricted.** Every worry worth having was
checked, and none of them holds.

| Checked | Result |
|---|---|
| Classified? | No. The file's own metadata carries `SECCLASS = CLASSU`, `TBSSCTCLASSIFICATION = UNCLASSIFIED` and `TBSSCTVISUALMARKINGNO = NO`. Those properties are written by TBS's own Titus labelling tool, so the marking comes from TBS itself. |
| Behind a login? | No. Plain HTTP GET, 200, no cookie, no account. |
| On the GC network only? | No. Served from the open internet, off a home connection. |
| GCpedia or GCcollab? | Neither holds it. The policy links to it directly. |
| Permission to use it? | None needed. It is the instrument the policy points at. |

Both official languages are published, and both are now held here in
`Template (as published by TBS)/`.

- **English:** `https://www.tbs-sct.canada.ca/pol-cont/32593-eng.docx`
- **French:** `https://www.tbs-sct.gc.ca/pol-cont/32593-fra.docx`

Both are linked from **Appendix B: Mandatory Procedures for Concept Cases for Digitally
Enabled Projects**, in the *Policy on the Planning and Management of Investments*.

**One note on retrieval, in case somebody repeats this.** `tbs-sct.canada.ca` returned 500s
and WAF rejections for most of the afternoon of 14 September. The policy text came from the
Internet Archive snapshot of 16 March 2026. The two template files came from the live site
on the `tbs-sct.gc.ca` host, with an ordinary browser user agent and a referer. An
unreliable site is a separate thing from a restricted document.

---

## Two names for the same thing, and the template is behind

**The template cites a procedure that no longer exists under that name.** Its body points at
the *Mandatory Procedures for Concept Cases for **Digital** Projects*, which was Appendix C
of the 2021 policy and is now archived. The live requirement is Appendix B, and it says
**digitally enabled** projects.

**Use it anyway.** The file was last saved on 7 August 2024 and still carries the older
wording, and it is the file the current policy links to. Worth knowing before somebody spots
the mismatch and assumes we pulled a stale copy.

---

## What the template actually contains

Six free-text sections, a signature block, and roughly one page of front matter. That is all
of it. There are no scored fields, no dropdowns, no financial tables and no architecture
annex.

**Header block.** Proposed initiative, department, Assistant Deputy Minister business owner,
date, signature.

**The six sections, with the instruction TBS prints under each:**

<!-- lint-off -->
1. **Problem or opportunity statement.** "Provide a succinct problem statement (ideally a
   single sentence) which describes the business problem, the key stakeholders affected, and
   the reason why this is important."
   *TBS's own example:* "Department XYZ lacks a capability to manage the end-to-end client
   journey of Canadian citizens resulting in service 20% below standard and lost files."

2. **Current state or context.** "Elaborate on the context within which the problem occurs,
   and provide objective evidence, such as KPIs or metrics, that demonstrate the magnitude of
   the problem."

3. **Root cause.** "Identifying the root cause is important to ensure that any future action
   taken to resolve the problem will consider the causes of the problem and in the future not
   be subject to the same circumstances."

4. **Desired business outcome.** "A business outcome is the result of the outputs and/or
   capabilities being delivered by a project or programme and being used in day-to-day
   operations."
   *TBS's own example:* "Department XYZ is using a complete case management capability to
   manage interactions with all five of its clients segments, while delivering services on
   time and accurately in 95% of interactions, as well as exceeding the client satisfaction
   service standards."

5. **Future state.** "Describe what the department(s) envision as the future state in terms
   of people, process, information, and technology."

6. **Next steps.** "Provide a high level list of the anticipated next steps to resolve this
   problem."
<!-- lint-on -->

**Both of the examples TBS prints carry a number.** Sections 1, 2 and 4 all ask for
measurement in some form. A concept case with no figure anywhere in it is answering a
different question from the one on the page.

**Nothing in the template asks for a solution.** No product, no vendor, no cost estimate, no
schedule. Writing an answer into it is the common way to have it handed back.

---

## What the policy requires around the document

From Appendix B:

- **B.1.2, when it applies.** A digitally enabled project the department is willing to invest
  at least: **$2.5M** with no approved Organizational Project Management Capacity Class or
  class 1; **$5M** at class 2; **$10M** at class 3; **$15M** for National Defence; **$25M**
  at class 4.
- **B.1.3.** The deputy head ensures it is prepared **in accordance with the Concept Case
  Template** and approved by the business owner, at **assistant deputy minister level or
  above**.
- **B.1.4.1.** The business owner ensures the **departmental investment oversight body**
  reviews it, to confirm it merits inclusion in the departmental investment plan.
- **B.1.4.2.** The business owner **approves and submits** it to TBS for review by the
  **Chief Information Officer of Canada**.
- **B.1.5.** If it may become a joint or enterprise project, the **initiative lead** is the
  business owner and provides one concept case on behalf of every implicated department.

**Where it goes**, from the template itself: to TBS through the **program sector analyst**,
and to **OCIOPortfolios-PortefeuillesBDPI@tbs-sct.gc.ca**. The same mailbox takes questions.

**What comes back:** OCIO reviews every concept case and returns endorsement and feedback.

**Where it comes in the sequence:** before the business case, before any Treasury Board
submission, and before GC EARB. The architecture review board reviews after the concept case
review has already happened, so an initiative on this path goes through both.

---

## What we can write now, and what we cannot

Confirmed with Mariia on 14 September: the concept case is for **the self-assessment tool**,
which is what Dan asked for. Three sources carry the material, and all three are current.

- The tool's `README.md`.
- The standing requirements record, `Self-assessment tool/NOTES/requirements.html`.
- The backlog beside it, `NOTES/backlog.html`.

### Two things to settle before writing a word

**The template is pre-solution and we have already built a solution.** That is a reason to
put the prototype in the right box, and no reason to avoid the document. The prototype
belongs in *current state*, as evidence that the problem can be moved, and in *next steps*.
It stays out of *future state*, which has to be written as a capability in the four terms the
template names.

**At prototype scale this is nowhere near $2.5 million**, so Appendix B probably does not
compel a concept case at all. Submitting one anyway still earns OCIO endorsement and still
buys the early signal the template describes, and it is the instrument that turns a co-op
prototype into a departmental investment. Whether it is mandatory or voluntary changes who
has to sign, and how much the threshold questions below matter. Ask Dan which of the two he
is asking for.

### Section by section, what we hold

**1. Problem or opportunity statement.** Written already in substance, in three places.
These are the complaints behind it:

1. The GC EARB assessment is a PowerPoint template and a score deck built by hand.
2. The answers were never data.
3. The board is walked through slides.
4. Trend analysis across the portfolio is impossible for anyone.

One sentence drawn out of those is a morning's work.

**2. Current state or context.** Only partly held, and this is what can be evidenced
today:

- **176 questions** across four architecture domains, scored on an eleven-rung scale.
- **700 or more past assessments exist**, and they are buried in PowerPoint. Dan's own
  estimate is that a picklist drawn from them would match 99% of submitters.
- On a full submission the answers that fail to add up are **single digits out of 176**. An
  assessor reads all 176 to find fewer than ten.
- The instrument carries faults that only data exposes. The Business Architecture section
  weights **add to 80 where 100 is expected**. Of the nine categories TBS itself named,
  **Accessibility and Official Languages are asked about in none of the 176 questions**.

That last pair is the strongest evidence in the file, because it is a gap in the current
instrument that the current instrument cannot see.

**3. Root cause.** Three of them, and they come apart cleanly, which is what section 3 is
asking for.

- **The instrument was a document**, so the answers were never data.
- **Categorisation was locked to the four TOGAF domains**, so four of the nine categories had
  nowhere to appear even when a question asked about them.
- **There was no store**, so there was no portfolio view and no trend.

**4. Desired business outcome.** Needs a number, and TBS's own example carries one. We can
write the shape: assessors reading only the anomalies out of 176, the board triaging a list,
twelve months of comparable data. The target figures are Dan's to set.

**5. Future state.** Held, and it has to be rewritten upward from a product into a capability.

- **People.** Submitters answer at home, assessors audit the exceptions, the board triages.
- **Process.** One instrument, one store, and an append-only record of every score change
  with its reason.
- **Information.** One structured record per assessment against a versioned question set,
  plus a CSV row for trend.
- **Technology.** Unclassified only, one page and one endpoint, nothing installed on a
  departmental laptop.

**6. Next steps.** Already exists as a list with owners, in `NOTES/backlog.html` and in the
twenty open requirements. It needs filtering down to the handful an ADM would care about.

### What is missing, and who holds it

**Operational evidence, which only Dan can supply.** Section 2 asks for KPIs or metrics and
we hold none of the operational ones:

- Assessments per year.
- Elapsed time from submission to endorsement.
- Assessor hours per assessment.
- How much of that time goes to answers that turn out fine.
- How many departments are overdue.

The 700-odd past assessments are already the largest outstanding item on his list, for the
dropdowns. The same data answers this section. Worth telling him, because it makes one ask
serve two purposes.

**The initiative and its money.** Its name, TBS's own Organizational Project Management
Capacity Class, and what the department is willing to invest. Without the class and the
figure, the mandatory-or-voluntary question cannot be settled.

**The ADM business owner.** A name, and a signature. Dan is not it unless he is at that level.

**The route in.** The departmental investment oversight body, and the program sector analyst
the template says to submit through. Both are internal, and Dan will know or know who does.

**Target numbers for section 4.** What better looks like, quantified, which is Dan's to
decide.

### How this lines up with the requirements record

`P4` in the requirements, *which initiatives have to submit one*, has been open with Dan as
owner since the beginning. His own words on 1 September: "For X send us the results. I don't
know what X is." That is the same unanswered question as the threshold above, seen from the
other end. Put both to him together.

---

## Sources

- [Appendix B: Mandatory Procedures for Concept Cases for Digitally Enabled Projects](https://www.tbs-sct.canada.ca/pol/doc-eng.aspx?id=32593&section=procedure&p=B)
- [Policy on the Planning and Management of Investments](https://www.tbs-sct.canada.ca/pol/doc-eng.aspx?id=32593)
- [Concept case template, English](https://www.tbs-sct.canada.ca/pol-cont/32593-eng.docx)
- [Modèle de cas conceptuel, français](https://www.tbs-sct.gc.ca/pol-cont/32593-fra.docx)
- [Appendix C of the archived 2021 policy, which the template still cites](https://www.tbs-sct.canada.ca/pol/doc-eng.aspx?id=32693&p=C&section=procedure)
