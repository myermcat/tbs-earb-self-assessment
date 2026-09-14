/**
 * Sharing, and the promises it must not make.
 *
 * Sharing is the access code: whoever holds it opens the assessment and changes it. The window
 * behind File exists to explain that and hand the code over, and the assertions that matter are
 * still the negative ones. Nothing here may send a message or look as though it did, because the
 * tool has no way to put anything in front of anybody. Nothing here may ask for an address,
 * because that was the previous idea and it granted nothing; the user found both halves on one
 * screen and asked which of them was real.
 */
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

let fails = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) { fails++; console.log(`  FAIL  ${name} ${extra}`); } else console.log(`  ok    ${name}`);
};

const html = await readFile('dist/index.html', 'utf8');
const settle = () => new Promise((r) => setTimeout(r, 40));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://localhost/tool/#about',
  pretendToBeVisual: true,
  beforeParse(w) {
    // A draft that has been saved online, because the access code only exists once it has. An
    // assessment with no code shows the other half of this window, which says it has none yet.
    w.localStorage.setItem('gc-arch-assessment:draft', JSON.stringify({
      fileType: 'gc-arch-assessment', formatVersion: 1, ref: 'ZZ99', id: 'KFRM92TXBQ7H',
      rubric: { id: 'gc-ea-selfassess', version: '1.0-dan', title: 'x' },
      initiative: {
        name: 'Licensing Renewal', department: 'DFO', contact: 'a@b.gc.ca',
        lifecycleStage: 'beta', summary: 'A thing.', classification: 'Unclassified',
      },
      answers: {},
      meta: { createdAt: 'x', updatedAt: 'x', appVersion: 'test', savedOnlineAt: 'x' },
    }));
    w.scrollTo = () => {};
    w.alert = () => {};
    w.print = () => {};
  },
});
await settle();
const { document } = dom.window;
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const byText = (s, t) => qa(s).find((n) => n.textContent.trim().toLowerCase().includes(t.toLowerCase()));
const said = () => (q('.share-dialog')?.textContent ?? '').replace(/\s+/g, ' ');

console.log('\nSharing by access code\n');

// Sharing is reached through the File menu, where a document editor keeps it. The separate
// button at the top right went: the header was carrying too much.
ok('the File menu is in the header', !!byText('.file-menu summary', 'File'));
ok('and it holds a way to share access', !!byText('.file-menu .menu-item', 'Share access'));
byText('.file-menu .menu-item', 'Share access').click();
await settle();

ok('and it opens a window about the code', !!q('dialog.share-dialog'));
ok('which is what the window is called', /access code/i.test(q('.share-dialog .cf-title')?.textContent ?? ''));

/**
 * The code is the mechanism, so the window hands it over rather than describing it. Every place
 * a code appears it is a control you can copy from, because reading twelve characters off a
 * screen and retyping them into a chat window is the failure this is here to remove.
 */
ok('the code is on the window', !!q('.share-dialog .code-chip'));
ok('shown in groups of four, the way it is read', /KFRM-92TX-BQ7H/.test(said()), said().slice(0, 120));
ok('and it is a control, not a line of text', !!q('.share-dialog .code-chip button'));
ok('whose job it names for a screen reader',
   /copy the access code/i.test(q('.share-dialog .code-chip button')?.getAttribute('aria-label') ?? ''));

ok('it says holding the code is enough to change the assessment',
   /open this assessment and change it/i.test(said()), said().slice(0, 200));
ok('and that sending it is something you do yourself', /in a message yourself/i.test(said()));
ok('and that it cannot be taken back', /cannot be taken back/i.test(said()));

// What the previous idea left behind, and what it must never grow back into.
ok('there is no box asking for an email', !q('.share-dialog input[type=email]'));
ok('nothing on it opens a mail client', !/mailto:/.test(q('.share-dialog').innerHTML));
ok('and it does not call itself a mockup', !q('.share-dialog .badge-mockup'));

console.log(fails ? `\n${fails} sharing check(s) failed\n` : '\nall sharing checks passed\n');
process.exit(fails ? 1 : 0);
