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
async function open(seed = {}) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://example.gc.ca/tool/',
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
