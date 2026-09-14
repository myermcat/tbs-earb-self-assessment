/**
 * Sharing, and the promises it must not make.
 *
 * This is a mockup: it records addresses and does nothing else. The assertions that matter are
 * the negative ones. Nothing here may open a mail client, because a message that leaves is a
 * promise the rest of the feature cannot keep, and the results page has a control a few lines
 * away that does exactly that. Nothing here may suggest that naming an assessor lets them
 * score, because scoring is granted by an admin and anybody could otherwise appoint a friend.
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

console.log('\nSharing, as a mockup\n');

// Sharing is reached through the File menu, where a document editor keeps it. The separate
// button at the top right went: the header was carrying too much.
ok('the File menu is in the header', !!byText('.file-menu summary', 'File'));
ok('and it holds a way to share access', !!byText('.file-menu .menu-item', 'Share access'));
byText('.file-menu .menu-item', 'Share access').click();
await settle();

ok('and it opens a list', !!q('dialog.share-dialog'));
/**
 * The code is the sharing mechanism now, so it comes first and the email box has gone.
 *
 * The box was the mechanism back when there was none: you typed an address, nothing happened,
 * and the screen said so four times over. Two mechanisms on one window, one of them pretend,
 * is what the user was reading when she asked why it still wanted an email.
 */
ok('the access code leads the window', !!q('.share-dialog .code-shown'));
ok('shown in groups of four, the way it is read', /KFRM-92TX-BQ7H/.test(said()), said().slice(0, 120));
ok('with a way to take a copy of it', !!byText('.share-dialog button', 'Copy the code'));
ok('and the sentence that you send it yourself', /Send it to them yourself/.test(said()));
ok('there is no box asking for an email', !q('.share-dialog input[type=email]'));
ok('and it still says that naming an assessor does not let them score',
   /does not let them score/.test(said()));

// The list of people that used to be the mechanism is now a note about who was given the code.
// What it must never do has not changed, and is the only thing left worth asserting about it.
ok('nothing on the sharing list opens a mail client', !/mailto:/.test(q('.share-dialog').innerHTML));

console.log(fails ? `\n${fails} sharing check(s) failed\n` : '\nall sharing checks passed\n');
process.exit(fails ? 1 : 0);
