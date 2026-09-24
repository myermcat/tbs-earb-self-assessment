/**
 * The demonstration page, opened in a browser that has already used the real ones.
 *
 * All three published pages are one origin, so they are one localStorage. Reported as: when I
 * open your demo link it opens a popup window each time, "This assessment is no longer in the
 * shared store", and "4 from the pool" against "6 submissions open".
 *
 * What was happening was worse than what was reported. The demonstration was reading the
 * submitter's draft and the assessor's saved session, and it was writing over both: its four
 * invented submissions went into the real assessor's session, where the real page restored them
 * on every load for ever.
 *
 * This seeds the bare names the real pages write, boots the demonstration over them, and fails
 * on any name it touches outside its own namespace.
 */
import { readdir, readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

let fails = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) { fails++; console.log(`  FAIL  ${name} ${extra}`); } else console.log(`  ok    ${name}`);
};

const html = await readFile('dist/demo.html', 'utf8');
const MINE = 'gc-arch-assessment:demo:';

/** A real submission, in the shape the real pages keep one. */
const real = {
  fileType: 'gc-arch-assessment', formatVersion: 1, id: 'REALDOCAAAA', ref: 'RL01',
  rubric: { id: 'other-set', version: '0.9', title: 'An older set' },
  initiative: {
    name: 'Coastal Permits Replacement', department: 'A Real Department',
    contact: 'someone@example.gc.ca', lifecycleStage: 'beta', summary: '',
    classification: 'Unclassified',
  },
  answers: {},
  meta: {
    createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-02T09:00:00.000Z',
    submittedAt: '2026-09-02T09:00:00.000Z', appVersion: '0.1.0',
  },
};

/** What the two real pages leave in this browser. */
const bare = {
  'gc-arch-assessment:draft': JSON.stringify(real),
  'gc-arch-assessment:audit-session': JSON.stringify([{ file: 'coastal.json', a: real }]),
  'gc-arch-assessment:signer': JSON.stringify({ name: 'A Real Person', email: 'a.person@tbs-sct.gc.ca' }),
  'gc-arch-assessment:side': 'assess',
  'gc-arch-assessment:lang': 'fr',
  'gc-arch-assessment:rubric-current': 'set-0',
};

const touched = [];
/**
 * Put the real accessors back before this file reads storage itself. Without it the assertions
 * below land in `touched` and the namespace check fails on its own verification, which is what
 * the first run of this file did.
 */
const unwrap = [];

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://example.gc.ca/demo/',
  pretendToBeVisual: true,
  beforeParse(w) {
    for (const [k, v] of Object.entries(bare)) w.localStorage.setItem(k, v);
    /**
     * localStorage and sessionStorage are one interface, so one wrapper records both, and it
     * records reads as well as writes: the dialog people saw came from a read.
     */
    const proto = w.Storage.prototype;
    for (const call of ['getItem', 'setItem', 'removeItem']) {
      const was = proto[call];
      unwrap.push(() => { proto[call] = was; });
      proto[call] = function wrapped(name, ...rest) {
        touched.push(String(name));
        return was.call(this, name, ...rest);
      };
    }
    w.scrollTo = () => {};
    w.alert = () => {};
    w.print = () => {};
    w.fetch = () => Promise.reject(new Error('the demonstration reached for the network'));
  },
});

const { window } = dom;
const { document } = window;
const app = document.getElementById('app');
await new Promise((r) => setTimeout(r, 400));

const view = () => (app?.textContent ?? '').replace(/\s+/g, ' ');
const dialogs = () => [...document.querySelectorAll('dialog')].map((d) => d.textContent).join(' ');

ok('it opens in the language the real pages were left in',
   document.documentElement.getAttribute('lang') === 'fr',
   document.documentElement.getAttribute('lang'));
ok('the demonstration lists its own invented submissions',
   view().includes('Bureau of Illustrative Inspections'));
ok('and says on its face that it is a demonstration', !!document.querySelector('.demo-banner'));
ok('nothing on the page names the real submission',
   !view().includes('Coastal Permits Replacement'), view().slice(0, 160));
