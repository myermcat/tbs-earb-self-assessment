/**
 * Finds questions that ask the same thing twice.
 *
 *   node tools/find-duplicate-questions.mjs           the pairs worth a look
 *   node tools/find-duplicate-questions.mjs --all     everything it scored, with the numbers
 *
 * Dan found this himself on 26 September: he had asked the same thing in two different
 * sections and said neither copy had ever been happy. A department answering one question
 * twice, in two places, with two scores, makes the total meaningless.
 *
 * FINDING THEM IS OURS. CUTTING THEM IS HIS. This prints candidates and changes nothing. No
 * threshold can tell "do you know what data you hold" asked of the current state from the same
 * words asked of the target state, and that distinction is the instrument's whole point, so the
 * last call cannot be automated and is not attempted here.
 *
 * It is not in the test suite on purpose. A guard that failed the build would fail it today,
 * on duplicates nobody has decided about yet, and the decision is not ours to force.
 */
import { readFile } from 'node:fs/promises';

const RUBRIC = 'rubric/rubric.v1-dan.json';
const showAll = process.argv.includes('--all');

/**
 * Words carrying no subject.
 *
 * Every question here is a question about a solution at a department, so "solution",
 * "government" and "organization" appear everywhere and mean nothing for telling two apart.
 * Leaving them in scored every pair at roughly the same middling number and the list was noise.
 */
const EMPTY = new Set(`
a an the and or of to in for on at by with from as is are was were be been being this that these
those it its their there has have had how what which when where who whom why do does did not no
any all some each other more most well any been using used use within across over under about
solution solutions government organization organisation department departments gc canada
current target state states level degree extent thoroughly fully well-defined defined
`.trim().split(/\s+/));

/** Content words, stemmed just enough that plural and participle do not read as different. */
function words(text) {
  return String(text).toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !EMPTY.has(w))
    .map((w) => w.replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, ''))
    .filter((w) => w.length > 2);
}

/**
 * Two numbers, because one of them lies on its own.
 *
 *   overlap     how much of the shorter question is inside the longer one. Catches a short
 *               question that is a long one with the trimmings taken off.
 *   jaccard     how much the two share out of everything either one says. Catches two
 *               questions of similar length that are the same question.
 *
 * Overlap alone promotes every short question against every long one. Jaccard alone misses a
 * one-line question buried inside a three-line one, which is the shape Dan actually found.
 */
function score(a, b) {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return { overlap: 0, jaccard: 0 };
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return {
    overlap: shared / Math.min(A.size, B.size),
    jaccard: shared / (A.size + B.size - shared),
  };
}

const rubric = JSON.parse(await readFile(RUBRIC, 'utf8'));
const all = [];
for (const d of rubric.domains) {
  for (const s of d.sections) {
    for (const q of s.questions) {
      all.push({ id: q.id, text: q.text, domain: d.label, section: s.label, sheetRef: q.sheetRef });
    }
  }
}

const pairs = [];
for (let i = 0; i < all.length; i++) {
  for (let j = i + 1; j < all.length; j++) {
    const s = score(all[i].text, all[j].text);
    pairs.push({ a: all[i], b: all[j], ...s });
  }
}

// Two questions in the same section repeating each other is a different conversation from the
// same question in two sections, which is the one Dan raised, so they are counted apart.
const worth = (p) => p.jaccard >= 0.25 || (p.overlap >= 0.5 && p.jaccard >= 0.2);
const found = pairs.filter(worth).sort((x, y) => y.jaccard - x.jaccard);
const shown = showAll ? pairs.filter((p) => p.jaccard >= 0.15).sort((x, y) => y.jaccard - x.jaccard) : found;

const short = (t) => String(t).replace(/\s+/g, ' ').trim();
console.log(`\n${all.length} questions, ${pairs.length} pairs compared.\n`);
console.log(`${found.length} pair(s) ask close enough to the same thing to be worth Dan's eye.`);
console.log(`${found.filter((p) => p.a.section !== p.b.section).length} of them are in different sections, which is the kind he found.\n`);

let n = 0;
for (const p of shown) {
  n++;
  const sameSection = p.a.section === p.b.section;
  console.log(`${String(n).padStart(2)}. ${p.a.id} and ${p.b.id}  —  ${(p.jaccard * 100).toFixed(0)}% shared, ${(p.overlap * 100).toFixed(0)}% of the shorter one`);
  console.log(`    ${sameSection ? 'SAME section' : 'DIFFERENT sections'}${p.a.domain === p.b.domain ? '' : ', different domains'}`);
  console.log(`    ${p.a.id}  ${p.a.domain} / ${p.a.section}`);
  console.log(`      ${short(p.a.text)}`);
  console.log(`    ${p.b.id}  ${p.b.domain} / ${p.b.section}`);
  console.log(`      ${short(p.b.text)}`);
  console.log('');
}
if (!shown.length) console.log('Nothing crossed the line. Either the set is clean or the line is wrong; --all shows the numbers.\n');
