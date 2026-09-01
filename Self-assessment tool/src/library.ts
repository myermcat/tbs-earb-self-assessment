import type { Rubric } from './types';

/**
 * The question sets this browser knows about.
 *
 * Loading a new set used to replace the old one and forget it existed. Sets are versions of an
 * instrument, so they accumulate: one is in use, the others stay, and any of them can be
 * picked again. The set that ships in the build is always present and cannot be deleted.
 */

const LIB_KEY = 'gc-arch-assessment:rubric-library';
const CUR_KEY = 'gc-arch-assessment:rubric-current';
export const BUILTIN_ID = 'built-in';

export interface LibraryEntry {
  id: string;
  rubric: Rubric;
  addedAt: string;
  builtIn?: true;
}

interface Stored { id: string; rubric: Rubric; addedAt: string }

function read(): Stored[] {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    const list = raw ? (JSON.parse(raw) as Stored[]) : [];
    return Array.isArray(list) ? list.filter((x) => x && x.id && x.rubric) : [];
  } catch {
    return [];
  }
}

function write(list: Stored[]): { ok: true } | { ok: false; problem: string } {
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(list));
    return { ok: true };
  } catch {
    // A question set is around 80 KB and the browser gives a few megabytes, so this means the
    // store is full or turned off. Saying so beats a set that vanishes on reload.
    return { ok: false, problem: 'This browser would not store another question set. Its storage is full or turned off.' };
  }
}

/** Every set, the built-in one first, then whatever was added, newest last. */
export function libraryList(builtin: Rubric): LibraryEntry[] {
  return [
    { id: BUILTIN_ID, rubric: builtin, addedAt: '', builtIn: true },
    ...read().map((x) => ({ id: x.id, rubric: x.rubric, addedAt: x.addedAt })),
  ];
}

export function currentId(): string {
  try {
    return localStorage.getItem(CUR_KEY) || BUILTIN_ID;
  } catch {
    return BUILTIN_ID;
  }
}

export function setCurrentId(id: string): void {
  try {
    localStorage.setItem(CUR_KEY, id);
  } catch {
    /* the choice holds for this visit */
  }
}

/** The set in use. Falls back to the built-in one if the stored choice is gone. */
export function currentRubric(builtin: Rubric): Rubric {
  const id = currentId();
  if (id === BUILTIN_ID) return builtin;
  return read().find((x) => x.id === id)?.rubric ?? builtin;
}

/**
 * Adds a set and returns its id. Two sets can carry the same title and version, so the id is
 * generated from the counter rather than from the content: replacing a set of the same version
 * is a deliberate delete, never a silent overwrite.
 */
export function addToLibrary(r: Rubric, at: string): { ok: true; id: string } | { ok: false; problem: string } {
  const list = read();
  let n = list.length + 1;
  while (list.some((x) => x.id === `set-${n}`)) n++;
  const id = `set-${n}`;
  const res = write([...list, { id, rubric: r, addedAt: at }]);
  return res.ok ? { ok: true, id } : res;
}

export function removeFromLibrary(id: string): void {
  if (id === BUILTIN_ID) return;                 // it lives in the build, not in storage
  write(read().filter((x) => x.id !== id));
}

export function entryOf(builtin: Rubric, id: string): LibraryEntry | undefined {
  return libraryList(builtin).find((x) => x.id === id);
}
