import type { Rubric } from './types';
import { storeKey } from './keys';

/**
 * The question sets this browser knows about.
 *
 * Loading a new set used to replace the old one and forget it existed. Sets are versions of an
 * instrument, so they accumulate: one is in use, the others stay, and any of them can be
 * picked again. The set that ships in the build is always present and cannot be deleted.
 */

const LIB_KEY = storeKey('rubric-library');
const CUR_KEY = storeKey('rubric-current');
const HIDDEN_KEY = storeKey('rubric-hidden');

/**
 * The set compiled into the page. It is a set like any other on screen: it can be previewed,
 * made active, and removed. Removing it hides it, because it lives in the build rather than in
 * storage, and that is a detail nobody filling in an assessment should have to know.
 */
export const BUNDLED_ID = 'set-0';

export interface LibraryEntry {
  id: string;
  rubric: Rubric;
  addedAt: string;
  addedBy?: string;
  bundled?: true;
}

interface Stored { id: string; rubric: Rubric; addedAt: string; addedBy?: string }

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

function hidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === 'yes';
  } catch {
    return false;
  }
}

/** Every set, the one from the build first unless it was removed, then whatever was added. */
export function libraryList(builtin: Rubric): LibraryEntry[] {
  const stored = read().map((x) => ({ id: x.id, rubric: x.rubric, addedAt: x.addedAt, addedBy: x.addedBy }));
  const bundled: LibraryEntry = { id: BUNDLED_ID, rubric: builtin, addedAt: '', bundled: true };
  // Hiding it only counts while something else is there to answer.
  return hidden() && stored.length ? stored : [bundled, ...stored];
}

/** Nothing can be removed while it is the only set: the tool has no questions without one. */
export function canRemove(builtin: Rubric, id: string): boolean {
  const list = libraryList(builtin);
  return list.length > 1 && list.some((x) => x.id === id) && currentId() !== id;
}

export function currentId(): string {
  try {
    return localStorage.getItem(CUR_KEY) || BUNDLED_ID;
  } catch {
    return BUNDLED_ID;
  }
}

export function setCurrentId(id: string): void {
  try {
    localStorage.setItem(CUR_KEY, id);
  } catch {
    /* the choice holds for this visit */
  }
}

/** The set in use. Falls back to the one in the build if the stored choice has gone. */
export function currentRubric(builtin: Rubric): Rubric {
  const id = currentId();
  if (id === BUNDLED_ID) return builtin;
  return read().find((x) => x.id === id)?.rubric ?? builtin;
}

/**
 * Adds a set and returns its id. Two sets can carry the same title and version, so the id is
 * generated from the counter rather than from the content: replacing a set of the same version
 * is a deliberate delete, never a silent overwrite.
 */
export function addToLibrary(
  r: Rubric,
  at: string,
  by?: string,
): { ok: true; id: string } | { ok: false; problem: string } {
  const list = read();
  let n = list.length + 1;
  while (list.some((x) => x.id === `set-${n}`)) n++;
  const id = `set-${n}`;
  const res = write([...list, { id, rubric: r, addedAt: at, addedBy: by }]);
  return res.ok ? { ok: true, id } : res;
}

export function removeFromLibrary(id: string): void {
  if (id === BUNDLED_ID) {
    // It cannot be deleted out of storage, because it is not in storage. It stays out of the
    // list instead, which is the same thing from the outside.
    try { localStorage.setItem(HIDDEN_KEY, 'yes'); } catch { /* holds for this visit */ }
    return;
  }
  write(read().filter((x) => x.id !== id));
}

export function entryOf(builtin: Rubric, id: string): LibraryEntry | undefined {
  return libraryList(builtin).find((x) => x.id === id);
}

/**
 * The set a submission was answered against, if this browser holds it.
 *
 * An assessment records its set by id and version rather than by library slot, so this matches
 * on that pair. Two sets can carry the same pair, in which case the first is used and there is
 * nothing in the file to tell them apart: worth knowing, and the reason the ingest warning
 * says which set it scored with.
 */
/**
 * A VERSION STRING INSIDE SAVED WORK IS A KEY, AND RENAMING A KEY ORPHANS EVERYTHING UNDER IT.
 *
 * The set was called 1.0-dan until 19 October, when it was renamed to 1.0 because the first
 * half of it is a colleague's name and it was printing on every screen he was about to be
 * shown. The rename was right. What it did not account for is that every assessment already
 * saved carries the version it was answered against, inside the record, and the matching below
 * is an exact string comparison.
 *
 * So on the morning after, every submission in the live store said NOT COMPARABLE, on every
 * row of the assessor's list, because none of them could find the set they were answered
 * against any more. The questions had not changed by a word. Reported with a screenshot of ten
 * rows all carrying the badge.
 *
 * These two names are one set, and saying so here is cheaper and safer than rewriting twenty
 * departments' records to agree with us. It is also the honest statement: nothing about the
 * questions changed, only what we call them.
 *
 * ANYTHING ADDED HERE IS PERMANENT. A record saved under an old name is out of our hands, so
 * the row it needs can never be removed, and the way to avoid adding another is to not rename
 * a version again. Change the questions and give the new set a new version; change the name
 * and you are here.
 */
const ALSO_KNOWN_AS: Record<string, string> = {
  '1.0-dan': '1.0',
};

export function rubricFor(
  builtin: Rubric,
  want: { id: string; version: string },
): Rubric | undefined {
  const wanted = ALSO_KNOWN_AS[want.version] ?? want.version;
  return libraryList(builtin)
    .find((x) => x.rubric.id === want.id
                 && (ALSO_KNOWN_AS[x.rubric.version] ?? x.rubric.version) === wanted)?.rubric;
}
