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
window.confirm = () => true;
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
/** Answers currently in the tool, read the way the app reads them. */
const answeredNow = () => {
  const raw = window.localStorage.getItem('gc-arch-assessment:draft');
  const live = q('.set-row.danger p')?.textContent?.match(/Erases the (\d+)/);
  if (live) return Number(live[1]);
  if (!raw) return 0;
  return Object.values(JSON.parse(raw).answers ?? {}).filter((x) => typeof x.score === 'number').length;
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
ok('three panes, named', qa('.set-navrow').map((b) => b.textContent).join('|') ===
   'Question set|Your answers|Start again',
   qa('.set-navrow').map((b) => b.textContent).join('|'));
ok('the gear opens the harmless one', q('.set-navrow.on').textContent === 'Question set',
   q('.set-navrow.on').textContent);
ok('the destructive pane is marked as dangerous in the rail itself',
   qa('.set-navrow')[2].classList.contains('danger'));

ok('settings shows the rubric version', view().includes('1.0-dan'));
ok('settings surfaces the import warning about the Business weight gap', view().includes('80%'));
ok('settings offers a different question set', !!byText('.filelabel', 'Load a question set'));
ok('and warns that loading one clears the answers',
   !!q('.set-row.caution') && view().includes('Clears your answers'));

pane('Your answers');
ok('settings says where the page was loaded from', view().includes('Where your answers go'));
ok('settings names the rule that stops it transmitting', view().includes("connect-src 'none'"));
ok('and explains that reloading keeps the answers', view().includes('Reloading does not lose anything'));

pane('Start again');
ok('the discard control lives here, not on the start page', !!q('.set-row.danger button.danger'));
ok('it says it cannot be undone', view().includes('Cannot be undone'));
ok('and it is disabled while there is nothing to lose',
   q('.set-row.danger button.danger').disabled === true);

pane('Question set');
byText('.tab', 'Start').click();
ok('the start page no longer carries the destructive control',
   !byText('button', 'Discard this and start again'));
ok('no network call is even possible (CSP)', html.includes("connect-src 'none'"));
// Without an explicit color-scheme, native buttons and inputs follow the OS setting while
// the page follows the media query, and a light page renders dark controls.
ok('color-scheme is declared for both themes',
   /:root\s*\{[^}]*color-scheme:\s*light/.test(html) && /prefers-color-scheme:\s*dark[^}]*\{[^}]*color-scheme:\s*dark/s.test(html));
// The sticky footer floats over cards that would otherwise look identical to it.
ok('the sticky footer is pinned to the edge and reads as chrome, not as a floating card',
   /\.sticky-footer\s*\{[^}]*bottom:\s*0/s.test(html) &&
   /\.sticky-footer\s*\{[^}]*border-top:\s*1px solid var\(--line-2\)/s.test(html) &&
   !/\.sticky-footer\s*\{[^}]*backdrop-filter/s.test(html));

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

