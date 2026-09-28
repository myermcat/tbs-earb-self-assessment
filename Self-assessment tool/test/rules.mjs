/**
 * The store's rules, run against a real Firestore.
 *
 * deploy/firestore.rules is the only access control this tool has. There is no program of ours
 * in the middle: the page talks to the database and Google enforces that file on every request.
 * Until this existed, the file was the one part of the design nothing could check, and a change
 * to it was tested by publishing it over the live store and seeing whether anybody complained.
 *
 * That very nearly cost us the tool. A tightening proposed for the open create path swapped
 * hasAll for hasOnly over a list of five keys. A real record carries seven on its first save,
 * so every submitter would have been refused, silently, by a rule that reads as stricter and
 * is in fact broken. It was caught by reading, which is not a method.
 *
 * This starts Google's own Firestore emulator with that file loaded and talks to it over REST,
 * exactly the way src/firebase.ts talks to the real one, with no account attached. What the
 * emulator allows is what the live store allows.
 *
 *   npm run test:rules
 *
 * It is not in `npm test`, because it needs a JDK at 21 or above and downloads a 60 MB
 * emulator the first time. .github/workflows/rules.yml runs it whenever the rules or this
 * file change, so nothing goes to the console unchecked.
 */
const BASE = 'http://127.0.0.1:8181/v1/projects/demo-earb/databases/(default)/documents';

const str = (v) => ({ stringValue: v });
const num = (v) => ({ integerValue: String(v) });
const map = (o) => ({ mapValue: { fields: o } });
const list = () => ({ arrayValue: { values: [] } });

/**
 * What blankAssessment() in src/storage.ts produces, as it goes out.
 *
 * Seven keys, minus `id`, which src/firebase.ts deletes before sending because the id is the
 * document's own name. This object is the reason the rule cannot ask for exactly five.
 */
const REAL = {
  fileType: str('gc-arch-assessment'),
  formatVersion: num(1),
  rubric: map({ id: str('dan'), version: str('1.0'), title: str('GC EARB') }),
  initiative: map({
    name: str('Thing'), department: str('TBS'), contact: str(''),
    lifecycleStage: str(''), summary: str(''), classification: str(''),
  }),
  answers: map({}),
  meta: map({
    createdAt: str('2026-09-28T00:00:00Z'),
    updatedAt: str('2026-09-28T00:00:00Z'),
    appVersion: str('x'),
  }),
};

async function create(id, fields) {
  const r = await fetch(`${BASE}/assessments?documentId=${id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return r.status;
}


/**
 * A signed-in request, as the emulator understands one.
 *
 * The emulator accepts an unsigned token and reads its claims, which is the only way to test a
 * rule that turns on who somebody is without standing up a real sign-in. What it proves is the
 * rule, not Google's signature checking, and that is the half we write.
 */
function asPerson(email) {
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const token = `${part({ alg: 'none', typ: 'JWT' })}.${part({
    iss: 'https://securetoken.google.com/demo-earb', aud: 'demo-earb',
    sub: email, user_id: email, email, email_verified: true,
    iat: now, exp: now + 3600, auth_time: now, firebase: { sign_in_provider: 'password' },
  })}.`;
  return { authorization: `Bearer ${token}` };
}

async function patch(path, fields, headers = {}) {
  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&');
  const r = await fetch(`${BASE}/${path}?${mask}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ fields }),
  });
  return r.status;
}

async function read(path, headers = {}) {
  const r = await fetch(`${BASE}/${path}`, { headers });
  return r.status;
}

let failed = 0;
/**
 * 'opens' is its own answer and not a loose 'allowed'. A read of a document that is not there
 * comes back not-found, which means the rule let the request through and there was nothing
 * behind it. Counting that as a refusal would hide the one case this file exists to catch.
 */
