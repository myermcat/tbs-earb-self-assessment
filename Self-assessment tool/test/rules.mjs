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

let failed = 0;
function check(what, status, want) {
  const ok = (want === 'allowed') === (status === 200);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what} — ${status === 200 ? 'allowed' : `refused ${status}`}`);
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

console.log(failed ? `\n${failed} rules check(s) failed` : '\nthe create rule holds');
process.exit(failed ? 1 : 0);
