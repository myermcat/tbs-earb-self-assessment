/**
 * The backlog, as data. `tools/build-backlog.mjs` renders it to NOTES/backlog.html, which is
 * the page Mariia actually reads.
 *
 * Editing rules, so this stays cheap to keep current:
 *  - status: 'next' | 'wait' | 'later' | 'done'. Finishing something is a one-word change.
 *  - A done item stays where it is written and the renderer moves it into Done, permanently.
 *    Nothing is deleted, and nothing has to be re-typed to record that it landed.
 *  - 'wait' means somebody outside this repo owes a reply. Those are gathered into Waiting on
 *    somebody as well as shown in place, because that list is the one to chase.
 *  - `why` is the one line that explains why the item exists. Write it for a reader who was
 *    not in the meeting.
 */

export const updated = '2026-09-01';

export const quick = {
  title: 'Quick actions',
  hint: 'No discussion needed.',
  items: [
    { t: 'Rail’s Overview row shows a count and a bar', status: 'done',
      why: 'Every other rail row had both; Overview had neither, which reads as a row stuck at zero.' },
    { t: 'Overview bar moves on the first keystroke', status: 'done',
      why: 'It counted the three groups, and group one needs four fields. It now measures the six fields while the count still reads in groups.' },
    { t: 'README and Settings stop describing a local-only tool', status: 'done',
      why: 'Both said the tool cannot transmit and that the repo is private. Neither was true.' },
  ],
};

