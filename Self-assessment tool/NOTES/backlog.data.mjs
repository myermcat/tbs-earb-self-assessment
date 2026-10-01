/**
 * The backlog, as data. `tools/build-backlog.mjs` renders it to NOTES/backlog.html, which is the
 * page people actually read.
 *
 * HOW IT IS ARRANGED, AND WHY
 *
 * Dan asked for this on 26 September: three backlogs, in his words administrative, the engine
 * itself, and the questions, plus "what do we need to go live, that whole critical path". Those
 * are the tabs across the top. The list down the left side is the finer grouping inside whichever
 * tab is open.
 *
 * ONE RECORD, SEVERAL VIEWS. Nothing is written twice. An item that is a question carries
 * kind: 'question' and appears once, marked; it used to be written both as work and again in a
 * separate list of open questions, so settling it meant deleting it twice. An item that blocks
 * go-live carries golive: true and shows in the first tab as well as its own, from the one record.
 *
 * EDITING RULES, so this stays cheap to keep current:
 *  - id        never changes. It is the name of the document in the store that holds this item's
 *              priority, so renaming it loses whatever priority somebody set.
 *  - status    'wait' | 'open' | 'doing' | 'done'. Finishing something is a one-word change,
 *              and it is ONLY the status that changes. A done item is never deleted and NEVER
 *              MOVES SECTION: the track's Done block gathers it by status and groups it under
 *              the title of the section it was finished in, so the section is what makes that
 *              archive readable. Moving a finished bug out of Broken into the section it
 *              touched empties Broken, and an emptied section used to vanish from the page
 *              entirely. Said on 1 October, after exactly that happened: do not remove sections
 *              in the backlog when you are done with them. 'wait' means somebody outside this
 *              repository owes a reply, and owes names them. 'doing' means started and not finished, and there should be at most
 *              two of them at a time; a list where everything is started is a list where nothing
 *              is. 'open' is everything else, and it draws no badge at all.
 *
 *              THERE USED TO BE 'next' AND 'later' AS WELL, and they were priority wearing a
 *              status's clothes. Asked: are next and later not the same as priority, considering
 *              80% of items carry next. Measured before agreeing: 53% said next and 25% said
 *              later, so the badge on half the page was telling a reader nothing. A status now
 *              says only what cannot be a preference. Blocked on somebody is a fact. Started is a
 *              fact. Finished is a fact. How much something matters is the priority, which is
 *              three coloured buttons and already on every row. Everything that was 'later' is
 *              'open' at low priority, and the reason it waits was already in its own words.
 *  - owner     who does the work once it is unblocked, which is not the same as who owes us an
 *              answer. It used to be a property of the section, which works for two people and
 *              stops working the moment three of them share 'ours'.
 *  - owes      who owes us the answer, on a 'wait' item, and nothing on any other.
 *  - owes      who owes us the answer, on a 'wait' item, and nothing on any other.
 *
 *              THERE IS NO DATE FIELD ANY MORE. There were two, and the page turned them into
 *              lines reading "Dan owes it, asked 27 days". Reported: are you going to maintain
 *              that every day, and we did not ask anyone yet and Dan owes us nothing so far.
 *              Both fair. The dates came from commits rather than from anybody being asked, so
 *              the page was counting days since a thing that had not happened. If a date matters
 *              to an item, it is a fact about that item and it belongs in `why`, in a sentence,
 *              where it can say what actually happened.
 *  - THERE IS NO SIZE FIELD. There was, with three values, and it was filled by reading the code
 *              and guessing. Reported: the badges look to be set by you and do not seem to be
 *              approximated correctly, so not having it is better than having it. Right. Where an
 *              estimate came from something real it is still in the item's own words, which is
 *              where it can say what it is based on.
 *  - priority  'high' | 'medium' | 'low'. This is only the starting value. The page lets anybody
 *              signed in change it, and that change is kept in the store so everybody sees the
 *              same list. What is written here is what a reader sees before the store answers.
 *  - kind      'bug' | 'feature' | 'chore' | 'question'. A bug is something broken, not something
 *              missing, and each track keeps its broken things together at the top.
 *  - why       written for somebody who was not in the meeting. It is what you open; the title
 *              alone has to carry the meaning, because the list is read folded shut.
 *  - parent    the id of the item this one sits under, or ''.
 */

export const updated = '2026-10-01';

/** The tabs, across the top. Dan's three, and the critical path he asked for on top of them. */
export const tracks = [
  { id: 'golive', title: 'To go live' },
  { id: 'questions', title: 'The questions' },
  { id: 'engine', title: 'The engine' },
  { id: 'admin', title: 'Administrative' },
];

/**
 * The list down the left. Broken comes first in every tab that has anything broken in it.
 *
 * There is no section called Open questions any more. A question sits beside the work it blocks,
 * because a question in a bin of its own is a second copy of an item that already exists, and
 * settling it then means deleting it twice. The count along the bottom still counts them, and
 * pressing that count shows only those.
 */
export const sections = [
  { id: 'golive-path', track: 'golive', title: 'Blocks going live' },

  { id: 'q-broken', track: 'questions', title: 'Broken' },
  { id: 'q-content', track: 'questions', title: 'Content Dan owes' },
  { id: 'q-behaviour', track: 'questions', title: 'How the questions behave' },
  { id: 'q-french', track: 'questions', title: 'French' },
  { id: 'q-done', track: 'questions', title: 'Done' },

  { id: 'e-broken', track: 'engine', title: 'Broken' },
  { id: 'e-submitter', track: 'engine', title: 'The submitter' },
  { id: 'e-assessor', track: 'engine', title: 'The assessor' },
  { id: 'e-admin', track: 'engine', title: 'Admin screens' },
  { id: 'e-exec', track: 'engine', title: 'The executive view' },
  { id: 'e-storage', track: 'engine', title: 'Saving and storage' },
  { id: 'e-done', track: 'engine', title: 'Done' },

  { id: 'a-broken', track: 'admin', title: 'Broken' },
  { id: 'a-signin', track: 'admin', title: 'Signing in' },
  { id: 'a-publish', track: 'admin', title: 'Where it lives' },
  { id: 'a-owner', track: 'admin', title: 'Ownership and handover' },
  { id: 'a-process', track: 'admin', title: 'Process, for people' },
  { id: 'a-done', track: 'admin', title: 'Done' },
];

