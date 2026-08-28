# Build brief

The requirements, extracted from the 2026-08-26 meeting, and what is done.

| # | Requirement | State |
|---|---|---|
| R1 | Take-home self-assessment, scored by the submitter | done |
| R2 | Evidence attached, come-as-you-are, no new artefacts invented for TBS | done - attached or pointed at |
| R3 | Score means maturity of evidence, not maturity of opinion | done, via the anchored ladder |
| R4 | Structured data out, every answer a referenceable field | done, JSON + CSV |
| R5 | Dropdowns from the real answer distribution instead of free text | **mechanism done, no picklists yet** - needs the 700+ assessments |
| R6 | Lifecycle stage captured, and expectations vary by stage | done, with stage multipliers |
| R7 | Assessor review with drill-through to evidence | done |
| R8 | Triage by score, board time only for the exceptional | done, thresholds unconfirmed |
| R9 | Board format flips - 5 to 7 minutes, members interrogate the data | out of scope for the tool |
| R10 | Doubles as a maturity roadmap for the submitter | done, "your weakest five" |
| R11 | Works offline, nothing has to leave their side | done, and enforced by CSP |

## Dan's three stages

1. **Self-assessment.** Built.
2. **Human audit against evidence.** Built. Self-score and audited score are stored side by
   side in the same file, which is what makes stage 3 possible later.
3. **AI does the audit, assessors agree or adjust.** Not built, deliberately. It is a
   function over the same structured payload, so it is an addition rather than a rebuild.
   It also needs the stage-2 calibration data - self-score against audited score - which
   only accumulates once stage 2 is running.

## Deliberately not built yet

- **A cross-portfolio analytics dashboard.** With three test submissions a dashboard is
  decoration. The CSV export gives Nick and Allison trend analysis in Excel on day one,
  which is more than they have now. Build the in-app version once real data exists.
- **Stage 3 AI audit.** See above.
- **Anything that sends a file anywhere.** The submitter sends it, through a channel that
  already exists and is already accredited.
- **Tamper-evidence on the saved file.** Dropped, after Mariia asked why a submitter would
  need to edit the JSON. They would not - they can set any score they like in the form
  itself, so hand-editing gains them nothing a hash would catch. The only threat a hash
  addresses is alteration after the file leaves the submitter, which the existing mail or
  document channel already covers. Not worth building.

## Evidence and marking, settled 2026-08-28

Dan: *"am open to options on evidence collection... it would be useful to have evidence right
away don't you think. to not need to email people back."* So evidence is attached, not just
referenced.

- Attachments live inside the assessment JSON as base64, so one saved file is the whole
  submission and the assessor opens the evidence in place. 15 MB per file, a warning past
  20 MB total, a hard stop at 50 MB.
- Pointing at an artefact instead of attaching it stays available, for a live dashboard, a
  system, or anything held above the file's own marking. A high score backed only by a
  pointer raises its own flag for the assessor.
- **Marking is a hard gate, per Dan.** The file carries one marking and each attachment
  carries its own. Save is refused until the file is marked and every attachment is marked,
  and refused again if any attachment is marked higher than the file. Individual scores are
  not marked - a number is not sensitive; what can be is the text somebody wrote and the
  files they attached, which is how a real GC document is marked.
- The marking shows as a banner at the top and bottom of the page and on every printout.

## Notifications

A page with no network cannot send email, and should not pretend to. Two layers:

- **Now:** a "Draft the email" button opens the person's own mail client with the subject and
  body written for them. `mailto:` cannot attach a file, so it tells them to attach the one
  they just saved. No infrastructure, works on a locked-down laptop.
- **Later, and separate:** reminders, "your assessment is due", "an assessor asked you
  something" need a service that holds the intake. The GC already has the sanctioned piece
  for this - **GC Notify**, which appears in Dan's own rubric at application question Q33.
  That service never needs to touch the evidence: it works from whoever receives the
  submissions. It is a second component, not a change to this one.

## Things to decide with Dan

- Band thresholds. And whether a hall pass gets audited anyway - recommend yes, sampled.
- Domain list and weights. Currently business 30, information 20, application 25, technology 25.
- Whether his ladder is per question or shared. Both are supported.
- `dlgBaseUrl` in the rubric, once the Digital Lifecycle Guide is live on GCXchange. One
  field, and the stage cards start linking to the right guide page.
