import type { Assessment, SavedBy } from './types';
import type { Signer } from './signer';

/**
 * How many saves the trail keeps. A save replaces the document, so this is the only version
 * history the tool has, and it rides inside the document, which has a size.
 */
const SAVES_KEPT = 20;

/**
 * Which saves survive when the trail is full.
 *
 * A save replaces the document, so this trail is the only history the tool has, and it rides
 * inside the document, which has a size. When it overflows, the ordinary saves in the middle
 * go first and the named moments stay: the save where the assessment first existed at TBS, and
 * every time it was handed to an assessor or taken back. Those are the ones somebody asks about
 * afterwards. Dropping them to keep twenty of somebody's Tuesday afternoon would be the wrong
 * twenty.
 */
/** What the assessment scored when it went, so a trail reads as a trend and not as a list. */
function snapshot(a: Assessment): { score: number | null; answered: number } {
  try {
    const v = validate(BUILTIN);
    if (!v.ok) return { score: null, answered: 0 };
    const r = score(v.rubric, a);
    return { score: r.overall, answered: r.answered };
  } catch {
    // A record answered against a question set this build does not hold. The trail is still
    // worth keeping without a number on it.
    return { score: null, answered: 0 };
  }
}

function keepTrail(all: SavedBy[]): SavedBy[] {
  if (all.length <= SAVES_KEPT) return all;
  const named = all.filter((x) => x.moment && x.moment !== 'save');
  const plain = all.filter((x) => !x.moment || x.moment === 'save');
  const room = Math.max(0, SAVES_KEPT - named.length);
  const kept = new Set([...named, ...plain.slice(-room)]);
  return all.filter((x) => kept.has(x));
}
import { beginWrite, keepDraft, hasWork, loadDraft, localOnly, registerAfterSave, writeFailed, writeLanded, writeBehind,
  writeOffline, } from './storage';
import { markingProblems } from './marking';
import { score } from './scoring';
import { validate } from './rubric';
import BUILTIN from '../rubric/rubric.v1-dan.json';
import { currentUser, deleteAssessment, getAssessment, isConfigured, listAssessments,
  putAssessment, storeHost } from './firebase';
