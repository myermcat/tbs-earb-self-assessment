# Concept case draft content

Source text for the filled template. Every blank is marked `[TO CONFIRM ...]` and every
provisional figure is marked `[PROVISIONAL ...]`. The builder reads this file, so the words
change here and nowhere else.

---

## Header

**Proposed initiative:** Government of Canada Enterprise Architecture assessment as a data
collection. [TO CONFIRM, Dan: the name the initiative should carry.]

**Department:** Treasury Board of Canada Secretariat, Office of the Chief Information Officer.

**Assistant Deputy Minister business owner:** [TO CONFIRM, Dan: the name and title of the ADM
who approves and signs. Appendix B B.1.3 requires assistant deputy minister level or above.]

**Date:** [TO CONFIRM: the date of signature.]

---

## 1. Problem or opportunity statement

The Government of Canada Enterprise Architecture assessment is collected on a PowerPoint
template and scored by hand, leaving GC EARB and departments with more than 700 completed
assessments and no comparable data.

---

## 2. Current state or context

**The instrument.** 176 questions across four architecture domains, each scored on an
eleven-rung scale from Absent to Symbiotic. It is issued as a PowerPoint template and
returned as one. The score deck the board reads is built by hand from those returns.

**The volume.** More than 700 completed assessments exist. Every answer inside them is a
sentence on a slide, so none of it can be totalled, compared across departments or tracked
over time without somebody retyping it first. Asked what a picklist drawn from those past answers would
cover, the programme's own estimate was 99% of submitters.

**The audit effort.** On a full submission the answers that fail to add up run to single
digits out of 176. An assessor reads all 176 to find them.

**Faults in the instrument that only data exposes.** A prototype built during a co-op term
imported the question set as structured data, and two defects surfaced immediately.

1. The Business Architecture section weights **add to 80 where 100 is expected**, so every
   score in that domain has been computed against a total that is short by a fifth.
2. Of the nine categories the Secretariat itself named, **Accessibility and Official Languages
   are asked about in none of the 176 questions**. A sweep of the full set found official
   languages in two questions and accessibility in three, each time in an unrelated sense.

Both defects had been carried for years inside a format that gives nobody a way to look.

**What is still to be measured.** Five figures are held by the programme and are needed to
size the problem in full:

1. Assessments completed per year. [TO CONFIRM, Dan]
2. Elapsed time from submission to endorsement. [TO CONFIRM, Dan]
3. Assessor hours per assessment. [TO CONFIRM, Dan]
4. The share of those hours spent on answers that turn out to be sound. [TO CONFIRM, Dan]
5. Departments overdue for an assessment. [TO CONFIRM, Dan]

---

## 3. Root cause

Three causes, and each one survives the removal of the other two.

1. **The instrument is a document.** A PowerPoint file records an answer as a sentence on a
   slide. Nothing in it can be summed, weighted, compared or versioned, so the assessment
   produces a verdict and never produces data.

2. **Categorisation is fixed to the four architecture domains.** The domains come from TOGAF,
   and a question belongs to exactly one. A concern that cuts across them has nowhere to
   appear. Security questions divide across all four domains, so a department weak on security
   shows four scores that each look acceptable. The same structure is why accessibility and
   official languages were never asked about.

3. **There is no shared store.** Each assessment is a file that travels by attachment. A
   submitter and an assessor work from different copies, and the programme holds no portfolio
   view.

---

## 4. Desired business outcome

The Secretariat runs the enterprise architecture assessment as a data collection, and four
things become true of it.

**A department's answers arrive as data.** They are recorded against a named version of the
question set, so an assessment can be re-scored and compared later.

**An assessor audits the exceptions.** The reading effort falls from 176 questions to
[TARGET TO CONFIRM, Dan: the number of questions an assessor should expect to read], and an
assessment completes within [TARGET TO CONFIRM, Dan: elapsed days from submission to
endorsement].

**GC EARB opens its review on a ranked list** computed from every submission the programme
holds.

**After twelve months the Secretariat can answer three questions it cannot answer today:**
the average score per question, the average by department, and the strongest and weakest
evidence cited against each question.

---

## 5. Future state

**People.** A department answers where the knowledge already is, in the team that runs the
service, over as many sittings as it takes. An assessor audits the exceptions and justifies
every score they change. The board triages a ranked list. The programme holds an admin view
over the whole portfolio.

**Process.** The instrument is issued and answered in the same place. A score an assessor changes
carries a reason and appends to a record that is never overwritten, so two assessors who
disagree both leave an account. An assessment names the version of the question set it was
answered against, so a revised question set is a new version and never a silent edit.

**Information.** One structured record per assessment, plus one row per assessment for trend.
Every question carries its domain and any number of named categories, so the same answers can
be re-cut across all nine categories the Secretariat named, without adding a fifth
architecture domain. Evidence is a link to the artefact where it already lives.

**Technology.** Unclassified content only, stated as a rule and enforced in the instrument. A
page and a single write endpoint. Nothing is installed on a departmental laptop, because
departmental laptops cannot install anything. [TO CONFIRM, Dan and TBS: where the production
store lives, and under whose account.]

---

## 6. Next steps

**Decisions needed before anything is built for production.**

1. Which initiatives are required to submit an assessment. Open since the start of the work.
   [TO CONFIRM, Dan]
2. Whether this concept case is submitted as a requirement under Appendix B or submitted
   voluntarily. The Appendix B trigger is what the department is willing to invest, and that
   figure has not been set. [TO CONFIRM, Dan]
3. The Secretariat's Organizational Project Management Capacity Class, which fixes the
   threshold at $2.5M, $5M, $10M or $25M. [TO CONFIRM, Dan]

**Work that a funded initiative would carry.**

4. Release the 700 completed assessments as data, which supplies the answer picklists and the
   baseline figures missing from section 2.
5. Stand up a production store owned by the department. The prototype store is held in a
   personal account and is scheduled for deletion at the end of the current work term.
6. Move the code into the `canada-ca` organisation.
7. Translate the question set, its descriptions and the eleven-rung scale into French.
8. Settle the assessment routing thresholds, which are marked provisional everywhere they
   appear in the prototype today.
9. Confirm the category assignment for every question, replacing the provisional grouping
   derived from question wording.

**Sequence after this document.** Departmental investment oversight body review. Then
approval and submission by the business owner, through the program sector analyst and the
OCIO portfolios mailbox. Then review by the Chief Information Officer of Canada. A submission
to GC EARB, if one is required, follows that review.
