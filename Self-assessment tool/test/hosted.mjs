/**
 * The build that gets published, driven signed in.
 *
 * Every other suite builds with no store, so `isConfigured()` is false and none of the hosted
 * branches ever run. That is how a page that went blank the moment anybody signed in reached
 * the live site with 556 green assertions behind it. This suite builds with a placeholder
 * project, seeds a session in storage the way a real sign-in does, answers Firestore from a
 * stub, and asserts the screens a signed-in person actually meets.
 *
 * Nothing here touches the network: fetch is replaced before the bundle runs, and every call
 * it does not recognise fails the suite rather than escaping.
 */
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

let fails = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) { fails++; console.log(`  FAIL  ${name} ${extra}`); } else console.log(`  ok    ${name}`);
};

const html = await readFile('dist/index.html', 'utf8');
const rubric = JSON.parse(await readFile('rubric/rubric.v1-dan.json', 'utf8'));

const SESSION = 'gc-arch-assessment:firebase-session';
const SIDE = 'gc-arch-assessment:side';
const ME = 'assessor@tbs-sct.gc.ca';

/** One submission, in the shape Firestore hands back. Enough of it to score and to name. */
function submission(ref, name) {
  return {
    fileType: 'gc-arch-assessment',
    ref,
    id: `doc-${ref}`,
    rubric: { id: rubric.id, version: rubric.version },
    initiative: { name, department: 'Fisheries and Oceans Canada', contact: 'someone@dfo-mpo.gc.ca' },
    answers: {},
    meta: { submittedAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' },
  };
}

/** Firestore's own encoding, so the page's decoder is exercised rather than bypassed. */
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(toValue) } : {} };
  const fields = {};
  for (const [k, val] of Object.entries(v)) fields[k] = toValue(val);
  return { mapValue: Object.keys(fields).length ? { fields } : {} };
}
const asDoc = (a) => ({ name: `projects/p/databases/(default)/documents/assessments/${a.id}`, fields: toValue(a).mapValue.fields });

/**
 * One page, booted with whatever storage and whatever store answer a case needs.
 * `listAnswer` decides what the assessments list does: a page of documents, or a refusal.
 */
async function boot({ session = null, side = null, listAnswer = { documents: [] }, role = null, hash = '', url = null } = {}) {
  const seen = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: url ?? `https://example.gc.ca/tool/${hash}`,
    pretendToBeVisual: true,
    beforeParse(w) {
      // A file:// origin is opaque, so jsdom throws on any storage access. That is the same
      // thing a browser does in a locked-down private window, and the tool has to survive it.
      try {
        if (session) w.localStorage.setItem(SESSION, JSON.stringify(session));
        if (side) w.localStorage.setItem(SIDE, side);
      } catch { /* no storage on this origin */ }
      w.scrollTo = () => {};
      w.alert = () => {};
      w.print = () => {};
      w.fetch = async (url, init) => {
        const href = String(url);
        seen.push({ href, method: init?.method ?? 'GET' });
        const roles = href.includes('/roles/');
        const body = roles
          ? (role ? { fields: { role: { stringValue: role } } } : { error: { code: 404 } })
          : href.includes('/assessments')
            ? (listAnswer.error
                ? { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Missing or insufficient permissions.' } }
                : listAnswer)
            : {};
        const status = roles
          ? (role ? 200 : 404)
          : href.includes('/assessments') && listAnswer.error ? 403 : 200;
        // jsdom's window has no Response, so the shape the page reads is supplied directly.
        return {
          ok: status >= 200 && status < 300,
          status,
          headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
          json: async () => body,
          text: async () => JSON.stringify(body),
        };
      };
    },
  });
  // Two turns: one for the boot paint, one for the pool answer and the repaint it asks for.
  await new Promise((r) => setTimeout(r, 120));
  return { dom, doc: dom.window.document, seen };
}