function check(what, status, want) {
  const ok = want === 'opens' ? (status === 200 || status === 404)
    : (want === 'allowed') === (status === 200);
  const said = status === 200 ? 'allowed'
    : status === 404 ? 'opens, nothing there' : `refused ${status}`;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what} — ${said}`);
  if (!ok) failed++;
}

// The first save of a real assessment, by somebody with no account. This is the line that has
// to hold: the whole point of the design is that filling one in needs no sign-in.
check("the tool's own record, seven keys, no account", await create('ABCDEFGHJKMN', REAL), 'allowed');

// Every field src/types.ts declares, all at once, so the rule's list cannot fall behind the
// interface without this saying so.
check('a record carrying every field src/types.ts declares', await create('PQRSTUVWXYZ2', {
  ...REAL,
  ref: str('ABCD'),
  withdrawnAt: str(''),
  ownerEmail: str('a@b.ca'),
  sharing: map({ people: list(), teammateEmails: list(), assessorEmails: list() }),
  audit: map({}),
}), 'allowed');

// What the tightening is for: this collection used as free storage for something that is not
// an assessment, under a name the tool never writes.
check("an assessment with one extra field of somebody else's", await create('QRSTUVWXYZ23', { ...REAL, payload: str('x'.repeat(200)) }), 'refused');
check('a body that is not an assessment at all', await create('RSTUVWXYZ234', { blob: str('x'.repeat(200)) }), 'refused');

// The checks that were already there, still doing their job.
check('a body missing one of the five parts', await create('STUVWXYZ2345', {
  fileType: REAL.fileType, rubric: REAL.rubric, initiative: REAL.initiative, answers: REAL.answers,
}), 'refused');
check('a name that is not a code this tool mints', await create('nope', REAL), 'refused');
check('the right shape under the wrong fileType', await create('TUVWXYZ23456', { ...REAL, fileType: str('something-else') }), 'refused');


/**
 * The backlog's priorities.
 *
 * The page that shows them is published where anybody can open it, so reading is open on
 * purpose: a reader who had to sign in to see the order would see a different list from
 * everybody else. Changing one needs an account, because otherwise the order of the work is
 * writable by the internet.
 */
const PRIO = { priority: str('high'), setAt: str('2026-09-28T00:00:00Z') };

check('anybody may read a priority, signed in or not',
      await read('backlog/some-item'), 'opens');
check('and may list them, which is how the page loads',
      await read('backlog'), 'allowed');
check('nobody signed out may set one',
      await patch('backlog/some-item', PRIO), 'refused');
check('somebody signed in may',
      await patch('backlog/some-item', PRIO, asPerson('dan@example.com')), 'allowed');
check('and may change it again',
      await patch('backlog/some-item', { priority: str('low'), setAt: str('2026-09-28T01:00:00Z') },
                  asPerson('dan@example.com')), 'allowed');
check('a priority the page does not offer is refused',
      await patch('backlog/other-item', { priority: str('urgent'), setAt: PRIO.setAt },
                  asPerson('dan@example.com')), 'refused');
check('and so is anything else written beside it',
      await patch('backlog/other-item', { ...PRIO, note: str('x') },
                  asPerson('dan@example.com')), 'refused');
check('nothing records who set it, so no address reaches a public page',
      await patch('backlog/other-item', { ...PRIO, setBy: str('dan@example.com') },
                  asPerson('dan@example.com')), 'refused');


/**
 * The audit, as one document per assessor beside the assessment.
 *
 * Three decisions are enforced here rather than by the page being polite, and each of them is a
 * line somebody could otherwise cross with a request written by hand.
 *
 * An assessor writes their own audit and nobody else's, so two of them cannot overwrite each
 * other and EARB sees both readings. The department reads what was said about it, because a
 * score with a reason nobody can read is a score with no appeal. And nothing in this
 * subcollection is reachable by somebody holding only the access code: the code opens the
 * assessment, and an assessor's working notes about a department are not part of it.
 */
{
  // Roles are written by an admin, and there is no admin yet, so the emulator's owner token
  // seeds them. It bypasses the rules, which is what it is for and the only thing it is used
  // for here: every check below runs as an ordinary person.
  const AS_OWNER = { authorization: 'Bearer owner' };
  await patch('roles/asr1@example.com', { role: str('assessor') }, AS_OWNER);
  await patch('roles/asr2@example.com', { role: str('assessor') }, AS_OWNER);
  await patch('assessments/AUDITTEST234', { ...REAL, ownerEmail: str('dept@example.com') }, AS_OWNER);

  const auditOf = (who) => ({
    reviewer: str(who),
    reviewedAt: str('2026-09-28T00:00:00Z'),
    perQuestion: map({}),
  });
  const at = (who) => `assessments/AUDITTEST234/audit/${who}`;

  check('an assessor writes their own audit',
        await patch(at('asr1@example.com'), auditOf('asr1@example.com'), asPerson('asr1@example.com')), 'allowed');
  check('and may come back and change it',
        await patch(at('asr1@example.com'), { ...auditOf('asr1@example.com'), overallNote: str('second look') },
                    asPerson('asr1@example.com')), 'allowed');
  check('a second assessor writes their own, and both stand',
        await patch(at('asr2@example.com'), auditOf('asr2@example.com'), asPerson('asr2@example.com')), 'allowed');
  check('neither can write over the other',
        await patch(at('asr1@example.com'), auditOf('asr1@example.com'), asPerson('asr2@example.com')), 'refused');
  check('nor sign their own document with somebody else\u2019s name',
        await patch(at('asr2@example.com'), auditOf('asr1@example.com'), asPerson('asr2@example.com')), 'refused');
  check('somebody with no role writes no audit at all',
        await patch(at('nobody@example.com'), auditOf('nobody@example.com'), asPerson('nobody@example.com')), 'refused');
  check('and neither does somebody signed out',
        await patch(at('asr1@example.com'), auditOf('asr1@example.com')), 'refused');

  check('an assessor reads the audits on a submission',
        await read('assessments/AUDITTEST234/audit', asPerson('asr1@example.com')), 'allowed');
  check('the department reads what was said about its own assessment',
        await read('assessments/AUDITTEST234/audit', asPerson('dept@example.com')), 'allowed');
  check('a signed-in stranger reads none of it',
        await read('assessments/AUDITTEST234/audit', asPerson('passerby@example.com')), 'refused');
  check('and holding the code opens the assessment and not the audit on it',
        await read('assessments/AUDITTEST234/audit'), 'refused');
  check('the assessment itself still opens on its name alone',
        await read('assessments/AUDITTEST234'), 'opens');
}

console.log(failed ? `\n${failed} rules check(s) failed` : '\nthe create rule holds, the backlog holds, and an audit is one assessor\u2019s own');
process.exit(failed ? 1 : 0);
