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
import { readFile } from 'node:fs/promises';
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
ok('the count over the table is the count of what is in it',
   /4 submissions, ready first then weakest/.test(view()), view().match(/\d+ submissions[^.]{0,40}/)?.[0]);

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
const strays = byThePage.filter((k) => !k.startsWith(MINE));
ok('and it touched no name outside its own namespace', strays.length === 0, strays.join(', '));
ok('it touched storage at all, so the check above means something', byThePage.length > 0);

/**
 * A name on a path this test never walks.
 *
 * The wrapper above sees only what booting the page touches, which is seven of the eleven names
 * this tool stores: the signer's name waits for a dialog, and the three Firebase names need a
 * build with a project. A demonstration build folds the namespace down to one literal, so the
 * built page answers the whole question whether or not anybody reached the code.
 */
const stems = [...new Set([...html.matchAll(/gc-arch-assessment:(?!demo:)[a-z-]*/g)].map((m) => m[0]))];
ok('every name in the built page comes from the one helper', stems.length === 0, stems.join(', '));
ok('and the namespace is in the page, so the check above means something',
   html.includes(MINE));

window.close();
console.log(fails ? `\n${fails} demonstration storage check(s) failed\n` : '\nthe demonstration keeps to itself\n');
process.exit(fails ? 1 : 0);
