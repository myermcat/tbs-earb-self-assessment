/**
 * What the tool has to do, as data. `tools/build-requirements.mjs` renders it to
 * NOTES/requirements.html, which is the page people read.
 *
 * Why a data file rather than a hand-written page: every requirement carries an id that gets
 * quoted in conversation, a state that changes as decisions are made, and an owner. Those
 * three things drift the moment they are maintained by hand in prose.
 *
 * States:
 *   'built'    in the tool today
 *   'agreed'   decided, and not built yet
 *   'proposed' our reading, waiting for somebody to confirm it
 *   'open'     nobody has decided
 */

export const updated = '2026-09-01';

export const intro = [
  'This is the standing record of what the GC Enterprise Architecture self-assessment tool has to do. It accumulates: a decision made in a meeting is written here the same day, with who made it.',
  'Each requirement carries a number so it can be quoted, a state, and an owner where somebody owes an answer. Numbers are never reused and never renumbered. Nothing is deleted when a requirement changes: the state changes and the reason goes in the note.',
  'Owners are named people. Build team means Mariia Yermolenko, who is building this on a co-op term at the Treasury Board Secretariat. TBS means whoever holds the decision inside the department, which is Dan Cooper unless the entry says otherwise.',
];

/** Shown under the intro, because a reader will ask what standard this follows. */
export const standard = {
  title: 'What this follows, and where it departs',
  points: [
    ['The standard', 'ISO/IEC/IEEE 29148:2018, Systems and software engineering, life cycle processes, requirements engineering. It replaced IEEE 830, which is withdrawn and still the thing most people picture when they hear the words requirements specification.'],
    ['Tailored, which the standard allows', 'Clause 4.5 permits tailoring. Two departures are deliberate. The document carries a status line where a signature block would go, because it is living and gets baselined at each release. And requirements are written in plain present tense, leaving out the "shall" convention in clause 5.2.7, because the people who read this are two colleagues and a director, and "the tool shall keep work as it is typed" is harder to read than the same sentence without it.'],
    ['States', 'Proposed is the standard word. Agreed means analysed, agreed by whoever owns the decision, and committed to. Built means it is in the tool. Open marks a decision nobody has made, and every open item is also listed in one place at the top.'],
  ],
};

