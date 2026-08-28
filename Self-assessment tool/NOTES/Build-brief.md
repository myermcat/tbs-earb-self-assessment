# Build brief

The requirements, extracted from the 2026-08-26 meeting, and what is done.

| # | Requirement | State |
|---|---|---|
| R1 | Take-home self-assessment, scored by the submitter | done |
| R2 | Evidence attached, come-as-you-are, no new artefacts invented for TBS | done, by reference |
| R3 | Score means maturity of evidence, not maturity of opinion | done, via the anchored ladder |
| R4 | Structured data out, every answer a referenceable field | done, JSON + CSV |
| R5 | Dropdowns from the real answer distribution instead of free text | **mechanism done, content invented** - needs the ~800 assessments |
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
- **Tamper-evidence on the saved file.** Worth adding before anything real depends on the
  score: a hash so an assessor can tell whether a file was edited after export. Cheap, but
  pointless until the routing decision has consequences.

## Things to decide with Dan

- Band thresholds. And whether a hall pass gets audited anyway - recommend yes, sampled.
- Domain list and weights. Currently business 30, information 20, application 25, technology 25.
- Whether his ladder is per question or shared. Both are supported.
- `dlgBaseUrl` in the rubric, once the Digital Lifecycle Guide is live on GCXchange. One
  field, and the stage cards start linking to the right guide page.
