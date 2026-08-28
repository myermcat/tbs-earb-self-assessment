/**
 * Counts the DOM churn caused by one score click.
 *
 *   npm run measure
 *
 * The questionnaire used to rebuild itself on every click, about four thousand elements, which
 * is why an opened section closed itself and focus jumped out of fields. This measures what a
 * click actually touches now, so the number is a fact and not a claim. test/ui.mjs holds the
 * same measurement as a budget, so a regression fails the build.
 */
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const html = await readFile('dist/index.html', 'utf8');
const rubric = JSON.parse(await readFile('rubric/rubric.v1-dan.json', 'utf8'));
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom, { document } = window;
window.scrollTo = () => {}; window.alert = () => {}; window.confirm = () => true;
const g = (s) => [...document.querySelectorAll(s)];
const fire = (n, t) => n.dispatchEvent(new window.Event(t, { bubbles: true }));
await new Promise((r) => setTimeout(r, 60));

g('.hero-actions button')[0].click();
const inp = g('.card input[type=text]')[0];
inp.value = 'Measurement run'; fire(inp, 'input'); fire(inp, 'change');
const pb = g('.marking-chip input').find((r) => r.value === 'Protected B');
pb.checked = true; fire(pb, 'change');
const st = g('.stage-card input').find((r) => r.value === 'maturity');
st.checked = true; fire(st, 'change');
g('.stepper .step').find((t) => t.textContent.includes('Business')).click();

const app = document.getElementById('app');
const count = () => app.querySelectorAll('*').length;
console.log(`Business Architecture page: ${count()} elements under #app`);

const obs = new window.MutationObserver(() => {});
obs.observe(app, { childList: true, subtree: true, attributes: true, characterData: true });

const target = g('.question')[5];
[...target.querySelectorAll('.score-btn')].find((b) => b.textContent === '7').click();

// Synchronous read. The observer callback is a microtask and would not have run yet.
const records = obs.takeRecords();
obs.disconnect();

let added = 0, removed = 0, attrs = 0, text = 0;
for (const rec of records) {
  added += rec.addedNodes.length;
  removed += rec.removedNodes.length;
  if (rec.type === 'attributes') attrs++;
  if (rec.type === 'characterData') text++;
}

console.log(`One score click: ${added} nodes added, ${removed} removed, ${attrs} attribute writes, ${text} text writes`);
console.log(`Touched ${added + removed + attrs + text} of ${count()} elements on the page.`);
