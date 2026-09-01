# The plan

**Layers are the spine. The three views are three groups inside the interface layer.** Layers are
what the work is; views are who it is for; a list is not split twice. Dan already framed it as
layers, so this is his own vocabulary.

Classification gets no section. It is a property reaching into every layer: an engine rule for
which engine runs, an interface job for the picker and the frame, a hosting constraint on what an
intake accepts, and a process item for a spill. Giving it a section builds a second index over
items that already live somewhere, and the two drift.

Every item appears exactly once. Owner is either **Dan** or **us**.

---

## 1. The question set, Dan's work

First, because he called it the biggest remaining piece and because the plan's most useful
property is showing him which items are his.

| Item | Why | Suggested |
|---|---|---|
| Decide the answer type for every question | Binary questions are being scored 0 to 10 | He marks a column in the workbook; the importer carries it |
| Mark the show stoppers | A no on some should end the assessment | One more column |
| Set per-question criticality | Distinct from section weight, and he wants both | Normal, red flag, show stopper |
| Fix the section weights totalling 80 | His error, confirmed in his own words | He corrects the sheet, we re-import |
| Add security and privacy questions | Neither is represented, and a security review is asking | After the topics decision |
| Bring in the dropdown answers | Still no picklists anywhere | Needs the 700 or more past assessments |

## 2. The engine, ours

| Item | Why | Suggested |
|---|---|---|
| Multiple answer types | The clearest defect Dan named | A `type` field, `scale` as default, so nothing breaks |
| Topic metadata and per-topic roll-up | Security and privacy visible without a fifth silo | Four domains stay the scoring spine, topics are a second axis |
| Show-stopper handling | An assessment that fails one should stop | Its own result screen naming the question |
| The engine switch, online or local | The marking decides whether bytes ever leave | `markingProblems()` becomes the one authority for saving and submitting |
| Submission as a capability | Same build, two deployments | The hosting turns it on; a file-served copy cannot submit |
| `formatVersion` to 2 | New fields, old files still readable | Reader accepts 1 and 2. Adds `submissions`, `markingWarning`, `incidents` |

## 3. The interface, ours

### 3a. The submitter's view

| Item | Why | Suggested |
|---|---|---|
| Unclassified as one big tile, the six behind a challenge | Unclassified is the default and the rare path must not tax it | Nothing preselected: a marking is a declaration somebody presses |
| The challenge screen | Dan wants people pushed down to unclassified | Asked once, on change. A returning marked draft is never re-interrogated |
| The two families, Protected and Classified | Her ask, and it is the real GC structure | Native fieldsets, one radio group, seven inputs, one tab stop |
| The frame changes with the engine | Online and local are different things and must not look alike | `data-engine="online"` or `"local"`. Six tokens, four CSS blocks |
| Escalation and de-escalation dialogs | Both directions have consequences worth naming | Generalise `confirmDestructive`, which already has the dialog, the focus trap and the test fallback |
| The Protected C interstitial | Dan asked for it, unmissable | Full screen, not a dialog. Records `markingWarning` in the file |
| Collapse three pickers to one | The footer's seven pills are a one-click bypass around all of the above | One button, "Mark this assessment" |
| The filled view states the marking | Seven chips invite idle re-picking of the most consequential field | Unclassified: a small plain row. Above: a full-width plate |

### 3b. The assessor's view

| Item | Why | Suggested |
|---|---|---|
| Authentication, mandatory | It is their name against a disputed number | Open on how. Until then, a required typed name, and say plainly that it is not verified |
| Justification required on a changed score | Dan's rule | Block the audited save while any change is unexplained |
| Accept-all per section | He asked for it by name | Stamps agreement, touches no numbers |
| Assessor recorded per question | Two assessors on one high-profile file | Move the reviewer field down a level |
| The edit exchange, visible | She wants disagreement traceable: I change with a reason, you change back with yours | An append-only list per question. Default display two facts: it was edited, and by whom. The full exchange on request |
| Evidence read-only | Dan: "by no means" | Already true. Add a test so it stays true |

### 3c. The executive view, and the possible fourth

| Item | Why | Suggested |
|---|---|---|
| Build the executive view | Dan needs it more than the per-file view | Date range, weakest first, name, score, summary, assessor |
| A system administrator view | Placeholder. Nobody knows what it does yet | Recorded so the roles matrix is complete. Likely deletion, withdrawal and re-assignment |
| Reviewer of reviewers | Dan floated it and left it optional | Not now |

## 4. Data and hosting

