/**
 * The lock on question ids, and the reason it exists.
 *
 * A question id is a CSV column name. Every export a department has ever taken out of this tool
 * carries those names, and the whole point of exporting is that two exports can be compared. So
 * an id that quietly comes to mean a different question does not break anything visibly: it
 * makes two spreadsheets look comparable when they are not, which is worse than a crash and is
 * invisible for as long as nobody looks.
 *
 * rubric/rubric-ids.lock.json records what each id meant last time. This file compares.
 *
 * WHAT WAS WRONG WITH IT UNTIL 1 OCTOBER. A changed meaning printed a warning and the import
 * carried on, while a mistyped category name a few lines later stopped the run outright. Then
 * the same run rewrote the lock at the end, so the drift was absorbed into the record and the
 * second run said nothing at all. One warning, scrolled past once, and the evidence was gone.
 *
 * So saveLock() below refuses to write over drift. Not as a message but as a refusal: even with
 * the import's own exit taken out, a lock recording a meaning that was never approved cannot be
 * written by this program.
 */
import { writeFile } from 'node:fs/promises';

/**
 * What is recorded per id, and therefore what counts as a change.
 *
 * The first seventy characters with runs of whitespace flattened. Not the whole question,
 * because a wording tidy is not a change of meaning and nobody should have to approve a comma;
 * not a hash, because a person reading a refusal has to be able to see what moved.
 */
export const gist = (t) => String(t).replace(/\s+/g, ' ').trim().slice(0, 70);

/**
 * Three answers, and only one of them is a problem.
 *
 *   drifted  an id that exists in both and points at a different question. This is the one.
 *   gone     an id that has been removed. Old exports have a column with nothing behind it,
 *            which is worth saying, but removing a question is a thing Dan is allowed to do —
 *            he is about to, to cut the duplicates he found on 26 September.
 *   added    new ids, which are free.
 *
 * `approved` is the escape hatch: ids whose meaning has been changed on purpose. It is a list
 * of ids and not a flag, so approving one change cannot wave through another one that arrived
 * in the same run.
 */
export function compareIds(previous, current, approved = new Set()) {
  const ok = approved instanceof Set ? approved : new Set(approved ?? []);
  const drifted = [];
  const gone = [];
  const waved = [];
  for (const [id, was] of Object.entries(previous ?? {})) {
    if (!(id in current)) { gone.push(id); continue; }
    if (current[id] === was) continue;
    (ok.has(id) ? waved : drifted).push({ id, was, now: current[id] });
  }
  const added = Object.keys(current).filter((id) => !(id in (previous ?? {})));
  return { drifted, gone, added, waved };
}

/** The refusal, in words somebody can act on without reading this file. */
export function describeDrift(drifted, lockPath) {
  const lines = [`Refusing to import. ${drifted.length} question id(s) now mean something different:`, ''];
  for (const d of drifted) {
    lines.push(`  ${d.id}`, `    was: "${d.was}"`, `    now: "${d.now}"`, '');
  }
  lines.push(
    'An id is a column name in every CSV already exported, so repointing one makes old exports',
    'and new ones look comparable when they are not.',
    '',
    'Three ways forward, in the order they are usually right:',
    '  1. Give the changed question a new id and leave the old one alone.',
    '  2. If the meaning really was meant to change, say so by name:',
    `       EARB_IDS_APPROVED=${drifted.map((d) => d.id).join(',')} node tools/import-rubric.mjs`,
    `  3. Delete ${lockPath} to start the record again. This throws away every id's history,`,
    '     so it is the right move only when the whole set has been replaced.',
  );
  return lines.join('\n');
}

/**
 * Write the lock, or refuse.
 *
 * The refusal is here rather than only at the call site on purpose. The defect this replaces
 * was not a missing message, it was a run that warned and then recorded the drift anyway, and a
 * message is removable in a way a throw is not.
 */
export async function saveLock(path, current, verdict) {
  if (verdict.drifted.length) {
    throw new Error(
      `Refusing to rewrite ${path}: ${verdict.drifted.length} id(s) changed meaning and were not approved `
      + `(${verdict.drifted.map((d) => d.id).join(', ')}). Recording them would absorb the drift and the next run would be silent.`,
    );
  }
  await writeFile(path, JSON.stringify(current, null, 2) + '\n');
}