import { hasAccounts } from './who';

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
  // With accounts, nobody signed in can reach anything and the local sources answer. On the
  // code build the second request below stands on its own, and returning null here is what
  // left `warnGoneFromStore` comparing the draft against itself: a submission an admin had
  // deleted went on looking online to the person who sent it.
  if (hasAccounts() && !currentUser()) return null;
  if (currentUser()) {
    try {
      const rows = await listAssessments();
      return rows.map((a, i) => recordOf(a, 'hosted', a.id ?? `hosted-${i}`));
    } catch {
      /* refused, or offline. A submitter's own record is the next thing to try. */
    }
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
function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Why a write did not go through, in the words the badge shows.
 *
 * Two of these read as a broken tool unless they are named. A store that has spent its daily
 * allowance is silent about it and the allowance belongs to everybody, so one person's
 * afternoon can stop another's. A record carrying an old attachment is refused for its size on
 * every keystroke, which looks like the tool having stopped working.
 */
function notSaved(err: unknown): string {
  if (offline()) return 'Not saved. Check your connection.';
  const why = (err as Error).message;
  if (/RESOURCE_EXHAUSTED|quota/i.test(why)) {
    return 'The shared store has had all the writes it is allowed today. Your work is kept in this browser. Save a file.';
  }
  if (/INVALID_ARGUMENT/i.test(why) && /byte|size|large/i.test(why)) {
    return 'This assessment is too big for the store, because a file is attached to it. Remove the attachment, or keep working from a file.';
  }
  return `Not saved: ${why}`;
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
    if (hasAccounts() && !currentUser()) {
      // Returning quietly here is what made the submit button look like it worked. The badge
      // has a state for this, so use it: the person pressed something and deserves an answer.
      //
      // On the code build there is nothing to sign in to. The rules grant create and update on
      // the document's name, so refusing here would be this page turning down a write Google
      // would have taken, which is what made an access code mean nothing on its own.
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
      if (offline()) writeOffline(); else writeFailed(problem);
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
    if (offline()) writeOffline(); else writeFailed(problem);
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
/**
 * Quiet time before a write, and the shortest gap the store will be asked to accept two.
 *
 * The settle is what turns thirty keystrokes into one write. The floor is what stops a
 * determined typist from spending the whole project's daily allowance on their own afternoon:
 * the free plan gives twenty thousand writes a day for everybody, and a settle on its own
 * permits nine hundred an hour from one person.
 */
/**
 * What this record is, ignoring the clock and ignoring its own bookkeeping.
 *
 * autosave restamps meta.updatedAt on every call, so comparing whole documents would find two
 * the same never. onlineVersion is this function's own output and cannot be part of its input.
 */
function fingerprint(a: Assessment): string {
  const { meta, ...rest } = a;
  const { updatedAt: _when, onlineVersion: _v, ...restMeta } = meta ?? ({} as Assessment['meta']);
  return JSON.stringify({ ...rest, meta: restMeta });
}

/**
 * Turn the record's own state into what the badge says, without writing anything.
 *
 * Called on every local save and once at boot. The boot call is the fix for a badge that
 * showed nothing at all on a reloaded page: the state used to live only in this module, so a
 * fresh tab holding an assessment saved online last week reported neither.
 */
export function showWhereItStands(a: Assessment): void {
  // A page with nothing on it says nothing. Announcing "saved on this computer" over a blank
  // questionnaire is a claim ahead of the fact, which is what the badge used to do.
  if (!savedOnline(a) && !hasWork(a)) return;
  if (!savedOnline(a)) { localOnly(); return; }
  if (onlineIsCurrent(a)) { writeLanded(); return; }
  writeBehind();
}

/**
 * Put this assessment in the store, because somebody asked.
 *
 * THE MODEL, because it has been both ways and the reason matters.
 *
 * Saving online is one deliberate act each time, like saving a document. It was written the
 * other way first: the first press turned on a write-through that sent every later keystroke
 * three seconds after typing stopped. That is what a document editor does, and it is the wrong
 * shape here for three reasons. An assessment is read by an assessor, so the version in the
 * store is a thing the submitter is publishing and not a backup. A 41 KB document leaving on
 * every pause spends a shared free-tier allowance that is metered monthly and does not reset
 * overnight. And consent given once for a whole afternoon is not consent anybody remembers
 * giving.
 *
 * So the button is the only writer, and the badge says when the store is behind.
 */
export async function saveOnlineNow(
  a: Assessment,
  who?: Signer,
  moment: SavedBy['moment'] = 'save',
): Promise<{ ok: true } | { ok: false; problem: string }> {
  if (!isHosted()) return { ok: false, problem: 'This build has no store to write to.' };
  /**
   * Nothing here asks for an account any more.
   *
   * The store's rules grant the write on the code, which is the document's name, and the page
   * refusing what the store would allow is what made the code mean nothing for anybody without
   * an account. An account still buys more than a code does, and the request carries the token
   * when there is one.
   */
  const gate = markingProblems(a);
  if (gate.length) return { ok: false, problem: gate[0].message };
  /**
   * Who is saving, written onto the record before it goes rather than after, because it is part
   * of the version and not a note about it. Unverified, always, and every screen showing it
   * says so.
   */
  if (who) {
    const stamp: SavedBy = {
      name: who.name, email: who.email, at: new Date().toISOString(), unverified: true,
      moment: savedOnline(a) ? moment : 'first',
      ...snapshot(a),
    };
    a.meta.savedBy = stamp;
    a.meta.saves = keepTrail([...(a.meta.saves ?? []), stamp]);
  }
  const res = await putRecord(a);
  if (res.ok) {
    a.meta.savedOnlineAt = new Date().toISOString();
    // Fingerprinted after the write and not before it, because the write is where the record
    // learns its own id and its owner. Taken first, the print was of a document that never
    // existed, and every record read back said the store was behind it.
    a.meta.onlineVersion = fingerprint(a);
    delete a.meta.onlineDeclined;
    keepDraft(a);
    writeLanded();
  }
  // A refusal leaves every one of those alone, so the badge keeps saying the store is behind,
  // which it is.
  return res;
}

/** Whether this record is in the store at all, which is one deliberate act away from false. */
export function savedOnline(a: Assessment): boolean { return !!a.meta?.savedOnlineAt; }

/**
 * Whether the copy in the store is the copy on screen.
 *
 * The fingerprint of what went last is kept in the record, so this answers the same on a
 * reloaded page as it does on the page that did the saving. It used to be module state, which
 * meant a reload reported every record as current whether it was or not, and the guard in
 * front of anything that replaces your work said nothing would be lost when something would.
 */
export function onlineIsCurrent(a: Assessment): boolean {
  if (!savedOnline(a)) return false;
  return a.meta?.onlineVersion === fingerprint(a);
}

/**
 * What a local save means now that it sends nothing.
 *
 * It moves the badge and nothing else. The store learns about this assessment when somebody
 * presses the button, and not before.
 */
registerAfterSave((a: Assessment) => { showWhereItStands(a); });
