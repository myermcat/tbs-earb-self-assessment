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
 *  - status    'wait' | 'next' | 'doing' | 'later' | 'done'. Finishing something is a one-word
 *              change, and a done item is never deleted: it moves itself into that track's Done
 *              section. 'wait' means somebody outside this repository owes a reply, and owes
 *              names them. 'doing' means started and not finished, and there should be at most
 *              two of them at a time; a list where everything is started is a list where nothing
 *              is. 'later' means after the prototype. There used to be a separate 'level 2' tag
 *              as well, which meant the same thing and could contradict the status on the same
 *              row. It is gone, and the word 'later' is the only name for that idea now.
 *  - owner     who does the work once it is unblocked, which is not the same as who owes us an
 *              answer. It used to be a property of the section, which works for two people and
 *              stops working the moment three of them share 'ours'.
 *  - owes      who owes us the answer, on a 'wait' item, and nothing on any other.
 *  - asked     the date somebody was ACTUALLY ASKED. Not the date the item was written down.
 *  - since     the date it went on the list, for a 'wait' item nobody has actually asked yet.
 *              A 'wait' needs one or the other and the build stops without either.
 *
 *              THESE ARE TWO FIELDS BECAUSE THE PAGE WAS LYING. Every waiting item said "asked
 *              N days ago", and for nine of them the date was the commit that first wrote the
 *              item down, because that was the only evidence there was. Reported, correctly, as:
 *              we never asked him for anything. A thing nobody has asked for is a different
 *              problem from a thing somebody has ignored for a month, and the page now says
 *              which it is looking at.
 *  - size      'hours' | 'days' | 'weeks', required on anything next or doing. Three values and
 *              not an estimate, because an estimate is a thing you have to stop and think about
 *              and so it never gets written.
 *  - priority  'high' | 'medium' | 'low'. This is only the starting value. The page lets anybody
 *              signed in change it, and that change is kept in the store so everybody sees the
 *              same list. What is written here is what a reader sees before the store answers.
 *  - kind      'bug' | 'feature' | 'chore' | 'question'. A bug is something broken, not something
 *              missing, and each track keeps its broken things together at the top.
 *  - why       written for somebody who was not in the meeting. It is what you open; the title
 *              alone has to carry the meaning, because the list is read folded shut.
 *  - parent    the id of the item this one sits under, or ''.
 */

export const updated = '2026-09-28';