| Item | Why | Owner | Suggested |
|---|---|---|---|
| Repo in the GC GitHub organisation | Dan asked; it gates everything public | us | Step one, message Nick. Step two, create it and move the code |
| README points at the live site, first line | Nobody should have to hunt for the thing itself | us | Done |
| Public deployment for unclassified | Openness is the stated default | us | Pages from that repo |
| Somewhere for a submission to arrive | Pages serves and accepts nothing | **TBS** | Blocked. Meanwhile the executive view reads a folder |
| Internal instance for Protected and above | Half of the two-deployment picture | TBS | Same build |
| Immutability and authorisation | Dan's own condition for data living online | **Dan** | Blocked. Build nothing against a guess |

## 5. Process, for people and not the tool

| Item | Why | Owner |
|---|---|---|
| How John's team validates evidence | Their job changes completely and Dan expects resistance | Dan and John |
| What the intake accepts, and from whom | Dan called it a protocol for the humans | Dan |
| Which initiatives must submit | "I don't know what X is" | Dan |
| The spill protocol | What a submitter does when a marking rises after submission | us to draft, Dan to approve |

## 6. Decisions deferred

A register, not a backlog. Three fields each: who owns the answer, what it blocks, what we do
meanwhile. Kept separate because a row with no owner makes a plan look stalled, and because Dan
asked what needs doing, while this is the list of what he owes us.

| Question | Owner | Blocks | Meanwhile |
|---|---|---|---|
| Who may edit a stored assessment | Dan | The intake | Nothing built against a guess |
| Where a submission arrives | TBS | Phase 4 entirely | Executive view over a folder |
| Verifying an assessor's identity | Dan | Real authentication | Typed name, labelled unverified |
| The exact refusal threshold | Dan | Nothing | Recommend Protected C |
| Which initiatives must submit | Dan | Nothing we build | Ignore for now |
| Notification triggers and recipients | Dan | Notifications | Never discussed. GC Notify is the route |
| Does a two-topic question score twice | Dan | The topic roll-up | She thinks yes, since weights differ per topic. Ask him |
| What classification the intake accepts | Dan and John | The internal instance | Assume unclassified only |

**Closed since last time**, and the register shrank because of it: deletion is withdraw and never
hard delete; one build with submission as a hosting capability; and before an intake exists the
authoritative copy is the file the assessor holds, with the tool saying so.

---

## The classification design, settled

**Nothing is preselected.** A marking is a declaration somebody presses. `overviewProgress`
already refuses to advance without one.

**Two engines, not seven.** Protected B and Top Secret behave identically: a local file travelling
by encrypted email. A middle palette would signal a difference that does not exist.

**Drafts never go online.** Autosave stays a `localStorage` write. Submission is one deliberate act
on the last page. This is the sentence the whole design rests on: with it, raising a marking
mid-assessment has nothing online to reckon with, in nearly every case.

**Nothing submitted is ever deleted, and there is no delete button.** Three reasons, each
sufficient. It cannot work: a submission may already be in a backup, a git history, a fork, a cache
or an assessor's download. Dan's own condition for online data is immutability. And a delete button
frames a raised marking as a form to correct, when it is an incident to report. What happens: the record
is marked withdrawn, the tool produces a manifest of what went and who to tell, and the local
session switches to the local engine.

**The tool never relabels a stored record.** A marking on a stored record is a statement about what
it contains, and this page does not control that record.

**Lowering a marking is gated harder than raising one.** Raising is over-caution and costs reach.
Lowering is how Protected B reaches a store accredited for unclassified.

**The gate is advisory, and that goes in writing.** Dan said it himself: somebody can fill it in at
a lower classification and simulate the answers. This is a red flag, and it is not a control.

### Two places this overrules what was asked for, with reasons

**Unclassified gets smaller in the filled view, not bigger.** Big in the picker means easy to hit
and obviously the way through. Big in the filled view means alarming. Being the default means
costing the least attention; the exception earns the plate.

**No gold, no VIP palette for classified.** Gold on black reads as premium. Local-only is the
degraded path: Dan does not get the data and somebody has to send an encrypted email. A local frame
that looks better than the online one is an interface arguing for classifying, against the whole
point of the change. Oxblood chrome and a hazard band instead.

### The catch that would have been missed

The header and footer paint their text from the body ink tokens, so a dark chrome in light mode
makes both disappear. Six declarations switch to new `--chrome-ink` tokens. It looks correct in dark
mode while being broken in light mode, which is how it gets missed. A defect found on the way past:
`--ink-3` on today's light chrome measures 3.25:1 and already fails.
