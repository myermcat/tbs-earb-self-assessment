# Concept case: what it is, where it came from, what we still need

Research note, 14 September 2026. Written after Dan named the concept case as the priority.

---

## The access question, settled

**The template is public. Nothing about it is restricted.** Every worry worth having was
checked and none of them holds:

| Checked | Result |
|---|---|
| Classified? | No. The file's own metadata says so: `SECCLASS = CLASSU`, `TBSSCTCLASSIFICATION = UNCLASSIFIED`, `TBSSCTVISUALMARKINGNO = NO`. Those properties are written by TBS's own Titus labelling tool, so this is TBS's marking, not a guess from reading it. |
| Behind a login? | No. Plain HTTP GET, 200, no cookie, no account. |
| On the GC network only? | No. Served from the open internet, off a home connection. |
| GCpedia or GCcollab? | Not needed. Neither holds it. It is linked directly from the policy. |
| Permission to use it? | None needed. It is the instrument the policy points at. |

Both official languages are published and both are now held here, in
`Template (as published by TBS)/`.

- English: `https://www.tbs-sct.canada.ca/pol-cont/32593-eng.docx`
- French: `https://www.tbs-sct.gc.ca/pol-cont/32593-fra.docx`

Linked from **Appendix B: Mandatory Procedures for Concept Cases for Digitally Enabled
Projects**, in the *Policy on the Planning and Management of Investments*
(`doc-eng.aspx?id=32593&section=procedure&p=B`).

One note on retrieval, in case somebody repeats this. `tbs-sct.canada.ca` was returning
500s and WAF rejections for most of the afternoon of 14 September. The policy text came
from the Internet Archive snapshot of 16 March 2026; the two template files came from the
live site on the `tbs-sct.gc.ca` host with an ordinary browser user agent and a referer.
The site being unreliable is not the template being restricted.

---

## Two names for the same thing, and the template is behind

The template's own body says *"Mandatory Procedures for Concept Cases for **Digital**
Projects"*. That was Appendix C of the 2021 policy, which is archived. The live
requirement is Appendix B and says **digitally enabled** projects.

The file was last saved 7 August 2024 and still carries the older wording. It is the file
the current policy links to, so it is the right file to use. Worth knowing before somebody
notices the mismatch and assumes we pulled a stale copy.

---

## What the template actually contains

Six free-text sections, a signature block, and roughly one page of front matter. That is
all of it. There are no scored fields, no dropdowns, no financial tables, no architecture
annex.

**Header block**

Proposed initiative · Department · Assistant Deputy Minister business owner · Date ·
Signature.

**The six sections, with the instruction TBS prints under each**

1. **Problem or opportunity statement** — "Provide a succinct problem statement (ideally a
   single sentence) which describes the business problem, the key stakeholders affected,
   and the reason why this is important."
   *TBS's own example:* "Department XYZ lacks a capability to manage the end-to-end client
   journey of Canadian citizens resulting in service 20% below standard and lost files."

2. **Current state or context** — "Elaborate on the context within which the problem
   occurs, and provide objective evidence, such as KPIs or metrics, that demonstrate the
   magnitude of the problem."

3. **Root cause** — "Identifying the root cause is important to ensure that any future
   action taken to resolve the problem will consider the causes of the problem and in the
   future not be subject to the same circumstances."

4. **Desired business outcome** — "A business outcome is the result of the outputs and/or
   capabilities being delivered by a project or programme and being used in day-to-day
   operations."
   *TBS's own example:* "Department XYZ is using a complete case management capability to
   manage interactions with all five of its clients segments, while delivering services on
   time and accurately in 95% of interactions, as well as exceeding the client satisfaction
   service standards."

5. **Future state** — "Describe what the department(s) envision as the future state in
   terms of people, process, information, and technology."

6. **Next steps** — "Provide a high level list of the anticipated next steps to resolve
   this problem."

Note what sections 1 and 2 ask for and what section 4 asks for. Both TBS examples carry a
number. A concept case with no measurement in it is answering a different question from
the one on the page.