/** The tabs, across the top. Dan's three, and the critical path he asked for on top of them. */
export const tracks = [
  { id: 'golive', title: 'To go live',
    hint: 'Everything that has to be true before a real department fills this in and a real assessor reads it. Dan asked for this list on 26 September and nothing on it is confirmed: it is what we think blocks going live until he says otherwise. Every item here also sits in the tab it belongs to.' },
  { id: 'questions', title: 'The questions',
    hint: 'The question set: what is asked, in what order, in which language, and what each answer is worth. The content is Dan\u2019s and most of this tab waits on him.' },
  { id: 'engine', title: 'The engine',
    hint: 'The tool that carries the questions: the screens a submitter and an assessor use, the scoring, and the saving. All of it is ours to build.' },
  { id: 'admin', title: 'Administrative',
    hint: 'Everything that is neither the questions nor the engine: where the tool is published, who owns the accounts it runs on, who may sign in, and what people do around it.' },
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
    status: "next", priority: "high", owner: "ours", golive: true, size: "weeks",
    t: "French is missing from the assessor screens and from half the rest",
    why: "An official instrument that is English on half its screens is not usable in government, so this is a defect and not a feature.\n\nThe machinery works: 403 pieces of wording go through the translator and 402 of them carry French. What is missing is wording that never went through it at all. On the assessor side that is 108 pieces, and the portfolio screen does not so much as import the translator. Across the submitter and shared screens it is roughly 300 more.\n\nThere is a second half nobody can start: the question set itself, 3,344 words of Dan’s English, and there is nowhere in the file format to put a French version. That is what the item below is for.\n\nAnd the accessibility fix that landed in September only reached the submitter side. The assessor screens still show English text inside a page that says it is French, so a screen reader reads English in a French voice. That is a ten-minute fix and should go first.\n\nWhat stays English on purpose: the access code, the question ids, and this page.",
  },
  {
    id: "dan-owes-french-question", track: "questions", section: "q-french", kind: "feature",
    status: "next", priority: "high", owner: "ours", golive: true, size: "weeks",
    t: "The French of the question set, which nobody has asked Dan for",
    why: "Reported: we can do this ourselves, and we never asked him for anything. Both are right, and the item said otherwise on both counts.\n\nWhat is true: 3,344 words of Dan’s English have no French anywhere, and the file format has nowhere to put it. That is 2,760 words in the 176 questions, 228 in the eleven rungs of the scale a submitter reads to pick a score, 104 in the routing and maturity bands, 98 in the section and domain names, 84 in the five categories and 70 in the seven lifecycle stages.\n\nTwo ways to get it, and they are not exclusive. Draft it here and have it approved, which starts today and needs nobody. Or send it to the Translation Bureau, which is weeks on instrument text of this size and is the route an official instrument normally takes. Drafting first and having the Bureau check a draft is faster than either.\n\nTwo decisions are genuinely Dan’s and neither has been put to him. Whether the French is a second file or extra fields in the one file, given the ids are spreadsheet column names either way. And who signs off the wording, because a self-assessment whose questions differ between the two languages is two instruments.\n\nIt also waits on the set settling. Translating 176 questions while duplicates are still being cut is translating work that is about to be deleted.",
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
    status: "next", priority: "medium", owner: "ours", golive: false, size: "hours",
    t: "Put a real submission in the pool",
    why: "There is no seeding tool, so test submissions are made through the submitter page, which needs no account, and sent. Half an hour. Without it an assessor signs in to an empty list, and an empty list reads as a broken tool rather than an empty one.",
  },
  {
    id: "each-assessor-sees-pool", track: "engine", section: "e-assessor", kind: "question",
    status: "wait", priority: "medium", owner: "ours", golive: false, size: "days",
    owes: "Dan or Chris", since: "2026-09-03",
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
    status: "later", priority: "low", owner: "ours", golive: false, size: "days",
    t: "What counts as a finished assessment",
    why: "Answered on 21 September, and the answer is to leave it alone: Dan and Mariia agreed it stays the submitter’s judgement until real submissions exist, because answering every question is not the same as attaching every piece of evidence and a submitter may come back to a question after adding one. The choices below are what a later answer has to pick from. You spotted this yourself: there is no obvious finishing line. Filling every score is one answer, but evidence is not mandatory and neither is the reasoning, so the tool cannot say when somebody is done without being told. What the rubric says: nothing. All 176 questions carry weight 1, none is marked required, and no question asks for evidence. So the finishing line is the instrument’s decision, and these are the choices. Complete means every question in the set has a score or is marked not applicable. Whether the six overview fields count: they are not scored, but the lifecycle stage changes every score through the stage multipliers and the marking gates saving at all, so the working answer is that they count. Whether a floor is needed, since with none an assessment marked not applicable throughout is complete and unscored. Whether saying it is finished freezes the answers, or whether the submitter keeps editing and the assessor is warned. Whether an assessor may do anything with an unfinished one beyond reading it. Whether the portfolio averages should exclude unfinished ones.",
  },
  {
    id: "completion-flow-notification-exist", track: "engine", section: "e-submitter",
    kind: "feature", status: "next", priority: "medium", owner: "ours", golive: false,
    size: "days",
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
    id: "library-question-sets", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "A library of question sets",
    why: "Sets accumulate. Settings lists every one this browser holds and marks the one in use. Adding one changes nothing on its own, and each row has a menu: preview the questions, make it active, delete it, and who added it. Deleting is two steps and refused only on the set in use and on the last remaining set.",
  },
  {
    id: "each-submission-scored-against", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
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
    id: "question-ids-lose-letter", track: "engine", section: "e-done", kind: "feature",
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
    id: "applicable-hides-scale-keeps", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
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
    id: "opening-question-set-assessor", track: "engine", section: "e-broken", kind: "bug",
    status: "next", priority: "high", owner: "ours", golive: false, size: "hours",
    t: "Opening a question set on the assessor page deletes the submitter’s draft",
    why: "Both pages are served from one address, so they share one browser store. The demonstration page was given its own namespace in September; the two real pages were not.\n\nWhat happens: the assessor page still offers Question set, and activating a set there clears the draft on the submitter page. Somebody halfway through 176 questions loses them, in another tab, with no warning.\n\nThe fix is the same one the demonstration page got: a namespace per side, so the two cannot reach each other’s keys.",
  },
  {
    id: "discarding-draft-browser-empty", track: "engine", section: "e-broken", kind: "bug",
    status: "next", priority: "high", owner: "ours", golive: false, size: "hours",
    t: "Discarding a draft says the browser is empty, and it is not",
    why: "The window that asks you to confirm says it erases the copy this browser is holding, and the Settings row says the same. Both sentences are false.\n\nDiscarding removes one key. Every online save also writes a full second copy of the document under its own key, and nothing ever removes one of those. So the answers a person believed they had just destroyed are still in the browser, under a name they were never told about.\n\nTwo things to fix and they are separate: remove those copies when a draft is discarded, and until that is done, stop the screen claiming otherwise.",
  },
  {
    id: "assessor-screen-wrong-spacing", track: "engine", section: "e-done", kind: "bug",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The assessor screen was on the wrong spacing ratio",
    why: "Measured: a card padded 1.05rem inside and margined .85rem below, so two unrelated blocks were 3.2px CLOSER together than a heading was to its own content. A ratio of 0.81 where the submitter’s results page runs 2.76. Every complaint about buttons crowding text came from that one inversion, plus .actions carrying no top margin at all, so its gap was whatever the element above happened to leave: zero after a table and zero after every heading. On the list screen the export button’s own border was touching the table’s closing rule while being 8px from the button beside it, so a control was closer to content it had nothing to do with than to its own group. On the detail screen 180 audit rows stacked at 0px apart, separated only by the hairline this stylesheet had already measured as too faint to read as a boundary, and 51 pairs of tinted rows touched and merged into one band.",
  },
  {
    id: "clear-gone-assessor-toolbar", track: "engine", section: "e-done", kind: "bug",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Clear is gone from the assessor toolbar",
    why: "It emptied every submission and every score, verdict and reason the assessor had typed. The audit exists in one browser key and in a file somebody may or may not have saved, so it was the only copy: a control that destroyed an afternoon, on the main screen, the same size and colour as an export beside it. Closing one submission you are finished with is what an assessor actually wants and the screen could not do, so that is a per-row menu item now, and the one that closes everything is the last item of a menu in red with an offer to save the audited files first. No test covered the old button, which is how it lasted.",
  },
  {
    id: "assessor-s-review-saved", track: "engine", section: "e-broken", kind: "bug",
    status: "next", priority: "high", owner: "ours", golive: true, size: "days",
    t: "An assessor’s review is never saved anywhere but their own laptop",
    why: "The worst thing on this list. An assessor’s scores, verdicts and notes live in memory and in one key in their own browser, and the only button that does anything with them writes a file to their own laptop. views-review.ts makes no network call at all.\n\nWhat that costs a person: the department never sees the review. A second assessor cannot see the first one’s work. Clearing the browser, or picking up a different machine, loses all of it. And the portfolio tile that counts audited records reads the audit off the record, so it is permanently zero.\n\nThe decision to make first: the rules already allow an assessor to write a subcollection under the assessment, and nothing writes there. Taking that route needs no rules change and no republish, and it is about a day: a save, a read when the pool is listed, a change so the audited state comes from what was read, and a test. The other route, keeping the audit as a field of the assessment, needs the rules widened to let an assessor update somebody else’s document, which is more work and more risk. Take the subcollection.\n\nOne line of the code says \"the audit is in the store\", which is false, and goes in the same change.",
  },
  {
    id: "nothing-tests-signing-google", track: "engine", section: "e-broken", kind: "bug",
    status: "next", priority: "medium", owner: "ours", golive: false, size: "hours",
    t: "Nothing tests signing in with Google",
    why: "Half of this is now done. The email-link sign-in is tested end to end: the test stubs the two calls, opens a real link and checks the code sent, the address sent and the session that comes back.\n\nThe Google route is not tested at all. Four calls carry it and no test mentions any of them; the tests only check that the button is on the screen. That is the route every assessor will actually use, and the one that broke in September with a redirect mismatch nobody caught.",
  },
  {
    id: "rules-tested-nobody-signed", track: "engine", section: "e-broken", kind: "bug",
    status: "next", priority: "medium", owner: "ours", golive: false, size: "hours",
    t: "The rules are only ever tested with nobody signed in",
    why: "The blocker is gone. There is now a rules test that runs Google’s own Firestore with our rules loaded, and it proves what an anonymous request can and cannot do.\n\nWhat it still does not prove is the part that needs two identities: that one submitter cannot read another’s assessment, and that somebody who is not an assessor cannot list the pool. Those are the rules that actually protect the work, and they have never been run against a signed-in request.",
  },
  {
    id: "changing-question-s-meaning", track: "questions", section: "q-broken", kind: "bug",
    status: "next", priority: "medium", owner: "ours", golive: false, size: "hours",
    t: "Changing a question’s meaning warns once, then the warning is written away",
    why: "The lock file exists so a question cannot quietly change meaning while old submissions still carry its id. It does not hold. A changed meaning prints a warning and carries on, where a bad section name a few lines later stops the run outright. Then the same run rewrites the lock file at the end, so the drift is absorbed and the second run is silent.\n\nNothing else in the repository reads the lock file, and it is not in the test suite. So today it records what happened rather than preventing it.",
  },
  {
    id: "submitter-delete-withdraw-submission", track: "engine", section: "e-broken",
    kind: "question", status: "next", priority: "medium", owner: "ours", golive: false,
    size: "hours",
    t: "A submitter cannot delete or withdraw their own submission",
    why: "True, and it is our decision, not a wait on anybody. The rules let only an assessor delete, and only an assessor withdraw. The one destructive thing a submitter can do is discard the copy in their own browser; the copy at TBS stays.\n\nSettings already tells them so, in those words. What is missing is the decision: can a department pull back a submission it sent by mistake, and does pulling it back delete it or only take it out of the statistics. After that it is about one line of rules and one button.\n\nIt was marked as waiting on the \"Build team\", which is us, and that was wrong.",
  },
  {
    id: "restrict-browser-key-site", track: "admin", section: "a-owner", kind: "feature",
    status: "next", priority: "medium", owner: "ours", golive: false, size: "hours",
    parent: "personal-accounts",
    t: "Restrict the browser key to our own site and three services",
    why: "GitHub flagged the Firebase web key in the published page as a Google API key. It is a public identifier by design and it authorises nothing on its own, so the page is not a leak. What is worth changing is that the key currently answers from anywhere: a check from the command line reached the project with no site attached at all. In the Google Cloud console, under Credentials, the browser key takes a website restriction of myermcat.github.io and localhost, and an API restriction of Identity Toolkit, Token Service and Cloud Firestore. Nothing the tool does falls outside those three.",
  },
  {
    id: "close-github-secret-scanning", track: "admin", section: "a-owner", kind: "feature",
    status: "next", priority: "low", owner: "ours", golive: false, size: "hours",
    parent: "personal-accounts",
    t: "Close the GitHub secret-scanning alert as will not fix",
    why: "The alert is correct about what it found. Revoking the key would take the store down and change nothing about who can read what, because reading is gated by sign-in and by the published rules. Will not fix, with the restriction above as the note.",
  },
  {
    id: "whether-department-many-decisions", track: "questions", section: "q-behaviour",
    kind: "feature", status: "later", priority: "low", owner: "ours", golive: false,
    size: "hours",
    t: "Whether a department says how many decisions are already made",
    why: "Dan floated this on 21 September as a way to tell whether an assessment can still change anything. A department that has chosen the product and signed the contract answers the same 176 questions as one still deciding, and the two are worth different amounts to a board. It would be one overview field and nothing scored.",
  },
  {
    id: "answer-types-criticality", track: "questions", section: "q-behaviour", kind: "feature",
    status: "wait", priority: "medium", owner: "Dan", golive: false, asked: "2026-09-01",
    t: "Answer types and criticality",
    why: "The shape of the questions, which Dan called the biggest remaining piece. Our reading is in the tool and labelled provisional.",
  },
  {
    id: "confirm-answer-type-every", track: "questions", section: "q-behaviour", kind: "feature",
    status: "wait", priority: "medium", owner: "Dan", golive: false, size: "hours", owes: "Dan",
    asked: "2026-09-01", parent: "answer-types-criticality",
    t: "Confirm the answer type for every question",
    why: "Ten are yes/no on our reading of the wording. The other 166 are scored 0 to 10.",
  },
  {
    id: "confirm-no-answers-matter", track: "questions", section: "q-behaviour", kind: "feature",
    status: "wait", priority: "medium", owner: "Dan", golive: false, size: "hours", owes: "Dan",
    asked: "2026-09-01", parent: "answer-types-criticality",
    t: "Confirm which no answers matter most",
    why: "Every no colours its section red today. If some should not, that is his call.",
  },
  {
    id: "set-per-question-criticality", track: "questions", section: "q-behaviour",
    kind: "feature", status: "wait", priority: "medium", owner: "Dan", golive: false,
    size: "days", owes: "Dan", asked: "2026-09-01", parent: "answer-types-criticality",
    t: "Set per-question criticality",
    why: "Separate from section weight, and nothing in his workbook carries it.",
  },
  {
    id: "content-dan-still-owes", track: "questions", section: "q-content", kind: "feature",
    status: "wait", priority: "medium", owner: "Dan", golive: false, since: "2026-09-01",
    t: "Content Dan still owes",
    why: "None of this is ours to write.",
  },
  {
    id: "fix-section-weights-total", track: "questions", section: "q-content", kind: "feature",
    status: "wait", priority: "medium", owner: "Dan", golive: false, size: "hours", owes: "Dan",
    asked: "2026-09-01", parent: "content-dan-still-owes",
    t: "Fix the section weights that total 80",
    why: "His error, confirmed in his own words. The tool shares the missing 20 proportionally and shows the normalised share.",
  },
  {
    id: "add-security-privacy-questions", track: "questions", section: "q-content",
    kind: "feature", status: "later", priority: "low", owner: "Dan", golive: false, size: "days",
    parent: "content-dan-still-owes",
    t: "Add security and privacy questions",
    why: "Neither is represented. A security review is already asking. The topic view makes the gap visible in the meantime.",
  },
  {
    id: "bring-dropdown-answers", track: "questions", section: "q-content", kind: "feature",
    status: "wait", priority: "medium", owner: "Dan", golive: false, size: "weeks", owes: "Dan",
    asked: "2026-08-26", parent: "content-dan-still-owes",
    t: "Bring in the dropdown answers",
    why: "No picklists exist. Needs the 700 or more past assessments, which only he can hand over.",
  },
  {
    id: "routing-thresholds-approximations-dan", track: "questions", section: "q-behaviour",
    kind: "feature", status: "later", priority: "low", owner: "ours", golive: false,
    size: "days",
    t: "The routing thresholds are approximations, and Dan said so",
    why: "Confirmed on 21 September: the numbers the tool routes on are the ones he named in the first conversation and are not accurate. He added a case the tool cannot express. A department scoring itself around three does not need to come to the board at all, because everybody already agrees the work is weak, and what matters is what they plan to do about it. So the band is not one line with a score on each side of it.",
  },
  {
    id: "recording-rework-loop", track: "engine", section: "e-assessor", kind: "feature",
    status: "later", priority: "low", owner: "ours", golive: false, size: "weeks",
    t: "Recording the rework loop",
    why: "Dan called the back and forth before a board date the real value GC EARB adds, and said on 21 September that he cannot prove that value because nothing captures it. It is also why the endorsement rate is 100 per cent: an initiative that would fail is reworked or abandoned before it ever reaches the board. Recording each round would make it visible. What a round looks like as data is the open question, and nobody has answered it.",
  },
  {
    id: "question-mechanics", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Question mechanics",
    why: "What the instrument can carry.",
  },
  {
    id: "multiple-answer-types", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "question-mechanics",
    t: "Multiple answer types",
    why: "A type field with scale as the default, so nothing existing breaks.",
  },
  {
    id: "no-answer-colours-section", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "question-mechanics",
    t: "A no answer colours its section",
    why: "The question, its section, its rail row and its domain tab, and it stops nothing.",
  },
  {
    id: "topic-metadata-per-topic", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "question-mechanics",
    t: "Topic metadata and per-topic roll-up",
    why: "Security, privacy, cost, data, business and technology, visible without inventing a fifth domain.",
  },
  {
    id: "two-topic-scoring", track: "engine", section: "e-done", kind: "feature", status: "done",
    priority: "low", owner: "ours", golive: false, parent: "question-mechanics",
    t: "Two-topic scoring",
    why: "Once in the overall, at full weight inside each topic, because the weight genuinely differs by topic.",
  },
  {
    id: "saving-two-people-saving", track: "engine", section: "e-storage", kind: "feature",
    status: "next", priority: "medium", owner: "ours", golive: false,
    t: "Saving, and two people saving at once",
    why: "Everything is unclassified, so it can all live online. The seam is written; the store is not.",
  },
  {
    id: "store-seam", track: "engine", section: "e-done", kind: "feature", status: "done",
    priority: "low", owner: "ours", golive: false, parent: "saving-two-people-saving",
    t: "The store seam",
    why: "src/store.ts. One constant from live, and the dashboard already reads through it.",
  },
  {
    id: "three-calls-real-write", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    parent: "saving-two-people-saving",
    t: "The three calls a real write needs",
    why: "Saving, saved, failed with a reason. Nothing drives them yet, so the wording is settled before the write exists.",
  },
  {
    id: "deliberate-first-submit", track: "engine", section: "e-storage", kind: "feature",
    status: "next", priority: "medium", owner: "ours", golive: false, size: "hours",
    parent: "saving-two-people-saving",
    t: "One deliberate first submit",
    why: "You should know the moment your work becomes visible to TBS.",
  },
  {
    id: "autosave-online-after", track: "engine", section: "e-storage", kind: "feature",
    status: "next", priority: "medium", owner: "ours", golive: false, size: "days",
    parent: "saving-two-people-saving",
    t: "Autosave online after that",
    why: "Like a document. Every later change writes through.",
  },
  {
    id: "field-level-last-write", track: "engine", section: "e-storage", kind: "feature",
    status: "next", priority: "low", owner: "ours", golive: false, size: "hours",
    parent: "saving-two-people-saving",
    t: "Field-level last write wins, with a marker",
    why: "Not locking. Two people in different questions never collide.",
  },
  {
    id: "tell-other-person-changed", track: "engine", section: "e-storage", kind: "feature",
    status: "next", priority: "low", owner: "ours", golive: false, size: "days",
    parent: "saving-two-people-saving",
    t: "Tell the other person it changed under them",
    why: "The audit trail already keeps both accounts. What is missing is the live signal while somebody is looking at the line.",
  },
  {
    id: "submitter-answers-assessor-scores", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    parent: "saving-two-people-saving", seen: true,
    t: "Submitter answers and assessor scores are separate fields",
    why: "Which is why a submitter and an assessor cannot collide at all.",
  },
  {
    id: "questionnaire-phone", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The questionnaire on a phone",
    why: "Measured at 375 by 812, before and after. The page laid out 601px wide and every question card was cut off at the right edge; it is 375 now. The fixed header was 322px and the bar at the bottom 191px against an 812px screen, so the question itself had 299px, and it has 500.9, which is the first time a whole question card fits. The section rail rendered as a row of bare counts because every label collapsed to zero width, and it names its sections again. Four captions in the bar were bare English inside a bilingual tool. No new breakpoint was added and a gate refuses an eighth, because seven narrow widths were already in the file and none of them was the agreed one. Desktop measured unchanged at 1200 by 900. Nobody has said they are filling this in on a phone, and nobody has said they are not.",
  },
  {
    id: "every-readout-agrees-page", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Every readout agrees with the page under a category lens",
    why: "Reported as: with Security on, the rail still shows 0 of 9 for a section showing 2 questions. Three places counted the same questions and only the domain tabs knew a lens was on. One function counts now and every readout calls it, so with Security on and Business open the tab, the rail row and the bar at the bottom all say 0 of 1 against the one question on the page, the four tabs add up to 25, and that is what the chip and the second bar say. Nothing exercised the lens at all, which is how it shipped; the gate asserts that the readouts agree with the questions rendered rather than pinning any figure, because the figures are Dan’s to change.",
  },
  {
    id: "evidence", track: "engine", section: "e-done", kind: "feature", status: "done",
    priority: "low", owner: "ours", golive: false,
    t: "Evidence",
    why: "The change that follows from unclassified-only.",
  },
  {
    id: "ask-link", track: "engine", section: "e-done", kind: "feature", status: "done",
    priority: "low", owner: "ours", golive: false, parent: "evidence",
    t: "Ask for a link",
    why: "Point at where it lives, and make sure your assessor can open it.",
  },
  {
    id: "email-fallback-pattern", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "evidence",
    t: "Email fallback, with a pattern",
    why: "Marking, sent by email, subject line written for you, so an assessor can find it.",
  },
  {
    id: "classified-pledge-modal", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The classified pledge, as a modal",
    why: "She chose Protected A on the strip that says \"mark this file to save it\" and nothing happened. The advice panel was on a different screen, so it could be scrolled past and was.",
  },
  {
    id: "any-marking-above-unclassified", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    parent: "classified-pledge-modal",
    t: "Any marking above unclassified takes over the screen",
    why: "Whichever control set it. The strip, the picker, and anything added later go through one function, so they cannot drift apart again.",
  },
  {
    id: "close-control-dead-until", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    parent: "classified-pledge-modal",
    t: "The close control is dead until the box is ticked",
    why: "Grey and unclickable, and it says \"tick the box first\". Escape does not dismiss it and clicking outside does nothing.",
  },
  {
    id: "way-changes-answer", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    parent: "classified-pledge-modal",
    t: "The way out changes the answer",
    why: "An accidental click needs an exit that is not a dismissal: \"this is unclassified after all\" changes the answer, and the warning stands.",
  },
  {
    id: "asks-once-per-marking", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    parent: "classified-pledge-modal",
    t: "It asks once per marking",
    why: "After the pledge, switching between classified markings does not ask again. The panel on the overview stays as the reference.",
  },
  {
    id: "unmarked-banner-opens-marking", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    parent: "classified-pledge-modal",
    t: "The unmarked banner opens the marking question",
    why: "It scrolled to an element that only exists on the overview, so from any of the twenty question pages it did nothing at all.",
  },
  {
    id: "marking-pickers", track: "engine", section: "e-submitter", kind: "feature",
    status: "next", priority: "low", owner: "ours", golive: false,
    t: "The marking pickers",
    why: "Somebody still has to state the marking of what they point at.",
  },
  {
    id: "big-unclassified-tile-six", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "marking-pickers",
    t: "One big unclassified tile, the six grouped behind it",
    why: "The default must not be taxed by the rare path.",
  },
  {
    id: "classified-panel-acknowledgement-toggle", track: "engine", section: "e-done",
    kind: "feature", status: "done", priority: "low", owner: "ours", golive: false,
    parent: "marking-pickers",
    t: "Classified panel with an acknowledgement toggle",
    why: "What to do instead, at the moment it is relevant.",
  },
  {
    id: "collapse-three-pickers", track: "engine", section: "e-submitter", kind: "feature",
    status: "next", priority: "low", owner: "ours", golive: false, size: "hours",
    parent: "marking-pickers",
    t: "Collapse three pickers into one",
    why: "The footer’s seven pills bypass the whole design.",
  },
  {
    id: "sending-tbs", track: "engine", section: "e-submitter", kind: "feature", status: "next",
    priority: "medium", owner: "ours", golive: false,
    t: "Sending it to TBS",
    why: "The moment work stops being private. Everything here is about the person knowing that.",
  },
  {
    id: "first-submit-confirmation", track: "engine", section: "e-submitter", kind: "feature",
    status: "next", priority: "medium", owner: "ours", golive: false, size: "hours",
    parent: "sending-tbs",
    t: "First-submit confirmation",
    why: "Names what is about to go online and asks them to confirm it is unclassified.",
  },
  {
    id: "save-status-indicator", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "sending-tbs",
    t: "Save status indicator",
    why: "Draft in browser, saving, saved, or not saved with a reason. It is in the header now, so it is on every screen and on a phone; it was on the 21 question pages only, and CSS hid it below 720px.",
  },
  {
    id: "silent-until-something-actually", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "sending-tbs",
    t: "Silent until something is actually written",
    why: "It opened at \"draft saved in browser\" on an empty page, which is a claim ahead of the fact.",
  },
  {
    id: "live-indicator-whole-visit", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "sending-tbs",
    t: "One live indicator for the whole visit",
    why: "Each repaint added another listener holding a dead node. Harmless while the state never changed, and a leak the moment writes start.",
  },
  {
    id: "who-the-assessor-is", track: "engine", section: "e-assessor", kind: "feature",
    status: "wait", priority: "medium", owner: "ours", golive: false, since: "2026-09-01",
    t: "Who the assessor is",
    why: "Their name goes against a number somebody may dispute.",
  },
  {
    id: "mockup-verification-screen", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "who-the-assessor-is",
    t: "Mockup verification screen",
    why: "Labelled a mockup, the departmental-account button visibly disabled, everything unverified.",
  },
  {
    id: "nothing-assessor-typed-overwritten", track: "engine", section: "e-done",
    kind: "feature", status: "done", priority: "low", owner: "ours", golive: false,
    t: "Nothing an assessor typed is overwritten silently",
    why: "Four places did it. Agree-with-all replaced a verdict somebody had already given, the note field rewrote the reason on whatever change was last in the trail, reloading a file of the same name discarded the audit attached to it without a word, and the email button wrote over a link somebody had typed.",
  },
  {
    id: "auditing-rules-dan-gave", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Auditing rules Dan gave as rules",
    why: "He stated all five as requirements in the review, and all five are built.",
  },
  {
    id: "justification-required-changed-score", track: "engine", section: "e-done",
    kind: "feature", status: "done", priority: "low", owner: "ours", golive: false,
    parent: "auditing-rules-dan-gave",
    t: "Justification required on a changed score",
    why: "His rule. The file cannot be saved while one is missing, and the button says how many are outstanding.",
  },
  {
    id: "accept-per-section", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    parent: "auditing-rules-dan-gave",
    t: "Accept-all per section",
    why: "He asked for it by name. It touches no score, and skips any changed score that still needs a reason.",
  },
  {
    id: "assessor-recorded-per-question", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    parent: "auditing-rules-dan-gave",
    t: "Assessor recorded per question",
    why: "Two assessors on one high-profile file. Each change carries a name, a time and a reason.",
  },
  {
    id: "edit-exchange-visible", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    parent: "auditing-rules-dan-gave",
    t: "The edit exchange, visible",
    why: "The line says it was edited and by whom. The full back and forth opens on request, and nothing is overwritten.",
  },
  {
    id: "evidence-read", track: "engine", section: "e-done", kind: "feature", status: "done",
    priority: "low", owner: "ours", golive: false, parent: "auditing-rules-dan-gave",
    t: "Evidence read-only",
    why: "Already true, and now held true by a test.",
  },
  {
    id: "load-question-set-moves", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Load a question set moves here",
    why: "It belongs to whoever maintains the instrument. A submitter is told where it lives and not handed the control.",
  },
  {
    id: "reachable-without-going-through", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "Reachable without going through the assessor view",
    why: "It sat behind two clicks on the assessor side with nothing on the start page pointing at it. There is a line under the assessor link now, and it asks who you are the same way.",
  },
  {
    id: "portfolio-dashboard", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The portfolio dashboard",
    why: "Dan’s self-updating dashboard. It recalculates every record from the answers as the page draws, so there is no stored number to go stale.",
  },
  {
    id: "averages-domain-topic", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "portfolio-dashboard",
    t: "Averages by domain and by topic",
    why: "The topic cut is the one a single assessment cannot show: security spread thin over four domains looks fine in each of them.",
  },
  {
    id: "every-record-weakest-first", track: "engine", section: "e-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "portfolio-dashboard",
    t: "Every record, weakest first",
    why: "The list is a worklist. Red rows are the ones with a no answer.",
  },
  {
    id: "portfolio-csv", track: "engine", section: "e-done", kind: "feature", status: "done",
    priority: "low", owner: "ours", golive: false, parent: "portfolio-dashboard",
    t: "Portfolio CSV",
    why: "One row per record, topic columns included.",
  },
  {
    id: "currently-see", track: "engine", section: "e-done", kind: "feature", status: "done",
    priority: "low", owner: "ours", golive: false, parent: "portfolio-dashboard",
    t: "It says what it can currently see",
    why: "With no store, that is this browser and the files opened this session. The page says so, so it cannot be read as live.",
  },
  {
    id: "admin-actions", track: "engine", section: "e-admin", kind: "feature", status: "wait",
    priority: "low", owner: "ours", golive: false, owes: "Dan", since: "2026-09-01",
    t: "Admin-only actions",
    why: "Nobody has decided whether admin is a role. Listed so the roles matrix is complete.",
  },
  {
    id: "withdraw-record", track: "engine", section: "e-admin", kind: "feature", status: "later",
    priority: "low", owner: "ours", golive: false, size: "hours", parent: "admin-actions",
    t: "Withdraw a record",
    why: "Out of every statistic and still in the list, with nothing deleted.",
  },
  {
    id: "re-assign-assessor", track: "engine", section: "e-admin", kind: "feature",
    status: "later", priority: "low", owner: "ours", golive: false, size: "days",
    parent: "admin-actions",
    t: "Re-assign an assessor",
    why: "Somebody leaves, or a file needs a second pair of eyes.",
  },
  {
    id: "clear-test-submissions", track: "engine", section: "e-admin", kind: "feature",
    status: "later", priority: "low", owner: "ours", golive: false, size: "hours",
    parent: "admin-actions",
    t: "Clear out test submissions",
    why: "Dan raised it and parked it.",
  },
  {
    id: "twelve-month-questions-dan", track: "engine", section: "e-exec", kind: "feature",
    status: "later", priority: "low", owner: "ours", golive: false,
    t: "The twelve-month questions Dan wants answered",
    why: "The reason the data is worth capturing at all. All of it needs more than one record to mean anything.",
  },
  {
    id: "per-question-averages-histograms", track: "engine", section: "e-exec", kind: "feature",
    status: "later", priority: "low", owner: "ours", golive: false, size: "days",
    parent: "twelve-month-questions-dan",
    t: "Per-question averages and histograms",
    why: "Which questions the whole GC is weak on, which is the argument for changing a question.",
  },
  {
    id: "average-department", track: "engine", section: "e-exec", kind: "feature",
    status: "later", priority: "low", owner: "ours", golive: false, size: "hours",
    parent: "twelve-month-questions-dan",
    t: "Average by department",
    why: "Needs enough records that a department average is not one initiative.",
  },
  {
    id: "best-worst-evidence-per", track: "engine", section: "e-exec", kind: "feature",
    status: "later", priority: "low", owner: "ours", golive: false, size: "days",
    parent: "twelve-month-questions-dan",
    t: "Best and worst evidence per question",
    why: "Gives a submitter an example of what good looks like, which is the thing people ask for first.",
  },
  {
    id: "assessor-sign", track: "admin", section: "a-signin", kind: "feature", status: "next",
    priority: "high", owner: "ours", golive: false,
    t: "Assessor sign-in",
    why: "Four routes, and they are a sequence rather than a choice. Each was argued on its own and the cheapest was never costed.",
  },
  {
    id: "sign-link-sent-work", track: "admin", section: "a-signin", kind: "feature",
    status: "next", priority: "high", owner: "ours", golive: false, size: "days",
    parent: "assessor-sign",
    t: "Sign in with a link sent to your work address",
    why: "Built and working. Firebase mails a one-time link, opening it proves the person can read that mailbox, and the address comes back verified, which is what the store’s rules insist on. It sits under Other ways to sign in, below the Google button.\n\nWhat it costs: five sign-in emails a day for the whole project on the no-cost plan. Read that as five sign-in events, not five people; somebody who signs in once stays signed in until they clear their browser. A room trying it at the same time, or one person mistyping twice, is what it will not survive.\n\nThere is no per-email price anywhere in Firebase. The two columns of that table are headed \"instrumentless\" and \"with billing instrument\", so what moves you past five is attaching a card, not spending money. Do not attach one yet: Firebase’s spend caps do not cover Firestore or Authentication, so a card removes the only ceiling this project has.\n\nTesting costs nothing now. Generating a link is a different operation with a limit of 20,000 a day and it posts no mail, so links can be made on a laptop and sent from an ordinary mailbox.\n\nWhat is still unsolved is delivery to a gc.ca address. Mail from this project goes out as noreply at a firebaseapp.com address, with no sender name, carrying a link to that same domain, which has no DMARC record and is a documented phishing host. A copy sent to a Gmail address on 27 September landed in spam. TBS sits behind Microsoft Defender, where high-confidence phishing is quarantined where an ordinary user cannot see it, and Safe Senders is explicitly ignored.",
  },
  {
    id: "password-set-link-later", track: "admin", section: "a-signin", kind: "feature",
    status: "next", priority: "medium", owner: "ours", golive: false, size: "days",
    parent: "assessor-sign",
    t: "A password, set from a link, so later sign-ins cost no mail",
    why: "Asked for on 26 September: add password sign in. Dan waved it away in the first conversation and the reason was never written down, so ask him before building it. What it buys is the cap. Firebase’s own limits table gives sign-in link mail five a day for the whole project and password reset mail a hundred and fifty, on the same no-cost plan, and there is no per-message charge on either. The shape that keeps this tool’s promise is not a password box on the front door. Nobody types a password to get in the first time: an assessor is invited with a link, which spends one of the five, and once they are inside, the tool offers to set a password on an address the link has already verified. That inverts the cap. Five a day stops meaning five sign-ins and starts meaning five new people, and somebody who already has a password is never counted again, because signing in with one sends no mail at all. It satisfies the store’s rules for the same reason the link does: those rules ask only that the address be verified, and an address verified by a link stays verified when a password is set on it. What it costs is that passwords then exist, which this tool was built to avoid, and a password is one more thing somebody reuses from another site. It also needs a way back for somebody who forgets one, which is the hundred and fifty a day and not the five. Nothing is needed in the console: Email/Password was enabled on 24 September alongside the link.",
  },
  {
    id: "sign-work-microsoft-account", track: "admin", section: "a-signin", kind: "feature",
    status: "later", priority: "medium", owner: "ours", golive: false, size: "days",
    parent: "assessor-sign",
    t: "Sign in with a work Microsoft account",
    why: "The final goal, and the blocker is a measurement nobody has taken rather than a decision from TBS. Three things settled on 24 September. One, registration needs nobody’s advance permission: an application registered once as multi-tenant lets people from any Microsoft directory sign in, the other organisation is never asked beforehand, and it costs nothing. The September note saying TBS must register it was wrong about that. Two, what is true is narrower and it is ours: the store refuses any identity without a verified address, and Firebase has an open report since August 2024 that it reports a Microsoft address as unverified. Three, and this is the part that changes the answer, that report is about an address signing in for the first time, where Microsoft creates the account. An address that has already signed in once by emailed link already exists with a verified address, and Firebase with one account per address does not make a second. The link shipped first, so that is the case our three assessors will actually meet. Nobody has measured either case. Measuring costs an application registration in any directory somebody already has, which Entra lets an ordinary user make by default, and then one real sign-in with the token read back. If the answer is that the address comes back verified, the build is a button, a provider enabled in the console and two redirect addresses. If it comes back unverified, the choice is between asking TBS for a single-tenant registration, which keeps the rules intact because TBS controls the addresses, and softening the rule, which would mean trusting every directory administrator in the world with a claim they are free to set, over a store holding pre-decisional departmental work. Do not soften the rule.",
  },
  {
    id: "ask-security-already-assessed", track: "admin", section: "a-signin", kind: "feature",
    status: "next", priority: "low", owner: "ours", golive: false, size: "hours",
    parent: "assessor-sign",
    t: "Ask IT Security what they have already assessed",
    why: "The question under the other three, and nobody has asked it. Nick said what they would prefer depends on what IT Security has assessed, and that this is corporate and not his group. The useful ask is for the list of assessed services, because the list decides the destination, where a ruling on Firestore only closes a door. He named Robin Sidhu for the identity side and was explicit that it is a separate conversation from which third-party services are authorised. Asking IMTD for an Azure registration before this is a request that fails twice. Commitment: none, it is one message.",
  },
  {
    id: "priced-stores-answer-keep", track: "admin", section: "a-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "assessor-sign",
    t: "Priced the stores, and the answer is to keep Firestore",
    why: "Asked on 23 September: how much would it cost if paid, is there anything free, why are we on Firestore at all. Three answers. The bill is nothing and would stay nothing: Firestore in Montreal is 3.3 cents per hundred thousand reads past a free fifty thousand a day, and this tool would need three million reads in one day to be charged one cent. Pay-as-you-go carries the same free amounts, so the only thing a card changes is the mail quota. Nothing is cheaper, because nothing is cheaper than nothing, and the free tiers elsewhere carry traps this tool would hit: a Supabase project on the free plan is paused after a week of no traffic, which is exactly what a tool used before a board meeting looks like, and its own sign-in mail is capped at two an hour. Appwrite has no Canadian region. Corrected on 24 September: this entry used to say the access code could not survive the move, and that was wrong. It was tested against a real Postgres rather than argued about. A code is a twelve-character string; it is a document name today and would be a primary key tomorrow, and nothing anybody holds carries it in a link, so every code keeps working. The mechanism survives too: a policy of the form USING (id = the code arriving as a request header) gives a holder exactly their own row and gives somebody with no code nothing, including through a count. Twenty assertions, all passing. What does not survive is the simplicity. The four comparisons that stop a code holder moving a record into somebody else’s account become a trigger function, and everything in a Supabase public schema is reachable by the anonymous key until it is given a policy of its own, where a Firestore path with no rule is closed. The reason to stay is simpler and it is about this tool’s rhythm: a free Supabase project is paused after a week without traffic, and this tool goes quiet for months between assessment rounds, so the first assessor back would meet a sleeping database and a dashboard they have no account on.",
  },
  {
    id: "moving-store-off-firestore", track: "admin", section: "a-publish", kind: "feature",
    status: "later", priority: "low", owner: "ours", golive: false, size: "weeks",
    parent: "assessor-sign",
    t: "Moving the store off Firestore",
    why: "Rewritten on 23 September because the first version of this was not understandable. What it means: today the page talks straight to Google’s database and Google decides who may read what. Moving off Firestore means putting something of our own in the middle, and then we decide, which means we are the thing that has to be right, stay up and stay patched after the work term ends. Today a bad request is refused even if somebody edits the page’s JavaScript in their own browser. Three to five weeks for a destination somebody has named, and no estimate for one nobody has: only three files anywhere name Firestore, but the tidy seam covers the submitter’s document alone and eleven modules reach past it for roles, sign-in, withdrawal and the code lookup, so those get untangled first. And it does not fix the reason an assessor needs an account. Show me every submission cannot be tied to a secret somebody is holding; a server has the same problem, because it still has to know who is asking. What it would genuinely buy is limiting how often one address can ask, a log of who asked for what, and whatever the IT Security list turns out to say. Real, and none of it urgent.",
  },
  {
    id: "move-tool-canada-ca", track: "admin", section: "a-publish", kind: "feature",
    status: "wait", priority: "medium", owner: "Nick", golive: true, asked: "2026-09-01",
    t: "Move the tool into the canada-ca GitHub organisation",
    why: "canada-ca is a GitHub organisation at github.com/canada-ca. It is not the canada.ca website, and nothing here is about publishing to canada.ca.\n\nDan raised it again on 26 September: the tool and this backlog should sit in a Government of Canada place rather than a personal account.\n\nTwo separate moves are tangled in this one line. Publishing the built page into canada-ca/TBS-OCIO-ESP needs no new repository and no transfer: that repository is public, access is already granted, and it already serves a GitHub Pages site. It waits only on Dan clearing the 176 draft questions for public view. Moving the source repository out of a personal account is the other one, and that waits on Nick, who was asked on 1 September and has not answered.",
  },
  {
    id: "publish-built-page-canada", track: "admin", section: "a-publish", kind: "feature",
    status: "wait", priority: "medium", owner: "ours", golive: false, size: "hours", owes: "Dan",
    since: "2026-09-03", parent: "move-tool-canada-ca",
    t: "Publish the built page into canada-ca/TBS-OCIO-ESP",
    why: "One commit, once Dan says the 176 draft questions can be public. The repository is public, access is already granted, and it already serves a Pages site.",
  },
  {
    id: "github-pages-serve-private", track: "admin", section: "a-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "move-tool-canada-ca",
    t: "GitHub Pages cannot serve a private repo on a free account",
    why: "Checked: all 35 Pages sites in canada-ca come from public repos, and no private repo there serves one. This is why a separate public preview repo exists.",
  },
  {
    id: "reply-nick-transfer-existing", track: "admin", section: "a-done", kind: "feature",
    status: "done", priority: "low", owner: "ours", golive: false, parent: "move-tool-canada-ca",
    t: "Reply to Nick: transfer the existing repo",
    why: "Sent. 28 commits of history, all yours.",
  },
  {
    id: "nick-owes-answer-moves", track: "admin", section: "a-publish", kind: "question",
    status: "wait", priority: "low", owner: "Nick", golive: false, size: "hours", owes: "Nick",
    asked: "2026-09-01", parent: "move-tool-canada-ca",
    t: "Nick owes an answer on who moves the repository",
    why: "Open an issue on canada-ca/welcome is the route he named. Whether he moves it or you do is the part still unanswered.",
  },
  {
    id: "retire-separate-preview-repository", track: "admin", section: "a-publish",
    kind: "feature", status: "next", priority: "low", owner: "ours", golive: false,
    size: "hours", parent: "move-tool-canada-ca",
    t: "Retire the separate preview repository",
    why: "The second repository exists only because GitHub Pages will not serve a private repository on a free account. The source repository was made public on 21 September, so that reason is gone and the two can be one. Three files still say it is private, and they are wrong.",
  },
  {
    id: "notifications", track: "admin", section: "a-process", kind: "feature", status: "wait",
    priority: "low", owner: "ours", golive: false, since: "2026-09-01",
    t: "Notifications",
    why: "GC Notify is the sanctioned service and is already in Dan’s own rubric at application question Q33. What triggers one is his decision and he has not made it.",
  },
  {
    id: "draft-email", track: "admin", section: "a-done", kind: "feature", status: "done",
    priority: "low", owner: "ours", golive: false, parent: "notifications", seen: true,
    t: "Draft the email",
    why: "Opens the person’s own mail client with the message written. All a static page can do.",
  },
  {
    id: "decide-triggers", track: "admin", section: "a-process", kind: "feature", status: "wait",
    priority: "medium", owner: "Dan", golive: false, size: "hours", owes: "Dan",
    since: "2026-09-01", parent: "notifications",
    t: "Decide the triggers",
    why: "Submission, assignment, a changed score and a reminder are four different decisions.",
  },
  {
    id: "john-s-team-validates", track: "admin", section: "a-process", kind: "feature",
    status: "later", priority: "low", owner: "John", golive: false, size: "weeks",
    t: "How John’s team validates evidence",
    why: "Their job changes completely and Dan expects resistance.",
  },
  {
    id: "intake-accepts-whom", track: "admin", section: "a-process", kind: "feature",
    status: "later", priority: "low", owner: "Dan", golive: false, size: "days",
    t: "What the intake accepts, and from whom",
    why: "Dan called it a protocol for the humans.",
  },
  {
    id: "initiatives-must-submit", track: "admin", section: "a-process", kind: "feature",
    status: "later", priority: "low", owner: "Dan", golive: false, size: "hours",
    t: "Which initiatives must submit",
    why: "His call. Blocks nothing we build.",
  },
  {
    id: "personal-accounts", track: "admin", section: "a-owner", kind: "chore", status: "next",
    priority: "high", owner: "ours", golive: true,
    t: "The tool runs on a personal GitHub account and a personal Firebase project",
    why: "Everything the tool is made of is held by one student. The source repository and the published site are under a personal GitHub account. The store, the sign-in and the only key are a Firebase project under a personal Google account. A co-op term ends.\n\nThis is not a note. The personal address is compiled into the product: four links a user sees on screen point at that account.\n\nAnd nothing anywhere in the repository says who owns it, when it ends, or how it is handed over. That was checked on 28 September against every file in NOTES, the README and CLAUDE.md, and there is no such sentence.\n\nThe four things under this are what turn it from a risk into a record. It was written up before as a section under her name, which made it read as her housekeeping rather than as the project’s single point of failure.",
  },
  {
    id: "owner-of-record", track: "admin", section: "a-owner", kind: "chore", status: "next",
    priority: "high", owner: "ours", golive: true, size: "hours",
    t: "Name an owner of record for the store",
    why: "A named person at TBS who is answerable for what is in the database, written down in the repository. The wording already exists in the requirements with the name left blank. It stays blank until somebody says it.",
  },
  {
    id: "store-delete-date", track: "admin", section: "a-owner", kind: "chore", status: "next",
    priority: "medium", owner: "ours", golive: false, size: "hours",
    t: "Set a date the prototype store is deleted",
    why: "A prototype that holds real departmental answers with no end date becomes a system nobody decided to run. Pick the date now, while it is cheap, and write it beside the owner.",
  },
  {
    id: "handover-written-down", track: "admin", section: "a-owner", kind: "chore",
    status: "next", priority: "high", owner: "ours", golive: true, size: "hours",
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
    id: "duplicate-questions", track: "questions", section: "q-broken", kind: "bug",
    status: "next", priority: "high", owner: "ours", golive: true, size: "days",
    t: "The same question is asked twice in different sections",
    why: "Dan found it himself in the meeting on 26 September: he asked the same thing twice, in two different sections, and said neither of them had ever been happy with it.\n\nSo this is a defect in the instrument, not a preference. A department answering the same question twice, in two places, with two scores, makes the total meaningless and makes the tool look careless.\n\nIt needs a pass over all 176 questions to find the pairs, and then Dan’s decision on which of each pair survives. Ours to find, his to cut.",
  },
  {
    id: "conditional-questions", track: "questions", section: "q-behaviour", kind: "feature",
    status: "later", priority: "low", owner: "ours", golive: undefined, size: "days",
    t: "Follow-on questions that only appear when they apply",
    why: "Dan’s idea, on 26 September, and he priced it himself: nice to have, not need to have, and explicitly not high priority.\n\nWhat it means. Some questions are yes or no, and they govern others. His example: if the answer to \"are all your connections secure\" is no, the follow-up about which programs are used should not be asked at all. Today it is asked anyway, and a department clicks no through a run of questions that do not apply to them.\n\nSo it is a user-experience change rather than a scoring one. It needs the question set to say which question controls which, which is another thing only Dan can supply, and it should wait until the set itself is settled.",
  },
  {
    id: "backlog-where-dan-can-see-it", track: "admin", section: "a-publish", kind: "chore",
    status: "next", priority: "medium", owner: "ours", golive: undefined, size: "hours",
    t: "Put this backlog where Dan can read it without being sent a link",
    why: "Asked for on 26 September. He had not seen the backlog, and asked for one in the SharePoint drive so he could look at it and say what matters more than what.\n\nHe accepted HTML when told that is what it is, and then asked the real question: is it in a Government of Canada place. It is not. It is published from a personal GitHub account, so it goes wherever the tool goes, which is the canada-ca item above.\n\nThe priority picker on this page is the other half of the same ask: it is how he says this before that without writing anything down.",
  },
  {
    id: "mail-from-a-domain-we-own", track: "admin", section: "a-signin", kind: "feature",
    status: "next", priority: "medium", owner: "ours", golive: undefined, size: "days",
    t: "Send sign-in mail from an address a government filter will accept",
    why: "The blocker on every route that mails somebody. What leaves today comes from noreply at a firebaseapp.com address, with no sender name, carrying a link to that same domain: no DMARC record, and a domain documented as a phishing host. Gmail put it in spam on 27 September. TBS is behind Microsoft Defender, which quarantines high-confidence phishing where the recipient cannot see it and ignores Safe Senders.\n\nTwo ways out, and neither is to wait.\n\nOne, do not use Firebase’s mail at all. Generate the link, which is free and uncapped, and send it from an ordinary Outlook mailbox. Government to government is the delivery profile most likely to arrive. This works today and needs nobody outside the team.\n\nTwo, point Firebase at a mail server we control, which is a setting on the no-cost plan. It needs a sending domain and credentials for it, and we have neither. GC Notify is the sanctioned service in the Government of Canada and offers no SMTP, only a REST interface, which makes that a piece of work rather than a setting.\n\nA third way, found on 28 September and better than either: GC Notify is free to federal public servants, sends from a government domain, and its own documentation covers sending sign-in codes. That is the sanctioned service, it solves the filtering problem at the source rather than working around it, and it needs a government email address to register, which we have. It has a REST interface and no SMTP, so Firebase cannot be pointed at it: the shape is the generator making a link and GC Notify sending it.",
  },
  {
    id: "q-may-write-prototype", track: "admin", section: "a-signin", kind: "question",
    status: "wait", priority: "medium", owner: "ours", golive: false, size: "hours",
    owes: "ours, then Dan", since: "2026-09-03",
    t: "Who may write to the prototype store",
    why: "Meanwhile: Anybody who reads the page source. Fine for unclassified drafts, and the reason the real one needs the departmental sign-in",
  },
  {
    id: "q-may-edit-stored", track: "admin", section: "a-signin", kind: "question",
    status: "wait", priority: "medium", owner: "ours", golive: false, size: "days", owes: "Dan",
    asked: "2026-09-01",
    t: "Who may edit a stored assessment, and how it is checked",
    why: "Blocks: Real authentication. Meanwhile: Mockup screen, everything labelled unverified",
  },
  {
    id: "q-verifying-assessor-s", track: "admin", section: "a-signin", kind: "question",
    status: "wait", priority: "medium", owner: "ours", golive: false, size: "weeks", owes: "Dan",
    asked: "2026-09-01",
    t: "Verifying an assessor’s identity",
    why: "Blocks: Real sign-in. Meanwhile: Typed name, labelled unverified on every change it records",
  },
  {
    id: "q-admin-role-assessor", track: "engine", section: "e-admin", kind: "question",
    status: "wait", priority: "medium", owner: "ours", golive: false, size: "days", owes: "Dan",
    asked: "2026-09-01",
    t: "Is admin a role, or an assessor with more buttons?",
    why: "Blocks: The admin-only actions. Meanwhile: The dashboard is built; the actions are listed and marked unbuilt",
  },
  {
    id: "q-production-intake-should", track: "admin", section: "a-publish", kind: "question",
    status: "wait", priority: "medium", owner: "ours", golive: false, size: "weeks", owes: "TBS",
    asked: "2026-09-01",
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
    id: "expired-session-dead-end", track: "engine", section: "e-broken", kind: "bug",
    status: "next", priority: "high", owner: "ours", golive: true, size: "hours",
    t: "A session that goes bad leaves the assessor on a screen with no way to sign in",
    why: "Found on 28 September while testing the Google sign-in. An account was deleted in the console while a browser still held its session. Reloading the assessor page then drew the submissions screen, carrying a panel that read \"Sign in to see the pool\", and nothing anywhere on it to sign in with.\n\nWhy it happens: the door in front of the assessor screens opens as soon as a name is known, and the name is taken from whatever session the browser is holding at that moment. A session whose token can no longer be refreshed still carries a name, so the door opens, the store then refuses to list anything, and the screen that results asks for a sign-in it does not offer.\n\nWho it reaches: anybody whose access is taken away in the danger zone, anybody whose account is removed, and anybody whose sign-in simply stops refreshing. None of those is unusual, and what they get is a screen they cannot leave without knowing to clear their browser.\n\nThe fix is to open the door on a session the store still accepts rather than on a name being present, and to put the way back on the refusal screen either way.",
  },
  {
    id: "unclassified-only-contradiction", track: "engine", section: "e-broken", kind: "bug",
    status: "next", priority: "medium", owner: "ours", golive: true, size: "hours",
    t: "Settings says everything in the tool is unclassified, and the pool holds a Protected B record",
    why: "Noticed on 28 September while taking the same claim out of the footer, where it appeared on every screen.\n\nSettings, under Where your answers go, opens with \"Everything in this tool is unclassified. Nothing protected or classified belongs in it.\" The tool asks every assessment for a marking, offers six above unclassified, takes a pledge for them, and the real pool holds a record marked Protected B right now.\n\nSo the sentence is either wrong or badly worded, and which one it is depends on a distinction nobody has written down: whether the marking on an assessment describes the evidence it points at, or the file itself. The type says the marking must be at least as high as anything inside it, which reads as the file. The pledge screen talks about not pasting classified content in, which reads as the evidence.\n\nSettle that first, then say it once, in one place. A rule repeated in three wordings is three rules.",
  },
  {
    id: "ask-cyber-security-about-sign-in", track: "admin", section: "a-signin", kind: "chore",
    status: "next", priority: "high", owner: "Dan", golive: true, size: "hours",
    t: "Tell TBS Cyber Security what we are signing people in with",
    why: "This is owed now, whatever happens with anything else, and nobody has done it. The Treasury Board Guideline on Cloud Authentication says an organization must contact the TBS Cyber Security Division before using a bespoke cloud authentication solution. Google sign-in plus a Firebase email link is exactly that.\n\nIt has to come from Dan rather than from us, because it is a departmental conversation and the address it goes to is zztbscybers@tbs-sct.gc.ca.\n\nTwo questions in one message. One: we run an internal tool for TBS staff and for assessors in other departments, signing in with Google and a one-time email link, and is that acceptable for a prototype. Two: is there a Government of Canada sign-in for that internal audience we should be planning toward, and what is it called this year.\n\nThe second question matters because the internal service has a name that keeps changing. The ICAM framework names GCpass. Shared Services Canada described delivering cross-department single sign-on for six departments in September 2025 and building a government-wide sign-in foundation for public servants for 2026-27, without naming it GCpass. So the capability is real and current and the name is uncertain, which is a reason to ask rather than to design around it.",
  },
  {
    id: "canada-login-is-for-the-public", track: "admin", section: "a-signin", kind: "question",
    status: "done", priority: "low", owner: "ours", golive: false,
    t: "The Canada sign-in service Dan mentioned is for the public, not for staff",
    why: "Asked on 28 September: Dan said there is a Canada log in service we could potentially use.\n\nHe meant Sign In Canada, or CanadaLogin at login.canada.ca which is replacing it. That is the sign-in on a Canada Revenue Agency or Service Canada page, and it is the front door for the public.\n\nThe government’s own architecture says so. The GC ICAM framework defines internal users as public servants and contractors and external users as members of the public and businesses, and states that internal needs are served by a different service, named there as GCpass. Sign In Canada describes its own job as serving programs’ external clients. This tool is on the internal side for both groups it serves.\n\nIt would also not solve the problem we have. CanadaLogin holds a self-asserted name, address, phone and language, so it proves somebody controls an email address and nothing more, which is what our one-time link already proves. It would never say that a person is an architect at a named department, so the assessor list stays hand-kept either way.\n\nAnd it is closing to newcomers. Sign In Canada stopped onboarding applications on 31 July 2023, and everything on it has to move to CanadaLogin by 30 December 2026.\n\nOne thing checked and corrected, because it would have sent us building the wrong thing: a page with no server is NOT the blocker. Firebase, upgraded to Google Cloud Identity Platform, accepts an outside sign-in provider and keeps the secret in Google’s own configuration while the page only opens a popup. Firebase is the server. The blockers are the audience and the fact that onboarding is a department-to-department agreement with a privacy assessment and an authority to operate behind it.\n\nDo not send anybody a login.canada.ca link at the moment. The site was rebuilt on 23 September and every address on it, including its own home page, returns not found.",
  },
];