export const layers = [
  {
    title: 'Question set', owner: 'Dan',
    groups: [
      { t: 'Answer types and criticality', status: 'wait',
        why: 'The shape of the questions, which Dan called the biggest remaining piece. Our reading is in the tool and labelled provisional.',
        subs: [
          { t: 'Confirm the answer type for every question', status: 'wait',
            why: 'Ten are yes/no on our reading of the wording. The other 166 are scored 0 to 10.' },
          { t: 'Confirm which no answers matter most', status: 'wait',
            why: 'Every no colours its section red today. If some should not, that is his call.' },
          { t: 'Set per-question criticality', status: 'wait',
            why: 'Separate from section weight, and nothing in his workbook carries it.' },
        ] },
      { t: 'Content still owed', status: 'wait',
        why: 'None of this is ours to write.',
        subs: [
          { t: 'Fix the section weights that total 80', status: 'wait',
            why: 'His error, confirmed in his own words. The tool shares the missing 20 proportionally and shows the normalised share.' },
          { t: 'Add security and privacy questions', status: 'later',
            why: 'Neither is represented. A security review is already asking. The topic view makes the gap visible in the meantime.' },
          { t: 'Bring in the dropdown answers', status: 'wait',
            why: 'No picklists exist. Needs the 700 or more past assessments, which only he can hand over.' },
        ] },
    ],
  },
  {
    title: 'Engine', owner: 'us',
    groups: [
      { t: 'Question mechanics', status: 'done',
        why: 'What the instrument can carry.',
        subs: [
          { t: 'Multiple answer types', status: 'done',
            why: 'A type field with scale as the default, so nothing existing breaks.' },
          { t: 'A no answer colours its section', status: 'done',
            why: 'The question, its section, its rail row and its domain tab. It stops nothing.' },
          { t: 'Topic metadata and per-topic roll-up', status: 'done',
            why: 'Security, privacy, cost, data, business and technology, visible without inventing a fifth domain.' },
          { t: 'Two-topic scoring', status: 'done',
            why: 'Once in the overall, at full weight inside each topic, because the weight genuinely differs by topic.' },
        ] },
      { t: 'Storage and concurrency', status: 'next',
        why: 'Everything is unclassified, so it can all live online. The seam is written; the store is not.',
        subs: [
          { t: 'The store seam', status: 'done',
            why: 'src/store.ts. One constant from live, and the dashboard already reads through it.' },
          { t: 'One deliberate first submit', status: 'next',
            why: 'You should know the moment your work becomes visible to TBS.' },
          { t: 'Autosave online after that', status: 'next',
            why: 'Like a document. Every later change writes through.' },
          { t: 'Field-level last write wins, with a marker', status: 'next',
            why: 'Not locking. Two people in different questions never collide.' },
          { t: 'Tell the other person it changed under them', status: 'next',
            why: 'The audit trail already keeps both accounts. What is missing is the live signal while somebody is looking at the line.' },
          { t: 'Submitter answers and assessor scores are separate fields', status: 'done',
            why: 'Which is why a submitter and an assessor cannot collide at all.' },
        ] },
    ],
  },
  {
    title: 'Interface: the submitter', owner: 'us',
    groups: [
      { t: 'Evidence', status: 'done',
        why: 'The change that follows from unclassified-only.',
        subs: [
          { t: 'Ask for a link', status: 'done',
            why: 'Point at where it lives, and make sure your assessor can open it.' },
          { t: 'Email fallback, with a pattern', status: 'done',
            why: 'Marking, sent by email, subject line written for you, so an assessor can find it.' },
        ] },
      { t: 'Marking', status: 'next',
        why: 'Somebody still has to state the marking of what they point at.',
        subs: [
          { t: 'One big unclassified tile, the six grouped behind it', status: 'done',
            why: 'The default must not be taxed by the rare path.' },
          { t: 'Classified panel with an acknowledgement toggle', status: 'done',
            why: 'What to do instead, at the moment it is relevant.' },
          { t: 'Collapse three pickers into one', status: 'next',
            why: 'The footer’s seven pills bypass the whole design.' },
        ] },
      { t: 'Submitting', status: 'next',
        subs: [
          { t: 'First-submit confirmation', status: 'next',
            why: 'Names what is about to go online and asks them to confirm it is unclassified.' },
          { t: 'Save status indicator', status: 'done',
            why: 'Draft in browser, saving, saved, or not saved with a reason.' },
        ] },
    ],
  },
  {
    title: 'Interface: the assessor', owner: 'us',
    groups: [
      { t: 'Identity', status: 'wait',
        why: 'Their name goes against a number somebody may dispute.',
        subs: [
          { t: 'Mockup verification screen', status: 'done',
            why: 'Labelled a mockup, the departmental-account button visibly disabled, everything unverified.' },
          { t: 'Real sign-in', status: 'wait', owes: 'Dan',
            why: 'Blocked on how identity gets checked at all, which is his answer to give.' },
        ] },
      { t: 'Auditing rules Dan gave as rules', status: 'done',
        subs: [
          { t: 'Justification required on a changed score', status: 'done',
            why: 'His rule. The file cannot be saved while one is missing, and the button says how many are outstanding.' },
          { t: 'Accept-all per section', status: 'done',
            why: 'He asked for it by name. It touches no score, and skips any changed score that still needs a reason.' },
          { t: 'Assessor recorded per question', status: 'done',
            why: 'Two assessors on one high-profile file. Each change carries a name, a time and a reason.' },
          { t: 'The edit exchange, visible', status: 'done',
            why: 'The line says it was edited and by whom. The full back and forth opens on request, and nothing is overwritten.' },
          { t: 'Evidence read-only', status: 'done',
            why: 'Already true, and now held true by a test.' },
        ] },
      { t: 'Load a question set moves here', status: 'done',
        why: 'It belongs to whoever maintains the instrument. A submitter is told where it lives and not handed the control.' },
    ],
  },
  {
    title: 'Interface: admin', owner: 'us',
    groups: [
      { t: 'The portfolio dashboard', status: 'done',
        why: 'Dan’s self-updating dashboard. It recalculates every record from the answers as the page draws, so there is no stored number to go stale.',
        subs: [
          { t: 'Averages by domain and by topic', status: 'done',
            why: 'The topic cut is the one a single assessment cannot show: security spread thin over four domains looks fine in each of them.' },
          { t: 'Every record, weakest first', status: 'done',
            why: 'The list is a worklist. Red rows are the ones with a no answer.' },
          { t: 'Portfolio CSV', status: 'done',
            why: 'One row per record, topic columns included.' },
          { t: 'It says what it can currently see', status: 'done',
            why: 'With no store, that is this browser and the files opened this session. The page says so rather than looking live.' },
        ] },
      { t: 'Admin-only actions', status: 'wait', owes: 'Dan',
        why: 'Nobody has decided whether admin is a role. Listed so the roles matrix is complete.',
        subs: [
          { t: 'Withdraw a record', status: 'later',
            why: 'Out of every statistic, still in the list. Nothing is deleted.' },
          { t: 'Re-assign an assessor', status: 'later',
            why: 'Somebody leaves, or a file needs a second pair of eyes.' },
          { t: 'Clear out test submissions', status: 'later',
            why: 'Dan raised it and parked it.' },
        ] },
    ],
  },
  {
    title: 'Interface: the executive view', owner: 'us',
    groups: [
      { t: 'Dan’s twelve-month questions', status: 'later',
        why: 'The reason the data is worth capturing at all. All of it needs more than one record to mean anything.',
        subs: [
          { t: 'Per-question averages and histograms', status: 'later' },
          { t: 'Average by department', status: 'later' },
          { t: 'Best and worst evidence per question', status: 'later' },
        ] },
    ],
  },
  {
    title: 'Data and hosting', owner: 'us and TBS',
    groups: [
      { t: 'Get into canada-ca', status: 'wait',
        why: 'Access is done. The repo is not.',
        subs: [
          { t: 'Reply to Nick: transfer the existing repo', status: 'done',
            why: 'Sent. 28 commits of history, all yours.' },
          { t: 'Nick’s answer on who performs the transfer', status: 'wait', owes: 'Nick',
            why: 'Open an issue on canada-ca/welcome is the route he named. Whether he moves it or you do is the part still unanswered.' },
          { t: 'Retire the separate preview repo', status: 'next',
            why: 'Pages can come from the canada-ca repo once it exists.' },
        ] },
      { t: 'Where submissions land', status: 'next',
        why: 'Dan asked us to figure it out. GitHub Pages serves static files and cannot accept a write, so something has to receive one.',
        subs: [
          { t: 'A write endpoint', status: 'next',
            why: 'An Azure Function is the cheapest route: canada-ca/TBS-OCIO-ESP already builds through Azure Pipelines, so the account and the approval path exist.' },
          { t: 'Open the CSP to exactly that origin', status: 'next',
            why: 'One line in build.mjs. The page blocks every outbound request until then.' },
          { t: 'Per-user auth', status: 'later',
            why: 'The known limit. Microsoft Entra is the obvious route, since departments already sign in with it.' },
        ] },
      { t: 'Notifications', status: 'wait',
        why: 'GC Notify is the sanctioned service and is already in Dan’s own rubric at application question Q33. What triggers one is his decision and he has not made it.',
        subs: [
          { t: 'Draft the email', status: 'done',
            why: 'Opens the person’s own mail client with the message written. All a static page can do.' },
          { t: 'Decide the triggers', status: 'wait', owes: 'Dan',
            why: 'Submission, assignment, a changed score and a reminder are four different decisions.' },
        ] },
    ],
  },
  {
    title: 'Process, for people', owner: 'Dan and John',
    groups: [
      { t: 'How John’s team validates evidence', status: 'later',
        why: 'Their job changes completely and Dan expects resistance.' },
      { t: 'What the intake accepts, and from whom', status: 'later',
        why: 'Dan called it a protocol for the humans.' },
      { t: 'Which initiatives must submit', status: 'later',
        why: 'His call. Blocks nothing we build.' },
    ],
  },
];

