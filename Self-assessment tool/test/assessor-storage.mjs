/**
 * The assessor's page, opened in a browser that has been filling in an assessment.
 *
 * Both published pages are one origin, so they are one localStorage. Reported twice. In
 * September a control here called clearDraft and took a submitter's 176 answers with it. In
 * October: it's the second time already when i opened a tab with an existing submission in the
 * submitter view, and i reloaded the page, and the submission wasn't there anymore, and it
 * opened a new empty one. That one was adoptSignedIn stamping the signed-in address onto the
 * blank assessment this page holds and autosaving it, on every paint, with no click.
 *
 * Asked for after it was explained: but they shouldn't affect each other at all. So this page
 * has a namespace of its own now, the way the demonstration page has had one since September.
 *
 * This seeds the names the submitter's page writes, boots the assessor's page over them, and
 * fails on any of them it changes. It also checks the one thing the namespace costs: what is
 * the assessor's own has to travel to the new name, or publishing this signs somebody out and
 * takes their imported question sets with it.
 */
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

let fails = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) { fails++; console.log(`  FAIL  ${name} ${extra}`); } else console.log(`  ok    ${name}`);
};

const html = await readFile('dist/assessor.html', 'utf8');
const submitterHtml = await readFile('dist/index.html', 'utf8');
const MINE = 'gc-arch-assessor:';
const THEIRS = 'gc-arch-assessment:';

const hers = {
  fileType: 'gc-arch-assessment', id: 'KFRM92TXBQ7H', ref: 'AB12',
  rubric: { id: 'gc-ea-selfassess', version: '1.0', title: 'x' },
  initiative: {
    name: 'Fleet Scheduling', department: 'DFO', contact: 'a@dfo-mpo.gc.ca',
    summary: 'A thing.', classification: 'Unclassified', lifecycleStage: 'beta',
  },
  answers: { 'B-Q1': { score: 7, evidence: [] }, 'B-Q2': { score: 4, evidence: [] } },
  meta: { createdAt: 'x', updatedAt: 'x', appVersion: 'test' },
};
const session = {
  email: 'someone@tbs-sct.gc.ca', idToken: 't', refreshToken: 'r', expiresAt: Date.now() + 36e5,
};
/** What the submitter's page wrote, under the names it writes them under. */
const bare = {
  [`${THEIRS}draft`]: JSON.stringify(hers),
  [`${THEIRS}firebase-session`]: JSON.stringify(session),
  [`${THEIRS}audit-session`]: JSON.stringify({ auditor: 'someone@tbs-sct.gc.ca' }),
  [`${THEIRS}rubric-library`]: JSON.stringify([]),
  [`${THEIRS}lang`]: 'fr',
};

function openAssessor(seed) {
  const touched = [];
  const unwrap = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://example.gc.ca/tool/assessor/',
    pretendToBeVisual: true,
    beforeParse(w) {
      for (const [k, v] of Object.entries(seed)) w.localStorage.setItem(k, v);
      const proto = w.Storage.prototype;
      for (const call of ['setItem', 'removeItem']) {
        const was = proto[call];
        unwrap.push(() => { proto[call] = was; });
        proto[call] = function wrapped(name, ...rest) {
          touched.push(String(name));
          return was.call(this, name, ...rest);
        };
      }
      w.scrollTo = () => {};
      w.alert = () => {};
      w.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' });
    },
  });
  return { dom, touched, unwrap };
}

console.log('\nThe assessor page, over somebody else\'s work\n');

const { dom, touched, unwrap } = openAssessor(bare);
await new Promise((r) => setTimeout(r, 400));
for (const put of unwrap) put();
const { window } = dom;

/* ----------------------------------------------------------------------------------------- */
// The submitter's names, exactly as they were handed over.
for (const [k, v] of Object.entries(bare)) {
  ok(`it leaves ${k.replace(THEIRS, '')} exactly as it found it`,
     window.localStorage.getItem(k) === v,
     (window.localStorage.getItem(k) ?? '(gone)').slice(0, 60));
}
const written = [...new Set(touched)].filter((k) => k.startsWith(THEIRS));
ok('and writes nothing at all under the submitter’s name', written.length === 0,
   written.join(', '));

/* ----------------------------------------------------------------------------------------- */
/**
 * And what is the assessor's own travelled with them. Without this the page opens signed out,
 * with no imported question set and no audit in progress, which is losing somebody's work to a
 * rename.
 */
ok('the session came across to the new name',
   window.localStorage.getItem(`${MINE}firebase-session`) === bare[`${THEIRS}firebase-session`]);
ok('the audit session came with it',
   window.localStorage.getItem(`${MINE}audit-session`) === bare[`${THEIRS}audit-session`]);
ok('so did the question sets',
   window.localStorage.getItem(`${MINE}rubric-library`) === bare[`${THEIRS}rubric-library`]);
ok('and the language',
   window.localStorage.getItem(`${MINE}lang`) === 'fr');
ok('and the page is signed in, which is the point of carrying the session',
   !/Sign in/.test(dom.window.document.getElementById('app')?.textContent ?? ''),
   (dom.window.document.getElementById('app')?.textContent ?? '').slice(0, 80));
window.close();

/* ----------------------------------------------------------------------------------------- */
/**
 * The second open must not put the old session back over a newer one. It runs on every open,
 * so a stale value in the submitter's namespace would otherwise reinstate itself for ever.
 */
{
  const newer = { ...session, idToken: 'NEWER' };
  const seed = { ...bare, [`${MINE}firebase-session`]: JSON.stringify(newer) };
  const again = openAssessor(seed);
  await new Promise((r) => setTimeout(r, 300));
  for (const put of again.unwrap) put();
  ok('a later open leaves the newer session alone',
     JSON.parse(again.dom.window.localStorage.getItem(`${MINE}firebase-session`)).idToken === 'NEWER',
     again.dom.window.localStorage.getItem(`${MINE}firebase-session`)?.slice(0, 60));
  again.dom.window.close();
}

/* ----------------------------------------------------------------------------------------- */
/**
 * A name on a path this file never walks. The build folds the namespace to one literal, so the
 * built pages answer the whole question whether or not anybody reached the code.
 */
ok('the assessor page carries its own namespace', html.includes(MINE));
ok('and the submitter page carries no sign of it, so the fold is real',
   !submitterHtml.includes(MINE));
/**
 * The one name that crosses, and it is a read. The migration is how a session, a question set
 * and an audit in progress survive the rename, so the submitter's stem is in this page on
 * purpose and exactly once.
 */
/**
 * Two stems are allowed and they are both named here. The bare one is the migration's own
 * template. The language is the one name that crosses on purpose: a page with none of its own
 * reads the choice the real pages were left in, once, and never writes it, because serving
 * English to somebody who asked for French is the expensive failure for a Government of Canada
 * tool. i18n.ts carries the same reasoning and demo-storage.mjs allows the same name.
 */
const ALLOWED = ['gc-arch-assessment:', 'gc-arch-assessment:lang'];
const stems = [...new Set([...html.matchAll(/gc-arch-assessment:[a-z-]*/g)].map((m) => m[0]))];
const strays = stems.filter((s) => !ALLOWED.includes(s));
ok('and reaches the submitter’s names only through the migration and the language',
   strays.length === 0, strays.join(', '));
ok('which are both in the page, so the allowance is not dead wording',
   ALLOWED.every((s) => stems.includes(s)), stems.join(', '));

console.log(fails ? `\n${fails} failed\n` : '\nall assessor storage checks passed\n');
process.exit(fails ? 1 : 0);
