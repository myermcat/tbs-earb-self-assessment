/**
 * Drives the real built file in a real DOM: pages through all four architecture domains,
 * answers all 176 questions, then feeds the saved file back through the reviewer side.
 */
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

let fails = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) { fails++; console.log(`  FAIL  ${name} ${extra}`); } else console.log(`  ok    ${name}`);
};

const html = await readFile('dist/index.html', 'utf8');
const rubric = JSON.parse(await readFile('rubric/rubric.v1-dan.json', 'utf8'));
const TOTAL = rubric.domains.reduce((n, d) => n + d.sections.reduce((m, s) => m + s.questions.length, 0), 0);

const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

const saved = [];
window.URL.createObjectURL = (blob) => { saved.push(blob); return 'blob:captured'; };
window.URL.revokeObjectURL = () => {};
const origClick = window.HTMLAnchorElement.prototype.click;
window.HTMLAnchorElement.prototype.click = function () { if (!this.download) origClick.call(this); };
window.alert = () => {};
window.confirm = () => true;   // nothing uses it any more; kept so a stray call cannot hang
window.print = () => {};
window.scrollTo = () => {};
const opened = [];
window.open = (u) => { opened.push(u); return null; };
let lastMailto = '';

const text = async (blob) => (blob.text ? await blob.text() : String(blob));

await new Promise((r) => setTimeout(r, 60));

const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const byText = (sel, t) => qa(sel).find((n) => n.textContent.trim().toLowerCase().includes(t.toLowerCase()));
const fire = (node, type) => node.dispatchEvent(new window.Event(type, { bubbles: true }));
/**
 * The bundle is inlined in a <script> inside <body>, so document.body.textContent contains
 * the whole source - any assertion against it matches string literals in the code rather
 * than rendered output. Always assert against the app root instead.
 */
const view = () => document.getElementById('app').textContent;
/**
 * Every dialog in the app is the same component, and in jsdom it renders non-modally rather
 * than through window.confirm. `dialogAct` presses one of its buttons by text; `dialogGone`
 * checks it closed.
 */
const dialogAct = (t) => {
  const dlg = document.querySelector('dialog.confirm');
  if (!dlg) return false;
  const btn = [...dlg.querySelectorAll('button')].find((b) => b.textContent.toLowerCase().includes(t.toLowerCase()));
  if (!btn) return false;
  btn.click();
  return true;
};
const dialogText = () => document.querySelector('dialog.confirm')?.textContent ?? '';

/** Answers currently in the tool, read the way the app reads them. */
const answeredNow = () => {
  const raw = window.localStorage.getItem('gc-arch-assessment:draft');
  const live = q('.set-row.danger p')?.textContent?.match(/Erases the (\d+)/);
  if (live) return Number(live[1]);
  if (!raw) return 0;
  // Not applicable counts as dealt with, the way the app counts it.
  return Object.values(JSON.parse(raw).answers ?? {})
    .filter((x) => typeof x.score === 'number' || x.na === true).length;
};
/** Settings is a rail and one pane, so a check has to open the pane it is about. */
const pane = (name) => qa('.set-navrow').find((b) => b.textContent.includes(name)).click();
/** Mirrors shortLabel() in views-submit.ts, which trims a domain name down to a tab label. */
const shortName = (s) => s.replace(/\s*&\s*\w+/, '').replace(/\s*Architecture$/, '');

/**
 * With one section per page, a question exists only on its own section's page. This walks to
 * whichever section holds the question whose text contains `needle`, and returns its node.
 */
function gotoQuestion(needle) {
  for (const d of rubric.domains) {
    for (const sec of d.sections) {
      if (!sec.questions.some((x) => x.text.includes(needle))) continue;
      const tab = qa('.stepper .step').find((t) => t.textContent.includes(shortName(d.label)));
      if (tab && !tab.className.includes('on')) tab.click();
      const row = qa('.toc-sec').find((n) => n.textContent.includes(sec.label));
      row.click();
      return qa('.question').find((n) => n.textContent.includes(needle));
    }
  }
  return undefined;
}

// ---- home ------------------------------------------------------------------------------
ok('app mounted', !!q('#app .topbar'));
ok('the header carries only the name, no version clutter', !q('.brand').textContent.includes('1.0-dan'));
ok('the rubric version is available in the footer', q('.sitefoot').textContent.includes('1.0-dan'));
ok('draft status is reachable from the footer', !!byText('button', 'How that works'));
ok('the question count is stated up front', view().includes(String(TOTAL)));

// Settings is a rail with one pane at a time, ordered from nothing at stake to everything.
q('.icon-btn[aria-label="Settings"]').click();
ok('settings is a rail and a pane, not a stack of cards',
   !!q('.set-layout') && !!q('.set-nav') && !!q('.set-pane'));
ok('four panes, named', qa('.set-navrow').map((b) => b.textContent).join('|') ===
   'Question set|Your answers|This build|Start again',
   qa('.set-navrow').map((b) => b.textContent).join('|'));
ok('the gear opens the harmless one', q('.set-navrow.on').textContent === 'Question set',
   q('.set-navrow.on').textContent);
ok('the destructive pane is marked as dangerous in the rail itself',
   qa('.set-navrow')[3].classList.contains('danger'));
{
  // The backlog is in Settings, which is where somebody goes looking for it.
  pane('This build');
  ok('this build says which versions are on screen',
     view().includes('Question set') && view().includes('v0.1.0'));
  ok('and says whether there is a store to write to',
     view().includes('cannot send anything') || view().includes('Writing to'));
  /**
   * The pages that are not this tool are cards and not rows. A setting is a sentence with a
   * control beside it; these are destinations, and the shape is the course-hub card so that
   * somebody finds the one they want without reading anything.
   */
  const cards = [...qa('.hub-cards .hub-card')];
  ok('the pages that explain this are cards', cards.length === 5, String(cards.length));
  ok('the two spreadsheets are among them',
     cards.filter((c) => /docs\.google\.com\/spreadsheets/.test(c.getAttribute('href') ?? '')).length === 2,
     cards.map((c) => c.getAttribute('href')).join(' | '));
  ok('and an eyebrow, a title and a call to action',
     cards.every((c) => c.querySelector('.hub-eyebrow') && c.querySelector('h3') && c.querySelector('.hub-go')));
  ok('the explanation is one of them, and needs no sign-in',
     cards.some((c) => /domains-and-categories\.html$/.test(c.getAttribute('href') ?? '')
       && /no sign-in/i.test(c.querySelector('.hub-eyebrow')?.textContent ?? '')),
     cards.map((c) => c.getAttribute('href')).join(' | '));
  ok('and the backlog opens from here',
     cards.some((c) => (c.getAttribute('href') ?? '').endsWith('/backlog.html')),
     cards.map((c) => c.getAttribute('href')).join(' | '));
  ok('every one of them opens in a new tab and cannot reach back',
     cards.every((c) => c.getAttribute('target') === '_blank' && /noopener/.test(c.getAttribute('rel') ?? '')));
  pane('Question set');
}

ok('settings shows the rubric version', view().includes('1.0-dan'));
ok('settings surfaces the import warning about the Business weight gap', view().includes('80%'));
// Replacing the question set belongs to whoever maintains the instrument, so a submitter is
// told where it lives and not handed the control.
// A submitter cannot change the set, so the screen does not discuss changing it. It shows
// which set they are answering.
ok('a submitter is not offered the question-set loader',
   !byText('.filelabel', 'Load a question set') && !byText('.filelabel', 'Add a question set'));
ok('and is not told about a setting they do not have',
   !view().includes('on the assessor side'));
ok('but does see which set is in use', view().includes('Version') && view().includes('questions in'));

pane('Your answers');
ok('settings says where the page was loaded from', view().includes('Where your answers go'));
// Everything in the tool is unclassified now, so the copy describes that and not a
// never-transmits tool.
ok('settings states the unclassified-only rule', view().includes('Unclassified only'));
ok('and explains that the browser keeps the work', view().includes('keeps your work as you type'));
ok('and that nothing will be recalled once submitted',
   view().includes('Nothing will be recalled once submitted'));
// Copy that describes a feature has to say whether the feature exists.
// This suite builds with no store, so the copy has to describe that build and not the hosted one.
ok('the copy marks the unbuilt parts as unbuilt',
   view().includes('Nothing is sent anywhere in this copy') && view().includes('Planned, not built'),
   view().slice(0, 200));

pane('Start again');
ok('the discard control lives here, not on the start page', !!q('.set-row.danger button.danger'));
ok('it says it cannot be undone', view().includes('Cannot be undone'));
ok('and it is disabled while there is nothing to lose',
   q('.set-row.danger button.danger').disabled === true);

pane('Question set');
byText('.tab', 'Start').click();
ok('the start page no longer carries the destructive control',
   !byText('button', 'Discard this and start again'));
// Built with no endpoint, the page cannot make a request at all. Built with one, that single
// origin is named and nothing else is reachable. One value in the build sets both.
ok('no network call is even possible (CSP)', html.includes("connect-src 'none'"));
ok('and the endpoint is a build input rather than a code change',
   /connect-src __CONNECT__/.test(await readFile('template.html', 'utf8')));
// Without an explicit color-scheme, native buttons and inputs follow the OS setting while
// the page follows the media query, and a light page renders dark controls.
ok('color-scheme is declared for both themes',
   /:root\s*\{[^}]*color-scheme:\s*light/.test(html) && /prefers-color-scheme:\s*dark[^}]*\{[^}]*color-scheme:\s*dark/s.test(html));
// The frame and the page were within 1.13:1 of each other in light and 1.08:1 in dark, so
// they read as one surface. The frame has its own edge token, the page footer has a ground of
// its own, and the dark frame is lighter than the page instead of darker.
ok('the sticky footer is pinned to the edge and carries the frame edge',
   /\.sticky-footer\s*\{[^}]*bottom:\s*0/s.test(html) &&
   /\.sticky-footer\s*\{[^}]*border-top:\s*1px solid var\(--chrome-line\)/s.test(html) &&
   !/\.sticky-footer\s*\{[^}]*backdrop-filter/s.test(html));
