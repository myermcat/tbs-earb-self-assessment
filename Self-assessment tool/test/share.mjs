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
  beforeParse(w) { w.scrollTo = () => {}; w.alert = () => {}; w.print = () => {}; },
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
ok('marked as a mockup', !!q('.share-dialog .badge-mockup'));
// Above the field, because the classified pledge taught that a panel under the fold is
// scrolled past, and this is the one sentence somebody has to read before they type.
ok('saying no email is sent', /No email is sent/.test(said()));
ok('and saying it above the field',
   !!(q('.share-dialog .card.warn').compareDocumentPosition(q('.share-dialog .share-add')) & 4));
ok('and saying that naming an assessor does not let them score',
   /does not let them score/.test(said()));

// One address or a pasted list, and whatever is refused is named.
{
  const field = q('.share-dialog input[type=email]');
  field.value = 'anna@dfo-mpo.gc.ca, nope, bruno@dfo-mpo.gc.ca';
  byText('.share-dialog button', 'Add to the list').click();
  await settle();
  ok('a pasted list adds every address in it', /2 added to the list/.test(said()), said().slice(0, 200));
  ok('and names what it left out', /left out: nope/.test(said()));
  ok('the people are on the list', qa('.share-dialog .share-row').length === 2,
     String(qa('.share-dialog .share-row').length));
  ok('each row says no email went', qa('.share-dialog .share-row .badge-mockup').length === 2);
}

// The same address twice is one person.
{
  const field = q('.share-dialog input[type=email]');
  field.value = 'ANNA@dfo-mpo.gc.ca';
  byText('.share-dialog button', 'Add to the list').click();
  await settle();
  ok('the same address again is not a second person', qa('.share-dialog .share-row').length === 2,
     String(qa('.share-dialog .share-row').length));
  ok('and it says so', /Already on the list/.test(said()));
}

// An assessor is a different part, on the same list.
{
  const roleBtn = byText('.share-roles button', 'As an assessor');
  ok('somebody can be added as an assessor', !!roleBtn);
  roleBtn.click();
  const field = q('.share-dialog input[type=email]');
  field.value = 'nick@tbs-sct.gc.ca';
  byText('.share-dialog button', 'Add to the list').click();
  await settle();
  ok('and lands in their own group', qa('.share-dialog .share-row').length === 3,
     String(qa('.share-dialog .share-row').length));
  ok('the groups are named for what they do',
     /Working on it with you/.test(said()) && /Reading and scoring it/.test(said()));
}

// Nothing is removed in one step. That is the house rule.
{
  const remove = byText('.share-dialog .share-row button', 'Remove');
  remove.click();
  await settle();
  ok('taking somebody off asks first', qa('dialog.confirm').length > 1);
  const ask = qa('dialog.confirm').at(-1);
  ok('and says nothing else happens, because nothing was granted',
     /nothing was granted/.test(ask.textContent));
  byText('.cf-actions button', 'Keep them on')?.click();
  await settle();
  ok('saying keep them changes nothing', qa('.share-dialog .share-row').length === 3,
     String(qa('.share-dialog .share-row').length));
}

// The promise this must never make.
ok('nothing on the sharing list opens a mail client', !/mailto:/.test(q('.share-dialog').innerHTML));

// It survives being saved and reopened, and the flat lists the store's rules will need are
// derived rather than typed, so they cannot disagree with the list they come from.
{
  const raw = dom.window.localStorage.getItem('gc-arch-assessment:draft');
  const draft = JSON.parse(raw);
  ok('the people are written into the assessment', (draft.sharing?.people ?? []).length === 3,
     String((draft.sharing?.people ?? []).length));
  ok('with two teammates in the flat list', (draft.sharing?.teammateEmails ?? []).length === 2);
  ok('and one assessor', (draft.sharing?.assessorEmails ?? []).length === 1);
  ok('every one recorded and nothing more',
     (draft.sharing?.people ?? []).every((p) => p.state === 'recorded'));
  ok('and each carries who added them and when',
     (draft.sharing?.people ?? []).every((p) => typeof p.addedAt === 'string' && 'addedBy' in p));
}

console.log(fails ? `\n${fails} sharing check(s) failed\n` : '\nall sharing checks passed\n');
process.exit(fails ? 1 : 0);