export const resolved = [
  { q: 'Should the tool hold classified information?',
    a: 'No. Nothing protected or classified goes in at all, settled with Dan on 1 September. That removed the second deployment, the local-only engine, the theme switch, and the whole recall problem.' },
  { q: 'What happens to online data when a marking rises?',
    a: 'Dropped. The tool never stores classified evidence, so the question cannot arise.' },
  { q: 'Does a two-topic question count twice overall?',
    a: 'No. Once in the overall score, and at full weight inside each topic, which is where the weights genuinely differ.' },
  { q: 'File sharing for a team filling one in together?',
    a: 'No files. Everything is online, so version control stops being a problem the tool has to solve.' },
  { q: 'Deletion rights',
    a: 'Nothing is ever hard-deleted. A record is withdrawn and left out of the statistics.' },
  { q: 'One build or two?',
    a: 'One. Submission is a capability the hosting turns on.' },
  { q: 'Where the plan lives',
    a: 'This page. The Markdown version is deleted.' },
  { q: 'Org access to canada-ca',
    a: 'Done. Nick invited you, and the TBS-OCIO-ESP team gives push access to canada-ca/TBS-OCIO-ESP.' },
  { q: 'Who may replace the question set?',
    a: 'The assessor and admin side only. Loading one clears every answer, so a submitter is told where it lives and not handed the control.' },
  { q: 'How does the dashboard stay current?',
    a: 'By storing nothing. It recalculates each record from its answers as the page draws, so there is no roll-up that can go stale.' },
];

export const questions = [
  { q: 'Who may edit a stored assessment, and how it is checked', who: 'Dan',
    blocks: 'Real authentication', meanwhile: 'Mockup screen, everything labelled unverified' },
  { q: 'Verifying an assessor’s identity', who: 'Dan',
    blocks: 'Real sign-in', meanwhile: 'Typed name, labelled unverified on every change it records' },
  { q: 'Is admin a role, or an assessor with more buttons?', who: 'Dan',
    blocks: 'The admin-only actions', meanwhile: 'The dashboard is built; the actions are listed and marked unbuilt' },
  { q: 'Notification triggers and recipients', who: 'Dan',
    blocks: 'Notifications', meanwhile: 'Draft the email. GC Notify is the sanctioned route' },
  { q: 'Which questions are yes/no, and which no answers matter most', who: 'Dan',
    blocks: 'Nothing', meanwhile: 'Ten on our reading, labelled provisional in the app' },
  { q: 'The routing thresholds', who: 'Dan',
    blocks: 'Nothing', meanwhile: 'Interpolated between two numbers he named, labelled provisional' },
  { q: 'Which initiatives must submit', who: 'Dan',
    blocks: 'Nothing', meanwhile: 'Ignore for now' },
  { q: 'Who performs the canada-ca transfer', who: 'Nick',
    blocks: 'The repo move', meanwhile: 'Asked. An issue on canada-ca/welcome is the route he named' },
  { q: 'What the production intake should be', who: 'TBS',
    blocks: 'Production only', meanwhile: 'The prototype answer is an Azure Function plus one CSP line' },
];
