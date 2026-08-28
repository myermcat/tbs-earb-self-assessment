/**
 * What survives into a printed page.
 *
 * Three separate defects made a printed assessment near-useless, and all three are the same
 * mistake: a form control shows its state on screen and prints its markup. The eleven score
 * buttons printed as nothing, so no answer appeared at all. The justification textarea printed
 * empty. And a folded section printed as a heading-less blank, because hiding the <summary>
 * hid the title and `details { display: block }` does not open a closed <details> in Blink or
 * WebKit.
 *
 * Everything answerable is therefore mirrored into a .print-only element, and every section is
 * opened before the print dialog and closed again after. These checks hold that in place.
 */
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const html = await readFile('dist/index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom, { document } = window;
window.scrollTo = () => {}; window.alert = () => {}; window.confirm = () => true;
const g = (s) => [...document.querySelectorAll(s)];
const fire = (n, t) => n.dispatchEvent(new window.Event(t, { bubbles: true }));
await new Promise((r) => setTimeout(r, 60));

// Walk the overview wizard: three groups, one screen each.
g('.hero-actions button')[0].click();
const next = () => g('.ov-nav button').find((b) => b.textContent.includes('Next') || b.textContent.includes('Done')).click();
{
  const [name, dept, contact] = g('.ov-block .grid-2 input');
  for (const [f, v] of [[name, 'Print check'], [dept, 'Transport Canada'], [contact, 'nick@tc.gc.ca']]) {
    f.value = v; fire(f, 'input'); fire(f, 'change');
  }
  const ta = document.querySelector('.ov-block textarea');
  ta.value = 'A solution for checking what prints.'; fire(ta, 'input'); fire(ta, 'change');
}
next();
const pb = g('.marking-chip input').find((r) => r.value === 'Protected B');
pb.checked = true; fire(pb, 'change');
next();
const st = g('.stage-card input').find((r) => r.value === 'maturity'); st.checked = true; fire(st, 'change');
g('.stepper .step').find((t) => t.textContent.includes('Technology')).click();

const first = g('.question')[0];
[...first.querySelectorAll('.score-btn')].find((b) => b.textContent === '7').click();
// Reasoning and evidence fold away until wanted, so open them the way a reader would.
first.querySelector('.q-extras-box').open = true;
const ta = first.querySelector('textarea');
ta.value = 'Reviewed quarterly and owned by the platform team.'; fire(ta, 'input');
[...first.querySelectorAll('button')].find((b) => b.textContent === 'Add evidence').click();
const evRow = g('.ev-row input[type=text]')[0];
evRow.value = 'Current-state architecture pack'; fire(evRow, 'input');
const evCls = [...g('.ev-row select')][1]; evCls.value = 'Protected B'; fire(evCls, 'change');

// Second question left deliberately unanswered, third marked not applicable.
const third = g('.question')[2];
const na = third.querySelector('.na input'); na.checked = true; fire(na, 'change');

// Fold the scale on a question, the way a reader would, then run the print handler. Sections
// are one per page now, so the disclosures that survive a print are the per-question ones.
const folded = g('.ladder-box')[1];
folded.open = false;
const foldedTitle = folded.querySelector('summary').textContent;

window.dispatchEvent(new window.Event('beforeprint'));

const printed = [...g('.print-only')].map((n) => n.textContent.trim()).filter(Boolean);
let fails = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) { fails++; console.log(`  FAIL  ${name} ${extra}`); } else console.log(`  ok    ${name}`);
};

ok('the score prints as words', printed.some((t) => t === 'Score 7 of 10 - Scalable & Secure'), printed.find((t) => t.startsWith('Score')) ?? 'none');
ok('an unanswered question prints as unanswered', printed.includes('Not answered'));
ok('a not-applicable question says so', printed.includes('Not applicable'));
ok('the typed reasoning prints', printed.some((t) => t.includes('owned by the platform team')));
ok('the evidence prints with its marking', printed.some((t) => t.includes('Current-state architecture pack') && t.includes('Protected B')));
ok('a folded disclosure is opened for print', folded.open === true);
ok('and its contents are reachable', document.body.textContent.includes(foldedTitle));

window.dispatchEvent(new window.Event('afterprint'));
ok('the fold is restored afterwards', folded.open === false);
ok('the section title is on the printed page', document.body.textContent.includes('Defining the Current State'));

console.log(fails === 0
  ? `\nall print checks passed (${printed.length} print-only blocks on this page)`
  : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