// Step one: the four plain facts.
{
  const [name, dept, contact] = qa('.ov-block .grid-2 input');
  name.value = 'Nexus agentic AI infrastructure'; fire(name, 'input'); fire(name, 'change');
  dept.value = 'Transport Canada'; fire(dept, 'input'); fire(dept, 'change');
  contact.value = 'nick@tc.gc.ca'; fire(contact, 'input'); fire(contact, 'change');
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

// Step two, the marking. The whole GC scheme, in order.
const MARKINGS = 'Unclassified|Protected A|Protected B|Protected C|Confidential|Secret|Top Secret';
ok('step two asks how the file is marked', view().includes('How is this assessment marked'));
ok('every GC marking is offered', qa('.marking-chip').map((c) => c.textContent.trim()).join('|') === MARKINGS,
   qa('.marking-chip').map((c) => c.textContent.trim()).join('|'));
ok('and the same list is offered inside the gate that demands one',
   qa('.gate-marks .mark-btn').map((b) => b.textContent).join('|') === MARKINGS,
   qa('.gate-marks .mark-btn').map((b) => b.textContent).join('|'));

byText('.gate-marks .mark-btn', 'Protected B').click();
ok('marking from the gate clears the gate', !q('.gate'));

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
    [...qb.querySelectorAll('.score-btn')].find((b) => b.textContent === '7').click();
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
ok('footer shows 7.0 once everything is a 7', q('.footer-score .pill').textContent.trim() === '7.0',
   q('.footer-score .pill').textContent);
ok("footer shows Dan's maturity label for 7.0", q('.footer-score .muted').textContent.includes('Advanced'),
   q('.footer-score .muted').textContent);
ok('footer counts every answer', q('.footer-score .muted').textContent.includes(`${TOTAL} of ${TOTAL}`),
   q('.footer-score .muted').textContent);
ok('all four domain tabs read complete', qa('.stepper .step.complete:not(:first-child)').length === 4,
   String(qa('.stepper .step.complete').length));
ok('the questionnaire says where the answers go', view().includes('Saved locally as you type'));

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
  ok('but the score itself does move',
     footerText().includes('Baseline Ready'), footerText());

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

  // Put it back, so the rest of the run sees a fully answered assessment.
  naBox.checked = false;
  fire(naBox, 'change');
  [...naQ.querySelectorAll('.score-btn')].find((b) => b.textContent === '7').click();
  [...target.querySelectorAll('.score-btn')].find((b) => b.textContent === '7').click();
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
  ok('the fold says what is behind it',
     box.querySelector('summary').textContent.includes('Add reasoning or evidence'));

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

  naInput.checked = false;
  fire(naInput, 'change');
  [...qa('.question')[0].querySelectorAll('.score-btn')].find((b) => b.textContent === '7').click();
  ok('restored to 7', qa('.question')[0].querySelectorAll('.score-btn')[7].getAttribute('aria-checked') === 'true');
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
[...hosting.querySelectorAll('button')].find((b) => b.textContent === 'Add evidence').click();
ok('an evidence row appears', hosting.querySelectorAll('.ev-item').length === 1);
const just = hosting.querySelector('textarea');
just.value = 'Diagram is current as of March and owned by the platform team.';
fire(just, 'input');

ok('a new evidence row starts unmarked and blocks saving',
   byText('.footer-actions button', 'Save to a file').disabled === true && view().includes('mark'));

const evTitle = hosting.querySelector('.ev-row input[type=text]');
evTitle.value = 'Current-state architecture diagram, March 2026';
fire(evTitle, 'input');

// Attach a real file, the way Dan asked - so an assessor does not have to email anybody.
const evFileInput = qa('.ev-row2 input[type=file]')[0];
const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);   // "%PDF-1.4"
const fakePdf = new window.File([bytes], 'current-state.pdf', { type: 'application/pdf' });
Object.defineProperty(evFileInput, 'files', { value: [fakePdf], configurable: true });
fire(evFileInput, 'change');
await new Promise((r) => setTimeout(r, 80));

const hosting2 = qa('.question').find((n) => n.textContent.includes('hosting environment'));
ok('the attachment is held on the evidence row', !!hosting2.querySelector('.att .att-name'),
   hosting2.querySelector('.att')?.textContent);
ok('the attachment keeps its filename', hosting2.querySelector('.att-name').textContent === 'current-state.pdf',
   hosting2.querySelector('.att-name')?.textContent);

const evClass = [...hosting2.querySelectorAll('.ev-row select')][1];
evClass.value = 'Protected B';
fire(evClass, 'change');
ok('evidence marking can be set', evClass.value === 'Protected B');
ok('saving is unblocked once the evidence is marked',
   byText('.footer-actions button', 'Save to a file').disabled === false);

