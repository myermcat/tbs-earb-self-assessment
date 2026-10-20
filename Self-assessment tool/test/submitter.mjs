/**
 * The submitter's screens on a build that runs on codes.
 *
 * Dan asked on 8 September whether the tool needs accounts at all, and the answer on this side
 * is no: the assessment's twelve-character code is its name in the store, and the published
 * rules grant the write on that name. What this suite is here to catch is the tool saying
 * otherwise anyway. Every sentence offering a sign-in on this build names a thing that is not
 * there, and the person reading it has no way to know that.
 *
 * It also holds the quieter one. A Firebase session left in this browser by an earlier build
 * still reads back, so the page could hide the account chip and go on using the account behind
 * it: stamping the owner's address onto the record and asking for a role. Two people on the
 * same page were using two different tools.
 */
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

let fails = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) { fails++; console.log(`  FAIL  ${name} ${extra}`); } else console.log(`  ok    ${name}`);
};

const html = await readFile('dist/index.html', 'utf8');
const settle = () => new Promise((r) => setTimeout(r, 40));

/** One page, optionally with something left in its storage before any of it runs. */
async function open(seed = {}, at = '') {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: `https://example.gc.ca/tool/${at}`,
    pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.alert = () => {};
      for (const [k, v] of Object.entries(seed)) w.localStorage.setItem(k, v);
      // Nothing here should reach the network, and anything that tries is the finding.
      w.fetch = async (url) => { asked.push(String(url)); return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' }; };
    },
  });
  await settle();
  return dom;
}

let asked = [];

/** One control inside one box, found by what it says. */
const byTextIn = (root, sel, txt) => [...(root?.querySelectorAll(sel) ?? [])]
  .find((n) => n.textContent.toLowerCase().includes(txt.toLowerCase()));

console.log('\nThe submitter, with no account\n');

/* --------------------------------------------------------------------------------------- */
{
  asked = [];
  const dom = await open();
  const { document } = dom.window;
  const qa = (s) => [...document.querySelectorAll(s)];
  const text = () => document.querySelector('#app').textContent;

  ok('the header offers no sign-in', !qa('button').some((b) => /sign in/i.test(b.textContent)),
     qa('button').map((b) => b.textContent).filter((x) => /sign in/i.test(x)).join(' | '));
  ok('and no account chip', !document.querySelector('.account-menu'));
  ok('and nothing on the page asks anybody to sign in', !/sign in/i.test(text()),
     (text().match(/.{0,40}sign in.{0,40}/i) ?? [''])[0]);

  document.querySelector('.icon-btn[aria-label="Settings"]').click();
  await settle();
  const pane = (name) => { qa('.set-navrow').find((b) => b.textContent === name).click(); };
  pane('Your answers');
  await settle();
  const said = document.querySelector('.set-pane').textContent;
  ok('the pane that says where the work goes still says so', /Where your answers go/.test(said));
  ok('and names the access code as the way back', /access code is the way back/i.test(said),
     said.slice(0, 120));
  ok('and offers no sign-in of any kind',
     !/sign in/i.test(said) && !qa('.set-pane button').some((b) => /sign in|google/i.test(b.textContent)),
     (said.match(/.{0,40}sign in.{0,40}/i) ?? [''])[0]);
  ok('and does not claim the store only takes work from somebody it knows',
     !/somebody it knows/i.test(said));
}

/* --------------------------------------------------------------------------------------- */
/**
 * An assessment opened with a code, before anybody has answered anything in it.
 *
 * Reported as: when I opened an assessment with a code and then I reloaded, I didn't edit
 * anything there, but I reloaded my browser tab and this assessment is gone. Nothing was gone.
 * One opened with a code arrives with a department, a contact and a summary and no answers at
 * all, and the home page decided what it was holding by counting answers, so it drew Fill it
 * in, said nothing about the assessment in its own storage, and read as a browser that had
 * lost the lot.
 *
 * The questionnaire's own address was right the whole time, which is why this is seeded with no
 * hash: the address somebody types, or opens from a bookmark, is the one that was wrong.
 */
{
  const opened = {
    fileType: 'gc-arch-assessment', id: 'KFRM92TXBQ7H', ref: 'AB12',
    rubric: { id: 'gc-ea-selfassess', version: '1.0', title: 'x' },
    initiative: {
      name: 'Fleet Scheduling', department: 'DFO', contact: 'a@dfo-mpo.gc.ca',
      summary: 'A thing.', classification: 'Unclassified', lifecycleStage: 'beta',
    },
    answers: {},
    meta: { createdAt: 'x', updatedAt: 'x', appVersion: 'test' },
  };
  const dom = await open({ 'gc-arch-assessment:draft': JSON.stringify(opened) });
  const { document } = dom.window;
  const hero = document.querySelector('.hero-actions button');
  const note = document.querySelector('.draft-note');
  ok('an assessment with no answers in it is still one this browser is holding',
     /Continue/.test(hero?.textContent ?? ''), hero?.textContent ?? 'no button');
  ok('and the page says which one it is',
     /Fleet Scheduling/.test(note?.textContent ?? '') && /DFO/.test(note?.textContent ?? ''),
     note?.textContent?.slice(0, 80) ?? 'no note');
  ok('and how much of it is done', /0 of 176 answered/.test(note?.textContent ?? ''),
     note?.textContent?.slice(0, 120) ?? '');
  ok('and it is still in the browser after the page has drawn',
     !!dom.window.localStorage.getItem('gc-arch-assessment:draft'));
}