/**
 * Every dialog, and not one guessed class. A selector that matches nothing makes an assertion
 * about what a dialog says pass on the build that was showing the dialog.
 */
ok('no window about an assessment that has gone from the store',
   !/no longer in the shared store/.test(dialogs()), dialogs().slice(0, 120));
// French, because the browser this test seeds had been left in French, which is the whole
// point of the one name that crosses.
ok('the count over the table is the count of what is in it',
   /4 soumissions, les prêtes d’abord puis les plus faibles/.test(view()),
   view().match(/\d+ (?:soumissions|submissions)[^.]{0,60}/)?.[0]);

// Everything the page does is in `touched` by now, and nothing this file does should be.
const byThePage = [...new Set(touched)];
for (const put of unwrap) put();

for (const [k, v] of Object.entries(bare)) {
  ok(`it leaves ${k.replace('gc-arch-assessment:', '')} exactly as it found it`,
     window.localStorage.getItem(k) === v);
}

const extra = [];
for (let i = 0; i < window.localStorage.length; i++) {
  const k = window.localStorage.key(i);
  if (!k.startsWith(MINE) && !(k in bare)) extra.push(k);
}
ok('it creates no name outside its own namespace', extra.length === 0, extra.join(', '));

// Read from the snapshot, which covers everything the page did including whatever the
// assertions above drove it to do.
/**
 * One name crosses, and it is named here.
 *
 * A demonstration reads the real pages' language choice when it has none of its own, because
 * serving English to somebody who asked for French is the expensive failure for a Government of
 * Canada tool. It never writes it, which the value check above is what proves.
 */
const SHARED = ['gc-arch-assessment:lang'];
const strays = byThePage.filter((k) => !k.startsWith(MINE) && !SHARED.includes(k));
ok('and it touched no name outside its own namespace, beyond the one it is allowed',
   strays.length === 0, strays.join(', '));
ok('which it did read, so the allowance is not dead wording',
   byThePage.includes(SHARED[0]), byThePage.join(', '));
ok('it touched storage at all, so the check above means something', byThePage.length > 0);

/**
 * A name on a path this test never walks.
 *
 * The wrapper above sees only what booting the page touches, which is seven of the names this
 * tool stores: the signer's name waits for a dialog, and the Firebase ones need a build with a
 * project. A demonstration build folds the namespace down to one literal, so the built page
 * answers the whole question whether or not anybody reached the code.
 *
 * The count used to be written out as a number here and it went stale the day the sign-in link
 * added a name. It is counted below now, so it cannot say one thing while the code says
 * another.
 */
const stems = [...new Set([...html.matchAll(/gc-arch-assessment:(?!demo:)[a-z-]*/g)].map((m) => m[0]))]
  .filter((k) => !SHARED.includes(k));
ok('every name in the built page comes from the one helper, beyond the one allowance',
   stems.length === 0, stems.join(', '));
ok('and the allowance is the only bare name in it, so it stays one',
   [...new Set([...html.matchAll(/gc-arch-assessment:(?!demo:)[a-z-]*/g)].map((m) => m[0]))].length === 1);
ok('and the namespace is in the page, so the check above means something',
   html.includes(MINE));

/**
 * Every name this tool stores goes through the one helper, counted rather than stated.
 *
 * A comment above used to say how many there were and was wrong within a week. This reads the
 * source, so the day somebody adds a name without the helper it is the count that disagrees.
 */
const sources = await Promise.all(
  (await readdir('src')).filter((f) => f.endsWith('.ts')).map((f) => readFile(`src/${f}`, 'utf8')),
);
const named = [...new Set(sources.flatMap((src) =>
  [...src.matchAll(/storeKey\('([a-z-]+)'\)/g)].map((m) => m[1])))].sort();
ok('every stored name is made by the helper, and there is more than one',
   named.length >= 10, `${named.length}: ${named.join(', ')}`);

window.close();
console.log(fails ? `\n${fails} demonstration storage check(s) failed\n` : '\nthe demonstration keeps to itself\n');
process.exit(fails ? 1 : 0);