const live = { email: ME, idToken: 'seeded', refreshToken: 'seeded-refresh', expiresAt: Date.now() + 3600e3 };
// The bundle is an inline script inside <body>, so body.textContent carries every string
// literal in the program. Read what was rendered instead.
const body = (doc) => (doc.querySelector('#app')?.textContent ?? '').replace(/\s+/g, ' ').trim();

console.log('\nThe published build, signed in\n');

/* --------------------------------------------------------------------------------------- */
{
  // The defect that shipped: a session existed, the gate did not know it, and paint() called
  // itself until the stack gave out. The page was blank and stayed blank on every reload.
  const { doc, dom } = await boot({ session: live, side: 'assess', role: 'assessor' });
  const app = doc.querySelector('#app');
  ok('a signed-in assessor gets a page at all', app.children.length > 0, `children=${app.children.length}`);
  ok('and it is not the sign-in screen', !/Continue with Google/.test(body(doc)));
  ok('the header carries the address', body(doc).includes(ME));
  ok('and does not call a checked account unverified', !/unverified/i.test(body(doc)));
  dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  // The second defect: the screen only ever showed files dragged onto it, so a submission
  // sitting in the store was reported as an empty pool.
  const rows = [submission('AB12', 'Licensing Renewal'), submission('CD34', 'Fleet Scheduling')];
  const { doc, dom, seen } = await boot({
    session: live, side: 'assess', role: 'assessor', listAnswer: { documents: rows.map(asDoc) },
  });
  ok('the assessor screen asks the store', seen.some((r) => r.href.includes('/assessments')));
  ok('and lists what came back', body(doc).includes('Licensing Renewal'), body(doc).slice(0, 160));
  ok('both of them', body(doc).includes('Fleet Scheduling'));
  ok('and stops saying the pool is empty', !/Nothing assigned to you yet/.test(body(doc)));
  dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  // A refusal is not an empty pool. Being told the pool is empty when the truth is that
  // nobody has granted a role sends an assessor looking for the submission instead of asking
  // for access, and the store answers 403 for exactly that case.
  const { doc, dom } = await boot({ session: live, side: 'assess', role: 'assessor', listAnswer: { error: true } });
  const t = body(doc);
  ok('a refusal says the account cannot read the pool', /cannot read the pool/i.test(t), t.slice(0, 200));
  ok('and quotes what the store said', /insufficient permissions/i.test(t));
  ok('and does not claim the pool is empty', !/Nothing assigned to you yet/.test(t));
  dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  // Nothing used to read the role, so every account was offered the admin screen and the
  // delete button, and Firestore did the refusing after the click.
  const { doc, dom, seen } = await boot({ session: live, side: 'assess' });
  ok('the role is asked for', seen.some((r) => r.href.includes('/roles/')));
  ok('and a submitter is not offered the admin tab',
     !/Admin/.test(body(doc)), body(doc).slice(0, 140));
  dom.window.close();
}

{
  const { doc, dom } = await boot({ session: live, side: 'assess', role: 'admin' });
  ok('an admin is', /Admin/.test(body(doc)), body(doc).slice(0, 140));
  dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  // Signing in and being allowed in are two different things. An address nobody has added used
  // to reach the assessor screen and be told the pool was empty, which reads as a lost
  // submission rather than a missing role.
  const { doc, dom, seen } = await boot({ session: live, side: 'assess' });
  const t = body(doc);
  ok('an address nobody has added is told so', /does not have access/i.test(t), t.slice(0, 160));
  ok('and is given the address to send to an admin', t.includes(ME));
  ok('and a way back to the home page', /Go to the home page/.test(t));
  ok('and a way to try another account', /different account/i.test(t));
  ok('and the cat is on it', !!doc.querySelector('.no-access .pool-art svg'));
  ok('and it does not ask the store for a list it cannot have',
     !seen.some((r) => /assessments\?/.test(r.href)), JSON.stringify(seen).slice(0, 160));
  dom.window.close();
}