/* --------------------------------------------------------------------------------------- */
/**
 * The marking is settled on the page that is blocked by it.
 *
 * Reported as: when i clicked save my result without marking the evidence (it simply shouldnt
 * allow me), it sent me here. See my results is the loud button at the foot of the
 * questionnaire and nothing stops it, so an unmarked file arrives at a page carrying a block
 * and, until this, one button that sent somebody back to look for the control.
 */
{
  const unmarked = {
    fileType: 'gc-arch-assessment', id: 'KFRM92TXBQ7H', ref: 'AB12',
    rubric: { id: 'gc-ea-selfassess', version: '1.0', title: 'x' },
    initiative: {
      name: 'Fleet Scheduling', department: 'DFO', contact: 'a@dfo-mpo.gc.ca',
      summary: 'A thing.', lifecycleStage: 'beta',
    },
    answers: { 'B-Q1': { score: 3, evidence: [] } },
    meta: { createdAt: 'x', updatedAt: 'x', appVersion: 'test' },
  };
  const dom = await open({ 'gc-arch-assessment:draft': JSON.stringify(unmarked) }, '#results');
  const { document } = dom.window;
  const blocker = () => document.querySelector('.card.warn.alert');
  ok('an unmarked file is blocked from saving on the results page',
     /cannot save this yet/i.test(blocker()?.textContent ?? ''),
     blocker()?.textContent?.slice(0, 60) ?? 'no blocker');
  const marks = [...(blocker()?.querySelectorAll('.mark-btn') ?? [])];
  ok('and every marking is on the block itself', marks.length === 7,
     marks.map((b) => b.textContent).join(' | ') || 'none');
  ok('and going back is still offered for the problems that live on a question',
     !!byTextIn(blocker(), 'button', 'Go back'));
  marks.find((b) => b.textContent.trim() === 'Unclassified').click();
  await settle();
  ok('marking it there clears the block without leaving the page',
     !blocker() && dom.window.location.hash === '#results',
     `${blocker() ? 'still blocked' : 'clear'} at ${dom.window.location.hash}`);
  ok('and the marking is in the draft this browser keeps',
     JSON.parse(dom.window.localStorage.getItem('gc-arch-assessment:draft')).initiative.classification === 'Unclassified');
}

/* --------------------------------------------------------------------------------------- */
// The two sides are two published pages now, so the submitter's home page has no door to the
// other one. It had a testing door, which was right while there was one page and one build.
{
  const dom = await open();
  const { document } = dom.window;
  ok('the home page has no way across to the assessor view',
     !document.querySelector('.crossover'),
     document.querySelector('.crossover')?.textContent ?? '');
}