Note also what is **not** asked for: no solution, no vendor, no cost estimate, no schedule.
The template is deliberately pre-solution, and writing a solution into it is the common way
to get it handed back.

---

## What the policy requires around the document

From Appendix B, verbatim in substance:

- **B.1.2 — when it applies.** A digitally enabled project the department is willing to
  invest at least: **$2.5M** with no approved Organizational Project Management Capacity
  Class or class 1; **$5M** at class 2; **$10M** at class 3; **$15M** for National Defence;
  **$25M** at class 4.
- **B.1.3** — the deputy head ensures it is prepared **in accordance with the Concept Case
  Template** and approved by the business owner, at **assistant deputy minister level or
  above**.
- **B.1.4.1** — the business owner ensures the **departmental investment oversight body**
  reviews it, to confirm it merits inclusion in the departmental investment plan.
- **B.1.4.2** — the business owner **approves and submits** it to TBS for review by the
  **Chief Information Officer of Canada**.
- **B.1.5** — if it may become a joint or enterprise project, the **initiative lead** is the
  business owner and provides one concept case on behalf of every implicated department.

**Where it goes**, from the template itself: to TBS **through the program sector analyst**,
and to **OCIOPortfolios-PortefeuillesBDPI@tbs-sct.gc.ca**. Same mailbox for questions.

**What comes back**: OCIO reviews every concept case and returns endorsement and feedback.

**Where it sits in the sequence**: before the business case, before any Treasury Board
submission, and before GC EARB. The architecture review board comes after the concept case
review, not instead of it.

---

## What we can write now, and what we cannot

Assuming the concept case is for the enterprise architecture assessment work — see the open
question below, because this changes if it is not.

**We already hold the material for four of the six sections.**

| Section | Where the material is |
|---|---|
| Problem or opportunity | The self-assessment tool's own README states it: a PowerPoint template and a score deck built by hand, no trend analysis across the portfolio, assessors auditing everything rather than the anomalies. |
| Root cause | Same source. The instrument was a document, so the answers were never data. |
| Future state | The tool is a working demonstration of it: people, process, information and technology are all evidenced by something that runs. |
| Next steps | `Self-assessment tool/NOTES/backlog.html` is already a next-steps list with owners. |

**Four things are missing, and three of them can only come from Dan or his ADM.**

1. **Objective evidence for the current state.** Section 2 asks for KPIs or metrics, and
   TBS's own examples put a number in both the problem and the outcome. We have none. How
   many assessments a year, how long each takes end to end, how much assessor time goes to
   answers that turn out fine, how many departments are overdue. Dan's past assessment data
   is already on the outstanding list for the dropdowns; the same data answers this.

2. **The named initiative and its money.** The threshold in B.1.2 is what makes a concept
   case mandatory rather than optional. Nobody has said what this initiative is called, what
   TBS's own Organizational Project Management Capacity Class is, or what the department is
   willing to invest. Without the class and the number we cannot say whether this is
   required or voluntary — and a voluntary one is still worth writing, but it changes who
   has to sign.

3. **The ADM business owner.** A name, and a signature. Dan is not it, unless he is at that
   level.

4. **The departmental investment oversight body and the program sector analyst.** Both are
   named routes in the policy and both are internal knowledge. Dan will know, or know who
   does.

Nothing here is blocked on us. The document is one page of front matter and six boxes, and
the writing is a day's work once the evidence and the names arrive.

---

## Sources

- [Appendix B: Mandatory Procedures for Concept Cases for Digitally Enabled Projects](https://www.tbs-sct.canada.ca/pol/doc-eng.aspx?id=32593&section=procedure&p=B)
- [Policy on the Planning and Management of Investments](https://www.tbs-sct.canada.ca/pol/doc-eng.aspx?id=32593)
- [Concept case template, English](https://www.tbs-sct.canada.ca/pol-cont/32593-eng.docx)
- [Modèle de cas conceptuel, français](https://www.tbs-sct.gc.ca/pol-cont/32593-fra.docx)
- [Appendix C of the archived 2021 policy, the template's own wording](https://www.tbs-sct.canada.ca/pol/doc-eng.aspx?id=32693&p=C&section=procedure)
