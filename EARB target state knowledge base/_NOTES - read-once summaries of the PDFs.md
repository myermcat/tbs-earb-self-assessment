# Notes on the three PDFs in this folder

Read once, on 2026-08-28. Everything worth keeping is here, so **do not re-read the PDFs**
unless the files themselves change. Ask before any new read.

---

## GC EA Framework 2026.pdf

39 pages, a slide deck. Cover says **"Renewing the assessment model and enabling
self-service. DRAFT - FOR DISCUSSION. January 2026."** This is the official framing of the
project Dan handed us. The CSVs in this folder are its assessment instrument.

**Why GC EA exists**, in its own words: it was put in place to help "prevent the next
architectural disaster," like Phoenix, and every initiative that has been through the rigour
of GC EARB has been more successful. Evolution marked at 2017, 2019, 2023, 2025, 2026+.

**Themes.** Four, and they are the categories the assessment is organised around:
Business Architecture; Information & Data Architecture; Application & Virtual Architecture;
Technology & Physical Architecture. Questions per theme are "designed to highlight the
qualities of the solution in that theme, that lead to better outcomes."

**The self-service intent**, verbatim from the deck, and this is the requirement in one slide:

> Thorough and consistent "at-home" assessments spanning GC EA themes.
> Leveraging: 700+ existing GC EARB assessments; maturity and experience of GC EA practice
> and assessment team; an extensive series of scored questions to rate architectural
> maturity. Using Government of Canada Protected B authorized Artificial Intelligence Large
> Language Models (AI LLM) capabilities.

Three things follow from that slide:

1. **"At-home" is the official word** for what Dan called a take-home assessment. The
   offline-first design is the framework's own intent, not our interpretation of it.
2. **700+ assessments**, not the 800 Dan said out loud. Either number makes the point; use
   "700+" in anything written down, since that is the number in the draft.
3. **A Protected B authorized LLM exists.** This matters. Dan's stage 3 (AI audits the
   self-scores) has a sanctioned path, and it can handle evidence up to Protected B. It does
   not change the offline design - evidence above Protected B still cannot travel - but it
   means an AI-assisted scoring path is in the framework, not something we invented.

The remaining ~34 pages are the same question topics as the CSVs, laid out as diagrams with
section weights. The CSVs are the better source: same content, machine-readable. The one
thing the deck has that the CSVs do not is a **seventh Business Architecture section,
"Defining the Business Problem" at 5%**, covering concept case details and a
problem/opportunity statement. See the weight discrepancy recorded in NOTES/Rubric-import.md.

---

## Things to measure.pdf

2 pages. Not part of the assessment instrument - it is a list of **what EA itself should be
measured on**, with quantifiable measures for each. Useful as the outcome layer above the
rubric: the rubric measures one initiative, this measures whether the practice is working.

| Measure | Quantify as |
|---|---|
| Total IT cost savings | Costs before vs after; investments evaluated |
| Alignment of IT roadmap with business objectives | Number of duplicative applications; business objectives satisfied |
| Application rationalization progress | Applications before vs after |
| Operational efficiency and system availability | Availability before/after; request-to-fulfilment time; nodes instrumented; SLA before/after |
| Client and user satisfaction | User satisfaction rate |
| Interoperability of systems | Registered APIs vs manual interfaces; transaction volume |
| Value realization and ROI | Applications before/after; cost per transaction; productivity or quality improvement; customer wait and delivery time |

One hard number worth remembering: **only 38% of current government applications are
considered healthy**, and a stated key measure is the percentage of unhealthy applications
planned for remediation in the next 12 months.

Where this touches the tool: these are the fields that would make a cross-portfolio
dashboard worth building later. Not needed for the self-assessment itself.

---

## GC Data Ecosystem Position Paper.pdf

3 pages. A position paper, not policy. Bottom line up front: the GC should have a **data mesh
(multiple data hubs) organised by data domain**, federated rather than a single central
repository, bought centrally and from multiple qualified vendors.

Four principles: data as a product with defined service levels; domain-oriented ownership
where departments hold accountability and the centre sets standards only; a self-serve
shared platform (GC Cloud One or a centrally managed SaaS contract, provided by SSC);
and governance baked into the platform through automated policy engines.

Argument against the monolithic hub: central IT lacks program context, "need-to-know"
across diverse departments is hard to manage in one place, and aggregating all data into one
zone is itself the risk. Argument against federation, stated honestly: multiple solutions add
ecosystem complexity, though they also prevent vendor lock-in.

Implementation in three phases: SSC provides common infrastructure; pilot three
high-value cross-departmental domains (recommends HCM for HR data, SSC for DCES
financial data, TBS for policy data) to establish data contracts; then scale via
governance-as-code with automated metadata tagging and an enterprise catalogue.

Where this touches the tool: it is **context, not content**. It explains why so many Data &
Information Architecture questions ask about federation, residency, lineage, data products
and stewardship - a submitter scoring high on those is aligned with this paper. It gives us
nothing to build. Do not treat it as a source of rubric questions.