ok('the frame has an edge token of its own in both schemes',
   /:root\s*\{[^}]*--chrome-line:/s.test(html) &&
   /prefers-color-scheme:\s*dark[^}]*\{[\s\S]{0,900}--chrome-line:/.test(html));
ok('the header and the tab strip use it too',
   /\.topbar\s*\{[^}]*border-bottom:\s*1px solid var\(--chrome-line\)/s.test(html) &&
   /\.chrome \.stepper\s*\{[^}]*border-bottom:\s*1px solid var\(--chrome-line\)/s.test(html));
ok('the dark frame is lighter than the dark page, not darker',
   /prefers-color-scheme:\s*dark[\s\S]{0,900}--chrome-bg:\s*#1e222a/.test(html));
ok('the page footer has a ground of its own',
   /\.sitefoot\s*\{[^}]*background:\s*var\(--surface-2\)/s.test(html) &&
   /\.sitefoot\s*\{[^}]*border-top:\s*1px solid var\(--line\)/s.test(html));
ok('the lift arrives only once the page has scrolled',
   /\.chrome\s*\{[^}]*box-shadow:\s*none/s.test(html) &&
   /\.scrolled \.chrome\s*\{[^}]*box-shadow:/s.test(html));
// The sentinel it watches has to outlive a render, and every render empties #app.
ok('the scroll sentinel lives outside the part that gets rebuilt',
   !!document.querySelector('body > .top-sentinel'));
// A short screen used to leave the footer floating in the middle of it. The shell fills the
// viewport and the footer rests on the bottom edge.
ok('the shell fills the viewport so the footer rests at the bottom',
   /#app\s*\{[^}]*min-height:\s*100dvh/s.test(html) &&
   /\.body\s*\{[^}]*flex:\s*1 0 auto/s.test(html) &&
   /\.sitefoot\s*\{[^}]*flex:\s*none/s.test(html));
// ...without an id selector, which would outrank the results view's own scroll container.
ok('and does it without an id selector that would beat .body-results',
   !/#app\s*>\s*\.body/.test(html));
ok('sign in is one screen, scrolling inside the body if the window is short',
   /\.app-signin\s*\{[^}]*height:\s*100dvh/s.test(html) &&
   /\.app-signin \.body\s*\{[^}]*overflow-y:\s*auto/s.test(html) &&
   /max-height:\s*620px[\s\S]{0,400}\.app-signin\s*\{[^}]*height:\s*auto/.test(html));

// ---- overview --------------------------------------------------------------------------
byText('.hero-actions button', 'Fill it in').click();
// ---- the overview is a wizard while anything is missing ---------------------------------
//
// Three groups, not six questions: the plain facts about the initiative, then the marking,
// then the lifecycle. The two decisions get a screen each because each has consequences.
ok('the overview opens on the facts about the initiative', view().includes('About the initiative'));
ok('and the first three fields are together, as they were', qa('.ov-block .grid-2 input').length === 3,
   String(qa('.ov-block .grid-2 input').length));
ok('no scored questions on the overview', qa('.question').length === 0);
ok('it says where you are in the three', view().includes('Step 1 of 3'));
ok('three dots, none filled yet', qa('.ov-dot').length === 3 && qa('.ov-dot.filled').length === 0,
   String(qa('.ov-dot.filled').length));
ok('no show-all escape while it is a wizard', !byText('button', 'Show all'));
ok('the tabs still show overview plus four domains', qa('.stepper .step').length === 5,
   String(qa('.stepper .step').length));
ok('the overview tab counts the three groups', qa('.stepper .step')[0].textContent.includes('0 of 3'),
   qa('.stepper .step')[0].textContent);
ok('a blank assessment has nothing to mark, so saving is allowed',
   byText('.footer-actions button', 'Save to a file').disabled === false);

// Nothing has been written yet, so the indicator says nothing. It used to open at "draft
// saved in browser" on an empty page, which is a claim ahead of the fact.
ok('the save indicator is silent until something is written',
   !!q('.save-state.hidden') && q('.save-state').textContent.trim() === '',
   q('.save-state')?.className);

// The bar has to move on the first field. Counting groups meant it could not move until four
// fields were filled, which reads as the tool ignoring you.
{
  const barWidth = () => qa('.stepper .step')[0].querySelector('.step-bar i').style.width;
  ok('the overview bar starts empty', barWidth() === '0%', barWidth());
  const first = q('.ov-block .grid-2 input');
  first.value = 'X';
  fire(first, 'input');
  ok('and moves on the very first field', barWidth() !== '0%', barWidth());
  ok('while the count still reads in groups',
     qa('.stepper .step')[0].textContent.includes('0 of 3'),
     qa('.stepper .step')[0].textContent);

  // The footer's own left bar was pinned at zero for the whole overview: it looks for the
  // current section, and the overview is not one. It measures the six overview fields.
  const footBar = () => qa('.sticky-footer .pbar')[0];
  ok('the footer bar names the overview and counts it',
     footBar().querySelector('.pbar-label').textContent.includes('Overview 1 of 6'),
     footBar().querySelector('.pbar-label').textContent);
  ok('and it has actually grown', footBar().querySelector('.progress-shell i').style.width === '17%',
     footBar().querySelector('.progress-shell i').style.width);
}

/**
 * One code, on step one, beside the name, because the name is what people assume identifies an
 * assessment and it is the thing they change.
 *
 * There used to be two codes: a four-character reference minted here, and a twelve-character
 * access code minted at the first online save. Same alphabet, different lengths, both called a
 * code, sitting centimetres apart. "Give me the code" had two answers.
 */
ok('the assessment has a code from the moment it exists',
   /[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/.test(view().replace(/\s+/g, ' ')), view().slice(0, 120));
ok('shown as something you can copy, not as text', !!q('.ov-block .code-chip button'));
ok('and says renaming does not change it', view().includes('if you rename the initiative'));
ok('and says what the four characters in an email subject are for',
   view().includes('first four characters'), view().slice(0, 200));

// Step one: the four plain facts.
{
  const [name, dept, contact] = qa('.ov-block .grid-2 input');
  name.value = 'Nexus agentic AI infrastructure'; fire(name, 'input'); fire(name, 'change');
  dept.value = 'Transport Canada'; fire(dept, 'input'); fire(dept, 'change');
  contact.value = 'nick@tc.gc.ca'; fire(contact, 'input'); fire(contact, 'change');
}

{
  const footBar = qa('.sticky-footer .pbar')[0];
  ok('the footer bar keeps up as more overview fields are filled',
     footBar.querySelector('.pbar-label').textContent.includes('Overview 3 of 6'),
     footBar.querySelector('.pbar-label').textContent);
}
ok('typing content blocks saving until the file is marked',
   byText('.footer-actions button', 'Save to a file').disabled === true);
ok('the gate says what to do, briefly', view().includes('Mark this file to save it'));
ok('the gate band is not capped at the content width',
   !/\.sticky-footer\s*>\s*\*\s*\{/.test(html) && /\.sticky-footer\s*>\s*\.gate-band/.test(html));
{
  const b = q('.chrome .marking-banner');
  ok('an unmarked file says so in the banner', b.classList.contains('unmarked'));
  ok('and the banner is itself the way to fix it', b.tagName === 'BUTTON', b.tagName);
}
{
  const ta = q('.ov-block textarea');
  ta.value = 'Shared agentic AI infrastructure for departmental business processes.';
  fire(ta, 'input'); fire(ta, 'change');
}
ok('finishing the group fills its dot', qa('.ov-dot.filled').length === 1,
   String(qa('.ov-dot.filled').length));

// Enter moves on, the way it does in any form.
{
  const name = qa('.ov-block .grid-2 input')[0];
  name.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ok('Enter in a text field advances the wizard', view().includes('Step 2 of 3'), view().slice(0, 40));
}

// Step two, the marking. The assessment is always an unclassified document, so the question
// is about the artefacts the answers point at.
const MARKINGS = 'Unclassified|Protected A|Protected B|Protected C|Confidential|Secret|Top Secret';
ok('step two asks how the evidence is marked', view().includes('How is your evidence marked'));
ok('and says the assessment itself stays unclassified',
   view().includes('unclassified document'));
ok('every GC marking is offered', qa('.marking-chip').map((c) => c.textContent.trim()).join('|') === MARKINGS,
   qa('.marking-chip').map((c) => c.textContent.trim()).join('|'));
ok('and the same list is offered inside the gate that demands one',
   qa('.gate-marks .mark-btn').map((b) => b.textContent).join('|') === MARKINGS,
   qa('.gate-marks .mark-btn').map((b) => b.textContent).join('|'));

// Choosing a marking above unclassified takes over the screen. This is the bug she found:
// the strip set the marking and showed nothing, so the advice below the fold was scrolled
// past and never read.
byText('.gate-marks .mark-btn', 'Protected B').click();
{
  const dlg = q('dialog.pledge');
  ok('choosing a classified marking pops a modal', !!dlg);
  ok('and it names the marking that triggered it',
     dlg.querySelector('.pledge-head h2').textContent.includes('Protected B'),
     dlg.querySelector('.pledge-head h2')?.textContent);
  // The first version of this line read "EARB evidence - m - [question]", which meant
  // nothing to anybody. It names what it is, which initiative, and which question.
  // The subject carries the question and a code that never changes. It used to carry the
  // initiative name, which meant renaming the initiative invalidated every sent email.
  ok('the subject line names the question and a permanent code',
     /^EARB evidence [A-Z2-9]{4}, question B-Q14$/.test(dlg.querySelector('.pledge-subject').textContent),
     dlg.querySelector('.pledge-subject')?.textContent);
  ok('and says the real one is written for them per question',
     dlg.textContent.includes('That is an example'));

  const x = dlg.querySelector('.pledge-x');
  ok('the close control is dead until the box is ticked', x.disabled === true);
  ok('and says so', x.getAttribute('title') === 'Tick the box first', x.getAttribute('title'));
  ok('the way out is stated as changing the answer, not dismissing the warning',
     !!byText('dialog.pledge button', 'unclassified after all'));

  const box = dlg.querySelector('.pledge-ack input[type=checkbox]');
  box.checked = true;
  fire(box, 'change');
  ok('ticking it makes the close control live', x.disabled === false && x.classList.contains('live'));
  ok('and the hint changes with it', dlg.querySelector('.pledge-hint').textContent.includes('can close'));

  x.click();
  ok('closing it removes the modal and its scrim',
     !q('dialog.pledge') && !q('.pledge-scrim'));
  ok('the acknowledgement is recorded against that marking',
     JSON.parse(window.localStorage.getItem('gc-arch-assessment:draft'))
       .initiative.markingAcknowledged === 'Protected B');
}
ok('marking from the gate clears the gate', !q('.gate'));

// A different marking is a different situation, so it asks again. Protected B and Secret do
// not carry the same instructions.
{
  const chip = qa('.marking-chip input').find((i) => i.value === 'Protected C');
  chip.checked = true;
  fire(chip, 'change');
  ok('a different classified marking asks again', !!q('dialog.pledge'));
  ok('and names the new marking',
     q('dialog.pledge .pledge-head h2').textContent.includes('Protected C'),
     q('dialog.pledge .pledge-head h2')?.textContent);
  const box = q('dialog.pledge .pledge-ack input[type=checkbox]');
  box.checked = true;
  fire(box, 'change');
  q('dialog.pledge .pledge-x').click();

  // Re-picking the same one does not.
  const again = qa('.marking-chip input').find((i) => i.value === 'Protected C');
  again.checked = true;
  fire(again, 'change');
  ok('the same marking twice does not ask twice', !q('dialog.pledge'));
}

// The escape hatch, on its own terms: it changes the answer back to unclassified.
{
  const unclass = qa('.marking-chip input').find((i) => i.value === 'Unclassified');
  unclass.checked = true;
  fire(unclass, 'change');
  ok('choosing unclassified pops nothing', !q('dialog.pledge'));
  const pa = qa('.marking-chip input').find((i) => i.value === 'Protected A');
  pa.checked = true;
  fire(pa, 'change');
  ok('and the pledge returns once the acknowledgement is cleared', !!q('dialog.pledge'));
  byText('dialog.pledge button', 'unclassified after all').click();
  const draft = JSON.parse(window.localStorage.getItem('gc-arch-assessment:draft'));
  ok('the way out sets the marking back to unclassified',
     draft.initiative.classification === 'Unclassified' && !draft.initiative.markingAcknowledged,
     `${draft.initiative.classification} / ${draft.initiative.markingAcknowledged}`);
  ok('and clears the modal', !q('dialog.pledge'));
}

// Back to Protected B, which the rest of this suite is written against.
{
  const pb = qa('.marking-chip input').find((i) => i.value === 'Protected B');
  pb.checked = true;
  fire(pb, 'change');
  const box = q('dialog.pledge .pledge-ack input[type=checkbox]');
  box.checked = true;
  fire(box, 'change');
  q('dialog.pledge .pledge-x').click();
  ok('the marking is Protected B again, acknowledged', !q('dialog.pledge'));
}

// Step three, the lifecycle, with the guide beside it.
byText('.ov-nav button', 'Next').click();
ok('step three asks where it is in the lifecycle', view().includes('Where is it in the lifecycle'));
ok('seven stages offered', qa('.stage-card').length === 7, String(qa('.stage-card').length));
ok('grouped into Create, Live and Sunset',
   qa('.phase-head h4').map((h) => h.textContent).join('|') === 'Create|Live|Sunset',
   qa('.phase-head h4').map((h) => h.textContent).join('|'));
{
  const links = qa('.stage-card a').map((n) => n.getAttribute('href'));
  ok('every stage links to its own page in the guide', new Set(links).size === 7, String(new Set(links).size));
  ok('and the links point at the published guide',
     links.every((h) => h.startsWith('https://myermcat.github.io/digital-lifecycle-guide/')), links[0]);
  ok('the phases link to their own pages too', qa('.phase-head a').length === 3,
     String(qa('.phase-head a').length));
}

const maturity = qa('.stage-card input[type=radio]').find((r) => r.value === 'maturity');
maturity.checked = true;
fire(maturity, 'change');
ok('all three answered turns the overview into three separate blocks',
   qa('.ov-block').length === 3, String(qa('.ov-block').length));
ok('each in its own card', qa('.body-submit .card .ov-block').length === 3);
ok('and the tab says so', qa('.stepper .step')[0].textContent.includes('3 of 3'),
   qa('.stepper .step')[0].textContent);

// ---- one weighted section per page, twenty-one stops in all -----------------------------
//
// A section holds between three and fourteen questions, which is a page that can be finished.
// The rail carries both levels of the rubric and never scrolls away.
const SECTIONS = rubric.domains.flatMap((d) => d.sections.map((sec) => ({ d, sec })));
ok('twenty weighted sections, plus the overview, is twenty-one stops', SECTIONS.length === 20,
   String(SECTIONS.length));

let seen = 0;
for (const { d, sec } of SECTIONS) {
  const tab = qa('.stepper .step').find((t) => t.textContent.includes(shortName(d.label)));
  ok(`the domain tab for ${d.label} is present`, !!tab);
  if (!tab.className.includes('on')) tab.click();

  const row = qa('.toc-sec').find((n) => n.textContent.includes(sec.label));
  ok(`the rail lists ${sec.label}`, !!row, sec.label);
  row.click();

  ok(`${sec.label}: only its own ${sec.questions.length} questions are on the page`,
     qa('.question').length === sec.questions.length, String(qa('.question').length));
  ok(`${sec.label}: the page says what it is worth`,
     view().includes(`${sec.shareOfDomain ?? sec.weight}% of ${d.label}`));
  ok(`${sec.label}: the rail marks it as the page you are on`,
     !!q('.toc-sec.on') && q('.toc-sec.on').textContent.includes(sec.label));

  for (const qb of qa('.question')) {
    // Most questions are a 0-10 ladder; a handful are yes/no and carry two buttons instead.
    const scale = [...qb.querySelectorAll('.score-btn')].find((b) => b.textContent === '7');
    const yes = [...qb.querySelectorAll('.yn-btn')].find((b) => b.textContent.startsWith('Yes'));
    (scale ?? yes).click();
  }
  seen += sec.questions.length;
}
ok(`all ${TOTAL} questions were reachable and answerable`, seen === TOTAL, String(seen));
ok('the rail shows every section of the current domain as done',
   qa('.toc-sec.done').length === rubric.domains[rubric.domains.length - 1].sections.length,
   String(qa('.toc-sec.done').length));

// Two bars, because one answer in 176 moves a single bar by half a percent.
{
  const bars = qa('.progress-row .pbar');
  ok('two progress bars, one for the page and one for the whole', bars.length === 2, String(bars.length));
  ok('the section bar counts this page', bars[0].textContent.startsWith('This section'), bars[0].textContent);
  ok('the whole-assessment bar counts everything',
     bars[1].textContent === `Whole assessment ${TOTAL} of ${TOTAL}`, bars[1].textContent);
  ok('both bars are full once everything is answered',
     bars.every((b) => b.querySelector('.progress-shell i').style.width === '100%'),
     bars.map((b) => b.querySelector('.progress-shell i').style.width).join(' '));
  ok('a finished section is marked done on its bar', !!q('.progress-shell i.done'));
}
// Every scale question got a 7 and every yes/no question got a Yes, which scores the top of
// the scale, so the overall sits a little above 7.
ok('footer reflects the sweep: a shade over 7', (() => {
  const v = Number(q('.footer-score .pill').textContent.trim());
  return v >= 7 && v < 7.5;
})(), q('.footer-score .pill').textContent);
ok("footer shows Dan's maturity label for that score", q('.footer-score .muted').textContent.includes('Advanced'),
   q('.footer-score .muted').textContent);
ok('footer counts every answer', q('.footer-score .muted').textContent.includes(`${TOTAL} of ${TOTAL}`),
   q('.footer-score .muted').textContent);
ok('all four domain tabs read complete', qa('.stepper .step.complete:not(:first-child)').length === 4,
   String(qa('.stepper .step.complete').length));
// Three save states, never silent.
// Where the work is kept, in the chrome, so it is on every screen rather than only the 21
// questionnaire pages. It also has to be silent before anything has been written.
// "Draft saved in browser" and "Saved to TBS" were both invented vocabulary. The words are
// hers: saved on this computer, saved online.
ok('the app says where the work stands', view().includes('Saved on this computer'));
ok('and the indicator is a live region', q('.save-state')?.getAttribute('role') === 'status');
ok('it lives in the chrome, not in the questionnaire footer',
   !!q('.topbar .save-state') && !q('.sticky-footer .save-state'));
ok('it carries a short wording for a narrow screen', !!q('.save-state .ss-short'));
// The language control is in the chrome from the start, because retrofitting one is how a page
// ends up with a French version missing a third of its screens. It is one link naming the other
// language in that language, which is the Canada.ca pattern, and its href is real so the French
// page can be sent to somebody.
ok('the other language is offered in the chrome, named in itself',
   q('.lang-link')?.getAttribute('lang') === 'fr' && /Français/.test(q('.lang-link')?.textContent ?? ''),
   q('.lang-link')?.outerHTML);
ok('and it is a link somebody can send',
   (q('.lang-link')?.getAttribute('href') ?? '').includes('lang=fr'));
ok('and it carries a two-letter form for a narrow header', !!q('.lang-link .lang-abbr'));
ok('and it comes immediately before the settings button',
   q('.lang-link')?.nextElementSibling?.classList.contains('icon-btn') === true);
ok('and the page says which one it is in',
   document.documentElement.getAttribute('lang') === 'en',
   document.documentElement.getAttribute('lang'));
{
  // Switching shows French where it exists and English where it does not, and says so.
  q('.lang-link').click();
  ok('switching to French takes effect', document.documentElement.getAttribute('lang') === 'fr');
  ok('and a translated string is translated',
     view().includes('Enregistré sur cet ordinateur') || !!q('.save-state.hidden'),
     q('.save-state')?.textContent);
  ok('and the link now offers English back', /English/.test(q('.lang-link')?.textContent ?? ''));
  q('.lang-link').click();
  ok('and back again', document.documentElement.getAttribute('lang') === 'en');
}
ok('and one click opens the detail', q('.save-state').tagName === 'BUTTON');

// With work in the file, the start page points at Settings and destroys nothing itself.
{
  byText('.tab', 'Start').click();
  ok('the start page points at settings for starting over', view().includes('Starting over is in'));
  ok('and offers no way to destroy anything from there',
     !qa('.draft-note button').some((b) => /discard|erase|delete/i.test(b.textContent)));
  byText('.linkish', 'Settings').click();
  ok('that pointer opens the pane it names', q('.set-navrow.on').textContent === 'Start again',
     q('.set-navrow.on')?.textContent);
  ok('and now the discard is live, since there is something to lose',
     q('.set-row.danger button.danger').disabled === false);
  byText('.tab', 'Fill it in').click();
}

// ---- scoring a question must not rebuild the page, and every readout must agree ----------
//
// The page used to be rebuilt on every score click. That closed sections the reader had
// opened, threw away focus, and made any completion animation impossible. These checks are
// the guard: node identity survives a click, and no readout is allowed to go stale.
{
  const currentDomain = rubric.domains[rubric.domains.length - 1];   // Technology, the page we are on
  const domainTotal = currentDomain.sections.reduce((n, x) => n + x.questions.length, 0);

  const tabOf = (d) => qa('.stepper .step').find((t) => t.textContent.includes(shortName(d.label)));
  const footerText = () => q('.footer-score .muted').textContent;
  /** Only the count. The maturity label beside it is expected to move when a score changes. */
  const footerCount = () => (footerText().match(/\d+ of \d+ answered/) ?? [''])[0];
  const railCounts = () => qa('.toc-sec .toc-count').map((n) => n.textContent);

  // Stamp identity onto live nodes. If the page is rebuilt these become detached.
  const probeQuestion = qa('.question')[0];
  const probeLadder = probeQuestion.querySelector('.ladder-box');
  const probeTextarea = probeQuestion.querySelector('textarea');
  probeLadder.open = true;                        // the reader opens the scale on a question
  probeTextarea.value = 'typed by the reader';
  fire(probeTextarea, 'input');
  probeTextarea.focus();

  // Change an already-answered question to a different score, counting what it touches.
  const target = qa('.question')[1];
  const before = footerCount();
  const scoreBefore = q('.footer-score .pill').textContent.trim();
  const app = document.getElementById('app');
  const pageSize = app.querySelectorAll('*').length;

  // Read the records synchronously. The observer callback is a microtask, so anything that
  // counts inside it is still zero at the next line.
  const obs = new window.MutationObserver(() => {});
  obs.observe(app, { childList: true, subtree: true, attributes: true });

  [...target.querySelectorAll('.score-btn')].find((b) => b.textContent === '3').click();

  const churn = obs.takeRecords().reduce(
    (n, rec) => n + rec.addedNodes.length + rec.removedNodes.length + (rec.type === 'attributes' ? 1 : 0),
    0,
  );
  obs.disconnect();

  // A budget, not a target. A full rebuild of this page is about 8,000 mutations; the readout
  // registry brings one click to roughly 100. Anything over 400 means something started
  // rebuilding a whole subtree again.
  ok(`one score click touches ~${churn} of ${pageSize} elements, under budget`,
     churn > 0 && churn < 400, `${churn} mutations on a ${pageSize}-element page`);

  ok('the page is not rebuilt: the same question node is still in the document',
     document.contains(probeQuestion));
  ok('a disclosure the reader opened stays open', probeLadder.open === true);
  ok('typed text is not thrown away', probeTextarea.value === 'typed by the reader');
  ok('focus survives a score click on another question', document.activeElement === probeTextarea);
  ok('changing an answered question to a different score does not move the count',
     footerCount() === before, `${before} -> ${footerCount()}`);
  ok('but the score itself does move', !footerText().includes(scoreBefore),
     `${scoreBefore} -> ${footerText()}`);

  // Readouts must agree with each other after the change.
  ok('the footer still counts every answer', footerCount().includes(`${TOTAL} of ${TOTAL}`), footerCount());
  ok('the domain tab still counts every answer in its domain',
     tabOf(currentDomain).textContent.includes(`${domainTotal} of ${domainTotal}`),
     tabOf(currentDomain).textContent);
  ok('every section in the rail reads fully answered',
     railCounts().every((t) => { const [a2, b2] = t.split('/'); return a2 === b2; }),
     railCounts().join(' '));
  ok('the section heading agrees with the rail',
     view().includes('answered on this page'));

  // Not applicable is the case that moves the denominator, so it is the one most likely to rot.
  const naQ = qa('.question')[2];
  const naBox = naQ.querySelector('.na input');
  naBox.checked = true;
  fire(naBox, 'change');

  // Marking a question not applicable is a decision, so it counts as dealt with. Shrinking the
  // denominator instead made a question look like it had gone missing.
  ok('n/a keeps the footer denominator whole',
     footerCount().includes(`${TOTAL} of ${TOTAL}`), footerCount());
  ok('n/a keeps the domain tab denominator whole',
     tabOf(currentDomain).textContent.includes(`${domainTotal} of ${domainTotal}`),
     tabOf(currentDomain).textContent);
  ok('n/a keeps every rail count whole',
     railCounts().every((t) => { const [a2, b2] = t.split('/'); return a2 === b2; }),
     railCounts().join(' '));
  ok('the page still was not rebuilt', document.contains(probeQuestion) && probeLadder.open === true);

  // Not applicable is its own answer, so it takes the score with it and unticking leaves the
  // question unanswered. Then score it again, so the rest of the run sees a full assessment.
  naBox.checked = false;
  fire(naBox, 'change');
  ok('unticking not applicable leaves the question unanswered',
     [...naQ.querySelectorAll('.score-btn')].every((b) => b.getAttribute('aria-checked') === 'false'),
     [...naQ.querySelectorAll('.score-btn')].map((b) => b.getAttribute('aria-checked')).join(','));
  [...naQ.querySelectorAll('.score-btn')].find((b) => b.textContent === '7').click();
  ok('and it can be scored again', footerCount().includes(`${TOTAL} of ${TOTAL}`), footerCount());
  probeTextarea.value = '';
  fire(probeTextarea, 'input');
  ok('restored to fully answered', footerCount().includes(`${TOTAL} of ${TOTAL}`), footerCount());
}

// ---- the score is the answer; everything else folds away --------------------------------
{
  // Anchor on the first page of Business, so leaving and returning lands on the same question.
  byText('.stepper .step', 'Business').click();
  const box = qa('.question')[0].querySelector('.q-extras-box');
  ok('reasoning and evidence are folded by default', !!box && box.open === false);
  ok('the score itself is not folded', !!qa('.question')[0].querySelector('.score-row'));
  // The heading is stable and a status follows it, so a filled section does not look like an
  // empty one. It used to say "Add reasoning or evidence" either way.
  ok('the fold names itself and says it is empty',
     box.querySelector('summary').textContent.includes('Reasoning and evidence')
     && box.querySelector('.q-extras-count.empty').textContent === 'nothing yet',
     box.querySelector('summary').textContent);

  // Anything already written must never hide behind a closed fold.
  box.open = true;
  const ta = box.querySelector('textarea');
  ta.value = 'Owned by the platform team.';
  fire(ta, 'input');

  byText('.stepper .step', 'Data').click();
  byText('.stepper .step', 'Business').click();
  const reopened = qa('.question')[0].querySelector('.q-extras-box');
  ok('a question with reasoning in it comes back open', reopened.open === true);
  ok('and one without stays folded',
     qa('.question')[1].querySelector('.q-extras-box').open === false);

  const ta2 = reopened.querySelector('textarea');
  ta2.value = '';
  fire(ta2, 'input');
}

// ---- the browser Back button walks the stops --------------------------------------------
{
  const before = qa('.toc-sec.on')[0]?.textContent ?? '';
  byText('.stepper .step', 'Technology').click();
  const after = qa('.toc-sec.on')[0]?.textContent ?? '';
  ok('moving between domains changes the page', before !== after, `${before} -> ${after}`);
  ok('and it left a history entry', (window.location.hash || '').length > 1, window.location.hash);
}

// ---- the score row is one keyboard control, not eleven ----------------------------------
//
// Eleven buttons per question across 176 questions is 1,936 tab stops. As a radio group it is
// one stop per question, moved with the arrow keys, which is the difference between a keyboard
// interface and a wall.
{
  const qb = qa('.question')[0];
  const row = qb.querySelector('.score-row');
  const btns = [...row.querySelectorAll('.score-btn')];
  const key = (k) => row.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true }));

  ok('the score row is a radio group', row.getAttribute('role') === 'radiogroup');
  ok('and it is named by its own question',
     !!document.getElementById(row.getAttribute('aria-labelledby')),
     row.getAttribute('aria-labelledby'));
  ok('each score is a radio', btns.every((b) => b.getAttribute('role') === 'radio'));
  ok('the rung name is in the accessible name, not just the digit',
     btns[7].getAttribute('aria-label') === '7, Scalable & Secure', btns[7].getAttribute('aria-label'));
  ok('exactly one tab stop among the eleven',
     btns.filter((b) => b.getAttribute('tabindex') === '0').length === 1,
     String(btns.filter((b) => b.getAttribute('tabindex') === '0').length));

  btns[5].click();
  const after = [...qa('.question')[0].querySelectorAll('.score-btn')];
  ok('choosing a score marks it checked', after[5].getAttribute('aria-checked') === 'true');
  ok('and the others are unchecked', after.filter((b) => b.getAttribute('aria-checked') === 'true').length === 1);
  ok('the tab stop follows the chosen score', after[5].getAttribute('tabindex') === '0');

  key('ArrowRight');
  ok('right arrow moves to the next score',
     qa('.question')[0].querySelectorAll('.score-btn')[6].getAttribute('aria-checked') === 'true');
  key('ArrowLeft'); key('ArrowLeft');
  ok('left arrow moves back',
     qa('.question')[0].querySelectorAll('.score-btn')[4].getAttribute('aria-checked') === 'true');
  key('Home');
  ok('Home selects zero',
     qa('.question')[0].querySelectorAll('.score-btn')[0].getAttribute('aria-checked') === 'true');
  key('End');
  ok('End selects ten',
     qa('.question')[0].querySelectorAll('.score-btn')[10].getAttribute('aria-checked') === 'true');
  key('ArrowRight');
  ok('and it does not run past ten',
     qa('.question')[0].querySelectorAll('.score-btn')[10].getAttribute('aria-checked') === 'true');

  // Not applicable is a different question, so it stays outside the group and keeps its stop.
  const naInput = qa('.question')[0].querySelector('.na input');
  naInput.checked = true;
  fire(naInput, 'change');
  const disabled = [...qa('.question')[0].querySelectorAll('.score-btn')];
  ok('not applicable disables the scores for a screen reader too',
     disabled.every((b) => b.getAttribute('aria-disabled') === 'true'));
  ok('and takes their tab stop away',
     disabled.every((b) => b.getAttribute('tabindex') === '-1'));
  ok('the checkbox itself stays reachable', !naInput.disabled);
  // The scale explains a score, and there is no score here, so it goes away.
  ok('the question is marked not applicable, which hides the scale',
     qa('.question')[0].classList.contains('na')
     && /\.question\.na \.ladder-box \{[^}]*display:\s*none/.test(html));
  {
    // Reasoning and evidence are kept and folded away, with a line saying so. Left open and
    // dimmed, the whole question read as one grey slab.
    const first = qa('.question')[0];
    const box = first.querySelector('.q-extras-box');
    box.open = true;
    const ta = box.querySelector('textarea');
    ta.value = 'Reasoning that must survive the box being ticked.';
    fire(ta, 'input');
    const na = first.querySelector('.na input');
    na.checked = true;
    fire(na, 'change');
    const after = qa('.question')[0];
    ok('not applicable folds the reasoning away rather than deleting it',
       after.querySelector('.q-extras-box').open === false
       && after.querySelector('textarea').value.includes('must survive'));
    ok('and says it is kept and not counted',
       after.querySelector('.q-extras-count').textContent.includes('kept and not counted'),
       after.querySelector('.q-extras-count')?.textContent);
    na.checked = false;
    fire(na, 'change');
    const back = qa('.question')[0];
    back.querySelector('.na input').checked = false;
    ta.value = '';
    fire(ta, 'input');
  }

  naInput.checked = false;
  fire(naInput, 'change');
  [...qa('.question')[0].querySelectorAll('.score-btn')].find((b) => b.textContent === '7').click();
  ok('restored to 7', qa('.question')[0].querySelectorAll('.score-btn')[7].getAttribute('aria-checked') === 'true');
  // Pressing the score that is already chosen leaves it chosen. It used to clear the answer.
  qa('.question')[0].querySelectorAll('.score-btn')[7].click();
  ok('pressing the chosen score again keeps it',
     qa('.question')[0].querySelectorAll('.score-btn')[7].getAttribute('aria-checked') === 'true');
}

// ---- no readout is announced twice -------------------------------------------------------
{
  const pills = qa('.pill[aria-hidden="true"]');
  ok('score pills are hidden from screen readers, since an sr-only twin carries the number',
     pills.length > 0, String(pills.length));
  ok('and the twin says what the number means',
     qa('.sr-only').some((n) => /out of 10|not scored yet/.test(n.textContent)));
  ok('every nav has an accessible name',
     qa('nav').every((n) => !!n.getAttribute('aria-label')),
     qa('nav').map((n) => n.getAttribute('aria-label')).join('|'));
  // aria-hidden="" hides nothing. The el() helper renders boolean true as an empty attribute,
  // which is right for `hidden` and wrong for ARIA, and the difference is invisible.
  ok('no ARIA attribute was rendered as an empty string',
     qa('[aria-hidden], [aria-checked], [aria-disabled], [aria-current], [aria-expanded]')
       .every((n) => [...n.attributes].every((at) => !at.name.startsWith('aria-') || at.value !== '')),
     'an aria-* attribute is present with an empty value');
}

// ---- the ladder is Dan's, and it is visible --------------------------------------------
{
  const first = qa('.question')[0];
  ok('the chosen rung is named back to the user', first.querySelector('.chosen').textContent.includes('Scalable'),
     first.querySelector('.chosen').textContent.slice(0, 60));
  ok("the full ladder uses Dan's maturity names", first.textContent.includes('Symbiotic'));
  // Each rung is one grid row: the number, then everything else. A third child became a
  // third grid item and dropped onto its own line under the number.
  {
    const rows = [...first.querySelectorAll('.ladder li')];
    ok('eleven rungs are listed', rows.length === 11, String(rows.length));
    ok('and each rung is exactly two grid children, so nothing wraps under the number',
       rows.every((r) => r.children.length === 2),
       rows.map((r) => r.children.length).join(','));
    ok('the rung name is emphasised inside the second child',
       rows[7].children[1].querySelector('i')?.textContent.includes('Scalable'),
       rows[7].children[1].textContent.slice(0, 40));
  }
}

// ---- a high score with nothing behind it, an n/a, and one evidence reference ------------
const infra = gotoQuestion('clear inventory of all infrastructure');
ok('the infrastructure inventory question is reachable through the rail', !!infra);
[...infra.querySelectorAll('.score-btn')].find((b) => b.textContent === '9').click();

const tra = gotoQuestion('Threat and Risk Assessment');
const naBox = tra.querySelector('.na input');
naBox.checked = true;
fire(naBox, 'change');
ok("n/a disables that question's buttons", [...tra.querySelectorAll('.score-btn')].every((b) => b.disabled));
ok('n/a counts as dealt with, so the denominator stays whole',
   q('.footer-score .muted').textContent.includes(`of ${TOTAL}`),
   q('.footer-score .muted').textContent);

const hosting = gotoQuestion('hosting environment');
byText('.evidence button', 'Add a piece of evidence').click();
ok('an evidence row appears', hosting.querySelectorAll('.ev-item').length === 1);
// Add evidence used to block saving the instant it was clicked, because the row it creates
// carries no marking. An empty row is nothing to mark.
ok('a brand-new empty row blocks nothing',
   byText('.footer-actions button', 'Save to a file').disabled === false,
   byText('.footer-actions button', 'Save to a file').getAttribute('title'));
// Evidence is a link now, and an artefact that cannot be linked goes by email with a pattern.
ok('the evidence block asks for a link', view().includes('Link to the evidence'));
ok('and offers the email route', !!byText('.ev-alt button', 'cannot be linked'));
{
  byText('.ev-alt button', 'cannot be linked').click();
  const loc = qa('.question').find((n) => n.textContent.includes('hosting environment'))
    .querySelector('.ev-row2 input[type=text]');
  ok('which fills in a findable subject line',
     /^Emailed to the assessor\. Subject: EARB evidence [A-Z2-9]{4}, question T-Q1$/.test(loc.value),
     loc.value);
  {
    // And the line is there to copy, so nobody retypes it and loses the question number.
    const row = qa('.question').find((n) => n.textContent.includes('hosting environment'))
      .querySelector('.ev-subject');
    ok('the subject line is offered with a copy button',
       !!row && row.textContent.includes('question T-Q1') && !!byText('.ev-subject button', 'Copy'));
    byText('.ev-subject button', 'Copy').click();
    ok('and the button confirms it copied', byText('.ev-subject button', 'Copied')
       || row.textContent.includes('Copied'));
  }
  // A row recorded as emailed does not also offer attaching: the attach control sitting
  // there invited a second, unmarked copy of the same artefact.
  ok('an emailed row does not offer attaching', !q('.ev-alt input[type=file]'));

  // And a way back, because the row is committed to the email route until it is pressed.
  byText('.ev-subject button', 'did not go by email').click();
  {
    const row = qa('.question').find((n) => n.textContent.includes('hosting environment'));
    ok('the email note can be taken back', !row.querySelector('.ev-subject'));
  }
}
const just = hosting.querySelector('textarea');
just.value = 'Diagram is current as of March and owned by the platform team.';
fire(just, 'input');

// An empty row holds nothing and blocks nothing. It blocks once it carries something and has
// no marking, which is the state that actually needs a decision.


const evTitle = hosting.querySelector('.ev-row input[type=text]');
evTitle.value = 'Current-state architecture diagram, March 2026';
fire(evTitle, 'input');

ok('a row with something in it and no marking blocks saving',
   byText('.footer-actions button', 'Save to a file').disabled === true && view().includes('mark'));

// Evidence above the answer given on the overview is refused, on the row that is here.
{
  const here = () => qa('.question').find((n) => n.textContent.includes('hosting environment'));
  const sel = [...here().querySelectorAll('.ev-row select')][1];
  sel.value = 'Secret';
  fire(sel, 'change');
  ok('marking evidence above the overview answer asks which is wrong',
     dialogText().includes('One of the two answers has to change'), dialogText().slice(0, 80));
  ok('and offers raising the overview answer as the first choice',
     dialogText().includes('My evidence does go up to Secret'));
  dialogAct('Leave both');
  ok('evidence above the file marking blocks saving',
     byText('.footer-actions button', 'Save to a file').disabled === true,
     byText('.footer-actions button', 'Save to a file').getAttribute('title'));
  ok('and says which way to resolve it', view().includes('Raise that answer to Secret'));
  const sel2 = [...here().querySelectorAll('.ev-row select')][1];
  sel2.value = 'Protected B';
  fire(sel2, 'change');
  ok('and unblocks when brought back down',
     byText('.footer-actions button', 'Save to a file').disabled === false,
     byText('.footer-actions button', 'Save to a file').getAttribute('title'));
}

ok('draft is autosaved to this browser', !!window.localStorage.getItem('gc-arch-assessment:draft'));

// ---- results ---------------------------------------------------------------------------
byText('button', 'See my results').click();
ok('results headline rendered', !!q('.bigscore .num'));
ok("Dan's maturity label is shown", !!q('.maturity strong') && q('.maturity').textContent.includes('Advanced'));
ok('routing band is shown separately from maturity', !!q('.band strong'));
ok('a fully answered assessment gets a routing suggestion',
   !view().includes('No routing suggestion yet'));

ok('routing is stated as a suggestion', view().includes('does not decide it'));
{
  // Four domains, then the same answers cut by subject. Both are bar rows, so scope the count.
  // They are parts of one region now, because they are the same 176 answers at two grains.
  const parts = qa('.res-sub');
  const domainPart = parts.find((c) => c.querySelector('h3')?.textContent === 'By architecture domain');
  const topicPart = parts.find((c) => c.querySelector('h3')?.textContent === 'Across the domains');
  ok('the domain bars are a part of a region', !!domainPart);
  ok('four domain bars rendered', domainPart?.querySelectorAll('.bar-row').length === 4,
     String(domainPart?.querySelectorAll('.bar-row').length));
  ok('and the cross-cutting topics are shown separately, with a provisional label',
     !!topicPart && topicPart.querySelectorAll('.bar-row').length > 0 &&
     topicPart.textContent.includes('provisional'),
     String(topicPart?.querySelectorAll('.bar-row').length));
  ok('the topic block says the numbers do not add up to the overall',
     topicPart.textContent.includes('do not add up to the overall'));
}

/**
 * One number, one box, four regions.
 *
 * The page used to be ten section.card siblings of one size, one fill, one border and one
 * width, with the gap between them equal to the padding inside them. Proximity is the
 * strongest grouping signal there is, and at those numbers it said nothing, so ten cards read
 * as one striped surface. Reported as "there is just a bunch of cards and all of them merge".
 *
 * The rule the page now holds to: a box means either "this is the number" or "this blocks
 * you". These are the assertions that stop it becoming eleven cards again.
 */
{
  const tops = qa('.body-results > section');
  const boxes = qa('.body-results > section.card');
  const alert = q('.body-results > section.card.warn.alert');
  ok('the page is four or five top-level sections', tops.length >= 4 && tops.length <= 5,
     String(tops.length));
  ok('and only the score is a card', boxes.length === (alert ? 2 : 1), String(boxes.length));
  ok('every region names itself for a screen reader',
     qa('.res-region').length >= 3 && qa('.res-region').every((sec) => {
       const id = sec.getAttribute('aria-labelledby');
       return !!id && document.getElementById(id) === sec.querySelector(':scope > h2');
     }));
  ok('there is one h1 on the page', qa('#app h1').length === 1, String(qa('#app h1').length));
  ok('every h3 is inside a region', qa('.body-results h3').every((h) => !!h.closest('.res-region')));
  ok('and no part carries an h2', !q('.res-sub h2'));
  // Two parts keep their heading inside a head row, because that row also carries the mockup
  // mark. Either shape is named; what matters is that no part is unlabelled.
  ok('every part names itself',
     qa('.res-sub').every((sec) => !!sec.querySelector(':scope > h3, :scope > .head-row > h3')));
  // The number comes second in the DOM and first on screen, so a screen reader hears what the
  // number is about before it hears the number.
  ok('the verdict leads with the name of the initiative',
     q('.card.verdict .headline-text')?.firstElementChild?.tagName === 'H1');
  ok('the answers table is still a fold, because printing depends on it',
     !!q('.res-sub details table.detail'));
  ok('and it has a column header on every column',
     qa('.res-sub table.detail thead th[scope=col]').length === 5,
     String(qa('.res-sub table.detail thead th[scope=col]').length));
  ok('a severity is stated in words as well as in colour',
     qa('.flag').length > 0 && qa('.flag').every((f) =>
       /^(high|medium|low|info)$/i.test(f.querySelector('.badge')?.textContent?.trim() ?? '')),
     qa('.flag').map((f) => f.querySelector('.badge')?.textContent).join(','));
}

/**
 * The ratio, as a number rather than as a declaration being present.
 *
 * The failure this replaces: a gate that greps a stylesheet for a rule it expects passes on a
 * page where another rule cancels it. So this one reads both numbers and compares them.
 */
{
  const between = /\.body-results > section \+ section \{[^}]*margin-top:\s*([\d.]+)rem/.exec(html);
  const within = /\n\.card \{[^}]*padding:\s*([\d.]+)rem/.exec(html);
  ok('the space between regions is read from the stylesheet', !!between && !!within,
     `${between?.[1]} / ${within?.[1]}`);
  ok('and it is at least 2.2 times the space inside a card',
     Number(between[1]) >= 2.2 * Number(within[1]),
     `${between[1]}rem between, ${within[1]}rem within`);
  const h2 = /\.res-region > h2 \{[^}]*font-size:\s*([\d.]+)rem/.exec(html);
  const h3 = /\.res-sub > h3 \{[^}]*font-size:\s*([\d.]+)rem/.exec(html);
  ok('a region heading is at least a fifth larger than a part heading',
     Number(h2[1]) >= 1.2 * Number(h3[1]), `${h2[1]} / ${h3[1]}`);
  ok('a region is separated by the heavier hairline, which is the one that reads',
     /\.res-region \{[^}]*border-top:[^;]*--line-2/.test(html));
  ok('and print keeps a rule under the score, where card borders do not exist',
     /@media print[\s\S]*\.card\.verdict \{[^}]*border-bottom/.test(html));
}
/**
 * The results page scrolls like a document.
 *
 * It used to be its own scroll container, and three faults came out of that. The wheel did
 * nothing over the side margins, which at 1440px was 500 pixels of the window. The keyboard
 * could not scroll at all, because the container never took focus and the document behind it
 * had nothing to scroll. And the header and the footer were subtracted from the reading area
 * rather than scrolling away. Reported as "the scroll barely works".
 *
 * These assertions are written against the built stylesheet because jsdom does not lay the
 * page out. The previous version of this gate grepped for a declaration that a surviving
 * webkit rule was cancelling, so it passed on a page whose scrollbar was invisible in Chrome.
 * A gate that cannot fail is a zero that means nothing ran.
 */
ok('the results page is not its own scroll container',
   !/\.app-results\s*\{[^}]*overflow:\s*hidden/s.test(html) &&
   !/\.body-results\s*\{[^}]*overflow-y:\s*auto/s.test(html));
ok('so nothing hides its scrollbar',
   !/\.body-results::-webkit-scrollbar\s*\{[^}]*display:\s*none/s.test(html) &&
   !/\.body-results\s*\{[^}]*scrollbar-width:\s*none/s.test(html));
ok('and the reading column is not a dead gutter',
   !/\.body-results\s*\{[^}]*max-width/s.test(html));
ok('the snap no longer fights the gesture', !/scroll-snap-type:\s*y (mandatory|proximity)/s.test(html));
ok('and no part is forced to fill a screen, which is what made empty ones',
   !/\.body-results\s*>\s*section\s*\{[^}]*min-height:\s*100%/s.test(html));
// Every block on this page is a section.card, and a rule inside .body-results used to strip
// the background, the border and the shadow off all of them, so ten cards read as one flat
// surface. Reported as "very poor separation".
ok('the cards on it are still cards',
   !/\.body-results\s*>\s*section\s*\{[^}]*background:\s*none/s.test(html) &&
   !/\.body-results\s*>\s*section\s*\{[^}]*box-shadow:\s*none/s.test(html));
ok('and the dots still watch against the window',
   !/\{\s*root,\s*rootMargin/.test(html));
// Marking an assessment ready is one deliberate act, and with no store there is nothing to
// press: no code exists, so no assessor could open it. The block says so and shows no button.
ok('the results page has a submit block', !!q('.submit-box'));
ok('and with no store it says why there is nothing to press',
   view().includes('Not hosted yet') && view().includes('nowhere to keep an assessment'));
ok('with no button that cannot work', !byText('.submit-box button', 'ready to review'));

ok('backlog section present', view().includes('weakest five'));
ok('assessor questions previewed to the submitter', view().includes('What an assessor will probably ask'));
// One card when it is rare, one aggregate line when it is not; the sweep makes it common.
ok('the no-evidence 9 is flagged', view().includes('nothing cited'));
// The banner says what the document is, which is unclassified, and carries the evidence
// marking as a second line. It used to print PROTECTED B across an unclassified document.
ok('the banner marks the document as unclassified', view().includes('UNCLASSIFIED'));
ok('and names the evidence marking beside it', view().includes('evidence up to Protected B'));
ok('the copy does not appeal to an unnamed "us"',
   !view().includes('for us.') && !view().includes('Talk us through'));
{
  const rows = qa('table.detail tbody tr').length;
  const expected = TOTAL + 4 + 20;   // questions + domain rows + section rows
  ok('detail table has a row per question, section and domain', rows === expected, `${rows} vs ${expected}`);
}

// ---- take the file out, and inspect what came out ---------------------------------------
//
// Saving a file to send to TBS has gone: an assessment is reached by its access code now, and a
// second way in that produces a different copy of the same work is how two versions start
// diverging. Downloading one is still in the File menu, which is where everything you do to a
// whole assessment lives, and it is what this suite uses to look inside a saved assessment.
byText('.file-menu .menu-item', 'Download as a JSON file').click();
ok('a file was produced', saved.length === 1, String(saved.length));
const savedJson = JSON.parse(await text(saved[0]));
ok('saved file is a self-assessment', savedJson.fileType === 'gc-arch-assessment');
ok("saved file carries Dan's rubric version", savedJson.rubric.version === '1.0-dan');
ok('saved file holds every answer', Object.keys(savedJson.answers).length === TOTAL, String(Object.keys(savedJson.answers).length));
ok('saved file carries the evidence reference', JSON.stringify(savedJson).includes('Current-state architecture diagram'));
// Nothing is attached any more, so nothing large rides in the file. This is what keeps an
// assessment inside the size a store will take.
ok('the saved file carries no attachment', (() => {
  const withFile = Object.values(savedJson.answers).flatMap((x) => x.evidence ?? []).filter((e) => e.attachment);
  return withFile.length === 0;
})());
ok('and stays small enough for a store to hold it',
   JSON.stringify(savedJson).length < 400_000, String(JSON.stringify(savedJson).length));
ok('saved file records its marking', savedJson.initiative.classification === 'Protected B');
ok('the favicon is inline, so the built file needs no second request', html.includes('rel="icon" href="data:image/svg+xml'));

// The submitter's one-row CSV has gone with the rest of the file controls. The assessor still
// exports, and the shape of a CSV row is held by test/smoke.ts, which checks the header and the
// row against each other directly.

// ---- discarding cannot lose work by accident --------------------------------------------
//
// jsdom has no <dialog>.showModal, so the app falls back to a plain confirm. That is the path
// exercised here; the dialog itself is verified in a browser.
{
  // Questions dealt with, the way the app counts them: a score, or marked not applicable.
  const before = Object.values(savedJson.answers)
    .filter((x) => typeof x.score === 'number' || x.na === true).length;
  q('.icon-btn[aria-label="Settings"]').click();
  pane('Start again');

  ok('the danger pane names what is at stake', /Erases the \d+ answers/.test(view()), view().slice(0, 80));

  /**
   * Discarding goes through the one guard now, like every other act that replaces what this
   * browser holds. It used to ask its own way: it offered a file download, never showed the
   * access code, and when the assessment was already in the store it said the online copy was
   * untouched, which reads as "nothing is lost" to somebody about to lose the only copy of the
   * code that reaches it.
   */
  q('.set-row.danger button.danger').click();
  ok('the discard dialog says what is about to be replaced',
     /Replace what this browser is holding/i.test(dialogText()), dialogText().slice(0, 80));
  ok('and says what discarding does', /empties the form/i.test(dialogText()), dialogText().slice(0, 200));
  ok('and says what would be lost', /never been saved online/i.test(dialogText()), dialogText().slice(0, 240));
  ok('and offers to save online first',
     /Save this online first/i.test(dialogText()), dialogText().slice(-200));
  dialogAct('Keep what I have');
  ok('saying no changes nothing', answeredNow() === before, `${answeredNow()} vs ${before}`);
  ok('and no undo is offered, because nothing happened', !q('.undo-bar'));

  // Accept it, without saving first.
  q('.set-row.danger button.danger').click();
  dialogAct('Go ahead without saving');
  ok('discarding empties the assessment', answeredNow() === 0, String(answeredNow()));
  ok('the browser draft is cleared too', !window.localStorage.getItem('gc-arch-assessment:draft'));
  ok('and it stays on the pane that did it, so the loss is visible', !!q('.set-row.danger'));
  ok('undo is offered', !!q('.undo-bar') && view().includes('Discarded.'));
  ok('undo says it is only good for this tab', view().includes('this tab only'));

  byText('.undo-bar button', 'Undo').click();
  ok('undo puts every answer back', answeredNow() === before, `${answeredNow()} vs ${before}`);
  ok('and the undo strip goes away once used', !q('.undo-bar'));
}

// ---- reviewer --------------------------------------------------------------------------
// Crossing to the assessor side. The two audiences do not share a path, and the crossover is
// offered once, on the page a submitter arrives at.
byText('.tab', 'Start').click();
/**
 * The two sides are separate products that share a build, so neither offers the other.
 *
 * The home page used to carry two links across, which existed to make testing easy before
 * either side worked. A person who is not an assessor got a sign-in they could not pass, and a
 * person who is has their own address. The address still reaches it, which is how this suite
 * gets there.
 */
// The way across is back, for testing, and it says so on its face. The finished tool routes a
// person to one side at sign-in and the two builds are split; until then this is how the
// assessor side gets opened without typing an address.
ok('the way across is marked as temporary', !!q('.crossover .badge-mockup'),
   q('.crossover')?.textContent);
ok('and says what the finished tool does instead',
   /own address/.test(q('.crossover')?.textContent ?? ''));
ok('the admin view is not a destination of its own', !byText('button', 'Open the admin view'));
window.location.hash = '#assessor';
window.dispatchEvent(new window.PopStateEvent('popstate', { state: null }));
await new Promise((r) => setTimeout(r, 30));
// The sign-in screen carries the name of the tool, the language and the way out, and nothing
// else. A save badge, an offer to sign in and a breadcrumb to submissions are all answers to
// questions this person has not been allowed to ask yet.
ok('the sign-in screen carries no save badge', !q('.topbar .save-state'));
ok('and no breadcrumb', !q('.topbar nav.path'));
ok('and no assessor badge yet', !q('.side-badge'));
ok('and there is a way back', !!byText('button', 'Leave assessor view'));
ok('the side is remembered', window.localStorage.getItem('gc-arch-assessment:side') === 'assess');

// No authentication exists, so the assessor side opens on a screen shaped like a sign-in that
// says it is a mockup, and everything it produces is labelled unverified.
ok('the assessor side asks who you are first', view().includes('Sign in'));
ok('and admits it is a mockup', view().includes('Mockup'));
ok('and says the name is not checked', view().includes('This is not checked'));
ok('the real route is shown but not wired',
   !!byText('.signin-mock button', 'departmental account') &&
   byText('.signin-mock button', 'departmental account').disabled === true);
{
  const nameField = q('.signin input[type=text]');
  nameField.value = 'Allison';
  fire(nameField, 'input');
  byText('.signin button', 'Continue as unverified').click();
  ok('the badge carries the name and the word unverified',
     q('.side-badge').textContent.includes('Allison') && q('.side-badge').textContent.includes('unverified'),
     q('.side-badge')?.textContent);
  // Signed in, the full header comes back.
  ok("the assessor's path is Submissions then Admin",
     qa('nav.path .tab').map((t) => t.textContent).join('|') === 'Submissions|Admin',
     qa('nav.path .tab').map((t) => t.textContent).join('|'));
  ok('the assessor path offers an admin view', !!byText('.tab', 'Admin'));
  ok('the submitter path is gone from the assessor view',
     !qa('nav.path .tab').some((t) => /Start|Fill it in|My results/.test(t.textContent)));
}
// The screen says why there is nothing from the shared store, and leaves a way to work.
ok('the empty pool explains itself', view().includes('No shared pool yet'));
ok('and offers the file route as the alternative',
   view().includes('Load submissions from files instead'));
ok('with a picture that belongs to the page rather than a request',
   !!q('.pool-art svg') && q('.pool-art svg').innerHTML.includes('currentColor'));
ok('and an empty screen centres its one card', !!q('main.body-empty'));
{
  // ...and the assessor gets a library of them.
  q('.icon-btn[aria-label="Settings"]').click();
  ok('the assessor can add a question set', !!byText('.filelabel', 'Add a question set'));
  ok('the sets in this browser are listed', qa('.set-list-row').length >= 1,
     String(qa('.set-list-row').length));
  ok('the active set is marked', !!q('.set-list-row.on') && view().includes('Active'));
  ok('and adding one is said to change nothing on its own',
     view().includes('changes nothing on its own'));
  {
    // Each set carries a menu: preview, make active, delete, and who added it.
    const menu = q('.set-list-row .set-menu');
    ok('every set has a menu', !!menu);
    menu.open = true;
    const items = qa('.set-menu-pop .menu-item').map((n) => n.textContent);
    ok('it offers preview first, then activate, then delete',
       items[0].includes('Preview') && items.length >= 3, items.join(' | '));
    ok('and says where the set came from', view().includes('Came with the page'));
    ok('the only set cannot be deleted, and says so',
       !!byText('.menu-item.is-off', 'cannot delete'),
       qa('.menu-item.is-off').map((n) => n.textContent).join('|'));
    byText('.set-menu-pop .menu-item', 'Preview').click();
    ok('preview shows what is in the set without making it active',
       !q('.set-preview').hidden && view().includes('First questions in each domain'));
    // Clicking anywhere else closes it, which is what any small menu does.
    q('.set-menu').open = true;
    q('h1').click();
    ok('a click outside closes the menu', q('.set-menu').open === false);
  }
  // Add a second set, keep the first, then delete the new one. Two steps, both times.
  {
    const before = qa('.set-list-row').length;
    const second = JSON.parse(JSON.stringify(rubric));
    second.version = '9.9-test';
    second.title = 'A second question set';
    const add = q('.filelabel input[type=file]');
    Object.defineProperty(add, 'files', {
      value: [{ name: 'second.json', text: async () => JSON.stringify(second) }],
      configurable: true,
    });
    fire(add, 'change');
    await new Promise((r) => setTimeout(r, 80));

    ok('an added set joins the library and the old one stays',
       qa('.set-list-row').length === before + 1, String(qa('.set-list-row').length));
    ok('adding it does not make it active',
       !q('.set-list-row.on').textContent.includes('A second question set'),
       q('.set-list-row.on')?.textContent?.slice(0, 60));

    // Now a second set exists, so either can be deleted, and the menu says so.
    const spare = qa('.set-list-row').find((r) => !r.classList.contains('on'));
    spare.querySelector('.set-menu').open = true;
    const del = byText('.set-menu-pop .menu-item', 'Delete this set');
    ok('a set that is not in use can be deleted once there are two', !!del);
    del.click();
    ok('deleting a set offers the file back before it goes',
       dialogText().includes('Download the set'), dialogText().slice(0, 80));
    ok('and deleting without a copy is offered too',
       dialogText().includes('Delete permanently'));
    dialogAct('Keep it');
    ok('and saying no keeps it', qa('.set-list-row').length === before + 1,
       String(qa('.set-list-row').length));

    const spare2 = qa('.set-list-row').find((r) => !r.classList.contains('on'));
    spare2.querySelector('.set-menu').open = true;
    byText('.set-menu-pop .menu-item', 'Delete this set').click();
    dialogAct('Delete permanently');
    await new Promise((r) => setTimeout(r, 40));
    ok('saying yes removes it', qa('.set-list-row').length === before,
       String(qa('.set-list-row').length));
  }
  byText('.tab', 'Submissions').click();
}

const fileInput = q('.dropzone input[type=file]');
Object.defineProperty(fileInput, 'files', {
  value: [{ name: 'nexus-self-assessment.json', text: async () => JSON.stringify(savedJson) }],
  configurable: true,
});
fire(fileInput, 'change');
await new Promise((r) => setTimeout(r, 100));

ok('submission appears in the triage list', !!q('table.triage tbody tr'));
// The assessor's side keeps its work in the browser now, the way the submitter's always has.
ok('the assessor session is kept in this browser',
   !!window.localStorage.getItem('gc-arch-assessment:audit-session'));
ok('triage row names the initiative', q('table.triage tbody tr').textContent.includes('Nexus'));

byText('button', 'Open').click();
ok('detail view opens', view().includes('Audit these'));
ok("assessor sees the submitter's own words",
   view().includes('They said') && view().includes('owned by the platform team'));
ok('assessor is told where a justification is missing', view().includes('No justification given'));
ok('assessor sees the evidence reference and its classification',
   view().includes('Current-state architecture diagram') && view().includes('Protected B'));
// Anomalies first: only the flagged questions are on the page until the assessor asks for
// the rest. This is the whole point of the reviewer side.
{
  const flaggedRows = qa('.audit-row.flagged').length;
  // A question can belong to two findings and appear under both, so count questions, not rows.
  const allQids = new Set(qa('.audit-row .qid').map((n) => n.textContent));
  ok('flagged questions are surfaced on their own', flaggedRows > 0, String(flaggedRows));
  ok('the flagged set is a small fraction of 176', flaggedRows < 40, String(flaggedRows));
  ok('every question is on the page, the unflagged ones folded away',
     allQids.size === TOTAL, `${allQids.size} vs ${TOTAL}`);
  ok('the fold says how many are behind it', view().includes('nothing flagged'));
  ok('a KPI row summarises the submission', qa('.kpi').length === 5, String(qa('.kpi').length));
}
ok('a challenge question is drafted for the assessor, with no AI and no key involved',
   qa('.challenge').length > 0 && qa('.challenge')[0].textContent.includes('?'),
   qa('.challenge')[0]?.textContent?.slice(0, 70));
ok('the marking is shown as handling information, not as an anomaly',
   view().includes('Marked Protected B') && !view().includes('Evidence marked Protected B'));
// The assessor sees where the evidence lives, which is a link or a note that it was emailed.
ok('the assessor is told where the evidence is',
   view().includes('Current-state architecture diagram'));

ok('the audit is attributed to whoever signed in, and says it is unverified',
   view().includes('Auditing as') && view().includes('unverified'));

// Agree-with-all: Dan asked for it by name. It marks a whole section as agreed and touches
// no score.
{
  // The scores as the assessor left them, so "touches no score" is actually checked.
  const nums = () => qa('.audit-controls input[type=number]').map((i) => i.value).join(',');
  const before = nums();
  ok('there are scores on the page to leave alone', before.length > 0);
  const btn = byText('.section-head button', 'Agree with all');
  ok('each section can be agreed with in one click', !!btn);
  btn.click();
  ok('and it says how many it marked', view().includes('marked as agreed'));
  ok('while changing no score', nums() === before, `${before} -> ${nums()}`);
}

// Re-score one specific question so the delta is checkable.
const targetQid = rubric.domains[0].sections[0].questions[0].id;
const rowOf = (qid) => q(`.audit-row[data-qid="${qid}"]`);
const targetRow = rowOf(targetQid);
ok('every question is addressable by its rubric id', !!targetRow, targetQid);
const targetInput = targetRow.querySelector('.audit-controls input[type=number]');
targetInput.value = '4';
fire(targetInput, 'input');
fire(targetInput, 'change');
ok('changing a score marks that line as changed',
   !!q(`.audit-row.changed[data-qid="${targetQid}"]`));
ok('the change is summarised for the assessor', view().includes('What you changed'));
ok('the delta is shown with direction', view().includes('They said 7, you scored 4'));

// A changed number has to be justified, and until it is, the file cannot be saved.
ok('saving is blocked while a changed score has no reason',
   !byText('button', 'Save the audited file') && view().includes('need a reason'));
{
  // The view repaints on a score change, so the row has to be looked up again.
  const noteField = rowOf(targetQid).querySelector('.audit-controls input[type=text]');
  ok('the missing reason is marked on the field itself', noteField.classList.contains('needs-marking'));
  noteField.value = 'Their evidence covers one region, not the estate.';
  fire(noteField, 'input');
  fire(noteField, 'change');
}
ok('with a reason, saving is offered again', !!byText('button', 'Save the audited file'));

// The exchange: it says it was edited, and by whom, before anyone opens anything.
{
  const ex = rowOf(targetQid).querySelector('.exchange summary');
  ok('the line shows that it was edited and who by',
     !!ex && ex.textContent.includes('Edited') && ex.textContent.includes('Allison'),
     ex?.textContent);
}

byText('button', 'Save the audited file').click();
const audited = JSON.parse(await text(saved[saved.length - 1]));
ok('audited file records the reviewer', audited.audit.reviewer === 'Allison', String(audited.audit?.reviewer));
{
  const h = audited.audit.perQuestion[targetQid].history ?? [];
  ok('the file keeps the whole exchange, with names, times and reasons',
     h.length === 1 && h[0].by === 'Allison' && !!h[0].at && h[0].note.includes('one region') &&
     h[0].unverified === true,
     JSON.stringify(h));
}
ok('audited file keeps the self-score alongside the audited one',
   audited.answers[targetQid].score === 7 && audited.audit.perQuestion[targetQid].auditedScore === 4,
   `${audited.answers[targetQid].score} / ${audited.audit.perQuestion[targetQid].auditedScore}`);

{
  // The admin view is the portfolio dashboard. It reads the records asynchronously, because
  // the same call becomes one request the day a store exists.
  byText('.tab', 'Admin').click();
  await new Promise((r) => setTimeout(r, 0));
  ok('the admin view is a portfolio dashboard', view().includes('Portfolio'));
  ok('it admits nothing is hosted yet', view().includes('Not hosted yet'));
  ok('and says exactly what it can see', view().includes('Showing:'));
  ok('and says the submission opened this session is what it is reading',
     view().includes('opened this session'));
  ok('with a roll-up per domain and per topic',
     view().includes('Average by domain') && view().includes('Average across the domains'));
  ok('the records are listed weakest first, in one table',
     view().includes('Every record, weakest first') && qa('table.detail tbody tr').length > 0,
     String(qa('table.detail tbody tr').length));
  ok('nothing about the roll-up is stored, so it cannot go stale',
     !view().includes('last calculated'));
  {
    // An admin deletes a record by typing the initiative name, the way GitHub deletes a
    // repository. The button is dead until the typing matches.
    // Delete is behind a menu, because nothing that cannot be undone sits in a row.
    q('table.detail .row-menu').open = true;
    byText('.row-menu .menu-item', 'Delete this assessment').click();
    const dlg = q('dialog.confirm.typed');
    ok('deleting a record asks for the name to be typed', !!dlg);
    ok('and lists what goes', dlg.querySelectorAll('.typed-list li').length >= 3,
       String(dlg.querySelectorAll('.typed-list li').length));
    const go = byText('dialog.confirm.typed .cf-actions button', 'Delete this assessment');
    ok('the delete is dead to begin with', go.disabled === true);
    const field = dlg.querySelector('.typed-field');
    field.value = 'not the name';
    fire(field, 'input');
    ok('and stays dead for the wrong name', go.disabled === true);
    field.value = dlg.querySelector('.typed-ask code').textContent;
    fire(field, 'input');
    ok('and arms only on the exact name', go.disabled === false && go.classList.contains('armed'));
    byText('dialog.confirm.typed button', 'Cancel').click();
    ok('cancelling closes it and deletes nothing', !q('dialog.confirm.typed'));
  }
  ok('the admin-only actions are listed, with what is built marked',
     view().includes('Admin actions') && view().includes('Mostly not built')
     && view().includes('Question sets'));
}

console.log(fails === 0 ? '\nall UI checks passed' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
