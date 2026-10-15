# Open questions we cannot answer without Dan

Things that came up while building, where a decision was made to keep moving and the decision
is not ours to keep. Each one says what the tool does today, so nothing is blocked, and what
would change if the answer is different.

Ordered by how much rework a different answer costs.

The first part is direction: what the tool is for and who it is for, written on 15 October
because we have been building without the answers and the gaps are starting to decide things
for us. None of it needs a meeting. Every one can be answered in a sentence, and each says what
the tool does today so that no answer is urgent.

The second part, from number 10 on, is about the instrument itself, and most of it predates
this.

---

# Part one: direction

## A. What happens after an assessment is finished

**A1. Where does a finished assessment go?** Into a board meeting, into a report, into a
conversation with the department, or nowhere in particular? Today it goes into a list that
assessors read and a CSV somebody can export. Nothing leaves the tool on its own.

**A2. Is this a gate or a conversation starter?** Does a department have to reach a number
before it may proceed, or is the score the opening of a discussion? Everything about
thresholds, refusals and how hard the tool argues with a submitter follows from this, and we
have built it as a conversation starter by default.

**A3. Does an assessment ever come back round?** After a board conversation, does the
department revise and resubmit against the same record, or is it one-shot? Today it is
one-shot: there is one assessment, it can be edited for ever, and nothing records a round.

## B. Who may see what

**B1. Should every assessor see every department's submission?** Today any signed-in assessor
sees the whole pool, including other departments' unfinished drafts. The alternative is
assignment, which is more machinery and a different permission model.

**B2. Can a department take its own submission back?** Today it cannot: once sent, only an
assessor can withdraw it from the counting, and the department cannot delete it at all.

**B3. Is "assessor" one role or two?** There is a screen with admin-only actions on it that
every assessor can currently reach. Is there a TBS-only tier above assessor, or is everybody
the same?

## C. The dashboard, and what you would do about a bad number

This is the one where your answer changes what gets built next, and we cannot guess it.

**C1. What are the three decisions you expect to make with this data in a year?** Not what
would be interesting to see - what you would actually decide.

**C2. For each one: if the number came back bad, what would you do on Monday?** A number with
no answer to that is a report rather than a dashboard, and we would rather not build it.

**C3. Which matters more to you: how departments are doing, or whether the questions are
working?** They are different screens. Today the tool shows the first and has just started
showing the second.

**C4. How many assessments do you expect in the first year?** Averages by department, weakest
questions across government and best evidence per question are all filed and none of them mean
anything at ten records. The number decides when they are worth building.

## D. The instrument, at the level of what it is for

**D1. When an assessor changes a self-score, what is that telling you?** That the department
was wrong, or that the question was unclear? The tool now measures the gap and shows which
questions are furthest apart - it matters which of the two you read it as.

**D2. Should a department that scores itself low on everything be flagged?** Today it is not.
Every check we have looks for over-claiming, so a submission scoring 1 to 3 across all 176
questions with no evidence attached produces no findings at all, while a confident one produces
a hundred and fifty. We think that is backwards and it is your call.

**D3. Is the routing threshold a real number?** It is drawn between two numbers you gave at
different times, nobody has confirmed it, and every screen that uses it says so.

## E. Who fills it in

**E1. Is a submission written by one person or by a team?** Today it is one browser, one draft,
with the access code as the only key. If two people are meant to work on it at once, that is a
different design and a larger piece of work.

**E2. Who tells the department somebody has looked at it?** Today nobody does: the tool sends
nothing and notifies nobody, by deliberate choice, and the submitter is told to tell their
assessor themselves.

## F. Timing

**F1. When does this need to be in front of a real department?** Everything above is answerable
in a sentence; this one decides which of the answers we act on first.

---

# Part two: the instrument

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