export const items = [
  {
    id: "french-missing-assessor-screens", track: "questions", section: "q-french", kind: "bug",
    status: "open", priority: "high", owner: "ours", golive: true,
    t: "French is missing from the assessor screens and from half the rest",
    why: "An official instrument that is English on half its screens is not usable in government, so this is a defect and not a feature.\n\nThe machinery works: 403 pieces of wording go through the translator and 402 of them carry French. What is missing is wording that never went through it at all. On the assessor side that is 108 pieces, and the portfolio screen does not so much as import the translator. Across the submitter and shared screens it is roughly 300 more.\n\nThere is a second half nobody can start: the question set itself, 3,344 words of Dan’s English, and there is nowhere in the file format to put a French version. That is what the item below is for.\n\nAnd the accessibility fix that landed in September only reached the submitter side. The assessor screens still show English text inside a page that says it is French, so a screen reader reads English in a French voice. That is a ten-minute fix and should go first.\n\nWhat stays English on purpose: the access code, the question ids, and this page.",
  },
  {
    id: "dan-owes-french-question", track: "questions", section: "q-french", kind: "feature",
    status: "open", priority: "high", owner: "ours", golive: true,
    t: "The question set in French",
    why: "Reported: it is our job, so just say French question set.\n\nWhat is true: 3,344 words of Dan’s English have no French anywhere, and the file format has nowhere to put it. That is 2,760 words in the 176 questions, 228 in the eleven rungs of the scale a submitter reads to pick a score, 104 in the routing and maturity bands, 98 in the section and domain names, 84 in the five categories and 70 in the seven lifecycle stages.\n\nTwo ways to get it, and they are not exclusive. Draft it here and have it approved, which starts today and needs nobody. Or send it to the Translation Bureau, which is weeks on instrument text of this size and is the route an official instrument normally takes. Drafting first and having the Bureau check a draft is faster than either.\n\nTwo decisions are genuinely Dan’s and neither has been put to him. Whether the French is a second file or extra fields in the one file, given the ids are spreadsheet column names either way. And who signs off the wording, because a self-assessment whose questions differ between the two languages is two instruments.\n\nIt also waits on the set settling. Translating 176 questions while duplicates are still being cut is translating work that is about to be deleted.",
  },
  {
    id: "dan-seen-assessor-side", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Dan has seen the assessor side",
    why: "He was demonstrated it. The question of how he gets his own account is the Google sign-in item below.",
  },
  {
    id: "check-whether-google-sign", track: "admin", section: "a-done", kind: "feature",
    status: "done", priority: "high", owner: "ours", golive: false,
    t: "Google sign-in works for anybody, not only us",
    why: "Checked on 28 September in the Google Cloud console for project tbs-earb-self-assessment, under Google Auth Platform, Audience. It reads External and In production, so any Google account can sign in and nobody has to be added to a list of test users first.\n\nThe page also shows a cap of 100 users over the project lifetime. That cap applies only to an application asking for sensitive or restricted permissions, and this one asks for an address and a name, so it does not bite.\n\nWhat this does not settle is whether an assessor wants to use a personal Google account for government work. That is the Microsoft item.",
  },
  {
    id: "put-real-submission-pool", track: "engine", section: "e-assessor", kind: "feature",
    status: "done", priority: "medium", owner: "ours", golive: false,
    t: "Put a real submission in the pool",
    why: "There is no seeding tool, so test submissions are made through the submitter page, which needs no account, and sent. Half an hour. Without it an assessor signs in to an empty list, and an empty list reads as a broken tool rather than an empty one.\n\nDONE on 28 September. Three complete submissions were seeded to the live store, all 176 questions answered with one marked not applicable in each, two marked ready and one left a draft: Marine Licensing Renewal at Fisheries and Oceans in growth, strong and even; Benefits Payment Modernization at Employment and Social Development in beta, strong overall and weak on data and security; Grants and Contributions Intake at Innovation, Science and Economic Development in alpha, early and honest about it. Checked here by reading all three back out of the store by their codes. They were created without an account, so they carry no owner address and an admin can delete them by code.",
  },
  {
    id: "each-assessor-sees-pool", track: "engine", section: "e-assessor", kind: "question",
    status: "wait", priority: "medium", owner: "ours", golive: false, owes: "Dan or Chris",
    t: "What each assessor sees of the pool",
    why: "Everything, for now. Chris says departments know who their assessor is, so they could pick one at submission, and an assessor could hand a file on. Until that is decided, every assessor sees the whole pool, and a My assessments tab is the filter to add once the rule exists.\n\nThis used to be written twice, here and in a separate list of open questions. It is one record now, and it is marked as a question.",
  },
  {
    id: "store-live-rules", track: "engine", section: "e-done", kind: "feature", status: "done",
    priority: "low", owner: "ours", golive: false,
    t: "The store is live, with rules",
    why: "Firestore in Montreal, the rules published, Google sign-in on, and one assessor account to start from. Checked from outside with no sign-in on 28 September: listing every assessment is refused and opening one by its code returns not-found, which is the shape it should be.",
  },
  {
    id: "counts-finished-assessment", track: "engine", section: "e-submitter", kind: "feature",
    status: "open", priority: "low", owner: "ours", golive: false,
    t: "What counts as a finished assessment",
    why: "Answered on 21 September, and the answer is to leave it alone: Dan and Mariia agreed it stays the submitter’s judgement until real submissions exist, because answering every question is not the same as attaching every piece of evidence and a submitter may come back to a question after adding one. The choices below are what a later answer has to pick from. You spotted this yourself: there is no obvious finishing line. Filling every score is one answer, but evidence is not mandatory and neither is the reasoning, so the tool cannot say when somebody is done without being told. What the rubric says: nothing. All 176 questions carry weight 1, none is marked required, and no question asks for evidence. So the finishing line is the instrument’s decision, and these are the choices. Complete means every question in the set has a score or is marked not applicable. Whether the six overview fields count: they are not scored, but the lifecycle stage changes every score through the stage multipliers and the marking gates saving at all, so the working answer is that they count. Whether a floor is needed, since with none an assessment marked not applicable throughout is complete and unscored. Whether saying it is finished freezes the answers, or whether the submitter keeps editing and the assessor is warned. Whether an assessor may do anything with an unfinished one beyond reading it. Whether the portfolio averages should exclude unfinished ones.",
  },
  {
    id: "completion-flow-notification-exist", track: "engine", section: "e-submitter",
    kind: "feature", status: "open", priority: "medium", owner: "ours", golive: false,
    t: "The completion flow, and the notification that does not exist yet",
    why: "Designed and ready to build. Saving an unfinished assessment online already asks first and says what an assessor will and will not do with it. What is left: the window that appears when the last question is filled, offering to mark it complete and tell an assessor; the mockup screen that follows, which has to say plainly that no notification is sent; the assessor screen split, with finished submissions and the statistics at the top and unfinished ones below; and the rule that an assessor can read an unfinished submission and cannot change anything in it.",
  },
  {
    id: "teammates-assessors-assessment", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Teammates and assessors on an assessment",
    why: "A mockup, working the way sharing a document works: Share in the header, enter one address or paste a list, see who the assessment is shared with grouped by what they do, remove somebody in two steps. It says on every screen that no email is sent and no access is granted, and nothing on it can open a mail client. The addresses are recorded on the record, with two flat lists derived beside them for the rules that do not exist yet, so nothing needs migrating on the day they do. 23 assertions.",
  },
  {
    id: "saving-online-deliberate-act", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Saving online is one deliberate act, and then it keeps itself current",
    why: "Nothing leaves the machine until you press Save online once. After that the copy at TBS is kept current a few seconds after you stop typing, with a floor between writes so one afternoon cannot spend the whole project allowance. Four guards stand on it, and the one that matters is the marking: nothing leaves the machine until you have said how your evidence is marked. Telling TBS it is ready is now a separate act that saves nothing new.",
  },
  {
    id: "tests-run-every-push", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The tests run on every push, and publishing runs them too",
    why: "Neither existed. A build that broke for anybody who signed in reached the live site behind 556 green assertions, because every suite built the tool with no store and the publish script never ran a test at all.",
  },
  {
    id: "signing-without-access", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Signing in without access says so",
    why: "An account nobody has added as an assessor now meets one screen naming the address, with the way back to the home page and the way to sign in as somebody else. Before this it reached the assessor screen and was told the pool was empty, which reads as a lost submission.",
  },
  {
    id: "back-button-works-every", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The back button works on every screen",
    why: "One hash router. The assessor view, the admin view, results, settings and any questionnaire section are all addresses somebody can send, and Back walks them in the order they were visited. Before this, Back worked inside the questionnaire only, so leaving the results page went two stops back into the questions and an assessor pressing Back was dropped into the submitter view.",
  },
  {
    id: "submitter-told-why-send", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "A submitter is told why a send did not go",
    why: "Pressing Send it to TBS while signed out did nothing at all: no request, no error, no change to the badge, because the refusal was computed and dropped. It now says what happened, the badge turns, and the header offers a way to sign in. Two lines that told a live build there was no submit button and no store are gone as well.",
  },
  {
    id: "write-requirements-down-decided", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Write the requirements down as they are decided",
    why: "A requirements specification, 81 numbered requirements with a state and an owner each, generated from NOTES/requirements.data.mjs so ids and states cannot drift. It follows ISO/IEC/IEEE 29148:2018 with two departures named in the document, lists the open decisions at the top, and says how each requirement gets checked. Linked from Settings and published beside the backlog.",
  },
  {
    id: "admin-deletes-record-typing", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "An admin deletes a record by typing the name out",
    why: "Copied from GitHub repository deletion: everything that goes is listed, the exact name has to be typed, and the button stays dead until it matches. The rules allow an admin to delete and nobody else, because a prototype fills up with test data.",
  },
  {
    id: "applicable-counts-answered-start", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Not applicable counts as answered on the start page",
    why: "It counted scored answers only, so the start page reported a smaller number than the page somebody had just left.",
  },
  {
    id: "marking-question-about-evidence", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The marking question is about the evidence",
    why: "The assessment is always unclassified, so asking how the assessment is marked was the wrong question. It asks for the highest marking of the artefacts the answers point at, which is what an assessor needs access to.",
  },
  {
    id: "banner-stops-printing-wrong", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The banner stops printing the wrong marking",
    why: "Choosing Protected A stamped PROTECTED A across an unclassified document, top, bottom and every printout. It reads UNCLASSIFIED with \"evidence up to Protected A\" beside it.",
  },
  {
    id: "email-subject-line-readable", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The email subject line is readable",
    why: "It said \"EARB evidence - m - [question]\", with a placeholder nobody filled in. It now names what it is, the initiative and the question number, and the evidence box offers a Copy button.",
  },
  {
    id: "save-badge-there-no", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The save badge says there is no online copy",
    why: "She asked where to save online. There is nowhere, and the badge says so on hover, so \"draft saved\" cannot be read as the whole story.",
  },
  {
    id: "library-question-sets", track: "questions", section: "q-content", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "A library of question sets",
    why: "Sets accumulate. Settings lists every one this browser holds and marks the one in use. Adding one changes nothing on its own, and each row has a menu: preview the questions, make it active, delete it, and who added it. Deleting is two steps and refused only on the set in use and on the last remaining set.",
  },
  {
    id: "each-submission-scored-against", track: "questions", section: "q-content",
    kind: "feature", status: "done", priority: "low", owner: "ours", golive: false,
    t: "Each submission is scored against its own question set",
    why: "Twenty submissions answered against set 1 are untouched when set 2 becomes active, but the assessor page used to recompute them with whichever set was active and print a one-line notice. It now uses the set they were answered against when this browser holds it, names that set on every row, and says what it did. CSV export writes one file per set, because the columns are question ids.",
  },
  {
    id: "assessor-screen-nothing-why", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "An assessor screen with nothing in it says why",
    why: "Three different situations, and an assessor can tell them apart: no shared store exists yet, this machine cannot reach it, or it is reachable and empty. It has a cat on it.",
  },
  {
    id: "sign-screen-short-screens", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Sign in is one screen, and short screens keep their footer",
    why: "The footer floated in the middle of any short page, the sign-in scrolled like a document, and the load-submissions card hung off the top edge.",
  },
  {
    id: "email-subjects-carry-code", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Email subjects carry a code, and no initiative name",
    why: "A sent email cannot be un-sent, so a subject line that carries the initiative name breaks the moment somebody renames the initiative. Every assessment gets a four-character reference when it is created, the subject reads \"EARB evidence 7QF3, question B-Q1\", and renaming costs nothing. It shows on the overview beside the name and on the assessor row.",
  },
  {
    id: "applicable-folds-work-away", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Not applicable folds the work away and keeps it",
    why: "A question with evidence on it turned into a grey slab when it was marked not applicable: the disclosure opened itself because there was something inside, and the whole apparatus dimmed. It folds, the summary says the work is kept and not counted, and unticking puts it back. Deleting somebody evidence because they ticked a box is not the tool decision to make.",
  },
  {
    id: "revert-highest-marking-allowed", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The revert goes to the highest marking allowed",
    why: "Saying no to a Protected C piece put the row back to unmarked. It goes to the marking chosen on the overview.",
  },
  {
    id: "backlog-opens-settings", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The backlog opens from Settings",
    why: "A This build pane, with the tool version, the question set version, whether there is a store, and the link.",
  },
  {
    id: "assessor-side-keeps-work", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The assessor side keeps its work in the browser",
    why: "Every audited score, verdict, note and history entry used to live in memory until the file was saved, so a reload took the afternoon. It autosaves the way the submitter side always has, Clear asks first, and the session comes back after a reload.",
  },
  {
    id: "store-build-input-away", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The store is one build input away",
    why: "EARB_ENDPOINT sets both the address the page writes to and the one origin its security policy allows, so a build with no endpoint still cannot make a request. deploy/worker.js is the store: forty lines, free tier, browser-only setup.",
  },
  {
    id: "prompt-evidence-outranks-overview", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "A prompt when the evidence outranks the overview answer",
    why: "Marking a piece of evidence higher than the answer given on the overview used to stay on screen blocking the save. It asks which of the two is wrong, and raising the overview answer does not re-open the pledge.",
  },
  {
    id: "every-dialog-closes-click", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Every dialog closes on a click outside it",
    why: "Menus stayed open until something else was clicked, and the discard window had no way out but its own buttons. Cancelling is the outcome, so a stray click can never delete. The classified pledge is the exception, because a tick is the point of it.",
  },
  {
    id: "dialog-everywhere-no-silent", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "One dialog everywhere, and no silent yes",
    why: "A browser without dialog support fell back to window.confirm, which named neither the count nor the stake and treated OK as yes. The same dialog renders in place instead, so the tests press the real buttons too.",
  },
  {
    id: "filled-section-stops-looking", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "A filled section stops looking empty",
    why: "The disclosure said \"Add reasoning or evidence\" whether or not anything was inside. The heading is stable now and a status follows it, the way a government task list marks a section as started.",
  },
  {
    id: "done-asks-reader-finish", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Done asks the reader to finish, and says what is missing",
    why: "Pressing Done on the overview with something empty repainted the same card and explained nothing. It goes to the gap and names it, and what is left is listed under the step at all times.",
  },
  {
    id: "cat-had-horns-then", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The cat had horns, and then its mouth crossed its body",
    why: "First the head outline peaked at both sides, which were the ears, and two more thin triangles were drawn floating above them. Then the mouth arc sat on the body top edge and the two curves read as one line. Ears joined to a round head, face eight units clear of the body.",
  },
  {
    id: "classified-file-left-attached", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "A classified file cannot be left attached",
    why: "Hiding the attach control was not enough: attach while the row is unclassified, raise the marking afterwards, and the file stayed, saved, and passed every check. The save is blocked now and the row says why, which is the one promise the pledge window makes.",
  },
  {
    id: "email-note-field-keeps", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The email note is a field, and keeps the line that was sent",
    why: "It was a prefix on the location text, so editing that text by hand changed the state, and renaming the initiative made the recorded subject and the shown subject disagree. There is also a way to take the note back.",
  },
  {
    id: "empty-evidence-row-stops", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The empty evidence row stops blocking the save",
    why: "Add evidence created a row with no marking, and the save gate demanded one immediately. An empty row is nothing to mark. A classified row no longer offers attaching at all, and a row already recorded as emailed does not offer it either.",
  },
  {
    id: "question-ids-lose-letter", track: "questions", section: "q-content", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Question ids lose a letter",
    why: "BU-Q1 is now B-Q1. The four domain initials are distinct, so the second letter carried nothing. Cheap today because no real submission exists; expensive once ids are column names in somebody exported spreadsheet.",
  },
  {
    id: "nothing-destroyed-step", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Nothing is destroyed in one step",
    why: "An audit found twenty destructive actions and eleven of them destroyed something with no prompt at all. Every one now asks, keeps a copy where it can, or leaves the work alone.",
  },
  {
    id: "applicable-hides-scale-keeps", track: "questions", section: "q-behaviour",
    kind: "feature", status: "done", priority: "low", owner: "ours", golive: false,
    t: "Not applicable hides the scale and keeps the score",
    why: "The eleven descriptions explain a score, and a question that does not apply has none. Ticking the box also used to erase the score, and unticking did not give it back.",
  },
  {
    id: "frame-stops-reading-part", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The frame stops reading as part of the page",
    why: "Measured: the header separated from the page by 1.13 to 1 in light and 1.08 to 1 in dark, and the page footer was exactly the page colour. The frame has its own edge token, the dark frame is now lighter than the page, the footer has a ground, and a shadow appears only once content scrolls under it.",
  },
  {
    id: "rail-stops-repeating-domain", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The rail stops repeating the domain tabs on a narrow screen",
    why: "Below 860px the rail lies down into a strip under the tabs. On the overview it had no section rows to show, so the same five items appeared twice. Found while checking the marking banner on the live page.",
  },
  {
    id: "prose-linter-takes-any", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The prose linter takes any file",
    why: "The writing rules were being applied from memory for chat replies, and em dashes went out. Replies go through the same linter as the app copy now.",
  },
  {
    id: "backlog-gets-jump-links", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Backlog gets jump links and a Done section that stays",
    why: "Done was at the bottom of eight layers with no way to reach it. Every section now has a link at the top, and Done is split into what came after Dan’s review and what he had already seen.",
  },
  {
    id: "every-backlog-item-carries", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Every backlog item carries its reason",
    why: "Five items had a title and nothing else, so they read as jargon. All of them now say why they exist.",
  },
  {
    id: "rail-s-overview-row", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Rail’s Overview row shows a count and a bar",
    why: "Every other rail row had both; Overview had neither, which reads as a row stuck at zero.",
  },
  {
    id: "overview-bar-moves-first", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Overview bar moves on the first keystroke",
    why: "It counted the three groups, and group one needs four fields. It now measures the six fields while the count still reads in groups.",
  },
  {
    id: "readme-settings-stop-describing", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "README and Settings stop describing a local-only tool",
    why: "Both said the tool cannot transmit and that the repo is private, and neither was true.",
  },
  {
    id: "settings-marks-unbuilt-parts", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Settings marks the unbuilt parts as unbuilt",
    why: "It promised a submit act and a withdrawal path as though both existed. Neither is written, and copy that describes a feature has to say whether the feature is there.",
  },
  {
    id: "opening-question-set-assessor", track: "engine", section: "e-assessor", kind: "bug",
    status: "done", priority: "high", owner: "ours", golive: false,
    t: "Opening a question set on the assessor page deletes the submitter’s draft",
    why: "Both pages are served from one address, so they share one browser store. The demonstration page was given its own namespace in September; the two real pages were not.\n\nWhat happens: the assessor page still offers Question set, and activating a set there clears the draft on the submitter page. Somebody halfway through 176 questions loses them, in another tab, with no warning.\n\nThe fix is the same one the demonstration page got: a namespace per side, so the two cannot reach each other’s keys.\n\nDONE on 1 October. Three lines went: making a set active no longer clears the draft, blanks the assessment or resets the overview. They were left over from when this picker was on the submitter’s side too, and the gate that moved it went in on 3 September.\n\nWorse than this item said, and found by building the published assessor page and driving it: nobody was warned. The guard in front of destructive acts measures the assessment in memory, and the assessor page boots with a blank one on purpose, so the guard scored the risk as nothing and committed without a window. Draft present, button pressed, draft gone, no dialog at either end.\n\nNOT FIXED THE WAY THIS ITEM PRESCRIBED. It asked for a storage namespace per side. That would rename the assessor’s saved audit, sign-in session and language on the next publish and orphan what is in people’s browsers now, and it would not touch the default build at all, because the namespace folds at build time while the side is chosen at runtime.\n\nThe test is the thing that was missing: nothing in the suite asserted anything about activating a set. It seeds a real draft and a second set, boots the built assessor page, presses the button and reads the draft back. With clearDraft() put back it goes red on exactly that line.\n\nOne thing left open on purpose, and it is its own item now: the active set is a shared name too, so a draft answered against the old set can sit in a browser whose active set is a different one, and nothing compares them.",
  },
  {
    id: "discarding-draft-browser-empty", track: "engine", section: "e-submitter", kind: "bug",
    status: "done", priority: "high", owner: "ours", golive: false,
    t: "Discarding a draft says the browser is empty, and it is not",
    why: "The window that asks you to confirm says it erases the copy this browser is holding, and the Settings row says the same. Both sentences are false.\n\nDiscarding removes one key. Every online save also writes a full second copy of the document under its own key, and nothing ever removes one of those. So the answers a person believed they had just destroyed are still in the browser, under a name they were never told about.\n\nTwo things to fix and they are separate: remove those copies when a draft is discarded, and until that is done, stop the screen claiming otherwise.\n\nDONE on 1 October. Discarding removes the copies as well as the draft, so the three sentences promising an empty browser are true rather than reworded, which is what somebody pressing a red button is entitled to.\n\nThe sweep matches the exact prefix and takes the list of names before removing anything, because removing from storage while walking it skips entries and a looser match would reach the draft itself or the demonstration page’s copies. What it costs is one extra read on the next save of a record whose copy is gone, down a path that already runs for the first save from any browser.\n\nWhy it was never caught: the assertion that existed lives in the suite built with no store, so no online save ever runs there and no second copy is ever written. The new one is in the hosted suite, which builds with a store, seeds two copies, drives a real discard through the window that asks, and reads the browser back. Without the sweep it goes red.",
  },
  {
    id: "assessor-screen-wrong-spacing", track: "engine", section: "e-broken", kind: "bug",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The assessor screen was on the wrong spacing ratio",
    why: "Measured: a card padded 1.05rem inside and margined .85rem below, so two unrelated blocks were 3.2px CLOSER together than a heading was to its own content. A ratio of 0.81 where the submitter’s results page runs 2.76. Every complaint about buttons crowding text came from that one inversion, plus .actions carrying no top margin at all, so its gap was whatever the element above happened to leave: zero after a table and zero after every heading. On the list screen the export button’s own border was touching the table’s closing rule while being 8px from the button beside it, so a control was closer to content it had nothing to do with than to its own group. On the detail screen 180 audit rows stacked at 0px apart, separated only by the hairline this stylesheet had already measured as too faint to read as a boundary, and 51 pairs of tinted rows touched and merged into one band.",
  },
  {
    id: "clear-gone-assessor-toolbar", track: "engine", section: "e-broken", kind: "bug",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Clear is gone from the assessor toolbar",
    why: "It emptied every submission and every score, verdict and reason the assessor had typed. The audit exists in one browser key and in a file somebody may or may not have saved, so it was the only copy: a control that destroyed an afternoon, on the main screen, the same size and colour as an export beside it. Closing one submission you are finished with is what an assessor actually wants and the screen could not do, so that is a per-row menu item now, and the one that closes everything is the last item of a menu in red with an offer to save the audited files first. No test covered the old button, which is how it lasted.",
  },
  {
    id: "assessor-s-review-saved", track: "engine", section: "e-done", kind: "bug",
    status: "done", priority: "high", owner: "ours", golive: false,
    t: "An assessor’s review is never saved anywhere but their own laptop",
    why: "The worst thing on this list. An assessor’s scores, verdicts and notes live in memory and in one key in their own browser, and the only button that does anything with them writes a file to their own laptop. views-review.ts makes no network call at all.\n\nWhat that costs a person: the department never sees the review. A second assessor cannot see the first one’s work. Clearing the browser, or picking up a different machine, loses all of it. And the portfolio tile that counts audited records reads the audit off the record, so it is permanently zero.\n\nThe decision to make first: the rules already allow an assessor to write a subcollection under the assessment, and nothing writes there. Taking that route needs no rules change and no republish, and it is about a day: a save, a read when the pool is listed, a change so the audited state comes from what was read, and a test. The other route, keeping the audit as a field of the assessment, needs the rules widened to let an assessor update somebody else’s document, which is more work and more risk. Take the subcollection.\n\nOne line of the code says \"the audit is in the store\", which is false, and goes in the same change.\n\nTHE SHAPE IS DECIDED, on 28 September, and passed on by the session building it rather than witnessed here. One audit document per assessor, beside the submission. An assessor may edit their own and nobody else’s. EARB sees every assessor’s opinion side by side, rather than one score of record, which is the part that had never been settled: the old design had a single audit on the assessment and no answer for two assessors disagreeing. And the department can read what was written about its own submission.\n\nThat resolves the field-or-subcollection question by making it neither: a document per assessor is a subcollection keyed by who wrote it, so an assessor writing their own needs no rule that lets anybody write anybody else’s, and nothing has to widen the update rule on the assessment itself.\n\nAND THE RULES DO HAVE TO CHANGE, which this item said twice that they did not. Corrected on 28 September by the session building it, and checked here against deploy/firestore.rules rather than taken on trust. Two lines fail the decisions above.\n\nallow create, update: if isAssessor() lets any assessor write an entry under any name, so one assessor can overwrite another’s audit. An assessor editing their own and nobody else’s needs the document named by the assessor’s address and the write tied to it.\n\nallow get, list: if isOwner() || isAssessor() does not do what it looks like. isOwner() compares ownerEmail on the document being read, and an audit document has no ownerEmail, so it is always false and the department cannot read the audits written about it. Letting them read it needs a look at the parent assessment.\n\nSo it is a rules change and a republish, small but real, and both belong in the same piece of work rather than after it.\n\nDONE on 28 September, built in another session and checked here against the live store rather than taken on trust. An audit is one document per assessor under the submission, named by their address. An assessor writes their own and the rules refuse them anybody else’s, twice over: the document name has to be their address and the reviewer field inside it has to match. The department that owns the submission may read every audit written about it, and a stranger signed in may not, and somebody holding only the access code may not either. Probed unauthenticated against the live project: the assessment opens on its name alone and the audits on it do not.\n\nOne thing worth keeping from how it was built. The rule that lets a department read its own audits needs a look at the parent assessment, and a look inside a rule is a billable read on every request that reaches it, refused ones included. The assessor test is written first, so the path every assessor walks on every submission never pays for one and only a department does.",
  },
  {
    id: "nothing-tests-signing-google", track: "engine", section: "e-broken", kind: "bug",
    status: "done", priority: "medium", owner: "ours", golive: false,
    t: "Nothing tests signing in with Google",
    why: "Half of this was already done. The email-link sign-in is tested end to end: the test stubs the two calls, opens a real link and checks the code sent, the address sent and the session that comes back.\n\nThe Google route had nothing. Four calls carried it and no test mentioned any of them — the only assertion anywhere was that the button is on the screen, which is exactly why a redirect mismatch shipped in September and sat there. The button was on the screen the whole time.\n\nDONE on 1 October. Twenty-nine checks, in four parts, because there is no popup and no SDK: the browser is sent to Google and comes back to a fresh load of this same page with an answer in the address, so the two halves are two page loads and had to be written as two.\n\nThe press: the request names Google, asks for the code flow, and returns to this page with no query and no fragment. That last line is the September break and the only part of the request that can cause it. What has to survive the trip is held for the tab and not for the machine, so closing the tab abandons the attempt and leaves nothing on a shared computer.\n\nThe return: the whole address goes back, with the session the tab was holding, which is the only thing joining the two calls. The person ends up signed in and the spent answer comes out of the address bar, for the same reason the link code does — an address bar goes into history, into a bookmark and into anything pasted into a ticket.\n\nThe refusal: a refused exchange says on screen that it did not go through, names the provider and carries what the service said, because redirect_uri_mismatch is ours to fix and nobody can fix what they cannot read. That was the whole of the September defect: every caller was a bare `void signInWithGoogle()`, so the refusal went into a promise nothing was reading and the screen simply stayed as it was. And the dead attempt is cleared, because a session id is good once and a leftover one fails the next try for a reason unrelated to the real problem.\n\nThe empty answer: a 200 carrying no address used to send the browser to `undefined`.\n\nEach part was checked by breaking the code it covers and watching it go red: the return address with something on the end, the session id not carried across, the spent answer left in the address bar, the dead attempt left in the tab, and the attempt kept on the machine instead of in the tab. Five breakages, every one caught.",
  },
  {
    id: "rules-tested-nobody-signed", track: "engine", section: "e-broken", kind: "bug",
    status: "done", priority: "medium", owner: "ours", golive: false,
    t: "The rules are only ever tested with nobody signed in",
    why: "The blocker is gone. There is now a rules test that runs Google’s own Firestore with our rules loaded, and it proves what an anonymous request can and cannot do.\n\nWHAT THIS ITEM ASKED FOR DOES NOT EXIST. It wanted proof that one submitter cannot read another’s assessment. There is no such rule and there is not meant to be: the rules say allow get: if true, because a record opens on its twelve-character name, and that is how a department hands one to a colleague who has no account. Knowing the code is the permission. The barrier is the list, not the read, and that half of the item was right.\n\nDONE on 1 October. Eight checks now run signed in. Four on the pool: an assessor asks for every submission and gets it, an account with no role is refused however it asks, so is somebody signed out, and one record still opens on its name alone. Four on the roles collection, which is the other half of the same barrier, because the rule that decides who is an assessor reads it on every single request, and a rule that leaks it hands out the list of accounts worth attacking: a person reads their own role and nobody else’s, an assessor lists who else is one, and a signed-out request reads neither.\n\nEvery one of them was checked by breaking the rule it covers and watching it go red. That is also what caught a mistake in the checking: the first mutation was aimed at the assessments list and landed on the roles block instead, because the two lines read identically, and nothing failed. Nothing had ever run the roles rules. That accident is why four of the eight exist.",
  },
  {
    id: "changing-question-s-meaning", track: "questions", section: "q-broken", kind: "bug",
    status: "done", priority: "medium", owner: "ours", golive: false,
    t: "Changing a question’s meaning warns once, then the warning is written away",
    why: "The lock file exists so a question cannot quietly change meaning while old submissions still carry its id. It did not hold. A changed meaning printed a warning and carried on, where a bad section name a few lines later stopped the run outright. Then the same run rewrote the lock at the end, so the drift was absorbed and the second run was silent.\n\nNothing else in the repository read the lock file, and it was not in the test suite. So it recorded what happened rather than preventing it.\n\nDONE on 1 October. A changed meaning now stops the import, the way a mistyped category always did, and the refusal prints both readings of the id so it can be judged without opening the workbook.\n\nThe write refuses too, and that is the part that matters. The comparison and the write moved into tools/rubric-lock.mjs, and saveLock() throws rather than record a meaning nobody approved. Taking the import’s exit back out would not be enough to let the drift into the file. The old defect was not a missing message, it was a run that warned and then wrote the drift down anyway, and a message is removable in a way a throw is not.\n\nThe escape hatch is by name and not a flag: EARB_IDS_APPROVED=B-Q3 names the one id whose meaning was meant to change, so approving one change cannot wave through a second one that arrived in the same workbook. Deleting the lock still works and is still the right move only when the whole set has been replaced.\n\nRemoving a question is still allowed, and said out loud rather than refused. Dan is about to remove several — the duplicates he found on 26 September — and a lock that stopped him editing his own instrument would be the wrong tool.\n\nEighteen checks, run by npm test, where there were none. Six of them are the comparison, five are the write against a real file on disk, and three read the rubric that ships against the lock that ships, which nothing had ever compared. Verified by breaking it three ways: the write stopping refusing, a removal counting as drift, and approval becoming a flag. All three went red.\n\nAlso run end to end against Dan’s actual spreadsheets, which live outside the repository: a clean run produces byte-identical output, a tampered lock exits 1 and is not rewritten, and the approval line lets exactly that one id through.",
  },
  {
    id: "submitter-delete-withdraw-submission", track: "engine", section: "e-submitter",
    kind: "question", status: "open", priority: "medium", owner: "ours", golive: false,
    t: "A submitter cannot delete or withdraw their own submission",
    why: "True, and it is our decision, not a wait on anybody. The rules let only an assessor delete, and only an assessor withdraw. The one destructive thing a submitter can do is discard the copy in their own browser; the copy at TBS stays.\n\nSettings already tells them so, in those words. What is missing is the decision: can a department pull back a submission it sent by mistake, and does pulling it back delete it or only take it out of the statistics. After that it is about one line of rules and one button.\n\nIt was marked as waiting on the \"Build team\", which is us, and that was wrong.\n\nNOT FILED UNDER BROKEN, and it was. Asked: why is it in broken when the item itself says it is our decision. Nothing is broken. The rules refuse it on purpose and Settings says so on screen. What is missing is the decision, which is ours, so it sits with the submitter’s screens.",
  },
  {
    id: "restrict-browser-key-site", track: "admin", section: "a-owner", kind: "feature",
    status: "open", priority: "medium", owner: "ours", golive: false,
    parent: "personal-accounts",
    t: "Restrict the browser key to our own site and three services",
    why: "GitHub flagged the Firebase web key in the published page as a Google API key. It is a public identifier by design and it authorises nothing on its own, so the page is not a leak. What is worth changing is that the key currently answers from anywhere: a check from the command line reached the project with no site attached at all. In the Google Cloud console, under Credentials, the browser key takes a website restriction of myermcat.github.io and localhost, and an API restriction of Identity Toolkit, Token Service and Cloud Firestore. Nothing the tool does falls outside those three.",
  },
  {
    id: "close-github-secret-scanning", track: "admin", section: "a-owner", kind: "feature",
    status: "open", priority: "low", owner: "ours", golive: false, parent: "personal-accounts",
    t: "Close the GitHub secret-scanning alert as will not fix",
    why: "The alert is correct about what it found. Revoking the key would take the store down and change nothing about who can read what, because reading is gated by sign-in and by the published rules. Will not fix, with the restriction above as the note.",
  },
  {
    id: "whether-department-many-decisions", track: "questions", section: "q-behaviour",
    kind: "feature", status: "open", priority: "low", owner: "ours", golive: false,
    t: "Whether a department says how many decisions are already made",
    why: "Dan floated this on 21 September as a way to tell whether an assessment can still change anything. A department that has chosen the product and signed the contract answers the same 176 questions as one still deciding, and the two are worth different amounts to a board. It would be one overview field and nothing scored.",
  },
  {
    id: "answer-types-criticality", track: "questions", section: "q-behaviour", kind: "feature",
    status: "wait", priority: "medium", owner: "Dan", golive: false,
    t: "Answer types and criticality",
    why: "The shape of the questions, which Dan called the biggest remaining piece. Our reading is in the tool and labelled provisional.",
  },
  {
    id: "confirm-answer-type-every", track: "questions", section: "q-behaviour", kind: "feature",
    status: "wait", priority: "medium", owner: "Dan", golive: false, owes: "Dan",
    parent: "answer-types-criticality",
    t: "Confirm the answer type for every question",
    why: "Ten are yes/no on our reading of the wording. The other 166 are scored 0 to 10.",
  },
  {
    id: "confirm-no-answers-matter", track: "questions", section: "q-behaviour", kind: "feature",
    status: "wait", priority: "medium", owner: "Dan", golive: false, owes: "Dan",
    parent: "answer-types-criticality",
    t: "Confirm which no answers matter most",
    why: "Every no colours its section red today. If some should not, that is his call.",
  },
  {
    id: "set-per-question-criticality", track: "questions", section: "q-behaviour",
    kind: "feature", status: "wait", priority: "medium", owner: "Dan", golive: false,
    owes: "Dan", parent: "answer-types-criticality",
    t: "Set per-question criticality",
    why: "Separate from section weight, and nothing in his workbook carries it.",
  },
  {
    id: "content-dan-still-owes", track: "questions", section: "q-content", kind: "feature",
    status: "wait", priority: "medium", owner: "Dan", golive: false,
    t: "Content Dan still owes",
    why: "None of this is ours to write.",
  },
  {
    id: "fix-section-weights-total", track: "questions", section: "q-content", kind: "feature",
    status: "wait", priority: "medium", owner: "Dan", golive: false, owes: "Dan",
    parent: "content-dan-still-owes",
    t: "Fix the section weights that total 80",
    why: "His error, confirmed in his own words. The tool shares the missing 20 proportionally and shows the normalised share.",
  },
  {
    id: "add-security-privacy-questions", track: "questions", section: "q-content",
    kind: "feature", status: "open", priority: "low", owner: "Dan", golive: false,
    parent: "content-dan-still-owes",
    t: "Add security and privacy questions",
    why: "Neither is represented. A security review is already asking. The topic view makes the gap visible in the meantime.",
  },
  {
    id: "bring-dropdown-answers", track: "questions", section: "q-content", kind: "feature",
    status: "wait", priority: "medium", owner: "Dan", golive: false, owes: "Dan",
    parent: "content-dan-still-owes",
    t: "Bring in the dropdown answers",
    why: "No picklists exist. Needs the 700 or more past assessments, which only he can hand over.",
  },
  {
    id: "routing-thresholds-approximations-dan", track: "questions", section: "q-behaviour",
    kind: "feature", status: "open", priority: "low", owner: "ours", golive: false,
    t: "The routing thresholds are approximations, and Dan said so",
    why: "Confirmed on 21 September: the numbers the tool routes on are the ones he named in the first conversation and are not accurate. He added a case the tool cannot express. A department scoring itself around three does not need to come to the board at all, because everybody already agrees the work is weak, and what matters is what they plan to do about it. So the band is not one line with a score on each side of it.",
  },
  {
    id: "recording-rework-loop", track: "engine", section: "e-assessor", kind: "feature",
    status: "open", priority: "low", owner: "ours", golive: false,
    t: "Recording the rework loop",
    why: "Dan called the back and forth before a board date the real value GC EARB adds, and said on 21 September that he cannot prove that value because nothing captures it. It is also why the endorsement rate is 100 per cent: an initiative that would fail is reworked or abandoned before it ever reaches the board. Recording each round would make it visible. What a round looks like as data is the open question, and nobody has answered it.",
  },
  {
    id: "question-mechanics", track: "questions", section: "q-behaviour", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Question mechanics",
    why: "What the instrument can carry.",
  },
  {
    id: "multiple-answer-types", track: "questions", section: "q-behaviour", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "question-mechanics",
    t: "Multiple answer types",
    why: "A type field with scale as the default, so nothing existing breaks.",
  },
  {
    id: "no-answer-colours-section", track: "engine", section: "e-storage", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "question-mechanics",
    t: "A no answer colours its section",
    why: "The question, its section, its rail row and its domain tab, and it stops nothing.",
  },
  {
    id: "topic-metadata-per-topic", track: "questions", section: "q-behaviour", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "question-mechanics",
    t: "Topic metadata and per-topic roll-up",
    why: "Security, privacy, cost, data, business and technology, visible without inventing a fifth domain.",
  },
  {
    id: "two-topic-scoring", track: "questions", section: "q-behaviour", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "question-mechanics",
    t: "Two-topic scoring",
    why: "Once in the overall, at full weight inside each topic, because the weight genuinely differs by topic.",
  },
  {
    id: "saving-two-people-saving", track: "engine", section: "e-storage", kind: "feature",
    status: "open", priority: "medium", owner: "ours", golive: false,
    t: "Saving, and two people saving at once",
    why: "Everything is unclassified, so it can all live online. The seam is written; the store is not.",
  },
  {
    id: "store-seam", track: "engine", section: "e-storage", kind: "feature", status: "done",
    priority: "low", owner: "ours", golive: false, parent: "saving-two-people-saving",
    t: "The store seam",
    why: "src/store.ts. One constant from live, and the dashboard already reads through it.",
  },
  {
    id: "three-calls-real-write", track: "engine", section: "e-storage", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    parent: "saving-two-people-saving",
    t: "The three calls a real write needs",
    why: "Saving, saved, failed with a reason. Nothing drives them yet, so the wording is settled before the write exists.",
  },
  {
    id: "deliberate-first-submit", track: "engine", section: "e-storage", kind: "feature",
    status: "open", priority: "medium", owner: "ours", golive: false,
    parent: "saving-two-people-saving",
    t: "One deliberate first submit",
    why: "You should know the moment your work becomes visible to TBS.",
  },
  {
    id: "autosave-online-after", track: "engine", section: "e-storage", kind: "feature",
    status: "open", priority: "medium", owner: "ours", golive: false,
    parent: "saving-two-people-saving",
    t: "Autosave online after that",
    why: "Like a document. Every later change writes through.",
  },
  {
    id: "field-level-last-write", track: "engine", section: "e-storage", kind: "feature",
    status: "open", priority: "low", owner: "ours", golive: false,
    parent: "saving-two-people-saving",
    t: "Field-level last write wins, with a marker",
    why: "Not locking. Two people in different questions never collide.",
  },
  {
    id: "tell-other-person-changed", track: "engine", section: "e-storage", kind: "feature",
    status: "open", priority: "low", owner: "ours", golive: false,
    parent: "saving-two-people-saving",
    t: "Tell the other person it changed under them",
    why: "The audit trail already keeps both accounts. What is missing is the live signal while somebody is looking at the line.",
  },
  {
    id: "submitter-answers-assessor-scores", track: "engine", section: "e-storage",
    kind: "feature", status: "done", priority: "low", owner: "ours", golive: false,
    parent: "saving-two-people-saving", seen: true,
    t: "Submitter answers and assessor scores are separate fields",
    why: "Which is why a submitter and an assessor cannot collide at all.",
  },
  {
    id: "questionnaire-phone", track: "engine", section: "e-submitter", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The questionnaire on a phone",
    why: "Measured at 375 by 812, before and after. The page laid out 601px wide and every question card was cut off at the right edge; it is 375 now. The fixed header was 322px and the bar at the bottom 191px against an 812px screen, so the question itself had 299px, and it has 500.9, which is the first time a whole question card fits. The section rail rendered as a row of bare counts because every label collapsed to zero width, and it names its sections again. Four captions in the bar were bare English inside a bilingual tool. No new breakpoint was added and a gate refuses an eighth, because seven narrow widths were already in the file and none of them was the agreed one. Desktop measured unchanged at 1200 by 900. Nobody has said they are filling this in on a phone, and nobody has said they are not.",
  },
  {
    id: "every-readout-agrees-page", track: "engine", section: "e-submitter", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Every readout agrees with the page under a category lens",
    why: "Reported as: with Security on, the rail still shows 0 of 9 for a section showing 2 questions. Three places counted the same questions and only the domain tabs knew a lens was on. One function counts now and every readout calls it, so with Security on and Business open the tab, the rail row and the bar at the bottom all say 0 of 1 against the one question on the page, the four tabs add up to 25, and that is what the chip and the second bar say. Nothing exercised the lens at all, which is how it shipped; the gate asserts that the readouts agree with the questions rendered rather than pinning any figure, because the figures are Dan’s to change.",
  },
  {
    id: "evidence", track: "engine", section: "e-submitter", kind: "feature", status: "done",
    priority: "low", owner: "ours", golive: false,
    t: "Evidence",
    why: "The change that follows from unclassified-only.",
  },
  {
    id: "ask-link", track: "engine", section: "e-submitter", kind: "feature", status: "done",
    priority: "low", owner: "ours", golive: false, parent: "evidence",
    t: "Ask for a link",
    why: "Point at where it lives, and make sure your assessor can open it.",
  },
  {
    id: "email-fallback-pattern", track: "engine", section: "e-submitter", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "evidence",
    t: "Email fallback, with a pattern",
    why: "Marking, sent by email, subject line written for you, so an assessor can find it.",
  },
  {
    id: "classified-pledge-modal", track: "engine", section: "e-submitter", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The classified pledge, as a modal",
    why: "She chose Protected A on the strip that says \"mark this file to save it\" and nothing happened. The advice panel was on a different screen, so it could be scrolled past and was.",
  },
  {
    id: "any-marking-above-unclassified", track: "engine", section: "e-submitter",
    kind: "feature", status: "done", priority: "low", owner: "ours", golive: false,
    parent: "classified-pledge-modal",
    t: "Any marking above unclassified takes over the screen",
    why: "Whichever control set it. The strip, the picker, and anything added later go through one function, so they cannot drift apart again.",
  },
  {
    id: "close-control-dead-until", track: "engine", section: "e-submitter", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    parent: "classified-pledge-modal",
    t: "The close control is dead until the box is ticked",
    why: "Grey and unclickable, and it says \"tick the box first\". Escape does not dismiss it and clicking outside does nothing.",
  },
  {
    id: "way-changes-answer", track: "engine", section: "e-submitter", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    parent: "classified-pledge-modal",
    t: "The way out changes the answer",
    why: "An accidental click needs an exit that is not a dismissal: \"this is unclassified after all\" changes the answer, and the warning stands.",
  },
  {
    id: "asks-once-per-marking", track: "engine", section: "e-submitter", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    parent: "classified-pledge-modal",
    t: "It asks once per marking",
    why: "After the pledge, switching between classified markings does not ask again. The panel on the overview stays as the reference.",
  },
  {
    id: "unmarked-banner-opens-marking", track: "engine", section: "e-submitter",
    kind: "feature", status: "done", priority: "low", owner: "ours", golive: false,
    parent: "classified-pledge-modal",
    t: "The unmarked banner opens the marking question",
    why: "It scrolled to an element that only exists on the overview, so from any of the twenty question pages it did nothing at all.",
  },
  {
    id: "marking-pickers", track: "engine", section: "e-submitter", kind: "feature",
    status: "open", priority: "low", owner: "ours", golive: false,
    t: "The marking pickers",
    why: "Somebody still has to state the marking of what they point at.",
  },
  {
    id: "big-unclassified-tile-six", track: "engine", section: "e-submitter", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "marking-pickers",
    t: "One big unclassified tile, the six grouped behind it",
    why: "The default must not be taxed by the rare path.",
  },
  {
    id: "classified-panel-acknowledgement-toggle", track: "engine", section: "e-submitter",
    kind: "feature", status: "done", priority: "low", owner: "ours", golive: false,
    parent: "marking-pickers",
    t: "Classified panel with an acknowledgement toggle",
    why: "What to do instead, at the moment it is relevant.",
  },
  {
    id: "collapse-three-pickers", track: "engine", section: "e-submitter", kind: "feature",
    status: "open", priority: "low", owner: "ours", golive: false, parent: "marking-pickers",
    t: "Collapse three pickers into one",
    why: "The footer’s seven pills bypass the whole design.",
  },
  {
    id: "sending-tbs", track: "engine", section: "e-submitter", kind: "feature", status: "open",
    priority: "medium", owner: "ours", golive: false,
    t: "Sending it to TBS",
    why: "The moment work stops being private. Everything here is about the person knowing that.",
  },
  {
    id: "first-submit-confirmation", track: "engine", section: "e-submitter", kind: "feature",
    status: "open", priority: "medium", owner: "ours", golive: false, parent: "sending-tbs",
    t: "First-submit confirmation",
    why: "Names what is about to go online and asks them to confirm it is unclassified.",
  },
  {
    id: "save-status-indicator", track: "engine", section: "e-submitter", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "sending-tbs",
    t: "Save status indicator",
    why: "Draft in browser, saving, saved, or not saved with a reason. It is in the header now, so it is on every screen and on a phone; it was on the 21 question pages only, and CSS hid it below 720px.",
  },
  {
    id: "silent-until-something-actually", track: "engine", section: "e-submitter",
    kind: "feature", status: "done", priority: "low", owner: "ours", golive: false,
    parent: "sending-tbs",
    t: "Silent until something is actually written",
    why: "It opened at \"draft saved in browser\" on an empty page, which is a claim ahead of the fact.",
  },
  {
    id: "live-indicator-whole-visit", track: "engine", section: "e-submitter", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "sending-tbs",
    t: "One live indicator for the whole visit",
    why: "Each repaint added another listener holding a dead node. Harmless while the state never changed, and a leak the moment writes start.",
  },
  {
    id: "who-the-assessor-is", track: "engine", section: "e-assessor", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Who the assessor is",
    why: "Their name goes against a number somebody may dispute, so the tool has to say whose name it is and how much that name is worth.\n\nDone in the sense that everything that was under this heading is finished: the screen that takes a name and labels it unverified on everything it records. The part that is not finished is not this item. Proving who somebody really is needs a work credential, and that is the sign-in item under Administrative, where it sits with Microsoft, CanadaLogin and the message owed to Cyber Security.\n\nClosed on 28 September after it was spotted wearing a Done badge while sitting in the open list. The row was showing the state of the only thing under it and its own field still said waiting, so the page and the file disagreed. The build refuses that now.",
  },
  {
    id: "mockup-verification-screen", track: "engine", section: "e-assessor", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "who-the-assessor-is",
    t: "Mockup verification screen",
    why: "Labelled a mockup, the departmental-account button visibly disabled, everything unverified.",
  },
  {
    id: "nothing-assessor-typed-overwritten", track: "engine", section: "e-assessor",
    kind: "feature", status: "done", priority: "low", owner: "ours", golive: false,
    t: "Nothing an assessor typed is overwritten silently",
    why: "Four places did it. Agree-with-all replaced a verdict somebody had already given, the note field rewrote the reason on whatever change was last in the trail, reloading a file of the same name discarded the audit attached to it without a word, and the email button wrote over a link somebody had typed.",
  },
  {
    id: "auditing-rules-dan-gave", track: "engine", section: "e-assessor", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Auditing rules Dan gave as rules",
    why: "He stated all five as requirements in the review, and all five are built.",
  },
  {
    id: "justification-required-changed-score", track: "engine", section: "e-assessor",
    kind: "feature", status: "done", priority: "low", owner: "ours", golive: false,
    parent: "auditing-rules-dan-gave",
    t: "Justification required on a changed score",
    why: "His rule. The file cannot be saved while one is missing, and the button says how many are outstanding.",
  },
  {
    id: "accept-per-section", track: "engine", section: "e-assessor", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    parent: "auditing-rules-dan-gave",
    t: "Accept-all per section",
    why: "He asked for it by name. It touches no score, and skips any changed score that still needs a reason.",
  },
  {
    id: "assessor-recorded-per-question", track: "engine", section: "e-assessor",
    kind: "feature", status: "done", priority: "low", owner: "ours", golive: false,
    parent: "auditing-rules-dan-gave",
    t: "Assessor recorded per question",
    why: "Two assessors on one high-profile file. Each change carries a name, a time and a reason.",
  },
  {
    id: "edit-exchange-visible", track: "engine", section: "e-assessor", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    parent: "auditing-rules-dan-gave",
    t: "The edit exchange, visible",
    why: "The line says it was edited and by whom. The full back and forth opens on request, and nothing is overwritten.",
  },
  {
    id: "evidence-read", track: "engine", section: "e-assessor", kind: "feature", status: "done",
    priority: "low", owner: "ours", golive: false, parent: "auditing-rules-dan-gave",
    t: "Evidence read-only",
    why: "Already true, and now held true by a test.",
  },
  {
    id: "load-question-set-moves", track: "questions", section: "q-content", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Load a question set moves here",
    why: "It belongs to whoever maintains the instrument. A submitter is told where it lives and not handed the control.",
  },
  {
    id: "reachable-without-going-through", track: "engine", section: "e-admin", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Reachable without going through the assessor view",
    why: "It sat behind two clicks on the assessor side with nothing on the start page pointing at it. There is a line under the assessor link now, and it asks who you are the same way.",
  },
  {
    id: "portfolio-dashboard", track: "engine", section: "e-admin", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The portfolio dashboard",
    why: "Dan’s self-updating dashboard. It recalculates every record from the answers as the page draws, so there is no stored number to go stale.",
  },
  {
    id: "averages-domain-topic", track: "engine", section: "e-admin", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "portfolio-dashboard",
    t: "Averages by domain and by topic",
    why: "The topic cut is the one a single assessment cannot show: security spread thin over four domains looks fine in each of them.",
  },
  {
    id: "every-record-weakest-first", track: "engine", section: "e-admin", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "portfolio-dashboard",
    t: "Every record, weakest first",
    why: "The list is a worklist. Red rows are the ones with a no answer.",
  },
  {
    id: "portfolio-csv", track: "engine", section: "e-admin", kind: "feature", status: "done",
    priority: "low", owner: "ours", golive: false, parent: "portfolio-dashboard",
    t: "Portfolio CSV",
    why: "One row per record, topic columns included.",
  },
  {
    id: "currently-see", track: "engine", section: "e-admin", kind: "feature", status: "done",
    priority: "low", owner: "ours", golive: false, parent: "portfolio-dashboard",
    t: "It says what it can currently see",
    why: "With no store, that is this browser and the files opened this session. The page says so, so it cannot be read as live.",
  },
  {
    id: "admin-actions", track: "engine", section: "e-admin", kind: "feature", status: "wait",
    priority: "low", owner: "ours", golive: false, owes: "Dan",
    t: "Admin-only actions",
    why: "Nobody has decided whether admin is a role. Listed so the roles matrix is complete.",
  },
  {
    id: "withdraw-record", track: "engine", section: "e-admin", kind: "feature", status: "open",
    priority: "low", owner: "ours", golive: false, parent: "admin-actions",
    t: "Withdraw a record",
    why: "Out of every statistic and still in the list, with nothing deleted.",
  },
  {
    id: "re-assign-assessor", track: "engine", section: "e-admin", kind: "feature",
    status: "open", priority: "low", owner: "ours", golive: false, parent: "admin-actions",
    t: "Re-assign an assessor",
    why: "Somebody leaves, or a file needs a second pair of eyes.",
  },
  {
    id: "clear-test-submissions", track: "engine", section: "e-admin", kind: "feature",
    status: "open", priority: "low", owner: "ours", golive: false, parent: "admin-actions",
    t: "Clear out test submissions",
    why: "Dan raised it and parked it.",
  },
  {
    id: "twelve-month-questions-dan", track: "engine", section: "e-exec", kind: "feature",
    status: "open", priority: "low", owner: "ours", golive: false,
    t: "The twelve-month questions Dan wants answered",
    why: "The reason the data is worth capturing at all. All of it needs more than one record to mean anything.",
  },
  {
    id: "per-question-averages-histograms", track: "engine", section: "e-exec", kind: "feature",
    status: "open", priority: "low", owner: "ours", golive: false,
    parent: "twelve-month-questions-dan",
    t: "Per-question averages and histograms",
    why: "Which questions the whole GC is weak on, which is the argument for changing a question.",
  },
  {
    id: "average-department", track: "engine", section: "e-exec", kind: "feature",
    status: "open", priority: "low", owner: "ours", golive: false,
    parent: "twelve-month-questions-dan",
    t: "Average by department",
    why: "Needs enough records that a department average is not one initiative.",
  },
  {
    id: "best-worst-evidence-per", track: "engine", section: "e-exec", kind: "feature",
    status: "open", priority: "low", owner: "ours", golive: false,
    parent: "twelve-month-questions-dan",
    t: "Best and worst evidence per question",
    why: "Gives a submitter an example of what good looks like, which is the thing people ask for first.",
  },
  {
    id: "assessor-sign", track: "admin", section: "a-signin", kind: "feature", status: "open",
    priority: "high", owner: "ours", golive: false,
    t: "Assessor sign-in",
    why: "Four routes, and they are a sequence rather than a choice. Each was argued on its own and the cheapest was never costed.",
  },
  {
    id: "sign-link-sent-work", track: "admin", section: "a-signin", kind: "feature",
    status: "open", priority: "high", owner: "ours", golive: false, parent: "assessor-sign",
    t: "Sign in with a link sent to your work address",
    why: "Built and working. Firebase mails a one-time link, opening it proves the person can read that mailbox, and the address comes back verified, which is what the store’s rules insist on. It sits under Other ways to sign in, below the Google button.\n\nWhat it costs: five sign-in emails a day for the whole project on the no-cost plan. Read that as five sign-in events, not five people; somebody who signs in once stays signed in until they clear their browser. A room trying it at the same time, or one person mistyping twice, is what it will not survive.\n\nThere is no per-email price anywhere in Firebase. The two columns of that table are headed \"instrumentless\" and \"with billing instrument\", so what moves you past five is attaching a card, not spending money. Do not attach one yet: Firebase’s spend caps do not cover Firestore or Authentication, so a card removes the only ceiling this project has.\n\nTesting costs nothing now. Generating a link is a different operation with a limit of 20,000 a day and it posts no mail, so links can be made on a laptop and sent from an ordinary mailbox.\n\nWhat is still unsolved is delivery to a gc.ca address. Mail from this project goes out as noreply at a firebaseapp.com address, with no sender name, carrying a link to that same domain, which has no DMARC record and is a documented phishing host. A copy sent to a Gmail address on 27 September landed in spam. TBS sits behind Microsoft Defender, where high-confidence phishing is quarantined where an ordinary user cannot see it, and Safe Senders is explicitly ignored.",
  },
  {
    id: "password-set-link-later", track: "admin", section: "a-signin", kind: "feature",
    status: "open", priority: "medium", owner: "ours", golive: false, parent: "assessor-sign",
    t: "A password, set from a link, so later sign-ins cost no mail",
    why: "Asked for on 26 September: add password sign in. Dan waved it away in the first conversation and the reason was never written down, so ask him before building it. What it buys is the cap. Firebase’s own limits table gives sign-in link mail five a day for the whole project and password reset mail a hundred and fifty, on the same no-cost plan, and there is no per-message charge on either. The shape that keeps this tool’s promise is not a password box on the front door. Nobody types a password to get in the first time: an assessor is invited with a link, which spends one of the five, and once they are inside, the tool offers to set a password on an address the link has already verified. That inverts the cap. Five a day stops meaning five sign-ins and starts meaning five new people, and somebody who already has a password is never counted again, because signing in with one sends no mail at all. It satisfies the store’s rules for the same reason the link does: those rules ask only that the address be verified, and an address verified by a link stays verified when a password is set on it. What it costs is that passwords then exist, which this tool was built to avoid, and a password is one more thing somebody reuses from another site. It also needs a way back for somebody who forgets one, which is the hundred and fifty a day and not the five. Nothing is needed in the console: Email/Password was enabled on 24 September alongside the link.",
  },
  {
    id: "sign-work-microsoft-account", track: "admin", section: "a-signin", kind: "feature",
    status: "open", priority: "low", owner: "ours", golive: false, parent: "internal-gc-sign-in",
    t: "Sign in with a work Microsoft account",
    why: "The final goal, and the blocker is a measurement nobody has taken rather than a decision from TBS. Three things settled on 24 September. One, registration needs nobody’s advance permission: an application registered once as multi-tenant lets people from any Microsoft directory sign in, the other organisation is never asked beforehand, and it costs nothing. The September note saying TBS must register it was wrong about that. Two, what is true is narrower and it is ours: the store refuses any identity without a verified address, and Firebase has an open report since August 2024 that it reports a Microsoft address as unverified. Three, and this is the part that changes the answer, that report is about an address signing in for the first time, where Microsoft creates the account. An address that has already signed in once by emailed link already exists with a verified address, and Firebase with one account per address does not make a second. The link shipped first, so that is the case our three assessors will actually meet. Nobody has measured either case. Measuring costs an application registration in any directory somebody already has, which Entra lets an ordinary user make by default, and then one real sign-in with the token read back. If the answer is that the address comes back verified, the build is a button, a provider enabled in the console and two redirect addresses. If it comes back unverified, the choice is between asking TBS for a single-tenant registration, which keeps the rules intact because TBS controls the addresses, and softening the rule, which would mean trusting every directory administrator in the world with a claim they are free to set, over a store holding pre-decisional departmental work. Do not soften the rule.",
  },
  {
    id: "ask-security-already-assessed", track: "admin", section: "a-signin", kind: "feature",
    status: "open", priority: "low", owner: "ours", golive: false, parent: "internal-gc-sign-in",
    t: "Ask IT Security what they have already assessed",
    why: "The question under the other three, and nobody has asked it. Nick said what they would prefer depends on what IT Security has assessed, and that this is corporate and not his group. The useful ask is for the list of assessed services, because the list decides the destination, where a ruling on Firestore only closes a door. He named Robin Sidhu for the identity side and was explicit that it is a separate conversation from which third-party services are authorised. Asking IMTD for an Azure registration before this is a request that fails twice. Commitment: none, it is one message.",
  },
  {
    id: "priced-stores-answer-keep", track: "admin", section: "a-publish", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "assessor-sign",
    t: "Priced the stores, and the answer is to keep Firestore",
    why: "Asked on 23 September: how much would it cost if paid, is there anything free, why are we on Firestore at all. Three answers. The bill is nothing and would stay nothing: Firestore in Montreal is 3.3 cents per hundred thousand reads past a free fifty thousand a day, and this tool would need three million reads in one day to be charged one cent. Pay-as-you-go carries the same free amounts, so the only thing a card changes is the mail quota. Nothing is cheaper, because nothing is cheaper than nothing, and the free tiers elsewhere carry traps this tool would hit: a Supabase project on the free plan is paused after a week of no traffic, which is exactly what a tool used before a board meeting looks like, and its own sign-in mail is capped at two an hour. Appwrite has no Canadian region. Corrected on 24 September: this entry used to say the access code could not survive the move, and that was wrong. It was tested against a real Postgres rather than argued about. A code is a twelve-character string; it is a document name today and would be a primary key tomorrow, and nothing anybody holds carries it in a link, so every code keeps working. The mechanism survives too: a policy of the form USING (id = the code arriving as a request header) gives a holder exactly their own row and gives somebody with no code nothing, including through a count. Twenty assertions, all passing. What does not survive is the simplicity. The four comparisons that stop a code holder moving a record into somebody else’s account become a trigger function, and everything in a Supabase public schema is reachable by the anonymous key until it is given a policy of its own, where a Firestore path with no rule is closed. The reason to stay is simpler and it is about this tool’s rhythm: a free Supabase project is paused after a week without traffic, and this tool goes quiet for months between assessment rounds, so the first assessor back would meet a sleeping database and a dashboard they have no account on.",
  },
  {
    id: "moving-store-off-firestore", track: "admin", section: "a-publish", kind: "feature",
    status: "open", priority: "low", owner: "ours", golive: false, parent: "assessor-sign",
    t: "Moving the store off Firestore",
    why: "Rewritten on 23 September because the first version of this was not understandable. What it means: today the page talks straight to Google’s database and Google decides who may read what. Moving off Firestore means putting something of our own in the middle, and then we decide, which means we are the thing that has to be right, stay up and stay patched after the work term ends. Today a bad request is refused even if somebody edits the page’s JavaScript in their own browser. Three to five weeks for a destination somebody has named, and no estimate for one nobody has: only three files anywhere name Firestore, but the tidy seam covers the submitter’s document alone and eleven modules reach past it for roles, sign-in, withdrawal and the code lookup, so those get untangled first. And it does not fix the reason an assessor needs an account. Show me every submission cannot be tied to a secret somebody is holding; a server has the same problem, because it still has to know who is asking. What it would genuinely buy is limiting how often one address can ask, a log of who asked for what, and whatever the IT Security list turns out to say. Real, and none of it urgent.",
  },
  {
    id: "move-tool-canada-ca", track: "admin", section: "a-publish", kind: "feature",
    status: "open", priority: "medium", owner: "Nick", golive: true,
    t: "Move the tool into the canada-ca GitHub organisation",
    why: "canada-ca is a GitHub organisation at github.com/canada-ca. It is not the canada.ca website, and nothing here is about publishing to canada.ca.\n\nDan raised it again on 26 September: the tool and this backlog should sit in a Government of Canada place rather than a personal account.\n\nTwo separate moves are tangled in this one line. Publishing the built page into canada-ca/TBS-OCIO-ESP needs no new repository and no transfer: that repository is public, access is already granted, and it already serves a GitHub Pages site. It waits only on Dan clearing the 176 draft questions for public view. Moving the source repository out of a personal account is the other one, and that waits on Nick, who was asked on 1 September and has not answered.",
  },
  {
    id: "publish-built-page-canada", track: "admin", section: "a-publish", kind: "feature",
    status: "wait", priority: "medium", owner: "ours", golive: false, owes: "Dan",
    parent: "move-tool-canada-ca",
    t: "Publish the built page into canada-ca/TBS-OCIO-ESP",
    why: "One commit, once Dan says the 176 draft questions can be public. The repository is public, access is already granted, and it already serves a Pages site.",
  },
  {
    id: "github-pages-serve-private", track: "admin", section: "a-publish", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "move-tool-canada-ca",
    t: "GitHub Pages cannot serve a private repo on a free account",
    why: "Checked: all 35 Pages sites in canada-ca come from public repos, and no private repo there serves one. This is why a separate public preview repo exists.",
  },
  {
    id: "reply-nick-transfer-existing", track: "admin", section: "a-publish", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "move-tool-canada-ca",
    t: "Reply to Nick: transfer the existing repo",
    why: "Sent. 28 commits of history, all yours.",
  },
  {
    id: "nick-owes-answer-moves", track: "admin", section: "a-publish", kind: "question",
    status: "wait", priority: "low", owner: "Nick", golive: false, owes: "Nick",
    parent: "move-tool-canada-ca",
    t: "Nick owes an answer on who moves the repository",
    why: "Open an issue on canada-ca/welcome is the route he named. Whether he moves it or you do is the part still unanswered.",
  },
  {
    id: "retire-separate-preview-repository", track: "admin", section: "a-publish",
    kind: "feature", status: "open", priority: "low", owner: "ours", golive: false,
    parent: "move-tool-canada-ca",
    t: "Retire the separate preview repository",
    why: "The second repository exists only because GitHub Pages will not serve a private repository on a free account. The source repository was made public on 21 September, so that reason is gone and the two can be one. Three files still say it is private, and they are wrong.",
  },
  {
    id: "notifications", track: "admin", section: "a-process", kind: "feature", status: "wait",
    priority: "low", owner: "ours", golive: false,
    t: "Notifications",
    why: "GC Notify is the sanctioned service and is already in Dan’s own rubric at application question Q33. What triggers one is his decision and he has not made it.",
  },
  {
    id: "draft-email", track: "admin", section: "a-publish", kind: "feature", status: "done",
    priority: "low", owner: "ours", golive: false, parent: "notifications", seen: true,
    t: "Draft the email",
    why: "Opens the person’s own mail client with the message written. All a static page can do.",
  },
  {
    id: "decide-triggers", track: "admin", section: "a-process", kind: "feature", status: "wait",
    priority: "medium", owner: "Dan", golive: false, owes: "Dan", parent: "notifications",
    t: "Decide the triggers",
    why: "Submission, assignment, a changed score and a reminder are four different decisions.",
  },
  {
    id: "john-s-team-validates", track: "admin", section: "a-process", kind: "feature",
    status: "open", priority: "low", owner: "John", golive: false,
    t: "How John’s team validates evidence",
    why: "Their job changes completely and Dan expects resistance.",
  },
  {
    id: "intake-accepts-whom", track: "admin", section: "a-process", kind: "feature",
    status: "open", priority: "low", owner: "Dan", golive: false,
    t: "What the intake accepts, and from whom",
    why: "Dan called it a protocol for the humans.",
  },
  {
    id: "initiatives-must-submit", track: "admin", section: "a-process", kind: "feature",
    status: "open", priority: "low", owner: "Dan", golive: false,
    t: "Which initiatives must submit",
    why: "His call. Blocks nothing we build.",
  },
  {
    id: "personal-accounts", track: "admin", section: "a-owner", kind: "chore", status: "open",
    priority: "high", owner: "ours", golive: true,
    t: "The tool runs on a personal GitHub account and a personal Firebase project",
    why: "Everything the tool is made of is held by one student. The source repository and the published site are under a personal GitHub account. The store, the sign-in and the only key are a Firebase project under a personal Google account. A co-op term ends.\n\nThis is not a note. The personal address is compiled into the product: four links a user sees on screen point at that account.\n\nAnd nothing anywhere in the repository says who owns it, when it ends, or how it is handed over. That was checked on 28 September against every file in NOTES, the README and CLAUDE.md, and there is no such sentence.\n\nThe four things under this are what turn it from a risk into a record. It was written up before as a section under her name, which made it read as her housekeeping rather than as the project’s single point of failure.",
  },
  {
    id: "owner-of-record", track: "admin", section: "a-owner", kind: "chore", status: "open",
    priority: "high", owner: "ours", golive: true,
    t: "Name an owner of record for the store",
    why: "A named person at TBS who is answerable for what is in the database, written down in the repository. The wording already exists in the requirements with the name left blank. It stays blank until somebody says it.",
  },
  {
    id: "store-delete-date", track: "admin", section: "a-owner", kind: "chore", status: "open",
    priority: "medium", owner: "ours", golive: false,
    t: "Set a date the prototype store is deleted",
    why: "A prototype that holds real departmental answers with no end date becomes a system nobody decided to run. Pick the date now, while it is cheap, and write it beside the owner.",
  },
  {
    id: "handover-written-down", track: "admin", section: "a-owner", kind: "chore",
    status: "open", priority: "high", owner: "ours", golive: true,
    t: "Write down how the project hands over",
    why: "One page: which accounts exist, what each one holds, what has to be transferred, and in what order, so that somebody who was not here can pick it up. Today that page does not exist, and the knowledge is in one head and in this backlog.",
  },
  {
    id: "phone-signin-retype", track: "engine", section: "e-done", kind: "bug", status: "done",
    priority: "high", owner: "ours", golive: false,
    t: "A sign-in link opened on a phone makes you retype the address, and one wrong character refuses it",
    why: "Reported from a phone on 27 September: the link opened in Safari, the address was typed, and the answer was a refusal that printed the service’s own code.\n\nWhat happens and why. The address a link was sent to is remembered in the browser that asked for it. A phone never asked, so it has nothing to remember, and the screen has to ask. Firebase refuses to finish without it, deliberately, because a link that signed somebody in on its own would sign in whoever opened the mail.\n\nWhat was ruled out on 28 September, by asking the service directly with four generated links and no mail sent: it is not capitalisation. The service accepted the address typed exactly, with the first letter capitalised, and in full capitals, and refused only a genuinely different address. The whole flow was then driven on the live page from a browser that had never asked, and it signed in. So the code is right and the refusal means the two addresses really did differ, by a dot, an alias, or the link having been issued for the other mailbox.\n\nThe fix is to stop asking. The address can travel in the link’s return address, so the screen can say which address the link was sent to and offer it already filled in. It must still take a press, not sign somebody in on arrival: otherwise a crafted link could sign you in as somebody else, which is the reason Firebase asks in the first place.\n\nLanded on 28 September. The link now carries the address it was issued for, the screen names it, and the button says which account the press would enter. Proved first that capitalisation was not the cause: four generated links, no mail sent, and the service accepted the address typed exactly, capitalised and in full capitals, refusing only a genuinely different one.",
  },
  {
    id: "duplicate-questions", track: "questions", section: "q-content", kind: "feature",
    status: "wait", priority: "high", owner: "dan", golive: false, owes: "Dan",
    t: "The same question is asked twice in different sections",
    why: "Dan found it himself in the meeting on 26 September: he asked the same thing twice, in two different sections, and said neither of them had ever been happy with it. A department answering the same question twice, in two places, with two scores, makes the total meaningless.\n\nTHE PASS IS DONE, 1 October. All 176 questions read, and every one of the 15,400 pairs scored by tools/find-duplicate-questions.mjs. What follows is the finding. The cutting is Dan’s, and nothing in the set has been changed.\n\nTEN PAIRS WHERE A DEPARTMENT WILL WRITE THE SAME ANSWER TWICE. One of each to go.\n\nD-Q25 and T-Q28 — encryption at rest, in transit and in processing. Near word for word; T-Q28 adds GC-approved standards, D-Q25 adds sensitivity level.\n\nB-Q50 and T-Q29 — the threat and risk assessment. One artefact, done once, asked for twice.\n\nA-Q12 and T-Q18 — configuration and infrastructure managed as code.\n\nB-Q61 and T-Q11 — contributing to GC-wide service consolidation.\n\nB-Q44 and T-Q38 — the continuing business need review. T-Q38 says infrastructure investment and B-Q44 says the solution, but a department runs one CBN process.\n\nB-Q22 and B-Q47 — a funding strategy sustainable across the lifecycle. Both in Business Architecture, two sections apart.\n\nB-Q23 and B-Q46 — skills, capacity and the training pipeline. Also both in Business Architecture.\n\nB-Q8 and A-Q31 — total lifecycle cost. B-Q8 asks build, operate, maintain, decommission; A-Q31 asks build, operate, maintain, licensing, exit, and calls it TCO.\n\nB-Q60 and D-Q35 — the data governance model.\n\nD-Q26 and T-Q26 — data sovereignty and residency, with A-Q32 asking it a third time as digital sovereignty.\n\nTEN MORE THAT OVERLAP, WHERE THE SPLIT MIGHT BE REAL AND ONLY DAN CAN SAY. Each is one subject asked at two layers, which is either the instrument working or four sheets drafted apart.\n\nB-Q56 and T-Q39 — change management, the business process and the infrastructure one.\n\nA-Q18 and T-Q12 — elasticity and scaling, at the application and at the infrastructure.\n\nA-Q27, T-Q36, B-Q38 and D-Q17 — observability and instrumentation, four times at four layers.\n\nB-Q48 and T-Q31 — business continuity and disaster recovery. B-Q48 is wider; T-Q31 is the one that asks for RTO and RPO.\n\nB-Q45 and A-Q6 — the delivery pipeline, as operational readiness and as application current state.\n\nD-Q16 and D-Q38 — data quality, under standards and under governance. Same domain, and both about the target state, so this one is not the current-versus-target split.\n\nB-Q14 and B-Q57 — accessibility, official languages and privacy as universal requirements, then again as tracked compliance.\n\nB-Q26, A-Q33, A-Q34, B-Q61 and T-Q11 — reuse of what GC already has, asked five times. A-Q33 names the platforms, A-Q34 asks about duplication, the rest are general.\n\nB-Q9, B-Q39, A-Q31 and T-Q35 — what things cost and whether anybody tracks it, four times.\n\nD-Q8, D-Q30 and T-Q34 — access control and audit, at the data layer and the infrastructure layer.\n\nSEVEN THAT LOOK LIKE DUPLICATES AND ARE NOT. Listed so they are not cut by mistake, because a similarity score flags every one of them.\n\nB-Q1, A-Q1, D-Q1 and T-Q1 — each domain documents its own current state. Four subjects, one sentence.\n\nB-Q4 and B-Q21 — is the criticality understood today, and does the target architecture reflect it.\n\nD-Q1 and D-Q10 — the data model as it is, and the formal model the target needs.\n\nD-Q4 and D-Q12 — the data lifecycle mapped, and the data lifecycle governed.\n\nB-Q11 and D-Q4 — the lifespan of the solution and the lifespan of its data.\n\nB-Q13 and B-Q23 — the skills in place now and the talent strategy for the target.\n\nD-Q29 and T-Q31 — a breach response plan and a disaster recovery plan are two plans. The score pairs them on the words documented and tested, and nothing else.\n\nWHAT THE SCRIPT CAN AND CANNOT DO. It compares words, and no two questions in the set share more than 42 per cent of theirs, so there is no textual copy to find: the duplicates are the same question written twice in different words. It ranked four of the ten real pairs at the top and missed six entirely, including the funding pair and the continuing business need pair, which share almost no vocabulary. Those six came from reading all 176. The script is kept because it is worth re-running when Dan sends a new workbook, and it is deliberately not in the test suite, because a guard would fail the build today over a decision nobody has made.\n\nWHAT IS LEFT, AND IT IS DAN’S. For each of the first ten, which copy survives. For the second ten, whether the split by layer is deliberate. Cutting is safe on our side: the id lock permits a removal and says so out loud, so the import will not fight him.\n\nNOT FILED AS A BUG, and it was. Asked: is it a bug or just how the current questions were formulated. The second. Nothing broke; the set was drafted that way and Dan found it reading his own work. Cutting duplicates is editing the instrument, not fixing the tool, so it sits with the rest of the content Dan owes.",
  },
  {
    id: "conditional-questions", track: "questions", section: "q-behaviour", kind: "feature",
    status: "open", priority: "low", owner: "ours", golive: undefined,
    t: "Follow-on questions that only appear when they apply",
    why: "Dan’s idea, on 26 September, and he priced it himself: nice to have, not need to have, and explicitly not high priority.\n\nWhat it means. Some questions are yes or no, and they govern others. His example: if the answer to \"are all your connections secure\" is no, the follow-up about which programs are used should not be asked at all. Today it is asked anyway, and a department clicks no through a run of questions that do not apply to them.\n\nSo it is a user-experience change rather than a scoring one. It needs the question set to say which question controls which, which is another thing only Dan can supply, and it should wait until the set itself is settled.",
  },
  {
    id: "backlog-where-dan-can-see-it", track: "admin", section: "a-publish", kind: "chore",
    status: "open", priority: "medium", owner: "ours", golive: undefined,
    t: "Put this backlog where Dan can read it without being sent a link",
    why: "Asked for on 26 September. He had not seen the backlog, and asked for one in the SharePoint drive so he could look at it and say what matters more than what.\n\nHe accepted HTML when told that is what it is, and then asked the real question: is it in a Government of Canada place. It is not. It is published from a personal GitHub account, so it goes wherever the tool goes, which is the canada-ca item above.\n\nThe priority picker on this page is the other half of the same ask: it is how he says this before that without writing anything down.",
  },
  {
    id: "mail-from-a-domain-we-own", track: "admin", section: "a-signin", kind: "feature",
    status: "open", priority: "medium", owner: "ours", golive: undefined,
    t: "Send sign-in mail from an address a government filter will accept",
    why: "The blocker on every route that mails somebody. What leaves today comes from noreply at a firebaseapp.com address, with no sender name, carrying a link to that same domain: no DMARC record, and a domain documented as a phishing host. Gmail put it in spam on 27 September. TBS is behind Microsoft Defender, which quarantines high-confidence phishing where the recipient cannot see it and ignores Safe Senders.\n\nTwo ways out, and neither is to wait.\n\nOne, do not use Firebase’s mail at all. Generate the link, which is free and uncapped, and send it from an ordinary Outlook mailbox. Government to government is the delivery profile most likely to arrive. This works today and needs nobody outside the team.\n\nTwo, point Firebase at a mail server we control, which is a setting on the no-cost plan. It needs a sending domain and credentials for it, and we have neither. GC Notify is the sanctioned service in the Government of Canada and offers no SMTP, only a REST interface, which makes that a piece of work rather than a setting.\n\nA third way, found on 28 September and better than either: GC Notify is free to federal public servants, sends from a government domain, and its own documentation covers sending sign-in codes. That is the sanctioned service, it solves the filtering problem at the source rather than working around it, and it needs a government email address to register, which we have. It has a REST interface and no SMTP, so Firebase cannot be pointed at it: the shape is the generator making a link and GC Notify sending it.",
  },
  {
    id: "q-may-write-prototype", track: "admin", section: "a-signin", kind: "question",
    status: "wait", priority: "medium", owner: "ours", golive: false, owes: "ours, then Dan",
    t: "Who may write to the prototype store",
    why: "Meanwhile: Anybody who reads the page source. Fine for unclassified drafts, and the reason the real one needs the departmental sign-in",
  },
  {
    id: "q-admin-role-assessor", track: "engine", section: "e-admin", kind: "question",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Admin is not a role. Every assessor can do everything.",
    why: "Settled, and settled before this item was written. Reported as: all assessors are admins, we had this conversation already.\n\nThe code agrees and says so. grantsAccess() in src/firebase.ts returns true for assessor and for admin alike, and deploy/firestore.rules carries the sentence \"An assessor. There is no rung above this one.\" The word admin survives only because the very first grant was typed into the console by hand and says admin, and a rule that stopped honouring it would lock out the only person who could fix it.\n\nThere was an admin above the assessor once, and it was taken out on purpose: it bought a separation nobody wanted and cost a lockout, because an assessor could write a role document naming the admin’s own address and the admin had no way back in. With one rung there is nothing to be knocked off.",
  },
  {
    id: "q-production-intake-should", track: "admin", section: "a-publish", kind: "question",
    status: "wait", priority: "medium", owner: "ours", golive: false, owes: "TBS",
    t: "What the production intake should be",
    why: "Blocks: Production only. Meanwhile: The prototype answer is an Azure Function plus one CSP line",
  },
  {
    id: "settled-assessor-side-work", track: "admin", section: "a-done", kind: "question",
    status: "done", priority: "low", owner: "ours", golive: false, seen: true,
    t: "Can the assessor side work on a code, the way the submitter side does?",
    why: "No, and it was worked through rather than waved away. The legal half is real: a rule can grant read on a named document, so a roll-up document named by a long code would be a lawful thing to read, and each submitter could be confined to writing their own row into it. It fails on what a leak costs. One assessment code leaks one assessment. An index code leaks every department at once, and it cannot be rotated, because its address is compiled into every published submitter page: old pages keep writing to the old document and anybody holding an old build keeps the address. Loosening the write rules enough to make it work also removes the one thing that lets a reader tell afterwards whether a verdict was written by an assessor or by the department being assessed, which takes the audit out of evidence.",
  },
  {
    id: "settled-should-tool-hold", track: "admin", section: "a-done", kind: "question",
    status: "done", priority: "low", owner: "ours", golive: false, seen: true,
    t: "Should the tool hold classified information?",
    why: "No. Nothing protected or classified goes in at all, settled with Dan on 1 September. That removed the second deployment, the local-only engine, the theme switch, and the whole recall problem.",
  },
  {
    id: "settled-happens-online-data", track: "admin", section: "a-done", kind: "question",
    status: "done", priority: "low", owner: "ours", golive: false, seen: true,
    t: "What happens to online data when a marking rises?",
    why: "Dropped. The tool never stores classified evidence, so the question cannot arise.",
  },
  {
    id: "settled-two-topic-question", track: "admin", section: "a-done", kind: "question",
    status: "done", priority: "low", owner: "ours", golive: false, seen: true,
    t: "Does a two-topic question count twice overall?",
    why: "No. Once in the overall score, and at full weight inside each topic, which is where the weights genuinely differ.",
  },
  {
    id: "settled-file-sharing-team", track: "admin", section: "a-done", kind: "question",
    status: "done", priority: "low", owner: "ours", golive: false, seen: true,
    t: "File sharing for a team filling one in together?",
    why: "No files. Everything is online, so version control stops being a problem the tool has to solve.",
  },
  {
    id: "settled-deletion-rights", track: "admin", section: "a-done", kind: "question",
    status: "done", priority: "low", owner: "ours", golive: false, seen: true,
    t: "Deletion rights",
    why: "Nothing is ever hard-deleted. A record is withdrawn and left out of the statistics.",
  },
  {
    id: "settled-build-two", track: "admin", section: "a-done", kind: "question", status: "done",
    priority: "low", owner: "ours", golive: false, seen: true,
    t: "One build or two?",
    why: "One. Submission is a capability the hosting turns on.",
  },
  {
    id: "settled-plan-lives", track: "admin", section: "a-done", kind: "question",
    status: "done", priority: "low", owner: "ours", golive: false, seen: true,
    t: "Where the plan lives",
    why: "This page. The Markdown version is deleted.",
  },
  {
    id: "settled-org-access-canada", track: "admin", section: "a-done", kind: "question",
    status: "done", priority: "low", owner: "ours", golive: false, seen: true,
    t: "Org access to canada-ca",
    why: "Done. Nick invited you, and the TBS-OCIO-ESP team gives push access to canada-ca/TBS-OCIO-ESP.",
  },
  {
    id: "settled-may-replace-question", track: "admin", section: "a-done", kind: "question",
    status: "done", priority: "low", owner: "ours", golive: false, seen: true,
    t: "Who may replace the question set?",
    why: "The assessor and admin side only. Loading one clears every answer, so a submitter is told where it lives and not handed the control.",
  },
  {
    id: "settled-dashboard-stay-current", track: "admin", section: "a-done", kind: "question",
    status: "done", priority: "low", owner: "ours", golive: false, seen: true,
    t: "How does the dashboard stay current?",
    why: "By storing nothing. It recalculates each record from its answers as the page draws, so there is no roll-up that can go stale.",
  },
  {
    id: "link-generator-without-sending", track: "admin", section: "a-done", kind: "chore",
    status: "done", priority: "medium", owner: "ours", golive: false,
    t: "Make a sign-in link without sending any mail",
    why: "Built on 28 September, and it takes the cost out of every sign-in experiment from here on. Sending a link is capped at five a day for the whole project; generating one is a different operation with a limit of 20,000 a day and it posts nothing.\n\nSo a link can be made on a laptop and pasted into an ordinary message from a government mailbox to a government mailbox, which is the delivery profile most likely to arrive, and the day’s five stay untouched.\n\nIt needs a service-account key, which can act as the whole project, so it refuses to read one from inside this repository at all: the repository is public and a key committed by accident cannot be un-published.",
  },
  {
    id: "expired-session-dead-end", track: "engine", section: "e-assessor", kind: "bug",
    status: "done", priority: "medium", owner: "ours", golive: false,
    t: "A session that goes bad leaves the assessor on a screen with no way to sign in",
    why: "Found on 28 September while testing the Google sign-in. An account was deleted in the console while a browser still held its session. Reloading the assessor page then drew the submissions screen, carrying a panel that read \"Sign in to see the pool\", and nothing anywhere on it to sign in with.\n\nWhy it happens: the door in front of the assessor screens opens as soon as a name is known, and the name is taken from whatever session the browser is holding at that moment. A session whose token can no longer be refreshed still carries a name, so the door opens, the store then refuses to list anything, and the screen that results asks for a sign-in it does not offer.\n\nWho it reaches: anybody whose access is taken away in the danger zone, anybody whose account is removed, and anybody whose sign-in simply stops refreshing. None of those is unusual, and what they get is a screen they cannot leave without knowing to clear their browser.\n\nThe fix is to open the door on a session the store still accepts rather than on a name being present, and to put the way back on the refusal screen either way.\n\nCLOSED on 28 September, after trying to reproduce it rather than assuming it was still there. A session naming an address the store will not answer for was planted in a browser and the published assessor page loaded with it. What came up was the no-access screen, which names the address and offers a way to sign in as somebody else, not the submissions screen with nothing to sign in with.\n\nSo what was seen the first time was narrower than what was written down. It needs a session that is good enough for the role lookup to succeed and then stops working before the pool is read, which is a race rather than a state, and it resolves on the next load. The screen it lands on is recoverable. Reopen it with the sequence written down if it is ever seen again.",
  },
  {
    id: "ask-cyber-security-about-sign-in", track: "admin", section: "a-signin", kind: "chore",
    status: "open", priority: "high", owner: "Dan", golive: true, parent: "internal-gc-sign-in",
    t: "Tell TBS Cyber Security what we are signing people in with",
    why: "This is owed now, whatever happens with anything else, and nobody has done it. The Treasury Board Guideline on Cloud Authentication says an organization must contact the TBS Cyber Security Division before using a bespoke cloud authentication solution. Google sign-in plus a Firebase email link is exactly that.\n\nIt has to come from Dan rather than from us, because it is a departmental conversation and the address it goes to is zztbscybers@tbs-sct.gc.ca.\n\nTwo questions in one message. One: we run an internal tool for TBS staff and for assessors in other departments, signing in with Google and a one-time email link, and is that acceptable for a prototype. Two: is there a Government of Canada sign-in for that internal audience we should be planning toward, and what is it called this year.\n\nThe second question matters because the internal service has a name that keeps changing. The ICAM framework names GCpass. Shared Services Canada described delivering cross-department single sign-on for six departments in September 2025 and building a government-wide sign-in foundation for public servants for 2026-27, without naming it GCpass. So the capability is real and current and the name is uncertain, which is a reason to ask rather than to design around it.\n\nCORRECTED on 28 September, because the first version of this said to email zztbscybers directly. The published instruments do not work that way. The Directive on Identity Management, the Policy on Government Security and the Directive on Security Management all carry the same two lines: an individual in a department contacts their own departmental security management group, and only that group writes to the Treasury Board Secretariat. The Guideline on Cloud Authentication says organizations must contact the TBS Cyber Security Division, and means organizations.\n\nSo the first move is finding TBS’s own internal IT security contact, which the intranet has and the open web does not, and the message goes from Dan. Name the colleague who already used a Government of Canada sign-in service in it, because that is a precedent their own department has already approved.",
  },
  {
    id: "canada-login-is-for-the-public", track: "admin", section: "a-signin", kind: "question",
    status: "open", priority: "low", owner: "Dan", golive: false, parent: "internal-gc-sign-in",
    t: "Find out how the department already uses CanadaLogin",
    why: "Dan said somebody else in the department had used a Canada sign-in service. He was right and the first answer here was wrong, so this item is what replaces it.\n\nWhat was wrong: this said CanadaLogin is for the public and not for public servants. Its own list of participating services, published on 23 September, names seven and two of them are the Treasury Board Secretariat’s: the ATIP Online Request Service, which is for anybody filing a request, and the ATIP Online Management Tools, which is staff only. That second one is ATIP practitioners inside federal institutions signing in through the same service with a credential created for work. So a department can run a staff-facing tool on it, and this department already does. That is almost certainly what Dan heard about, and it is the precedent to point at.\n\nWhat CanadaLogin is: the successor to Sign In Canada, built by the Canadian Digital Service, which as of 3 September is part of Digital Transformation Canada. Sign In Canada stopped taking new applications on 31 July 2023 and its remaining departments move across by 30 December 2026. Replaced rather than retired: the capability is not going anywhere, it is changing hands and name.\n\nWhy it is later and not next. There is no self-serve sign-up: the partner portal is not due until somewhere between October 2026 and March 2027, so onboarding today is a hands-on conversation. The terms of use ask for a departmental agreement, privacy authority, a Protected B security assessment and an authority to operate. None of that fits a co-op term.\n\nWhat to copy in the meantime, which is free. ATIP Online pairs an outside sign-in that proves somebody controls a mailbox with a code or a list issued by a named person, and that is what grants access to the department’s data. That is exactly what this tool does already, so the hand-kept assessor list is not a weakness to apologise for: it is the pattern a real government service uses.\n\nAnd one more place to ask, which came out of the same check: GC Digital Talent, run by the Public Service Commission, is on that list and verifies a Government of Canada work address to unlock the tools meant for employees. That is the nearest thing anybody has built to the question this tool has.",
  },
  {
    id: "internal-gc-sign-in", track: "admin", section: "a-signin", kind: "feature",
    status: "open", priority: "medium", owner: "ours", golive: false,
    t: "Signing in with a Government of Canada credential instead of a personal one",
    why: "The end state, and everything under here is a piece of it. Today an assessor signs in with a personal Google account or a one-time link to their mailbox. Neither is a work credential, and neither can tell the tool anything about the person beyond the fact that they can read that inbox.\n\nNothing here is a this-term job. Every route runs through a named person inside a department, and the published rules say who: an individual asks their own departmental security group, and that group writes to the Treasury Board Secretariat. Not HR, and not us directly.\n\nOne thing worth knowing before any of it starts, because it will come up in the room and it is funny: the Guideline on Cloud Authentication says exceptions to using an approved Government of Canada authentication service are assessed through the GC Enterprise Architecture Review Board. The tool being built for EARB would itself be an EARB matter.\n\nTWO QUESTIONS THAT USED TO SIT BESIDE THIS ONE AS STUBS, folded in on 28 September because they are this item and not neighbours of it.\n\nVerifying an assessor’s identity. Today the tool takes a typed name and labels it unverified on everything it records. A work credential is what would change that, which is what this item is. Until then the label is the honest answer and it stays.\n\nWho may edit a stored assessment, and how that is checked. The store already answers the second half: the rules compare the signed-in address against the record. What is unsettled is the first half, and it is a policy question rather than a technical one, so it moves when this does.",
  },
  {
    id: "send-the-link-through-gc-notify", track: "admin", section: "a-signin", kind: "feature",
    status: "open", priority: "medium", owner: "ours", golive: false,
    parent: "mail-from-a-domain-we-own",
    t: "Send the sign-in link through GC Notify, from a government address",
    why: "The real fix for mail that a departmental filter eats, and it is free. GC Notify is run by the Canadian Digital Service for federal public servants, there is no set-up fee and no procurement, and what it sends arrives from notification.canada.ca carrying the Government of Canada wordmark. That is the opposite end of the scale from noreply at a firebaseapp.com address with no DMARC record.\n\nRegistering is ours and it needs nobody. The form asks for a full name, a government email address only you can access rather than a shared inbox, a phone number for the two-factor sign-in, and a password. No manager, no departmental agreement. A new service starts in trial mode, which sends fifty a day and only to yourself, your team and addresses you put on a safelist, which is enough to test the whole thing; going live is a request in the settings.\n\nFIREBASE CANNOT BE POINTED AT IT, and this is the part worth understanding rather than retrying. Firebase’s custom mail setting asks for four things: a host, a port, a username and a password. GC Notify publishes none of them, because it has no mail server to connect to. It has a web interface you post a message to. The word SMTP does not appear on any of its fourteen documentation pages. Those four boxes will never be filled.\n\nIt still works, in a different shape. Something that is not the browser mints the link, the way deploy/make-signin-link.mjs already does, and then posts it to GC Notify as a value dropped into a template. The page finishes the sign-in when somebody clicks.\n\nWhat it costs is the thing to weigh: the tool stops being a page with nothing behind it. The key that mints links and the key that sends mail can neither of them sit in a page a browser downloads, so this needs a small piece of code running somewhere, and something to keep two secrets in. That is the first server this project would have.",
  },
  {
    id: "register-for-gc-notify", track: "admin", section: "a-signin", kind: "chore",
    status: "open", priority: "medium", owner: "ours", golive: false,
    parent: "send-the-link-through-gc-notify",
    t: "Register for GC Notify, which needs nobody",
    why: "Half an hour, and it unblocks the rest of that item. The form at notification.canada.ca/register asks for a full name, a government email address only you can access rather than a shared inbox, a phone number for the two-factor sign-in, and a password. No manager, no departmental agreement, no procurement.\n\nA new service starts in trial mode: fifty messages a day, and only to yourself, your team and addresses you put on a safelist. That is enough to send yourself a sign-in link from a canada.ca address and find out whether a departmental filter still eats it, which is the question that has been open for a week. Going live is a request in the settings afterwards.\n\nOne thing worth a sentence to a supervisor before going live, even though the form never asks: whether a co-op student should own a service that sends mail branded as the Government of Canada.",
  },
  {
    id: "portfolio-cannot-see-audits", track: "engine", section: "e-broken", kind: "bug",
    status: "done", priority: "high", owner: "ours", golive: true,
    t: "The audited count on the assessor’s portfolio is always zero",
    why: "DONE on 1 October, the first of the four ways: one list request per record as the page draws. Mariia settled it and the arithmetic settled itself, because the pool holds five records and five extra reads on a page that already reads five is nothing. No rules change and no republish: an assessor already has get and list on the audits of any submission.\n\nWhat changed: statusOf no longer asks the assessment whether it has been audited, because an assessment carries no trace of that by design. It takes the answer as an argument, the list reads the audits beside each record in parallel and catches per record so one refusal is one quiet row rather than a broken page, and a record carries who audited it by name. Undefined and empty are kept apart: empty means the store was asked and nobody has, undefined means nobody asked, and a screen that cannot tell them apart says nobody has looked at a record it knows nothing about.\n\nThere was a second bug underneath it, in the opposite direction, found by the session that split this work: opening a submission stamped reviewedAt with the time the screen was drawn. On a build with no store the portfolio is handed the same objects the review screen mutates, so it called a record audited because somebody had glanced at it. The stamp belongs where the work is written and already happens there.\n\nThe original item follows.\n\nAsked what the portfolio is: it is the screen an assessor opens to see every submission at once, with a row of counters across the top of it. One of those counters is labelled audited. That number is what this item is about, and the same test drives the small audited word on each row underneath.\n\nLeft open by the audit fix on 28 September, flagged by the session that built it and checked here against main rather than taken on trust.\n\nAn audit is now a document beside the assessment, which is what makes two assessors possible and what keeps an assessor out of somebody else’s record. Nothing writes to the assessment itself any more. But the portfolio still decides whether a record is audited by looking inside the assessment: statusOf() in src/store.ts reads a.audit?.reviewedAt, and that field is never there for anything read from the store. So the audited tile counts zero for ever, and the badge on the row never appears, however many audits exist.\n\nOnly the screen that opens one submission reads the audits. listAudits is imported by src/views-review.ts and by nothing else; src/views-dashboard.ts never asks.\n\nTHIS IS A DECISION ABOUT WHAT THE PORTFOLIO COSTS, which is why it is written down rather than patched. Three ways and none is free.\n\nOne list request per record as the portfolio draws. Simple, no rules change, no index, and it doubles the reads on a page that already reads every record. With a handful of submissions that is nothing. With a hundred it is a hundred extra reads every time somebody opens the page.\n\nA collection-group query, which fetches every audit in one request. One read instead of N, and it needs its own match block in the rules and an index in the console. More rules surface for less money.\n\nStamp a marker on the assessment when an audit is written. Cheapest to read and it undoes the thing the subcollection was for: an assessor would need permission to write the assessment, which is the rule the new design deliberately does not have.\n\nAnd a fourth, which is free and honest: take the tile and the badge off until one of the three is picked. A counter that reads zero for ever is worse than no counter, because it does not look broken, it looks like nobody has audited anything.\n\nThe recommendation is the fourth now and the first when somebody decides. The pool holds five records as of 28 September, so one request per record costs five, and the day it costs a hundred is the day the second option is worth its rules.",
  },
  {
    id: "name-of-the-tool-goes-home", track: "engine", section: "e-broken",
    kind: "bug", status: "done", priority: "low", owner: "ours", golive: false,
    t: "Pressing the name of the tool did not go to the assessor\u2019s home",
    why: "Reported as: when I click on the name of the tool it should send me to the assessor screen home. It already did, and the screen put the open submission straight back over it, because what brings somebody back after a reload cannot tell a reload from somebody asking to leave.\n\nDone on 1 October. The acts that mean leave say so: going to the submissions list, from the name of the tool or from the Submissions tab, lets go of the open one. A reload still comes back to it. Gated in test/hosted.mjs, which boots with a submission remembered, presses the name, and asserts the list is what arrives.",
  },
  {
    id: "assessor-side-takes-no-files", track: "engine", section: "e-assessor",
    kind: "chore", status: "done", priority: "medium", owner: "ours", golive: false,
    t: "The assessor side stops reading files",
    why: "Her words on 1 October: the app should not be able to deal with files, comment it out for now, and put it back if I ask. This was the drop zone and the picker on the submissions screen, which read the .json submissions people emailed each other. It is how the assessor side worked before there was a store, and the store is the pool now, so a second way in is a second place a submission can come from and a second thing to explain.\n\nCommented and not deleted, with the date and the reason on it, so putting it back is reading rather than writing. The import it used went quiet with it, and the empty state no longer offers a route that is not there: a build with no store says there is nothing to fetch and nothing to read, rather than pointing at a file picker.\n\nOne thing it took with it, flagged by the session doing the other half: that drop zone was how test/ui.mjs got a submission onto the assessor screen at all, because that suite builds with no store, and about twenty assertions sat downstream of it. The suite now seeds the session key the assessor side writes on every change and restores on every load, which is the road a real assessor\u2019s submission travels on their second visit, rather than a hook that exists for the test.",
  },
  {
    id: "assessor-screens-explain-themselves", track: "engine", section: "e-assessor",
    kind: "chore", status: "done", priority: "medium", owner: "ours", golive: false,
    t: "The assessor screens stop explaining themselves",
    why: "Done on 1 October, against the rule added to CLAUDE.md the same day. The sign-off card said where an audit went, who could read it and who could not change it; it says Saved. The empty pool explained what a shared pool is for; it is a heading and a badge. The submissions list explained its own sort order and what the State column means; the columns say that. A tooltip explained what checking the store again does that reloading does not.\n\nThe store\u2019s own words are kept where a request was refused, because that is a fact about what happened rather than an account of why the screen looks as it does.",
  },
  {
    id: "record-in-the-store-called-missing", track: "engine", section: "e-broken",
    kind: "bug", status: "done", priority: "high", owner: "ours", golive: false,
    t: "A record sitting in the store was marked as not being in it",
    why: "Reported as: it says Mariia\u2019s best app is not in the store, how is that possible if it is.\n\nRows are matched to what the store hands over on the reference as well as on the id, and the two can disagree. A record made before codes were readable is written back under a new name on its next save, so a browser can still hold the old one. The match found it by reference and left the row alone, and the test that ran afterwards asked only whether the row\u2019s id was among the ids the store returned. It was not, so a record the store had just handed over was marked missing from it.\n\nDone on 1 October. The rows the store accounted for are collected as it is read, by identity rather than by name, so none of them can be judged missing afterwards; a matched row takes the store\u2019s name for the record, because that is the true one.",
  },
  {
    id: "row-for-a-deleted-record-marked", track: "engine", section: "e-broken",
    kind: "bug", status: "done", priority: "high", owner: "ours", golive: false,
    t: "A record deleted from the store stayed on the assessor\u2019s list",
    why: "Reported four times, and the last three were the same cause: a row carrying this assessor\u2019s own audit was kept on purpose after the record left the store. That rule was mine rather than anybody\u2019s requirement, and with no control on the list that removes a row, a row nothing drops is a row that stays for ever. She deleted the record more than once and it kept coming back, which is exactly what it would do. An audit of a record that no longer exists has nothing to be an audit of, so deleted now means gone and the badge that marked the kept ones is gone with it.\n\nThe control that used to remove a row was taken off this list earlier the same day, as asked. I told her to use it without checking that it was still there, which is how the third report became a fourth.\n\nThe earlier part of this item follows.\n\nReported a third time: the Legacy code check row is still there. The drop itself is right and now has a test in the shape it was reported in, a session with no flag on it, named by its initiative, holding an id the pool does not return: that row goes.\n\nWhat was missing is the case where it is kept on purpose. A row carrying this assessor\u2019s own audit is never dropped, and nothing on it said so, so a record removed from the store sat in the list looking exactly like the ones that are still there. Its state now says Not in the store.\n\nThe other way a row survives is a browser that has not fetched the build with the fix in it.",
  },
  {
    id: "submission-is-one-page", track: "engine", section: "e-assessor",
    kind: "feature", status: "done", priority: "high", owner: "ours", golive: false,
    t: "A submission is one page, and the words on it are the same words",
    why: "Her shape, given on 1 October after using the split version: put the assessment on the same page as the looking glass. Breadcrumbs, then who audited it, then the headline, then by category, then the counters with complete first, then the questions as two tabs. No separate screen and no door between them.\n\nAnd the words. The list column said audited, one block said who saved this, another said assessed, and a tab said what needs you, which she could not read as anything in particular. One word for one thing: audited everywhere an assessor has written something, saved versions at the foot for what a department does to its own answers, and the tabs are Flagged questions and All questions, which say what is behind them.\n\nThe list lost the line explaining its own sort order and the line saying where its rows came from. Ready and draft are told apart by a rule between the groups and the drafts set back, which is what the sentence was describing. The heading is Submissions with the count beside it, the way the portfolio heading reads.\n\nStill open and not done here: the browser back button, which goes to whatever was open before this screen rather than to the list, because a submission has no address of its own. That needs a route and it is its own item.",
  },
  {
    id: "earb-not-enterprise-architecture", track: "engine", section: "e-assessor",
    kind: "chore", status: "done", priority: "low", owner: "ours", golive: false,
    t: "The tool is called the GC EARB self-assessment",
    why: "Asked for on 1 October: always say EARB rather than Enterprise Architecture. It is the name in the rubric file, so it reaches the header, the tab title, every email subject the tool writes and the printed one-pager from one line.",
  },
  {
    id: "other-assessors-work-is-not-visible", track: "engine", section: "e-assessor",
    kind: "bug", status: "done", priority: "high", owner: "ours", golive: false,
    t: "An assessor cannot see what the other assessors wrote",
    why: "DONE on 1 October. Two marks and one list, no sentence anywhere.\n\nA question another assessor has written on carries their initials in its heading, the same initials the byline uses, so the mark means one thing wherever it is seen and the reading itself is where it always was, under the question. And the tabs gained a third, Audited by others, with the count of such questions on it, which lists them in the order the department answered them. It appears only where there is something behind it: a tab onto an empty list is a dead end, and a dead end with nothing written on it is the worst of both.\n\nIt has its own address like the other two, so a link to what a colleague wrote is a link somebody can send.\n\nThe original report follows.\n\nReported on 1 October: I do not see other people\u2019s assessments beside mine, or it is not obvious, and either way it should be worked on.\n\nIt is built and it is nearly invisible. Another assessor\u2019s score, verdict and reason appear under a question, below the exchange and above the controls, in a quieter block. Three things stop that being found. It only shows on a question that somebody else has actually written on, which on a real submission is a handful out of 176 and none of the ones an assessor happens to open first. Nothing at the top of the submission says how many questions another assessor has touched or which ones. And the byline that names them is a fact about the whole submission, so it does not lead anywhere.\n\nWhat would answer it, none of it designed: the flagged tab is one filter over the questions and there could be another for questions somebody else has audited; a disagreement between two assessors is the thing a board actually needs and nothing counts them; and the byline could be the way in rather than a label.\n\nThe reason it matters more than it looks: the whole point of one document per assessor is that two readings stand side by side. If the second reading is somewhere nobody finds, the tool has the property and not the benefit.",
  },
  {
    id: "others-tab-link-dead-end", track: "engine", section: "e-assessor", kind: "bug",
    status: "done", priority: "medium", owner: "ours", golive: false,
    t: "A link to another assessor’s work opened an empty submission",
    why: "A link to Audited by others opened an empty submission for the one person most likely to be sent it.\n\nThe tab is drawn only where somebody else has written on a question, and whose work counts as somebody else’s depends on who is reading: the list leaves out the reader’s own audit. So the single assessor guaranteed not to see that tab on a submission is the assessor who wrote the thing it lists.\n\nWhich is exactly who the link gets sent to. One assessor copies the address from the third tab to ask a colleague about a note; the colleague wrote the note, so for them the tab is not there. They got a submission with the tab strip drawn, no tab marked as the one they were on, and nothing underneath it.\n\nIt could not happen before 1 October, because the only way to that tab was pressing it, and pressing it was only possible where it existed. Putting the depth in the address made it something that can be asked for.\n\nDONE on 1 October. An address asking for a tab that is not there opens the submission on the tab everybody has, and the address is corrected so it stops naming one that does not exist. Four checks, and the fix was verified by taking it out again.\n\nFound at the seam between two pieces of work rather than inside either: the third tab was one session’s and the address was another’s, and neither change is wrong on its own.\n\nA note on the checking. The first version of the test passed on the broken code, because the helper that builds an address in the test suite only knew two depths and quietly wrote the address for the first one. A test that cannot ask the question cannot fail it.",
  },
  {
    id: "four-character-reference-collides", track: "engine", section: "e-storage", kind: "bug",
    status: "open", priority: "low", owner: "ours", golive: false,
    t: "Two assessments can share the four characters in an email subject",
    why: "The four characters quoted in evidence email subject lines are the opening four of the twelve-character code, and two assessments can share them.\n\nMeasured on 1 October, while putting a submission in the address: four characters is 32^4, about a million, so the chance that some two assessments collide is 0.5 per cent at a hundred of them, 4 per cent at three hundred and 38 per cent at a thousand. EARB will pass three hundred.\n\nWhat breaks when it happens: an assessor searching their inbox for QK7M finds two departments’ evidence in one thread, and the search that the reference exists to make possible stops working. Nothing fails loudly.\n\nThe address does not have this problem, because it carries six characters and was built knowing this. The reference shown on the row and used in email subjects is still four.\n\nNot urgent and not hard: either the reference becomes six characters too, which makes the chip and the address agree and is one line, or the subject line carries more of the code. It is worth deciding before enough assessments exist to meet it, because changing the reference afterwards invalidates subject lines already sent, which is the thing the reference was invented to avoid.",
  },
  {
    id: "submission-has-no-address", track: "engine", section: "e-assessor", kind: "bug",
    status: "done", priority: "medium", owner: "ours", golive: false,
    t: "The browser back button does not come back to the list",
    why: "Reported on 1 October: in a submission, the browser back arrow went to Settings, which is where the assessor had been before opening the list.\n\nA submission was not in the address. The hash carried the side and the screen, so every submission was the same entry as the list it was opened from, and back went to whatever came before that. Which submission was open was remembered in the browser instead, which covers a reload and not the history.\n\nDONE on 1 October. A submission is #assessor/ABC123, and the depth is part of it: the bare form is the flagged questions and /all is all of them. Back comes out of a submission to the list, and out of a depth to the depth before it.\n\nSIX CHARACTERS OF THE CODE, NOT TWELVE, AND THAT IS THE WHOLE DESIGN OF IT. The item asked for assessor/CODE. The store grants a read on the code alone, so the full code in the address bar would be a working key to a department’s assessment sitting in browser history, in every screen share and in anything anybody pastes into a ticket, and a code cannot be taken back.\n\nFour characters would not have been enough to name one. Measured: the chance that some two assessments share their opening four is 4 per cent once there are 300 of them and 38 per cent at a thousand. At six it is 0.004 and 0.05 per cent, and what is left to guess is 32^6, about a billion, against a store that rate-limits.\n\nSo the address names a submission for somebody who can already list the pool, which is an assessor, and opens nothing for anybody else. Somebody outside TBS following the link gets the list and no account to see it with. The chip on the row and the reference in evidence email subjects still show four characters; the address is the same code, further along.\n\nTHE BROWSER KEY IS GONE. gc-arch-assessment:assessor-open held {code, depth} and was the only record of where somebody was. It could not tell a reload from somebody asking to leave, so the list had to clear it by hand on the way in, and it was invisible to Back. The address answers all three and is now the only place the answer lives. One thing is lost with it: a browser holding the old key at the moment this went out lands on the list once, and opening the submission again fixes it for good. A migration path would have meant keeping a second source of truth alive to rescue a single reload.\n\nA mistyped address opens the list. The parser matches a code by its shape rather than by being something it does not otherwise recognise, so #assessor/not-a-code is the list and never the submitter’s questionnaire, which is where every unrecognised address used to go.\n\nRepainting a submission adds no history. A score click, a verdict and a note losing focus all come back through the router, and none of them is a place, or Back would walk backwards through an afternoon’s typing one keystroke at a time.\n\nOne thing fixed on the way that was not in this item: a published assessor page opened with no hash at all, so the entry underneath everything said nothing and Back out of the first submission opened landed on an empty address, which the router reads as the submitter home. The first entry now says where it is.\n\nNine checks in test/hosted.mjs, which had no way to press Back before. Verified by breaking it three ways: the address no longer naming the submission, the whole code going in instead of six characters, and the first entry no longer saying where it is. All three went red.\n\nOne thing the fixtures were hiding: a test submission’s store id was doc-AB12, which no code this tool mints could be, since lowercase and a hyphen are not in the alphabet. Harmless while nothing parsed an id, and not harmless the day the address started naming a submission by the shape of its code. The fixtures carry real codes now.",
  },
  {
    id: "assessor-cannot-tell-what-to-assess", track: "engine", section: "e-assessor",
    kind: "bug", status: "done", priority: "high", owner: "ours", golive: false,
    t: "An assessor opens a submission and cannot tell what they are supposed to assess, or where",
    why: "DONE on 1 October, by structure and not by words. The first answer proposed was a line in the second person saying what an assessor does, a count of what they had looked at, and something at the end meaning finished. That was rejected and the rule given with it: the user experience should be self-explanatory, no text explanations and no tutorials, it should be obvious.\n\nSo the screens are three and the shape says what the job is. Opening a submission lands on the submission, which stays what it already was and is useful as one: a looking glass over the whole thing, with who saved it, the categories, the KPI row and what this assessor has already changed. Directly under the headline there is one block marked Assessment, carrying the three numbers that decide whether to press it: how many answers need arguing with, how many questions there are, and how many this assessor has scored or judged. Pressing it opens the assessment, which is two tabs over one piece of work: What needs you, which is the screen this tool was built around and the one Dan was shown, and All the questions, which is the assessment as the department filled it in. The sign-off sits under both. Back goes one step rather than all the way out.\n\nWhat moved: everything to do with assessing left the front page, except what you changed, which she asked to keep there because it is the record of what has already been decided about the thing and belongs with the summary of the thing.\n\nThe original report follows.\n\nReported in those words on 1 October, after a sitting with real submissions in the pool: as an assessor, I open a submission and I am confused as for what and where am I supposed to assess.\n\nIt is not the same as the layout item below it, and finishing that one did not finish this. The full view fixed where the questions are. What is still missing is anything telling somebody what the job is when they arrive: there is no sentence saying an assessor reads the answers that do not add up and leaves the rest, no mark saying which questions are still untouched by them, and nothing at the end saying what finishing looks like. The screen is a set of controls with no account of the task they serve.\n\nWhat would answer it is a short line at the top in the second person, a count of what they have looked at against what needs looking at, and something at the bottom that is the end of the job. None of that is built and none of it is designed.",
  },
  {
    id: "scoring-moves-the-page", track: "engine", section: "e-broken", kind: "bug",
    status: "done", priority: "medium", owner: "ours", golive: false,
    t: "Clicking a score moved the page under the assessor",
    why: "Reported as: when I click on numbers, it moves my screen somewhere. Giving a score rebuilds the screen, because whether a line counts as changed, the summary of what was changed and whether the file can be saved are all computed where the screen is built. The document got shorter or taller for a moment and the browser kept the same offset against a different page, so the question somebody was working on moved away from under the cursor.\n\nDone on 1 October: the offset is put back after the rebuild. The sections an assessor had open were already being remembered, which was the other half of the same complaint.",
  },
  {
    id: "two-rails-on-one-question", track: "engine", section: "e-broken", kind: "bug",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "A flagged question drew two coloured rails down its left",
    why: "Reported with a screenshot: it has the red line for each question twice, it is confusing. A flagged question drew its own rail and the finding inside it drew a second one directly beside it, so every flagged question arrived with a pair of coloured lines and nothing saying they meant different things.\n\nDone on 1 October. The finding keeps its severity on its dot and its title, which is where it was already carried, and the rail belongs to the question.",
  },
  {
    id: "deleted-record-comes-back", track: "engine", section: "e-broken", kind: "bug",
    status: "done", priority: "medium", owner: "ours", golive: false,
    t: "A record deleted from the store came back on every reload",
    why: "Reported twice, the second time after a fix that did not cover it. The assessor's open list is written to their browser and restored on every load with no regard for whether the store still has any of it, so a submission deleted in September sat in the worklist for days, was counted as something opened from a file by somebody who had never opened one, and answered that there was no such submission when it was deleted again.\n\nThe first fix only dropped rows that remembered arriving from the store, and a session written before rows remembered anything carries no flag, which is exactly the row this was reported about. Done on 1 October: sessions that predate the flag are told apart by name, because a file is named by its filename and a record by its initiative. A row with an audit on it is never dropped; it stays and says what happened, because nobody's work is thrown away to tidy a list.",
  },
  {
    id: "reload-loses-the-assessors-place", track: "engine", section: "e-assessor", kind: "bug",
    status: "done", priority: "medium", owner: "ours", golive: false,
    t: "Reloading inside a submission threw the assessor back to the list",
    why: "Reported twice, the second time after the first fix had been published, which turned out to be a build that had not reached that browser yet. There is a gate on it now rather than an argument: test/hosted.mjs boots the published page with each of the three depths remembered and asserts it comes back to that one and not to the list, including the key the first version of the fix wrote.\n\nReported as: when I am in an assessment and reload the page, it sends me to the pool view, I want to stay exactly where I was. An assessor reads one submission for twenty minutes and reloads for all the ordinary reasons, and finding the row again is a tax on every one of those.\n\nDone on 1 October. Which submission was open, and whether it was the triage or the full view, is remembered in that browser and reopened. What it does not give is an address: a submission still cannot be linked to or bookmarked, and that needs a route of its own.",
  },
  {
    id: "empty-entries-saved-as-audit", track: "engine", section: "e-storage", kind: "bug",
    status: "done", priority: "medium", owner: "ours", golive: false,
    t: "An audit was saved with 174 empty entries in it",
    why: "Found on 1 October by reading a real audit out of the live store rather than from the code. Opening a submission draws all 176 questions and gives each one a blank entry for the controls to write into, and the whole map went to the store: 176 entries, two with anything in them. It made the record of what an assessor had looked at a list of everything they had scrolled past, and the document twenty times the size of the work in it.\n\nDone the same day: only entries carrying a score, a verdict, a reason or a history are written.",
  },
  {
    id: "assessor-reads-in-the-submitters-layout", track: "engine", section: "e-assessor",
    kind: "feature", status: "done", priority: "high", owner: "ours", golive: false,
    t: "An assessor reads a submission the way it was written, not as one long scroll",
    why: "DONE on 1 October, the third way: a separate screen. Her decision in her own words, after the three ways were put to her: the view should stay the same, and instead of Everything else it should have Open the full submission and open it separately. So the triage keeps its shape and nothing Dan was shown has moved. The fold that held about 150 questions behind one triangle is a door instead, and behind it the assessment is laid out by domain and section the way the department filled it in, with the same controls on every question. It is the same auditRow on both screens rather than a second rendering, so the two cannot drift apart. Agree-with-all moved with the sections, because that is where the sections now are. A short line at the top of the full view says how many answers need arguing with and offers the way back, so somebody who opens it first is not stranded in 176 questions with no idea which ones matter.\n\nWhat it does not do, and is worth knowing: a submission still has no address of its own, so the full view cannot be linked to or bookmarked. Where an assessor was is remembered in their own browser instead, which covers the reload and not the shared link.\n\nThe original item follows.\n\nAsked for twice, and the same complaint is behind both: everything that is not flagged arrives as a flat scroll of about 150 questions. What is wanted instead is the submitter’s own layout, domains and sections, with the audit controls on each question where it sits and the flags marked in place rather than hoisted into a list at the top.\n\nIt is the biggest open piece on the assessor side and it is not a tidy-up. src/views-review.ts is 1,467 lines and it is built around the opposite idea: the questions worth arguing about are pulled out, and the rest is a remainder. Sharing the submitter’s layout means sharing src/views-submit.ts, which is 1,873 lines and owns the domain tabs, the section rail and the per-question block, rather than building a second one that drifts.\n\nTHIS REPLACES A SCREEN DAN HAS ALREADY BEEN SHOWN, which is the reason it is a decision and not a ticket. The triage view is what he was demonstrated, and it answers a real question: which handful of answers does an assessor have to argue with. The new one answers a different question: what did this department actually say. Both are defensible and only one can be the screen somebody opens.\n\nThree ways it could go, and the choice is Mariia’s. Replace the triage screen, which is the cleanest and loses the thing Dan saw. Keep both behind a switch, which is cheapest to decide and leaves two screens to maintain for a prototype. Or keep the triage list as a short summary at the top of the submitter’s layout, which is probably what was meant by the flags being marked where they fall, and which is the most work.\n\nThe session that raised it has offered to take src/views-review.ts and src/views-submit.ts together if she says go, and is not starting until she does. Nothing on this is under way.",
  },
  {
    id: "draft-and-active-set-can-disagree", track: "engine", section: "e-submitter",
    kind: "bug", status: "open", priority: "medium", owner: "ours", golive: false,
    t: "A draft can be answered against one question set while the browser says another is active",
    why: "Left open on 1 October by the fix that stopped the assessor page deleting the submitter’s draft, and named here rather than guessed at.\n\nThe active set is a shared name, the same way the draft was. So an assessor making a different set active now leaves the submitter’s draft alone, which is the point, but that draft was answered against the old set and nothing compares the two.\n\nEvery draft already records the set it was given against, so the comparison is cheap. What is not obvious is what should happen when they differ, and that is the decision: tell the person who owns the work and let them choose, which is the honest version, or leave the draft using the set recorded in it and treat the assessor’s choice as affecting only their own side.\n\nIt belongs on the submitter’s page either way, because that is the only screen with the person whose answers are at stake in front of it.",
  },
];
