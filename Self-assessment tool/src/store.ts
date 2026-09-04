import type { Assessment } from './types';
import { beginWrite, keepDraft, loadDraft, registerAfterSave, writeFailed, writeLanded } from './storage';
import { currentUser, deleteAssessment, getAssessment, isConfigured, listAssessments,
  putAssessment, storeHost } from './firebase';

/**
 * The store, and how to point at one.
 *
 * Everything in this tool is unclassified, so records can live in one place and the dashboard
 * can read them without anybody mailing a file around.
 *
 * The address is a build input, not a code change:
 *
 *   EARB_ENDPOINT=https://earb-store.example.workers.dev npm run build
 *
 * That one value sets both this constant and the page's `connect-src`, so a build with no
 * endpoint genuinely cannot make a request and a build with one can reach that origin and
 * nothing else. `deploy/worker.js` is the other half: paste it into a Cloudflare Worker, bind
 * a KV namespace called STORE, and this works.
 *
 * There is a second answer, built the same way and preferred once sign-in matters:
 *
 *   EARB_FIREBASE='{"apiKey":"...","projectId":"..."}' npm run build
 *
 * That one goes to Cloud Firestore, which can be created in Montreal and which enforces
 * deploy/firestore.rules on every request, so a person reads their own record and an assessor
 * reads the submitted ones. src/firebase.ts holds it. When both are set, Firestore wins,
 * because it is the one that knows who is asking.
 *
 * A build with neither behaves as it always has: this browser and the files opened this
 * session, and no request possible from the page at all.
 */
declare const __EARB_ENDPOINT__: string;
const ENDPOINT: string = typeof __EARB_ENDPOINT__ === 'string' ? __EARB_ENDPOINT__ : '';

export type RecordStatus = 'draft' | 'submitted' | 'audited' | 'withdrawn';
export type StoreSource = 'this-browser' | 'session-files' | 'hosted';

export interface StoredRecord {
  id: string;
  status: RecordStatus;
  source: StoreSource;
  updatedAt: string;
  assessment: Assessment;
}

export function isHosted(): boolean { return isConfigured() || ENDPOINT !== ''; }

/** Where the records are, for a page that has to say so. */
export function endpointHost(): string {
  if (isConfigured()) return storeHost();
  try {
    return ENDPOINT ? new URL(ENDPOINT).host : '';
  } catch {
    return '';
  }
}

/** What the record's own contents say its state is. No status field is stored yet. */
export function statusOf(a: Assessment): RecordStatus {
  if (a.withdrawnAt) return 'withdrawn';
  if (a.audit?.reviewedAt) return 'audited';
  if (a.meta?.submittedAt) return 'submitted';
  return 'draft';
}

function recordOf(a: Assessment, source: StoreSource, id: string): StoredRecord {
  return { id, status: statusOf(a), source, updatedAt: a.meta?.updatedAt ?? '', assessment: a };
}

/**
 * What Firestore will show this person, or null when it has nothing to say and the local
 * sources should answer.
 *
 * Two requests, because the rules give two different rights. An assessor or an admin may list
 * the collection. A submitter may not, and their request comes back 403, so the one record
 * they own is fetched by the id their own copy carries.
 */
async function firestoreRecords(): Promise<StoredRecord[] | null> {
  if (!currentUser()) return null;
  try {
    const rows = await listAssessments();
    return rows.map((a, i) => recordOf(a, 'hosted', a.id ?? `hosted-${i}`));
  } catch {
    /* refused, or offline. A submitter's own record is the next thing to try. */
  }
  const id = loadDraft()?.id;
  if (!id) return null;
  try {
    const mine = await getAssessment(id);
    return mine ? [recordOf(mine, 'hosted', mine.id ?? id)] : null;
  } catch {
    return null;
  }
}

/**
 * What the shared pool has for this person, and when it has nothing, why.
 *
 * The dashboard could get away with a list and a silence, because an empty portfolio and a
 * refused one look the same from a distance. An assessor cannot: being told the pool is empty
 * when the truth is that nobody has granted you a role sends you looking for the submission
 * instead of asking for access. So the reasons are separate values and the screen says which.
 */
export type PoolAnswer =
  | { state: 'off' }
  | { state: 'anonymous' }
  | { state: 'ok'; records: StoredRecord[] }
  | { state: 'refused'; problem: string }
  | { state: 'failed'; problem: string };

export async function poolRecords(): Promise<PoolAnswer> {
  if (!isConfigured()) return { state: 'off' };
  if (!currentUser()) return { state: 'anonymous' };
  try {
    const rows = await listAssessments();
    return { state: 'ok', records: rows.map((a, i) => recordOf(a, 'hosted', a.id ?? `hosted-${i}`)) };
  } catch (err) {
    const problem = (err as Error).message;
    // Firestore says 403 both for a missing role and for a rule that does not match. From here
    // they are the same thing and the same sentence answers both: ask an admin.
    if (/403|permission/i.test(problem)) return { state: 'refused', problem };
    return { state: 'failed', problem };
  }
}

/**
 * Every record the dashboard can currently see: the draft in this browser, plus anything the
 * assessor opened this session. With a hosted store this becomes one request and the two local
 * sources become a fallback for working offline.
 */
