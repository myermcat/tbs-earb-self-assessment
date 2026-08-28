# Open questions we cannot answer without Dan

Things that came up while building, where a decision was made to keep moving and the decision
is not ours to keep. Each one says what the tool does today, so nothing is blocked, and what
would change if the answer is different.

Ordered by how much rework a different answer costs.

---

## 1. Is answering every question mandatory?

**Today:** no. A partial assessment saves and scores. An unanswered question leaves the sum
and does not count as a zero, so a third-complete assessment shows the score of the third that
was answered, and the results page says so with the percentage beside it.

**Why it matters:** if a submission has to be complete, the tool should refuse to produce a
routing suggestion from a partial one, and the save gate needs a second condition.

**If the answer is yes:** small change. Block the routing band under a completeness threshold
and say why.

---

## 2. Is the justification field required?

**Today:** no. A score with no reasoning saves, and raises a flag for the assessor and does not block
the submitter.

**Why it matters:** it is the difference between a form that is quick and a form that is
useful. Requiring it on all 176 would be brutal; requiring it on nothing means an assessor
audits numbers with no words behind them.

**Worth putting to him as three options:** never required; required when the score is 8 or
more, which is where the claim is strongest; required only where the assessor asks for it
after a first pass.

---

## 3. Is evidence required, and required for what?

**Today:** no, and a high score with nothing cited raises the highest-severity flag and does not block.

**Why it matters:** this is the whole premise. Dan said the scale is really a maturity of
evidence scale, so a 10 with nothing attached is a contradiction the tool currently tolerates.

**Related, and his call:** should a question marked **not applicable** need a reason? Today it
takes no explanation at all, and "not applicable" is the cheapest way to make a low score
disappear. A one-line reason would cost the submitter almost nothing and would tell an assessor
whether to believe it.

---

## 4. Does folding the evidence away reduce how much of it arrives?

**Decided for now, and worth watching.** Reasoning and evidence fold behind "Add reasoning or
evidence" on every question, and open on their own wherever something is already written, so
nothing anybody wrote can hide behind a closed fold. The score is the only thing always on
screen, because the score is the answer.

**The open risk:** a fold makes evidence feel optional, and it is exactly the thing Dan most
wants to arrive. The alternative is 176 questions each showing a textarea and a file control,
which is most of the page given to fields most questions will not use.

**What would settle it:** how much evidence actually arrives in the first dozen real
submissions. If it is thin, unfold it for high scores, where the claim is strongest.

---

## 5. Should the lifecycle stage change which questions appear?

**Today:** stage changes the weighting, and every question is asked of everybody. Current-state
sections count for a quarter at discovery, because there is no current state to describe.

**Why it matters:** 176 questions is a long form. If a discovery team were asked 90
questions and not 176, that is the single biggest usability win available, and it costs nothing to
build once he says which questions are out of scope at which stage.

---

## 6. The routing thresholds, and what happens either side of 3.0

**Today:** 8.5 showcase, 6.0 hall pass, 3.0 routine, below that attend. These are the numbers
he said out loud on 26 August. They are in no document and nobody has signed them off.

**The 3.0 line is not his.** Checked against the transcript: he named three numbers, and 3 was
not one of them. He said above roughly 60% is a hall pass, around 8.5 is worth showcasing,
around 2 out of 10 means come and explain, and *"I don't really care for the 4, 5, 6."* The
line between "come and explain" and "no board time" was interpolated by us to bridge the 2 he
named and the 4 he named. The rubric now records that, and the tool says so on screen wherever
that band is shown.

**Worth asking him:** where does the bottom band actually end? At 3, at 4, or at 5? A 3.5 is
between Emergent and Defined on his own scale, and currently gets told no board time is needed.

**And the harder question: a self-scored threshold can be cleared on purpose.** Moving one
answer from a 6 to an 8 can carry a whole assessment over the hall-pass line, and nobody has to
lie to themselves very hard to do it. Three defences, none of which need policy:
the audit sample above; the existing flag for a high score with nothing cited; and a new flag
when the total rests within 0.35 of the threshold that decided the routing, which is a margin
one answer wide. That flag is built. Whether the thresholds should be published to submitters
at all is his call, and there is a real argument either way: hiding them removes the target,
showing them is the honest thing and lets people improve deliberately.

**Also his call:** whether a hall pass is audited anyway. Recommend a random sample from the
first day, which is also how the calibration data for the AI audit accumulates.

**Already changed, and not his call:** the tool no longer offers any routing suggestion until
most of the assessment is answered. A suggestion calculated from a fifth of the questions is a
guess wearing a suggestion's clothes.

---

## 7. Business Architecture is twenty weight points short

His workbook gives the six Business sections weights of 5, 25, 10, 10, 10 and 20, which is 80.
The other three domains each total 100.

**Today:** the missing twenty points are shared out across the six sections in proportion, so
the domain still scores out of 10 and the page shows the shares, which add to 100. The raw
weights are kept in the rubric because they are his.

**What we need from him:** whether a seventh section was left out of the export. The framework
deck has one the CSV does not, "Defining the Business Problem" at 5%, and even with it the
total reaches 85.

---

## 8. The 700+ past assessments

Still the largest gap in the whole project. Every dropdown depends on them, and there are
currently no dropdowns at all, so all 176 questions are free text plus a number. His own words
were that 99% of submitters would match a list drawn from the existing answers.

---

## 9. Where the Digital Lifecycle Guide lives

The stage cards want a link to the guide, at low visual weight, ideally one page per sub-phase.
`dlgBaseUrl` in the rubric is empty, so the links render as plain text. One URL fills it.
