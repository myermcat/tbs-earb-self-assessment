/**
 * The Firestore seam, driven against a stubbed Google.
 *
 * This cannot go in test/smoke.ts, because a Firestore build is made by two build-time defines
 * and smoke.ts is bundled without them. So the runner beside this file supplies a placeholder
 * project and bundles this against it.
 *
 * What it is here to catch: the request that goes out. A mapping that round-trips through its
 * own reader can still be sending a body Firestore refuses, addressing the wrong document, or
 * leaving the bearer token off. It also holds the two rights the rules give: an assessor lists
 * the collection, and a submitter whose list is refused reads the one record they own.
 */
import { listRecords, putRecord, deleteRecord, endpointHost, isHosted, onlineIsCurrent,
  saveOnlineNow } from '../src/store';
import { currentUser, roleOf } from '../src/firebase';
import { autosave, saveStatus } from '../src/storage';
import { mode } from '../src/who';
import type { Assessment } from '../src/types';

const mem = new Map<string, string>();
const store = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
} as unknown as Storage;
globalThis.localStorage = store;
globalThis.sessionStorage = store;

const sent: { url: string; init: RequestInit }[] = [];
let reply: { status: number; body: unknown } = { status: 200, body: {} };
globalThis.fetch = ((url: string, init: RequestInit = {}) => {
  sent.push({ url: String(url), init });
  return Promise.resolve({
    status: reply.status,
    ok: reply.status < 400,
    text: () => Promise.resolve(JSON.stringify(reply.body)),
  } as Response);
}) as typeof fetch;

let fails = 0;
const ok = (name: string, cond: boolean, extra = '') => {
  if (!cond) { fails++; console.log(`  FAIL  ${name} ${extra}`); } else console.log(`  ok    ${name}`);
};

ok('a Firestore build reports itself hosted', isHosted());
ok('and names the host', endpointHost() === 'firestore.googleapis.com', endpointHost());

const a: Assessment = {
  fileType: 'gc-arch-assessment', formatVersion: 1, ref: 'QK7M',
  rubric: { id: 'r', version: '1', title: 't' },
  initiative: { name: 'X', department: 'TC', contact: 'a@b.c', lifecycleStage: 'beta', summary: 's', classification: 'Unclassified' },
  answers: { q1: { score: null, na: true }, q2: { score: 7, evidence: [] } },
  meta: { createdAt: 'x', updatedAt: 'x', appVersion: 'test' },
};

/**
 * Nobody signed in, which is where the two builds part company.
 *
 * With accounts the browser refuses before the request goes. That guard is there because a
 * submit button that returned quietly looked to the person like it had worked. On codes the
 * rules grant create and update on the document's name, so the same refusal would be the
 * browser turning down a write the store would have taken, and an access code would mean
 * nothing to anybody without an account.
 */
if (mode() === 'accounts') {
  const first = await putRecord(a);
  ok('a write with nobody signed in is refused', first.ok === false && first.problem.startsWith('Sign in'), JSON.stringify(first));
  ok('and nothing went to the network', sent.length === 0, String(sent.length));
} else {
  reply = { status: 200, body: { name: 'projects/p/databases/(default)/documents/assessments/ABC', fields: {} } };
  const first = await putRecord(a);
  ok('a write with nobody signed in is sent', first.ok === true, JSON.stringify(first));
  ok('and one request went out', sent.length === 1, String(sent.length));
  ok('carrying no bearer token, because there is nobody to name',
     (sent[0].init.headers as Record<string, string>).authorization === undefined,
     JSON.stringify(sent[0].init.headers));
  const anon = JSON.parse(String(sent[0].init.body)) as { fields: Record<string, unknown> };
  ok('and no ownerEmail on the record', anon.fields.ownerEmail === undefined, JSON.stringify(anon.fields.ownerEmail));
  // Everything below this point is written for a signed-in browser. The id minted by the write
  // above would make its first write look like a second one.
  sent.length = 0;
  a.id = undefined;
  reply = { status: 200, body: {} };
}

