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
import { listRecords, putRecord, deleteRecord, endpointHost, flushWrites, isHosted } from '../src/store';
import { currentUser, roleOf } from '../src/firebase';
import { autosave, saveStatus } from '../src/storage';
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

// Nobody signed in.
const first = await putRecord(a);
ok('a write with nobody signed in is refused', first.ok === false && first.problem.startsWith('Sign in'), JSON.stringify(first));
ok('and nothing went to the network', sent.length === 0, String(sent.length));

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
ok('to the assessments collection with a minted id',
   /firestore\.googleapis\.com\/v1\/projects\/placeholder-project\/databases\/\(default\)\/documents\/assessments\/[A-Za-z0-9]{20}$/.test(req.url), req.url);
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
ok('the id came back onto the assessment this browser holds', typeof a.id === 'string' && a.id.length === 20, String(a.id));

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
  await flushWrites();
  ok('an unmarked assessment is never written to the store', writes().length === 0,
     JSON.stringify(writes().map((w) => w.url)));
  ok('and the badge says the work is here only', saveStatus().state === 'local', saveStatus().state);
}

// The same record, once it carries a marking.
{
  quiet();
  const marked: Assessment = JSON.parse(JSON.stringify(a));
  delete marked.id;
  delete marked.ownerEmail;
  autosave(marked);
  await flushWrites();
  ok('a marked assessment goes without anybody pressing anything', writes().length === 1,
     String(writes().length));
  ok('and the record is owned by whoever is signed in', marked.ownerEmail === 'someone@example.gc.ca',
     String(marked.ownerEmail));
  const first = String(marked.id ?? '');
  ok('and it carries the id it was written under', first.length > 0, first);

  // Two saves close together are one record, not two documents.
  quiet();
  marked.initiative.summary = 'changed';
  autosave(marked);
  marked.initiative.summary = 'changed again';
  autosave(marked);
  await flushWrites();
  ok('two changes in a moment make one write', writes().length === 1, String(writes().length));
  ok('to the document that already exists', writes()[0]?.url.includes(first), writes()[0]?.url);

  // Nothing changed means nothing to send.
  quiet();
  autosave(marked);
  await flushWrites();
  ok('a save that changes nothing writes nothing', writes().length === 0, String(writes().length));
}

// Somebody else's file stays theirs.
{
  quiet();
  const theirs: Assessment = JSON.parse(JSON.stringify(a));
  theirs.ownerEmail = 'someone.else@example.gc.ca';
  theirs.id = 'THEIRS';
  autosave(theirs);
  await flushWrites();
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
  autosave(mine);
  await flushWrites();
  ok('signed out, nothing reaches the store', writes().length === 0, String(writes().length));
  ok('and the badge says so', saveStatus().state === 'local', saveStatus().state);
}
await wait(0);

console.log(fails === 0 ? '\nall wiring checks passed' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
