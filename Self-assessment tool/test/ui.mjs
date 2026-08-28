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

// ---- home ------------------------------------------------------------------------------
ok('app mounted', !!q('#app .topbar'));
ok('the header carries only the name, no version clutter', !q('.brand').textContent.includes('1.0-dan'));
ok('the rubric version is available in the footer', q('.sitefoot').textContent.includes('1.0-dan'));
ok('draft status is reachable from the footer', !!byText('button', 'How that works'));
ok('the question count is stated up front', view().includes(String(TOTAL)));

// Settings holds the rubric detail and the data-handling note.
byText('.tab', 'Settings').click();
ok('settings shows the rubric version', view().includes('1.0-dan'));
ok('settings surfaces the import warning about the Business weight gap', view().includes('80%'));
ok('settings says where the page was loaded from', view().includes('Where your answers go'));
ok('settings names the rule that stops it transmitting', view().includes("connect-src 'none'"));
ok('settings offers a different question set', !!byText('.filelabel', 'Load a question set'));
byText('.tab', 'Home').click();
ok('no network call is even possible (CSP)', html.includes("connect-src 'none'"));
// Without an explicit color-scheme, native buttons and inputs follow the OS setting while
// the page follows the media query, and a light page renders dark controls.
ok('color-scheme is declared for both themes',
   /:root\s*\{[^}]*color-scheme:\s*light/.test(html) && /prefers-color-scheme:\s*dark[^}]*\{[^}]*color-scheme:\s*dark/s.test(html));
// The sticky footer floats over cards that would otherwise look identical to it.
ok('the sticky footer is visually separated from the content it covers',
   /\.sticky-footer\s*\{[^}]*border-top:\s*2px solid var\(--accent\)/s.test(html) &&
   !/\.sticky-footer\s*\{[^}]*backdrop-filter/s.test(html));

// ---- overview --------------------------------------------------------------------------
byText('button', 'Start').click();
ok('overview page rendered', view().includes('About the initiative'));
ok('no questions on the overview page', qa('.question').length === 0);
ok('seven lifecycle stages offered', qa('.stage-card').length === 7, String(qa('.stage-card').length));
ok('stepper has overview plus four domains', qa('.stepper .step').length === 5, String(qa('.stepper .step').length));
ok('a stage must be picked before scoring', view().includes('Pick a lifecycle stage'));

ok('a blank assessment has nothing to mark, so saving is allowed', q('.footer-actions .ghost').disabled === false);

const inputs = qa('.card input[type=text]');
inputs[0].value = 'Nexus agentic AI infrastructure';
fire(inputs[0], 'input');
inputs[1].value = 'Transport Canada';
fire(inputs[1], 'input');
fire(inputs[1], 'change');   // the gate refreshes on blur, not on every keystroke

// Dan's rule: the moment there is content in the file, it has to be marked before saving.
ok('typing content blocks saving until the file is marked', q('.footer-actions .ghost').disabled === true);
ok('the gate says why', view().includes('Mark this assessment before saving'));

const maturity = qa('.stage-card input[type=radio]').find((r) => r.value === 'maturity');
maturity.checked = true;
fire(maturity, 'change');
ok('the stage warning clears once a stage is picked', !view().includes('Pick a lifecycle stage'));

// Mark the file. Dan asked for this to be a hard gate, not a reminder.
ok('five markings offered', qa('.marking-chip').length === 5, String(qa('.marking-chip').length));
const pbChip = qa('.marking-chip input').find((r) => r.value === 'Protected B');
pbChip.checked = true;
fire(pbChip, 'change');
ok('banner shows the marking top and bottom', qa('.marking-banner').length === 2 &&
   q('.marking-banner').textContent.trim() === 'PROTECTED B', q('.marking-banner')?.textContent);
ok('saving is allowed once marked', q('.footer-actions .ghost').disabled === false);

// ---- answer every question, domain by domain -------------------------------------------
let seen = 0;
for (const d of rubric.domains) {
  const step = qa('.stepper .step').find((s) => s.textContent.includes(d.label.split(' ')[0]));
  ok(`stepper has a tab for ${d.label}`, !!step);
  step.click();

  const expectedQs = d.sections.reduce((n, s) => n + s.questions.length, 0);
  ok(`${d.label}: ${expectedQs} questions rendered`, qa('.question').length === expectedQs,
     String(qa('.question').length));
  ok(`${d.label}: ${d.sections.length} sections rendered`, qa('.card.section').length === d.sections.length,
     String(qa('.card.section').length));
  ok(`${d.label}: section weights shown`, view().includes(`${d.sections[0].weight}% of this domain`));

  for (const qb of qa('.question')) {
    [...qb.querySelectorAll('.score-btn')].find((b) => b.textContent === '7').click();
  }
  seen += expectedQs;
}
ok(`all ${TOTAL} questions were reachable and answerable`, seen === TOTAL, String(seen));
ok('footer shows 7.0 once everything is a 7', q('.footer-score .pill').textContent.trim() === '7.0',
   q('.footer-score .pill').textContent);