/* --------------------------------------------------------------------------------------- */
/**
 * The other half of the split, which is a build input and not a screen.
 *
 * publish-preview.sh puts the two pages at two paths, and the path is the only thing telling
 * them apart on disk. A build that ignored EARB_OUT would overwrite the submitter's page with
 * the assessor's and publish one product twice, which no screen test could see.
 */
{
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, existsSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const out = join(mkdtempSync(join(tmpdir(), 'earb-')), 'deep', 'assessor.html');
  execFileSync(process.execPath, ['build.mjs'], {
    env: { ...process.env, EARB_OUT: out, EARB_ACCESS: 'accounts', EARB_SIDE: 'assess', EARB_FIREBASE: '' },
    stdio: 'ignore',
  });
  ok('the build writes where it is told, making the folder if it has to', existsSync(out), out);

  /**
   * And it opens on the side it was built for.
   *
   * The assessor's address used to open the questionnaire, with a button on it marked "open
   * the assessor view". Somebody sent that address to test the assessor side saw the
   * submitter's home page, the submitter's account badge and the submitter's everything, and
   * had to find a door to get to what they came for.
   */
  const page = new JSDOM(readFileSync(out, 'utf8'), {
    runScripts: 'dangerously', url: 'https://example.gc.ca/tool/assessor/', pretendToBeVisual: true,
    beforeParse(w) { w.scrollTo = () => {}; w.alert = () => {}; w.fetch = async () => ({ ok: true, status: 200, text: async () => '{}' }); },
  });
  await settle();
  const said = page.window.document.querySelector('#app').textContent;
  ok('the assessor page opens on the assessor side', /Sign in/.test(said), said.slice(0, 90));
  ok('and not on the questionnaire', !/Start an assessment|What to expect/.test(said), said.slice(0, 90));
  ok('and offers no way out of it, because there is nothing at this address to go to',
     !/Leave assessor view/.test(said), said.slice(0, 120));

  /**
   * AND IT DOES NOT TOUCH THE SUBMITTER'S DRAFT. SIGNED IN, ON ITS OWN, WITH NO CLICK.
   *
   * Reported twice. The second time: it's the second time already when i opened a tab with an
   * existing submission in the submitter view, and i reloaded the page, and the submission
   * wasn't there anymore, and it opened a new empty one.
   *
   * Both products are one address and therefore one key. This page boots with a blank
   * assessment on purpose, and adoptSignedIn, which runs at the top of every paint, stamped
   * the signed-in address onto that blank and autosaved it. Measured on the built assessor
   * page before the fix: a draft of two answers came back with no initiative, no answers, no
   * reference and the account's address on it.
   *
   * The session is seeded because the write needed somebody to be signed in, which is the
   * state an assessor is in every time they open this page.
   */
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
  /**
   * Built again WITH a store address, because the page above has none.
   *
   * The first version of this check ran against that build and passed on the broken code. With
   * no Firebase config the session in storage is never read, so currentUser() is nobody,
   * adoptSignedIn returns before it reaches the line that writes, and the fixture could not
   * produce the input that breaks. An assessor's own page always has an address compiled into
   * it, which is the state the defect was reported from.
   */
  const hosted = join(mkdtempSync(join(tmpdir(), 'earb-')), 'assessor.html');
  execFileSync(process.execPath, ['build.mjs'], {
    env: {
      ...process.env, EARB_OUT: hosted, EARB_ACCESS: 'accounts', EARB_SIDE: 'assess',
      EARB_FIREBASE: '{"apiKey":"test-key","projectId":"test-project"}',
    },
    stdio: 'ignore',
  });
  const withDraft = new JSDOM(readFileSync(hosted, 'utf8'), {
    runScripts: 'dangerously', url: 'https://example.gc.ca/tool/assessor/', pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.alert = () => {};
      w.localStorage.setItem('gc-arch-assessment:draft', JSON.stringify(hers));
      w.localStorage.setItem('gc-arch-assessment:firebase-session', JSON.stringify({
        email: 'someone@tbs-sct.gc.ca', idToken: 't', refreshToken: 'r', expiresAt: Date.now() + 36e5,
      }));
      w.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' });
    },
  });
  await settle();
  const kept = JSON.parse(withDraft.window.localStorage.getItem('gc-arch-assessment:draft'));
  ok('the assessor page leaves the submitter’s draft exactly as it found it',
     kept.ref === 'AB12' && Object.keys(kept.answers ?? {}).length === 2
     && kept.initiative.name === 'Fleet Scheduling',
     `${kept.initiative?.name || '(no name)'} / ${Object.keys(kept.answers ?? {}).length} answers / ref ${kept.ref}`);
  ok('and puts no address of its own on it', !kept.ownerEmail, kept.ownerEmail ?? '');
  withDraft.window.close();
  page.window.close();
}

/* --------------------------------------------------------------------------------------- */
// A session left behind by an earlier build, which reads back perfectly well.
{
  asked = [];
  const hour = Date.now() + 3600_000;
  const dom = await open({
    'gc-arch-assessment:firebase-session': JSON.stringify({
      email: 'someone@example.gc.ca', idToken: 'TOKEN', refreshToken: 'REFRESH', expiresAt: hour,
    }),
  });
  const { document, localStorage } = dom.window;
  const text = () => document.querySelector('#app').textContent;

  ok('a session left in this browser puts no address on the screen',
     !text().includes('someone@example.gc.ca'),
     (text().match(/.{0,40}someone@.{0,40}/) ?? [''])[0]);
  ok('and no account chip with it', !document.querySelector('.account-menu'));
  const draft = localStorage.getItem('gc-arch-assessment:draft');
  ok('and the owner of an assessment is not filled in from it',
     !draft || !JSON.parse(draft).ownerEmail, String(draft).slice(0, 120));
  ok('and no role is asked for on its behalf',
     !asked.some((u) => /\/roles\//.test(u)), asked.join(' | '));
}

console.log(fails ? `\n${fails} failed\n` : '\nall submitter checks passed\n');
process.exit(fails ? 1 : 0);