{
  // An assessor is not an admin, and the admin view can delete things.
  const { doc, dom } = await boot({ session: live, side: 'assess', role: 'assessor', hash: '#assessor/admin' });
  ok('an assessor asking for the admin view is turned back', /admin view is for admins/i.test(body(doc)),
     body(doc).slice(0, 160));
  dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  // Signed out, the same build has to draw the real sign-in and reach nothing at all.
  const { doc, dom, seen } = await boot({ side: 'assess' });
  ok('signed out, the sign-in card draws', /Continue with Google/.test(body(doc)));
  ok('and nothing is fetched before somebody signs in', seen.length === 0, JSON.stringify(seen).slice(0, 200));
  dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  // The same configured build, opened from a file. There is no address for a provider to
  // return to, so the button used to be offered and then do nothing at all, because the
  // refusal went into a promise nobody was reading.
  // Storage is unavailable on this origin, so the address is what puts us on the assessor side.
  const { doc, dom } = await boot({ url: 'file:///Users/someone/dist/index.html#assessor' });
  const t = body(doc);
  // The first wording said "This copy was opened from a file", which reads as a claim about the
  // assessment and names nothing, so there was nothing to act on. It states what it observed.
  ok('the screen says sign-in needs a web address', /needs a web address/i.test(t), t.slice(0, 220));
  ok('and names the address it was loaded from', /file:\/\/\//.test(t));
  ok('and points at the published one', /myermcat\.github\.io/.test(t));
  const google = [...doc.querySelectorAll('.signin-providers button')]
    .find((b) => /Continue with Google/.test(b.textContent));
  ok('and the Google button is dead rather than silent', google?.disabled === true);
  dom.window.close();
}

{
  // Microsoft is on the screen and is not built. It has to read as unfinished before it is
  // pressed, which means disabled and labelled.
  const { doc, dom } = await boot({ side: 'assess' });
  const ms = [...doc.querySelectorAll('.signin-providers button')]
    .find((b) => /Microsoft/.test(b.textContent));
  ok('the Microsoft button is disabled', ms?.disabled === true);
  // A badge beside it was noise. Unclickable, and the whole story on hover.
  ok('and says on hover that it is a mockup', /Mockup/.test(ms?.getAttribute('title') ?? ''),
     ms?.getAttribute('title') ?? '');
  ok('and what it would take to build', /Azure rights/.test(ms?.getAttribute('title') ?? ''));
  ok('and carries no badge beside it', !doc.querySelector('.signin-providers .badge-mockup'));
  ok('and the sign-in card no longer calls itself a prototype',
     !/Prototype/.test(doc.querySelector('.signin')?.textContent ?? ''));
  dom.window.close();
}

{
  // The sign-in screen is not the place for a save badge, an offer to sign in, or a breadcrumb
  // to submissions. None of those are questions this person has been allowed to ask yet.
  const { doc, dom } = await boot({ side: 'assess' });
  const right = doc.querySelector('.topbar-right');
  const kinds = [...right.children].map((n) => n.className.split(' ')[0]);
  ok('the sign-in header carries no save badge', !kinds.includes('save-state'), kinds.join(','));
  ok('and no breadcrumb', !kinds.includes('path'), kinds.join(','));
  ok('and the language link is still there', kinds.includes('lang-link'), kinds.join(','));
  dom.window.close();
}

{
  // Signed in, the language link comes before the account menu.
  const { doc, dom } = await boot({ session: live, side: 'assess', role: 'admin' });
  const kinds = [...doc.querySelector('.topbar-right').children].map((n) => n.className.split(' ')[0]);
  ok('the language link is to the left of the account menu',
     kinds.indexOf('lang-link') < kinds.indexOf('set-menu'), kinds.join(','));
  dom.window.close();
}

/* --------------------------------------------------------------------------------------- */
{
  // A submitter is not an assessor, and the home page has to work signed in or out.
  const { doc, dom } = await boot({ session: live });
  ok('the submitter home page renders for a signed-in person', /Assess your own architecture/.test(body(doc)));
  dom.window.close();
}

console.log(fails ? `\n${fails} hosted check(s) failed\n` : '\nall hosted checks passed\n');
process.exit(fails ? 1 : 0);