export async function listRecords(sessionFiles: Assessment[] = []): Promise<StoredRecord[]> {
  const out: StoredRecord[] = [];
  if (isConfigured()) {
    const rows = await firestoreRecords();
    if (rows) return rows;
  } else if (ENDPOINT) {
    try {
      const res = await fetch(`${ENDPOINT}/assessments`, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`store answered ${res.status}`);
      const rows = (await res.json()) as Assessment[];
      return rows.map((a, i) => recordOf(a, 'hosted', a.id ?? `hosted-${i}`));
    } catch {
      // Fall through to what is local. A dashboard that shows nothing is worse than one that
      // shows this browser and says that is all it can reach.
    }
  }
  const draft = loadDraft();
  if (draft) out.push(recordOf(draft, 'this-browser', 'draft-in-this-browser'));
  sessionFiles.forEach((a, i) => out.push(recordOf(a, 'session-files', `file-${i}`)));
  return out;
}

/**
 * Why a write did not go through, in the words the save badge shows.
 *
 * A browser that knows it is offline gets the plain version. Everything else carries the
 * reason, because "check your connection" to somebody whose connection is fine wastes the one
 * chance the page has to say what happened.
 */
function notSaved(err: unknown): string {
  return typeof navigator !== 'undefined' && navigator.onLine === false
    ? 'Not saved. Check your connection.'
    : `Not saved: ${(err as Error).message}`;
}

/**
 * Send one assessment to the store.
 *
 * The three save states are driven from here, so the badge in the header tells the truth
 * whether the write worked, is in flight, or failed with a reason.
 *
 * Firestore names the record, and the id comes back onto the assessment this browser holds so
 * a later change goes to the same document and `goneFromStore` has something to match on.
 */
export async function putRecord(a: Assessment): Promise<{ ok: true } | { ok: false; problem: string }> {
  if (isConfigured()) {
    if (!currentUser()) {
      // Returning quietly here is what made the submit button look like it worked. The badge
      // has a state for this, so use it: the person pressed something and deserves an answer.
      const problem = 'Sign in before saving to the shared store.';
      beginWrite();
      writeFailed(problem);
      return { ok: false, problem };
    }
    beginWrite();
    try {
      a.id = await putAssessment(a);
      // Only the browser's own draft goes back into storage. This is also the way a record
      // opened from a file is written, and that one must never replace somebody's draft, so
      // the reference code decides: it is made once and never changes.
      if (a.ref && loadDraft()?.ref === a.ref) keepDraft(a);
      writeLanded();
      return { ok: true };
    } catch (err) {
      const problem = notSaved(err);
      writeFailed(problem);
      return { ok: false, problem };
    }
  }

  if (!ENDPOINT) return { ok: false, problem: 'This build has no store to write to.' };
  beginWrite();
  try {
    const res = await fetch(`${ENDPOINT}/assessments`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(a),
    });
    if (!res.ok) throw new Error(`the store answered ${res.status}`);
    writeLanded();
    return { ok: true };
  } catch (err) {
    const problem = notSaved(err);
    writeFailed(problem);
    return { ok: false, problem };
  }
}

/**
 * Remove one record from the store. Admin only, and Firestore enforces that whatever this
 * page believes.
 *
 * The seam for the dashboard's delete, which asks the admin to type the initiative name out
 * before it calls anything. Without a Firestore build there is nowhere to delete from, and
 * saying so beats a button that appears to work.
 */
export async function deleteRecord(id: string): Promise<{ ok: true } | { ok: false; problem: string }> {
  if (!isConfigured()) return { ok: false, problem: 'This build has no shared store to delete from.' };
  try {
    await deleteAssessment(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, problem: `Not deleted: ${(err as Error).message}` };
  }
}

/** Where the numbers on screen came from, in the words the page uses. */
export function sourceLine(records: StoredRecord[]): string {
  if (isHosted()) return `${records.length} records from the hosted store`;
  const here = records.filter((r) => r.source === 'this-browser').length;
  const files = records.filter((r) => r.source === 'session-files').length;
  const parts: string[] = [];
  if (here) parts.push(`${here} draft in this browser`);
  if (files) parts.push(`${files} file${files === 1 ? '' : 's'} opened this session`);
  return parts.length ? parts.join(' and ') : 'nothing to show yet';
}

/**
 * Whether a submission this browser is holding has gone from the store.
 *
 * An admin can delete a record, and the person who filled it in still has their own copy in
 * this browser. Coming back to it and finding it quietly out of step with the store is the
 * worst version of that; being told, with two ways forward, is the least bad.
 *
 * Untested against a real store, because there is not one yet. It is written now so the
 * behaviour is decided rather than improvised on the day.
 */
export function goneFromStore(records: StoredRecord[], local: Assessment): boolean {
  if (!isHosted()) return false;
  if (!local.meta?.submittedAt) return false;          // never went, so nothing to miss
  if (!local.ref && !local.id) return false;
  return !records.some((r) => (
    (local.id && r.assessment.id === local.id) || (local.ref && r.assessment.ref === local.ref)
  ));
}

/**
 * Once an assessment has been submitted, later changes go to the store on their own.
 *
 * Before the first submit nothing leaves the browser, which is the whole point of submitting
 * being one deliberate act. After it, a person who edits an answer expects their assessor to
 * see the edit, and asking them to press something again for every keystroke is not a design.
 *
 * Debounced, because typing a justification is thirty keystrokes and a key-value store counts
 * every write. The wait is generous for that reason.
 */
const WRITE_THROUGH_WAIT = 4000;
let pending: ReturnType<typeof setTimeout> | null = null;

registerAfterSave((a: Assessment) => {
  if (!isHosted()) return;
  if (!a.meta?.submittedAt) {
    // A submit that did not go through removes the stamp and saves again. Any write already
    // scheduled belongs to the attempt that failed, so it goes with it.
    if (pending) { clearTimeout(pending); pending = null; }
    return;
  }
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    void putRecord(a);
  }, WRITE_THROUGH_WAIT);
});