export const sections = [
  {
    id: 'purpose',
    title: 'Purpose and scope',
    lead: 'What the tool replaces and what it does not touch.',
    reqs: [
      { id: 'P1', state: 'agreed', text: 'A department scores its own architecture against the published GC Enterprise Architecture framework and points at evidence it already holds.',
        note: 'Replaces the GC EARB assessment template and the score deck built by hand.' },
      { id: 'P2', state: 'agreed', text: 'The assessor reads the answers that do not add up. Reading all 176 is the job this abolishes.',
        note: 'On a full submission the anomalies are single digits out of 176 questions.' },
      { id: 'P3', state: 'agreed', text: 'Everything in the tool is unclassified. Nothing protected or classified goes into it at all.',
        note: 'Settled with Dan on 1 September 2026. This one decision removes the second deployment, the local-only mode, the theme switch and the recall problem.' },
      { id: 'P4', state: 'open', owner: 'Dan', text: 'Which initiatives have to submit one.',
        note: 'Blocks nothing that is being built.' },
    ],
  },
  {
    id: 'roles',
    title: 'Roles and access',
    lead: 'Three roles, and three views that do not overlap. The prototype shows them in one page because it is a prototype.',
    reqs: [
      { id: 'R1', state: 'agreed', text: 'Three roles: submitter, assessor, admin.' },
      { id: 'R2', state: 'agreed', text: 'The views are separate. A submitter cannot reach the assessor view or the admin view.',
        note: 'They are reachable from one page today so the shape can be shown and argued about. That is a property of the prototype.' },
      { id: 'R3', state: 'agreed', text: 'The admin adds assessors. Signing in tells the tool which role somebody has, and they never choose it themselves.' },
      { id: 'R4', state: 'agreed', text: 'The admin can grant admin rights to an assessor, the way a Discord server grants a role.',
        note: 'So an admin leaving does not leave the programme without one.' },
      { id: 'R5', state: 'agreed', text: 'Rights decide which settings somebody sees.' },
      { id: 'R6', state: 'proposed', text: 'The exact rights each role carries, as a table, before any of it is built.',
        note: 'The Discord model is the reference: named roles, each with a set of permissions, granted per person.' },
      { id: 'R7', state: 'open', owner: 'Dan or Chris', text: 'What an assessor sees of the pool.',
        note: 'Every assessor sees everything today. Chris says departments know who their assessor is, so a department could pick one at submission, and an assessor could share a file or hand it on. A My assessments filter is the shape to add once the rule exists.' },
      { id: 'R8', state: 'open', owner: 'Dan', text: 'Whether admin is a role of its own or an assessor with more buttons.' },
      { id: 'R9', state: 'built', text: 'An admin can delete a record, and has to type the initiative name out to do it.',
        note: 'Copied from the way GitHub deletes a repository. A prototype fills up with test submissions and somebody has to be able to clear them; the protection is the typing, because a confirmation somebody can agree to by reflex stops being one.' },
      { id: 'R10', state: 'agreed', text: 'A submitter can never delete anything.' },
    ],
  },
  {
    id: 'signin',
    title: 'Signing in',
    lead: 'The thing that makes every access rule above enforceable.',
    reqs: [
      { id: 'S1', state: 'agreed', text: 'Real sign-in, so the tool knows who somebody is without asking them.',
        note: 'The no-sign-in design came from the assumption that the tool would hold classified evidence and therefore could not be online at all. P3 removed that assumption, so the constraint went with it.' },
      { id: 'S2', state: 'agreed', text: 'For the real thing, the departmental account: the same one used for Teams.',
        note: 'Microsoft Entra. No new password, and the tool knows the person and their department from the sign-in.' },
      { id: 'S3', state: 'agreed', text: 'For the prototype, sign in with a Google account or a Microsoft account, which sends no email and needs no password.',
        note: 'The first plan was a link sent to a work address. Firebase caps that at five sign-in emails a day for the whole project on the free plan, which is three testers, so it cannot be the prototype route. Neither of these sends an email at all. Microsoft matters because it is how Dan tests from his work account, and it may need TBS to allow the sign-in, which Google does not.' },
      { id: 'S6', state: 'proposed', text: 'Both Google and Microsoft are offered on the prototype sign-in screen.',
        note: 'Google works for anybody today. Microsoft lets Dan use his work account, and a departmental tenant can refuse an outside application, so it may need somebody at TBS to approve it. Offering both means one route works while the other is being approved.' },
      { id: 'S4', state: 'built', text: 'Until sign-in exists, the assessor side opens on a screen shaped like a sign-in that says it is a mockup, and everything it produces is labelled unverified.' },
      { id: 'S5', state: 'agreed', text: 'A submitter may read and change their own submission, and no other.',
        note: 'And any submission they have been added to.' },
    ],
  },
  {
    id: 'instrument',
    title: 'The instrument',
    lead: 'The questions, the weights and the scale. Dan owns the content; the tool renders whatever it is handed.',
    reqs: [
      { id: 'Q1', state: 'built', text: 'The question set is a data file. A new version is a new file, and every assessment records the version it was answered against.' },
      { id: 'Q2', state: 'built', text: 'Question sets accumulate. Adding one changes nothing on its own; one set is active at a time; any set can be previewed, made active or deleted.' },
      { id: 'Q3', state: 'built', text: 'A submission is scored against the set it was answered against, and the row says which set produced the number.' },
      { id: 'Q4', state: 'built', text: 'Each question is scored 0 to 10 against a ladder of descriptions, and the ladder is visible while answering.' },
      { id: 'Q5', state: 'built', text: 'Question weight is multiplied by a lifecycle-stage factor, and the weights are re-normalised so every assessment still scores out of 10.' },
      { id: 'Q6', state: 'built', text: 'Not applicable is an answer. It leaves the score out of every total and counts as dealt with for progress.' },
      { id: 'Q7', state: 'proposed', owner: 'Dan', text: 'Ten questions are yes/no. A no colours its question, its section, its rail row and its domain tab, and stops nothing.',
        note: 'Which ten is our reading of his wording, and is labelled provisional in the tool.' },
      { id: 'Q8', state: 'proposed', owner: 'Dan', text: 'Questions carry topics as well as a domain, so the same answers can be cut across the four domains.',
        note: 'Six topics, 31 questions in two of them. A question counts fully in each topic and once in the overall, so the topic scores do not add up to the overall.' },
      { id: 'Q9', state: 'open', owner: 'Dan', text: 'Per-question criticality, separate from section weight.' },
      { id: 'Q10', state: 'open', owner: 'Dan', text: 'The dropdown answers for each question.',
        note: 'None exist. The only real source is the 700-odd past assessments.' },
      { id: 'Q11', state: 'open', owner: 'Dan', text: 'The Business Architecture section weights add up to 80.',
        note: 'His own workbook, confirmed in his words. The tool shares the missing 20 out proportionally and shows the normalised share.' },
      { id: 'Q12', state: 'open', owner: 'Dan', text: 'The routing thresholds.',
        note: 'He gave three different numbers in one conversation. The tool interpolates and labels the threshold provisional wherever it appears.' },
    ],
  },
  {
    id: 'filling',
    title: 'Filling one in',
    lead: 'The submitter side.',
    reqs: [
      { id: 'F1', state: 'built', text: 'Nobody has to finish it in one go. Work is kept as it is typed, and a reload loses nothing.' },
      { id: 'F2', state: 'built', text: 'One weighted section per screen, with a rail that says where the gaps are.',
        note: '176 questions in one scroll is not a form anybody finishes.' },
      { id: 'F3', state: 'built', text: 'The overview asks six things before the questions: name, department, contact, summary, the marking of the evidence, and the lifecycle stage.' },
      { id: 'F4', state: 'built', text: 'Every assessment carries a four-character reference from the moment it is created, and the reference never changes.',
        note: 'Email subject lines are permanent, so nothing in one may depend on a name somebody can edit.' },
      { id: 'F5', state: 'built', text: 'Nothing is destroyed in one step, and the window that asks says what will be lost and offers a copy first where there is one to offer.' },
      { id: 'F6', state: 'agreed', text: 'Submitting is one deliberate act. The first press names what is about to go online and asks the person to confirm it is unclassified.' },
      { id: 'F7', state: 'agreed', text: 'After the first submit, later changes write through as they are made.' },
    ],
  },
  {
    id: 'evidence',
    title: 'Evidence and markings',
    lead: 'What follows from P3.',
    reqs: [
      { id: 'E1', state: 'built', text: 'Evidence is a link to where the artefact already lives, plus a note that the assessor has been given access.' },
      { id: 'E2', state: 'built', text: 'Evidence is a link, and nothing can be attached to an assessment.',
        note: 'Attaching was removed on 1 September. It cannot survive a store: a document there caps at one mebibyte and the tool allowed fifteen. A file attached by an earlier version still opens, so nothing already saved is lost.' },
      { id: 'E3', state: 'built', text: 'An artefact above unclassified goes to the assessor by email, and the tool writes the subject line and records that it was sent.' },
      { id: 'E4', state: 'built', text: 'Choosing a marking above unclassified takes over the screen once, explains what to do instead, and cannot be dismissed until the person says they understand.' },
      { id: 'E5', state: 'built', text: 'A file attached while a row was unclassified cannot stay once that row is marked higher. Saving is blocked and the row says why.' },
      { id: 'E6', state: 'built', text: 'Evidence marked above the answer given on the overview asks which of the two is wrong.' },
      { id: 'E7', state: 'built', text: 'The document itself is marked unclassified on screen and on every printout, with the evidence marking beside it.' },
    ],
  },
  {
    id: 'assessing',
    title: 'Assessing',
    lead: 'Rules Dan stated as rules.',
    reqs: [
      { id: 'A1', state: 'built', text: 'A changed score cannot be saved without a reason.' },
      { id: 'A2', state: 'built', text: 'Nothing is overwritten. Each change appends a name, a time and the reason, and two assessors disagreeing leaves both accounts.' },
      { id: 'A3', state: 'built', text: 'A line shows that it was edited and by whom before anybody opens anything.' },
      { id: 'A4', state: 'built', text: 'A whole section can be agreed with in one click, which touches no score.' },
      { id: 'A5', state: 'built', text: 'An assessor cannot change the evidence.' },
      { id: 'A6', state: 'built', text: 'The anomalies are surfaced first, with a question drafted for each, and the rest is folded away.' },
      { id: 'A7', state: 'built', text: 'The assessor side keeps its work in the browser as it is typed.' },
      { id: 'A8', state: 'agreed', text: 'Two people on one record do not overwrite each other, and each is told when the other has changed something they are looking at.',
        note: 'The append-only trail is built. The live signal is not.' },
    ],
  },
  {
    id: 'portfolio',
    title: 'The portfolio view',
    lead: 'What the programme sees.',
    reqs: [
      { id: 'D1', state: 'built', text: 'One page over every record: averages by domain and by topic, and every record listed weakest first.' },
      { id: 'D2', state: 'built', text: 'It recalculates from the answers as it draws, so no stored number can go stale.' },
      { id: 'D3', state: 'built', text: 'It says what it can currently see, and does not pretend to be live when it is reading one browser.' },
      { id: 'D4', state: 'agreed', text: 'Nothing is deleted. A record is withdrawn, which means out of every statistic and still in the list.' },
      { id: 'D5', state: 'open', owner: 'Dan', text: 'The twelve-month questions: per-question averages, averages by department, and the best and worst evidence for each question.',
        note: 'The reason the data is worth collecting at all. All of it needs more than one record to mean anything.' },
    ],
  },
  {
    id: 'data',
    title: 'Data, storage and hosting',
    lead: 'Where the answers live.',
    reqs: [
      { id: 'H1', state: 'built', text: 'Work is kept in the browser as it is typed, and can be saved to a file and reopened.' },
      { id: 'H2', state: 'agreed', text: 'Submitted assessments live in one store that the submitter and the assessor both read, so nobody works from an older copy.' },
      { id: 'H3', state: 'built', text: 'The store address is a build input. It sets both where the page writes and the single host the page is allowed to reach, so a build with no store cannot make a request at all.' },
      { id: 'H4', state: 'proposed', text: 'For the prototype: a database with sign-in, in a Canadian region, with rules that let somebody read and write their own records and nothing else.',
        note: 'Cloud Firestore in Montreal is the concrete version, and deploy/firestore.rules is written. A key-value store behind a small program of our own is the alternative, and it has no Canadian region.' },
      { id: 'H10', state: 'agreed', text: 'Attached files do not go into the store as part of the assessment.',
        note: 'A document in Firestore caps at one mebibyte and the tool allows 15 MB per attachment, so the design does not fit by a factor of twenty. Base64 makes it worse by a third. Evidence is a link for exactly this reason; an attachment stays in the file somebody saves, and it does not travel to the store.' },
      { id: 'H11', state: 'open', owner: 'Build team, then Dan', text: 'Whether the prototype store runs on the free plan or has a billing account attached.',
        note: 'The free plan costs nothing and rules out file storage and email sign-in. A billing account at this volume bills a couple of dollars a month. The obstacle is attaching a personal card to government work. That is a procurement conversation, and no amount of engineering settles it.' },
      { id: 'H12', state: 'built', text: 'The store rules are written so that reading your own record costs no extra lookup.',
        note: 'Every exists() or get() inside a rule is a billable read even when the request is denied. Only the assessor and admin paths look a role up.' },
      { id: 'H5', state: 'agreed', text: 'The prototype store has a named owner and a date it gets deleted, both written down before anybody asks.' },
      { id: 'H6', state: 'agreed', text: 'The page says what it is whenever it is writing to a prototype store: unclassified drafts only, and not a record of decision.' },
      { id: 'H7', state: 'open', owner: 'TBS', text: 'What the production store is.' },
      { id: 'H8', state: 'open', owner: 'Nick', text: 'The code moving into the canada-ca organisation.',
        note: 'Either as its own repository, which needs permission to create one, or as a folder in TBS-OCIO-ESP, which already publishes a tool the same way and which we can already push to.' },
      { id: 'H9', state: 'open', owner: 'Dan', text: 'Whether the 176 draft questions can be public.',
        note: 'Publishing inside canada-ca makes them public, because Pages will not serve a private repository.' },
    ],
  },
  {
    id: 'notify',
    title: 'Notifications',
    lead: 'Nothing here is built.',
    reqs: [
      { id: 'N1', state: 'built', text: 'The tool can open the person mail client with a message already written.' },
      { id: 'N2', state: 'agreed', text: 'Notifications go through GC Notify.',
        note: 'Already in Dan own question set, at application question 33.' },
      { id: 'N3', state: 'open', owner: 'Dan', text: 'What triggers one, and who receives it.',
        note: 'Submission, assignment, a changed score and a reminder are four different decisions.' },
    ],
  },
  {
    id: 'nonfunctional',
    title: 'How it has to behave',
    lead: 'The properties that are not features.',
    reqs: [
      { id: 'X1', state: 'built', text: 'One self-contained page. No framework, no runtime dependency, and nothing to install at the user end.',
        note: 'Departmental laptops will not run anything that has to be installed.' },
      { id: 'X2', state: 'built', text: 'The page states which hosts it may reach, and the build enforces it.' },
      { id: 'X3', state: 'built', text: 'Every score is reachable and answerable by keyboard, and each score row is one tab stop.' },
      { id: 'X4', state: 'built', text: 'It prints. A printed assessment carries its scores, its reasoning and its marking.' },
      { id: 'X5', state: 'built', text: 'It reads in light and in dark, and on a phone.' },
      { id: 'X6', state: 'agreed', text: 'Only an admin can delete, and only by typing the name of the thing being deleted.',
        note: 'This replaces the earlier rule that nothing could ever be deleted, which does not survive a prototype full of test data.' },
      { id: 'X8', state: 'agreed', text: 'Where a decision about how something should behave is not obvious, copy what GitHub does.',
        note: 'Her instruction on 1 September, after the typed-name delete. GitHub has already argued these out in public and its patterns are familiar to the people who will use this.' },
      { id: 'X7', state: 'built', text: 'The page is built to be bilingual: every reader-facing string goes through one function that returns English or French, and a switch in the header changes language without a reload.',
        note: 'Keyed on the English text, so no key can be invented or go stale, and a string with no French shows in English and is counted. Settings reports how far the translation has got.' },
      { id: 'X9', state: 'agreed', owner: 'Build team', text: 'The French text itself, for about 960 strings.',
        note: 'Mechanical from here: each string gets its French beside the English. It is writing, and the architecture is done.' },
      { id: 'X10', state: 'open', owner: 'Dan', text: 'French for the question set: 176 questions, their descriptions and the eleven rungs of the scale.',
        note: 'His text, so his translation. It belongs in the rubric file beside the English, which the tool already reads as data.' },
    ],
  },
];

/**
 * How a requirement gets checked, which is the section ISO 29148 expects and the one most
 * requirements documents leave out. It is worth having because the answer here is mechanical.
 */
export const verification = {
  title: 'How each requirement gets checked',
  lead: 'Four gates run on every change, and a requirement is not built until the gate that covers it passes.',
  gates: [
    ['The prose gate', 'Every word the reader sees is checked against the writing rules: no em dashes, no antithesis, no banned words. It runs before the tests and fails the build.'],
    ['The logic gate', 'Scoring, banding, weighting, the flags, the CSV round trip. It runs against the modules directly.'],
    ['The interface gate', 'The built page is driven in a real document object model, end to end: 21 pages of questions answered, evidence attached, markings set, dialogs opened and their buttons pressed. Around 500 assertions, and this is where a requirement about behaviour is actually held.'],
    ['The print gate', 'A printed assessment is checked for the things that vanish on paper: the scores, the reasoning, the marking, and every folded section.'],
  ],
  note: 'What no gate covers: anything needing a store, a sign-in or a second person. Those requirements are marked agreed, and they say so.',
};