ok("footer shows Dan's maturity label for 7.0", q('.footer-score .muted').textContent.includes('Advanced'),
   q('.footer-score .muted').textContent);
ok('footer counts every answer', q('.footer-score .muted').textContent.includes(`${TOTAL} of ${TOTAL}`),
   q('.footer-score .muted').textContent);
ok('all four domain tabs read complete', qa('.stepper .step.complete:not(:first-child)').length === 4,
   String(qa('.stepper .step.complete').length));

// ---- the ladder is Dan's, and it is visible --------------------------------------------
{
  const first = qa('.question')[0];
  ok('the chosen rung is named back to the user', first.querySelector('.chosen').textContent.includes('Scalable'),
     first.querySelector('.chosen').textContent.slice(0, 60));
  ok("the full ladder uses Dan's maturity names", first.textContent.includes('Symbiotic'));
}

// ---- a high score with nothing behind it, an n/a, and one evidence reference ------------
const infra = qa('.question').find((n) => n.textContent.includes('clear inventory of all infrastructure'));
ok('found the infrastructure inventory question on the technology page', !!infra);
[...infra.querySelectorAll('.score-btn')].find((b) => b.textContent === '9').click();

const tra = qa('.question').find((n) => n.textContent.includes('Threat and Risk Assessment'));
const naBox = tra.querySelector('.na input');
naBox.checked = true;
fire(naBox, 'change');
ok("n/a disables that question's buttons", [...tra.querySelectorAll('.score-btn')].every((b) => b.disabled));
ok('n/a drops it from the denominator', q('.footer-score .muted').textContent.includes(`of ${TOTAL - 1}`),
   q('.footer-score .muted').textContent);

const hosting = qa('.question').find((n) => n.textContent.includes("hosting environment"));
[...hosting.querySelectorAll('button')].find((b) => b.textContent === 'Add evidence').click();
ok('an evidence row appears', hosting.querySelectorAll('.ev-item').length === 1);
const just = hosting.querySelector('textarea');
just.value = 'Diagram is current as of March and owned by the platform team.';
fire(just, 'input');

ok('a new evidence row starts unmarked and blocks saving',
   q('.footer-actions .ghost').disabled === true && view().includes('mark'));

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
ok('saving is unblocked once the evidence is marked', q('.footer-actions .ghost').disabled === false);

// Evidence above the file's own marking must be refused, not silently allowed through.
{
  const sel = [...qa('.question').find((n) => n.textContent.includes('hosting environment')).querySelectorAll('.ev-row select')][1];
  sel.value = 'Classified';
  fire(sel, 'change');
  ok('evidence above the file marking blocks saving', q('.footer-actions .ghost').disabled === true);
  ok('and says which way to resolve it', view().includes('higher than this file'));
  sel.value = 'Protected B';
  fire(sel, 'change');
  ok('and unblocks when brought back down', q('.footer-actions .ghost').disabled === false);
}
ok('draft is autosaved to this browser', !!window.localStorage.getItem('gc-arch-assessment:draft'));

// ---- results ---------------------------------------------------------------------------
byText('button', 'See my results').click();
ok('results headline rendered', !!q('.bigscore .num'));
ok("Dan's maturity label is shown", !!q('.maturity strong') && q('.maturity').textContent.includes('Advanced'));
ok('routing band is shown separately from maturity', !!q('.band strong'));
ok('routing is stated as a suggestion', view().includes('does not decide it'));
ok('four domain bars rendered', qa('.bar-row').length === 4, String(qa('.bar-row').length));
ok('backlog section present', view().includes('weakest five'));
ok('assessor questions previewed to the submitter', view().includes('What an assessor will probably ask'));
ok('the no-evidence 9 is flagged', view().includes('High score, nothing cited'));
ok('the file marking reaches the results page', view().includes('PROTECTED B'));
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

// ---- reviewer --------------------------------------------------------------------------
byText('.tab', 'Review submissions').click();
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
