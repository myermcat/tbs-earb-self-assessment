/**
 * The lock on question ids.
 *
 * A question id is a CSV column name. Two exports taken a year apart are compared on those
 * names, so an id that comes to mean a different question makes two spreadsheets look
 * comparable when they are not. Nothing on any screen shows it, which is why it is checked at
 * import time and why that check has to hold.
 *
 * Until 1 October nothing in this suite read the lock at all, and the check did not hold: a
 * changed meaning printed a warning, the import carried on, and the same run rewrote the lock
 * at the end, so the drift went into the record and the second run was silent.
 *
 *   node test/rubric-lock.mjs
 *
 * The importer itself cannot be run here. It reads Dan's spreadsheets, which live outside this
 * repository on purpose, so there is nothing for it to read on a build machine. The comparison
 * and the write are their own module for exactly that reason, and this drives them directly.
 */
import { readFile, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareIds, describeDrift, gist, saveLock } from '../tools/rubric-lock.mjs';

let fails = 0;
function ok(what, cond, detail = '') {
  if (!cond) fails++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${what}${cond || !detail ? '' : ` ${detail}`}`);
}

console.log('\nThe lock on question ids\n');

const WAS = {
  'B-Q1': 'How thoroughly has the current state of this solution been documented',
  'B-Q2': 'What entities are currently produced by this solution',
  'B-Q3': 'Have all roles and responsibilities been defined',
};

/* ---------- what counts as a change ------------------------------------------------------ */
{
  // The record is the first 70 characters with whitespace flattened, so a reflow is not a
  // change of meaning and nobody has to approve a line break.
  ok('a question reflowed over two lines is the same question',
     gist('How thoroughly has\n  the current state   been documented')
     === gist('How thoroughly has the current state been documented'));
  ok('and trailing space is not a change', gist('Something  ') === gist('Something'));
  // 70 characters, because a person reading a refusal has to see what moved.
  ok('a long question is recorded by its opening, not its whole text',
     gist('x'.repeat(200)).length === 70, String(gist('x'.repeat(200)).length));
}

/* ---------- the comparison --------------------------------------------------------------- */
{
  const now = { ...WAS, 'B-Q2': 'What entities are currently CONSUMED by this solution' };
  const v = compareIds(WAS, now);
  ok('an id pointed at a different question is drift',
     v.drifted.length === 1 && v.drifted[0].id === 'B-Q2', JSON.stringify(v.drifted));
  ok('and the refusal carries both readings, so it can be judged without opening the workbook',
     /was: .*produced/.test(describeDrift(v.drifted, 'x.json'))
     && /now: .*CONSUMED/.test(describeDrift(v.drifted, 'x.json')));
  ok('and names the id in the line somebody would paste to approve it',
     /EARB_IDS_APPROVED=B-Q2/.test(describeDrift(v.drifted, 'x.json')),
     describeDrift(v.drifted, 'x.json').split('\n').slice(-6).join(' | '));
}
{
  const v = compareIds(WAS, { ...WAS, 'B-Q4': 'Something nobody has been asked before' });
  ok('a new id is free', v.drifted.length === 0 && v.added.join() === 'B-Q4', JSON.stringify(v.added));
}
{
  /**
   * A removed question is said out loud and allowed. Dan is about to remove several: he found
   * on 26 September that he had asked the same thing twice in two sections. Refusing that would
   * make the lock stop him editing his own instrument, which is not what it is for.
   */
  const gone = { ...WAS };
  delete gone['B-Q3'];
  const v = compareIds(WAS, gone);
  ok('a removed question is noted and not refused',
     v.drifted.length === 0 && v.gone.join() === 'B-Q3', JSON.stringify(v));
}
{
  const now = {
    ...WAS,
    'B-Q2': 'What entities are currently CONSUMED by this solution',
    'B-Q3': 'Have all roles, responsibilities AND ESCALATION PATHS been defined',
  };
  const v = compareIds(WAS, now, new Set(['B-Q2']));
  // Approval is by name, so approving one change cannot wave through a second one that arrived
  // in the same workbook. A flag would have let both through on one person's say-so about one.
  ok('approving one id approves exactly that id',
     v.waved.length === 1 && v.waved[0].id === 'B-Q2'
     && v.drifted.length === 1 && v.drifted[0].id === 'B-Q3', JSON.stringify(v));
  ok('and an approved change is not drift', compareIds(WAS, { ...WAS, 'B-Q2': 'other' }, ['B-Q2']).drifted.length === 0);
}

/* ---------- the write, which is the half that failed ------------------------------------- */
{
  const dir = await mkdtemp(join(tmpdir(), 'earb-lock-'));
  const path = join(dir, 'rubric-ids.lock.json');
  await writeFile(path, JSON.stringify(WAS, null, 2) + '\n');
  const onDisk = async () => JSON.parse(await readFile(path, 'utf8'));

  const drifting = { ...WAS, 'B-Q2': 'What entities are currently CONSUMED by this solution' };
  let threw = null;
  try { await saveLock(path, drifting, compareIds(WAS, drifting)); } catch (e) { threw = e; }
  /**
   * This is the defect, in one assertion. The old run warned, carried on, and then wrote this
   * file, so the drift became the new record and every run after it was silent.
   */
  ok('a lock recording an unapproved change cannot be written', !!threw, String(threw).slice(0, 80));
  ok('and says why, rather than failing as a write error',
     /changed meaning/.test(String(threw ?? '')), String(threw ?? '').slice(0, 120));
  ok('and the record on disk is exactly what it was',
     (await onDisk())['B-Q2'] === WAS['B-Q2'], (await onDisk())['B-Q2']);

  const approvedNow = { ...WAS, 'B-Q2': 'What entities are currently CONSUMED by this solution' };
  await saveLock(path, approvedNow, compareIds(WAS, approvedNow, ['B-Q2']));
  ok('an approved change is written, so the next run is quiet about it',
     (await onDisk())['B-Q2'] === approvedNow['B-Q2'], (await onDisk())['B-Q2']);

  const added = { ...approvedNow, 'B-Q9': 'A question nobody has asked before' };
  await saveLock(path, added, compareIds(approvedNow, added));
  ok('and an ordinary run with new questions writes as it always did',
     Object.keys(await onDisk()).length === 4);
  await rm(dir, { recursive: true, force: true });
}

/* ---------- the lock that is actually in the repository ---------------------------------- */
{
  /**
   * The shipped rubric against the shipped lock. Nothing compared these before, so an id could
   * have drifted at any point between runs of the importer and nothing here would have known.
   */
  const lock = JSON.parse(await readFile('rubric/rubric-ids.lock.json', 'utf8'));
  const rubric = JSON.parse(await readFile('rubric/rubric.v1-dan.json', 'utf8'));
  const live = {};
  for (const d of rubric.domains) for (const s of d.sections) for (const q of s.questions) live[q.id] = gist(q.text);

  const v = compareIds(lock, live);
  ok('every id in the shipped rubric still means what the lock says it means',
     v.drifted.length === 0,
     v.drifted.map((d) => `${d.id}: "${d.was}" -> "${d.now}"`).join(' | ').slice(0, 300));
  ok('and the lock covers the whole set, with nothing recorded that is no longer asked',
     v.gone.length === 0 && v.added.length === 0,
     `gone ${v.gone.join(',') || 'none'} / added ${v.added.join(',') || 'none'}`);
  ok('and that is all 176 of them', Object.keys(live).length === 176, String(Object.keys(live).length));
}

console.log(fails ? `\n${fails} lock check(s) failed\n` : '\nthe lock holds and cannot be written over drift\n');
process.exit(fails ? 1 : 0);