// Sign somebody in by hand, with an hour left on the token.
mem.set('gc-arch-assessment:firebase-session', JSON.stringify({
  email: 'someone@example.gc.ca', idToken: 'TOKEN', refreshToken: 'REFRESH',
  expiresAt: Date.now() + 3600_000,
}));
ok('currentUser reads the session', currentUser()?.email === 'someone@example.gc.ca');

reply = { status: 200, body: { name: 'projects/p/databases/(default)/documents/assessments/ABC', fields: {} } };
const wrote = await putRecord(a);
ok('the write is accepted', wrote.ok === true, JSON.stringify(wrote));
ok('the save state ended online', saveStatus().state === 'online', saveStatus().state);
ok('one request went out', sent.length === 1, String(sent.length));
const req = sent[0];
ok('it was a PATCH', req.init.method === 'PATCH', String(req.init.method));
// Twelve characters from the read-aloud alphabet, because the id is also the access code
// somebody reads down a phone. I, O, 0 and 1 are not in it.
ok('to the assessments collection with a minted id',
   /documents\/assessments\/[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/.test(req.url), req.url);
ok('with no updateMask, so the whole document is replaced', !req.url.includes('updateMask'));
const headers = req.init.headers as Record<string, string>;
ok('carrying the bearer token', headers.authorization === 'Bearer TOKEN', JSON.stringify(headers));
const body = JSON.parse(String(req.init.body)) as { fields: Record<string, unknown> };
ok('the body is wrapped fields', !!body.fields);
ok('ownerEmail was filled in from the signed-in address',
   JSON.stringify(body.fields.ownerEmail) === '{"stringValue":"someone@example.gc.ca"}', JSON.stringify(body.fields.ownerEmail));
ok('the id is left out of the fields, because the path carries it', body.fields.id === undefined);
ok('a null score went as nullValue',
   JSON.stringify(body.fields.answers).includes('"nullValue":null'), JSON.stringify(body.fields.answers));
ok('the id came back onto the assessment this browser holds', typeof a.id === 'string' && a.id.length === 12, String(a.id));

// The name the store gave the record has to survive a reload, or the next write makes a
// second document for the same assessment.
mem.set('gc-arch-assessment:draft', JSON.stringify({ ...a, id: undefined }));
sent.length = 0;
await putRecord(a);
ok('the id is written back into the draft this browser holds',
   JSON.parse(String(mem.get('gc-arch-assessment:draft'))).id === a.id,
   String(mem.get('gc-arch-assessment:draft')).slice(0, 80));

// A record opened from a file goes up the same way, and must not overwrite anybody's draft.
mem.set('gc-arch-assessment:draft', JSON.stringify({ ...a, ref: 'ZZZZ', id: 'SOMEBODY-ELSE' }));
await putRecord({ ...a, ref: 'QK7M' });
ok('a record from a file leaves the draft alone',
   JSON.parse(String(mem.get('gc-arch-assessment:draft'))).ref === 'ZZZZ');

// A second write goes to the same document.
sent.length = 0;
await putRecord(a);
ok('a later write goes to the same document', sent[0].url.endsWith(`/assessments/${a.id}`), sent[0].url);

// A refusal drives the failed state with the reason Google gave.
sent.length = 0;
reply = { status: 403, body: { error: { message: 'PERMISSION_DENIED' } } };
const denied = await putRecord(a);
ok('a refused write is reported', denied.ok === false && denied.problem.includes('PERMISSION_DENIED'), JSON.stringify(denied));
ok('and the save state ended failed', saveStatus().state === 'failed', saveStatus().state);

// Listing, as an assessor.
sent.length = 0;
reply = { status: 200, body: { documents: [
  { name: 'projects/p/databases/(default)/documents/assessments/ABC',
    fields: { fileType: { stringValue: 'gc-arch-assessment' }, ref: { stringValue: 'QK7M' },
              answers: { mapValue: {} }, meta: { mapValue: { fields: { updatedAt: { stringValue: 'z' } } } } } },
  { name: 'projects/p/databases/(default)/documents/assessments/JUNK', fields: { hello: { stringValue: 'world' } } },
] } };
const rows = await listRecords();
ok('the list came from Firestore', rows.length === 1 && rows[0].source === 'hosted', JSON.stringify(rows.map((r) => r.source)));
ok('the id comes off the document path', rows[0].id === 'ABC', rows[0].id);
ok('a document that is not an assessment is skipped', rows.length === 1, String(rows.length));

// Listing refused for a submitter, so their own record is fetched by id.
sent.length = 0;
mem.set('gc-arch-assessment:draft', JSON.stringify({ fileType: 'gc-arch-assessment', id: 'MINE', answers: {}, meta: {} }));
let n = 0;
globalThis.fetch = ((url: string, init: RequestInit = {}) => {
  sent.push({ url: String(url), init });
  n++;
  const body = n === 1
    ? { error: { message: 'PERMISSION_DENIED' } }
    : { name: 'projects/p/databases/(default)/documents/assessments/MINE',
        fields: { fileType: { stringValue: 'gc-arch-assessment' }, meta: { mapValue: {} } } };
  return Promise.resolve({ status: n === 1 ? 403 : 200, ok: n !== 1, text: () => Promise.resolve(JSON.stringify(body)) } as Response);
}) as typeof fetch;
const own = await listRecords();
ok('a submitter falls back to the one record they own', own.length === 1 && own[0].id === 'MINE', JSON.stringify(own.map((r) => r.id)));
ok('which took two requests', sent.length === 2, String(sent.length));

// Roles.
globalThis.fetch = ((url: string) => Promise.resolve({
  status: 200, ok: true,
  text: () => Promise.resolve(JSON.stringify({ fields: { role: { stringValue: 'admin' } } })),
} as Response)) as typeof fetch;
ok('a role is read from roles/{email}', (await roleOf('someone@example.gc.ca')) === 'admin');
globalThis.fetch = (() => Promise.resolve({ status: 404, ok: false, text: () => Promise.resolve('{}') } as Response)) as typeof fetch;
ok('no roles document means submitter', (await roleOf('nobody@example.gc.ca')) === 'submitter');

// Delete.
sent.length = 0;
globalThis.fetch = ((url: string, init: RequestInit = {}) => {
  sent.push({ url: String(url), init });
  return Promise.resolve({ status: 200, ok: true, text: () => Promise.resolve('{}') } as Response);
}) as typeof fetch;
const gone = await deleteRecord('ABC');
ok('a delete goes out as DELETE', gone.ok === true && sent[0].init.method === 'DELETE', JSON.stringify(gone));

// An expired token is refreshed before the request.
sent.length = 0;
mem.set('gc-arch-assessment:firebase-session', JSON.stringify({
  email: 'someone@example.gc.ca', idToken: 'OLD', refreshToken: 'REFRESH', expiresAt: Date.now() - 1000,
}));
globalThis.fetch = ((url: string, init: RequestInit = {}) => {
  sent.push({ url: String(url), init });
  const body = String(url).includes('securetoken')
    ? { id_token: 'NEW', refresh_token: 'REFRESH2', expires_in: '3600' }
    : { name: 'projects/p/databases/(default)/documents/assessments/ABC', fields: {} };
  return Promise.resolve({ status: 200, ok: true, text: () => Promise.resolve(JSON.stringify(body)) } as Response);
}) as typeof fetch;
await putRecord(a);
ok('an expired token is exchanged first', sent[0].url.startsWith('https://securetoken.googleapis.com/v1/token?key='), sent[0].url);
ok('and the new one is used on the write',
   (sent[1].init.headers as Record<string, string>).authorization === 'Bearer NEW',
   JSON.stringify(sent[1].init.headers));
ok('and the new token is kept', currentUser()?.idToken === 'NEW');

/* -------------------------------------------------------------------------------------------
   Continuous saving. Signed in means the work is at TBS, so the guards on that write are the
   thing standing between an unmarked assessment and the internet. None of this was tested
   before it existed, which is how the gate that was supposed to stop it got to be untested too.
   ------------------------------------------------------------------------------------------- */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const writes = () => sent.filter((x) => x.init.method === 'PATCH');

function quiet(): void {
  sent.length = 0;
  globalThis.fetch = ((url: string, init: RequestInit = {}) => {
    sent.push({ url: String(url), init });
    return Promise.resolve({
      status: 200, ok: true,
      text: () => Promise.resolve(JSON.stringify({
        name: 'projects/p/databases/(default)/documents/assessments/ABC', fields: {},
      })),
    } as Response);
  }) as typeof fetch;
}

mem.set('gc-arch-assessment:firebase-session', JSON.stringify({
  email: 'someone@example.gc.ca', idToken: 'T', refreshToken: 'R', expiresAt: Date.now() + 3600e3,
}));

// The classification gate. Until somebody says how their evidence is marked, nothing goes.
{
  quiet();
  const unmarked: Assessment = JSON.parse(JSON.stringify(a));
  unmarked.initiative.classification = '';
  delete unmarked.id;
  delete unmarked.ownerEmail;
  autosave(unmarked);
  await wait(0);
  ok('an unmarked assessment is never written to the store', writes().length === 0,
     JSON.stringify(writes().map((w) => w.url)));
  ok('and the badge says the work is here only', saveStatus().state === 'local', saveStatus().state);
}

/**
 * A marked assessment goes nowhere until somebody says so, and it goes nowhere afterwards
 * either.
 *
 * This is the shape of the whole feature and it has been both ways. The first version sent
 * every keystroke once the button had been pressed, which is what a document editor does. It
 * is wrong here: the copy in the store is what an assessor reads, so it is a thing somebody
 * publishes, and consent given once for a whole afternoon is not consent anybody remembers
 * giving. These cases hold the button to being the only writer.
 */
{
  quiet();
  const marked: Assessment = JSON.parse(JSON.stringify(a));
  delete marked.id;
  delete marked.ownerEmail;
  delete marked.meta.savedOnlineAt;
  autosave(marked);
  await wait(0);
  ok('a marked assessment waits to be asked', writes().length === 0, String(writes().length));

  // The one deliberate act.
  quiet();
  const first = await saveOnlineNow(marked);
  ok('saving online sends it', first.ok === true && writes().length === 1, JSON.stringify(first));
  ok('and records when it went', typeof marked.meta.savedOnlineAt === 'string');
  ok('and the record is owned by whoever is signed in', marked.ownerEmail === 'someone@example.gc.ca',
     String(marked.ownerEmail));
  const id = String(marked.id ?? '');
  ok('and it carries the id it was written under', id.length > 0, id);
  ok('and the store now holds what is on screen', onlineIsCurrent(marked));
  ok('which the badge says', saveStatus().state === 'online', saveStatus().state);

  // The reversal. An edit after the save stays here, and says so.
  quiet();
  marked.initiative.summary = 'changed';
  autosave(marked);
  marked.initiative.summary = 'changed again';
  autosave(marked);
  await wait(0);
  ok('an edit after the save sends nothing', writes().length === 0, String(writes().length));
  ok('and the store is now behind this copy', !onlineIsCurrent(marked));
  ok('and the badge says that in one word', saveStatus().state === 'behind', saveStatus().state);

  // Pressing it again is what catches the store up.
  quiet();
  const second = await saveOnlineNow(marked);
  ok('pressing it again sends the new version', second.ok === true && writes().length === 1,
     JSON.stringify(second));
  ok('to the document that already exists', writes()[0]?.url.includes(id), writes()[0]?.url);
  ok('and the store is current again', onlineIsCurrent(marked));

  /**
   * Undoing an edit back to what was sent leaves nothing to send. The fingerprint ignores the
   * clock, so a repaint that restamps updatedAt cannot make a record look changed.
   */
  quiet();
  marked.initiative.summary = 'changed again';
  autosave(marked);
  ok('a record edited back to what the store holds is current again', onlineIsCurrent(marked));

  // Turning it on is refused while the marking question is unanswered.
  quiet();
  const unmarked2: Assessment = JSON.parse(JSON.stringify(a));
  unmarked2.initiative.classification = '';
  delete unmarked2.id;
  delete unmarked2.meta.savedOnlineAt;
  const refused = await saveOnlineNow(unmarked2);
  ok('saving online is refused until the marking is answered', refused.ok === false, JSON.stringify(refused));
  ok('and nothing went', writes().length === 0, String(writes().length));
  ok('and it was not recorded as saved', unmarked2.meta.savedOnlineAt === undefined);
}

/**
 * A reloaded page knows where it stands.
 *
 * What the store holds is written into the record, so it survives the tab. It used to live in
 * module state, so a fresh tab reported every record as current whether it was or not, and the
 * badge showed nothing at all until somebody typed.
 */
{
  quiet();
  const saved: Assessment = JSON.parse(JSON.stringify(a));
  delete saved.id;
  delete saved.ownerEmail;
  delete saved.meta.savedOnlineAt;
  await saveOnlineNow(saved);
  const reloaded: Assessment = JSON.parse(JSON.stringify(saved));
  ok('a record read back from storage knows the store holds it', onlineIsCurrent(reloaded));
  reloaded.initiative.summary = 'edited in another tab';
  ok('and knows when the store is behind it', !onlineIsCurrent(reloaded));
}

// Somebody else's file stays theirs.
{
  quiet();
  const theirs: Assessment = JSON.parse(JSON.stringify(a));
  theirs.ownerEmail = 'someone.else@example.gc.ca';
  theirs.id = 'THEIRS';
  theirs.meta.savedOnlineAt = '2026-09-01T00:00:00.000Z';
  autosave(theirs);
  await wait(0);
  ok('a file owned by somebody else is never written to your account', writes().length === 0,
     JSON.stringify(writes().map((w) => w.url)));
}

// Signed out, there is nothing to write with.
{
  quiet();
  mem.delete('gc-arch-assessment:firebase-session');
  const mine: Assessment = JSON.parse(JSON.stringify(a));
  delete mine.id;
  delete mine.ownerEmail;
  mine.meta.savedOnlineAt = '2026-09-01T00:00:00.000Z';
  autosave(mine);
  await wait(0);
  ok('signed out, nothing reaches the store', writes().length === 0, String(writes().length));
  // The record says it was saved online in some earlier session and this copy has moved on
  // since, which is true whether or not anybody is signed in now. Signing in is what the
  // badge's tooltip is for; the badge itself reports where the work is.
  ok('and the badge says the store is behind this copy', saveStatus().state === 'behind', saveStatus().state);
}
await wait(0);

// A session that has run out and cannot be refreshed is nobody. This used to answer with
// whatever was in storage, so a page believed somebody was signed in while every request they
// made came back refused.
{
  mem.set('gc-arch-assessment:firebase-session', JSON.stringify({
    email: 'gone@example.gc.ca', idToken: 'STALE', refreshToken: '', expiresAt: Date.now() - 1000,
  }));
  ok('an expired session with no way back is nobody', currentUser() === null,
     JSON.stringify(currentUser()));
  mem.set('gc-arch-assessment:firebase-session', JSON.stringify({
    email: 'ok@example.gc.ca', idToken: 'STALE', refreshToken: 'R', expiresAt: Date.now() - 1000,
  }));
  ok('and an expired one that can be refreshed is still somebody', currentUser()?.email === 'ok@example.gc.ca');
}

console.log(fails === 0 ? '\nall wiring checks passed' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