// Evidence above the file's own marking must be refused, not silently allowed through.
{
  const sel = [...qa('.question').find((n) => n.textContent.includes('hosting environment')).querySelectorAll('.ev-row select')][1];
  sel.value = 'Secret';
  fire(sel, 'change');
  ok('evidence above the file marking blocks saving',
     byText('.footer-actions button', 'Save to a file').disabled === true);
  ok('and says which way to resolve it', view().includes('higher than this file'));
  sel.value = 'Protected B';
  fire(sel, 'change');
  ok('and unblocks when brought back down',
     byText('.footer-actions button', 'Save to a file').disabled === false);
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
ok('four domain bars rendered', qa('.bar-row').length === 4, String(qa('.bar-row').length));
// The results are read one screen at a time, so the scroll stops on each part.
ok('the results page is its own scroll container',
   document.getElementById('app').className.includes('app-results'));
// Snapping rests on each part without forcing every part to fill a screen, which made
// near-empty screens and a jump on every click.
ok('the scroll stops on each part', /\.body-results\s*\{[^}]*scroll-snap-type:\s*y mandatory/s.test(html) &&
   /\.body-results\s*>\s*section\s*\{[^}]*scroll-snap-stop:\s*always/s.test(html));
ok('but no part is forced to fill a screen, which is what made empty ones',
   !/\.body-results\s*>\s*section\s*\{[^}]*min-height:\s*100%/s.test(html));
ok('the bulky native scrollbar is hidden, since the dots do that job',
   /\.body-results\s*\{[^}]*scrollbar-width:\s*none/s.test(html));
ok('with a fallback for short viewports and reduced motion',
   /max-height:\s*620px[^{]*\{[\s\S]{0,400}scroll-snap-type:\s*none/.test(html) &&
   /prefers-reduced-motion[^{]*\{[\s\S]{0,300}scroll-snap-type:\s*none/.test(html));
ok('backlog section present', view().includes('weakest five'));
ok('assessor questions previewed to the submitter', view().includes('What an assessor will probably ask'));
ok('the no-evidence 9 is flagged', view().includes('High score, nothing cited'));
ok('the file marking reaches the results page', view().includes('PROTECTED B'));
ok('the copy does not appeal to an unnamed "us"',
   !view().includes('for us.') && !view().includes('Talk us through'));
{
  const rows = qa('table.detail tbody tr').length;
  const expected = TOTAL + 4 + 20;   // questions + domain rows + section rows
  ok('detail table has a row per question, section and domain', rows === expected, `${rows} vs ${expected}`);
}

// ---- save, and inspect what came out ---------------------------------------------------
byText('button', 'Save the file to send to TBS').click();
ok('a file was produced', saved.length === 1, String(saved.length));
const savedJson = JSON.parse(await text(saved[0]));
ok('saved file is a self-assessment', savedJson.fileType === 'gc-arch-assessment');
ok("saved file carries Dan's rubric version", savedJson.rubric.version === '1.0-dan');
ok('saved file holds every answer', Object.keys(savedJson.answers).length === TOTAL, String(Object.keys(savedJson.answers).length));
ok('saved file carries the evidence reference', JSON.stringify(savedJson).includes('Current-state architecture diagram'));
ok('saved file carries the attachment itself', (() => {
  const ev = Object.values(savedJson.answers).flatMap((x) => x.evidence ?? []).find((e) => e.attachment);
  return !!ev && ev.attachment.name === 'current-state.pdf' && atob(ev.attachment.data).startsWith('%PDF');
})());
ok('saved file records its marking', savedJson.initiative.classification === 'Protected B');
ok('the favicon is inline, so the built file needs no second request', html.includes('rel="icon" href="data:image/svg+xml'));

byText('button', 'Save a CSV row').click();
const csv = await text(saved[1]);
const [head, row] = csv.split('\r\n');
ok('csv header and row have the same width', head.split(',').length === row.split(',').length,
   `${head.split(',').length} vs ${row.split(',').length}`);
ok('csv carries a column per section', head.includes('section_data_data-architecture-and-standards'));

// ---- discarding cannot lose work by accident --------------------------------------------
//
// jsdom has no <dialog>.showModal, so the app falls back to a plain confirm. That is the path
// exercised here; the dialog itself is verified in a browser.
{
  // Scored answers only, the way the app counts them. One question is marked not applicable
  // and carries no score.
  const before = Object.values(savedJson.answers).filter((x) => typeof x.score === 'number').length;
  q('.icon-btn[aria-label="Settings"]').click();
  pane('Start again');

  ok('the danger pane names what is at stake', /Erases the \d+ answers/.test(view()), view().slice(0, 80));

  // Refuse the confirmation: nothing may change.
  window.confirm = () => false;
  q('.set-row.danger button.danger').click();
  ok('saying no changes nothing', answeredNow() === before, `${answeredNow()} vs ${before}`);
  ok('and no undo is offered, because nothing happened', !q('.undo-bar'));

  // Accept it.
  window.confirm = () => true;
  q('.set-row.danger button.danger').click();
  ok('discarding empties the assessment', answeredNow() === 0, String(answeredNow()));
  ok('the browser draft is cleared too', !window.localStorage.getItem('gc-arch-assessment:draft'));
  ok('and it stays on the pane that did it, so the loss is visible', !!q('.set-row.danger'));
  ok('undo is offered', !!q('.undo-bar') && view().includes('Discarded.'));
  ok('undo says it is only good for this tab', view().includes('this tab only'));

  byText('.undo-bar button', 'Undo').click();
  ok('undo puts every answer back', answeredNow() === before, `${answeredNow()} vs ${before}`);
  ok('and the undo strip goes away once used', !q('.undo-bar'));

  window.confirm = () => true;
}

// ---- reviewer --------------------------------------------------------------------------
// Crossing to the assessor side. The two audiences do not share a path, and the crossover is
// offered once, on the page a submitter arrives at.
byText('.tab', 'Start').click();
ok('the crossover is on the start page', !!q('.crossover button'));
byText('.crossover button', 'Open the assessor view').click();
ok('the assessor side announces itself', !!q('.side-badge'), q('.brand')?.textContent);
ok("the assessor's path is just Submissions",
   qa('nav.path .tab').map((t) => t.textContent).join('|') === 'Submissions',
   qa('nav.path .tab').map((t) => t.textContent).join('|'));
ok('the submitter path is gone from the assessor view',
   !qa('nav.path .tab').some((t) => /Start|Fill it in|My results/.test(t.textContent)));
ok('and there is a way back', !!byText('button', 'Leave assessor view'));
ok('the side is remembered', window.localStorage.getItem('gc-arch-assessment:side') === 'assess');
ok('reviewer dropzone rendered', view().includes('Load submissions'));

const fileInput = q('.dropzone input[type=file]');
Object.defineProperty(fileInput, 'files', {
  value: [{ name: 'nexus-self-assessment.json', text: async () => JSON.stringify(savedJson) }],
  configurable: true,
});
fire(fileInput, 'change');
await new Promise((r) => setTimeout(r, 100));

ok('submission appears in the triage list', !!q('table.triage tbody tr'));
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
  const allRows = qa('.audit-row').length;
  ok('flagged questions are surfaced on their own', flaggedRows > 0, String(flaggedRows));
  ok('the flagged set is a small fraction of 176', flaggedRows < 20, String(flaggedRows));
  ok('everything else is present but folded away', allRows === TOTAL, `${allRows} vs ${TOTAL}`);
  ok('the fold says how many are behind it', view().includes('nothing flagged'));
  ok('a KPI row summarises the submission', qa('.kpi').length === 5, String(qa('.kpi').length));
}
ok('a challenge question is drafted for the assessor, with no AI and no key involved',
   qa('.challenge').length > 0 && qa('.challenge')[0].textContent.includes('?'),
   qa('.challenge')[0]?.textContent?.slice(0, 70));
ok('the marking is shown as handling information, not as an anomaly',
   view().includes('Marked Protected B') && !view().includes('Evidence marked Protected B'));
{
  const openBtn = qa('.ev-list button').find((b) => b.textContent === 'Open');
  ok('assessor can open the attached evidence in place', !!openBtn);
  openBtn.click();
  ok('opening it produces a blob from memory, not a network request',
     opened.length === 1 && String(opened[0]).startsWith('blob:'), String(opened[0]));
}

const nameField = q('input.reviewer-name');
nameField.value = 'Allison';
fire(nameField, 'input');

// Re-score one specific question so the delta is checkable.
const targetQid = rubric.domains[0].sections[0].questions[0].id;
const targetRow = q(`.audit-row[data-qid="${targetQid}"]`);
ok('every question is addressable by its rubric id', !!targetRow, targetQid);
const targetInput = targetRow.querySelector('.audit-controls input[type=number]');
targetInput.value = '4';
fire(targetInput, 'input');
fire(targetInput, 'change');
ok('changing a score marks that line as changed',
   !!q(`.audit-row.changed[data-qid="${targetQid}"]`));
ok('the change is summarised for the assessor', view().includes('What you changed'));
ok('the delta is shown with direction', view().includes('They said 7, you scored 4'));
byText('button', 'Save the audited file').click();
const audited = JSON.parse(await text(saved[saved.length - 1]));
ok('audited file records the reviewer', audited.audit.reviewer === 'Allison', String(audited.audit?.reviewer));
ok('audited file keeps the self-score alongside the audited one',
   audited.answers[targetQid].score === 7 && audited.audit.perQuestion[targetQid].auditedScore === 4,
   `${audited.answers[targetQid].score} / ${audited.audit.perQuestion[targetQid].auditedScore}`);

console.log(fails === 0 ? '\nall UI checks passed' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
