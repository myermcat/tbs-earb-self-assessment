import type { Assessment } from './types';
import { beginWrite, loadDraft, writeFailed, writeLanded } from './storage';

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

export function isHosted(): boolean { return ENDPOINT !== ''; }

/** Where the records are, for a page that has to say so. */
export function endpointHost(): string {
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
 * Every record the dashboard can currently see: the draft in this browser, plus anything the
 * assessor opened this session. With a hosted store this becomes one request and the two local
 * sources become a fallback for working offline.
 */
export async function listRecords(sessionFiles: Assessment[] = []): Promise<StoredRecord[]> {
  const out: StoredRecord[] = [];
  if (ENDPOINT) {
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
 * Send one assessment to the store.
 *
 * The three save states are driven from here, so the badge in the header tells the truth
 * whether the write worked, is in flight, or failed with a reason.
 */
export async function putRecord(a: Assessment): Promise<{ ok: true } | { ok: false; problem: string }> {
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
    const problem = typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'Not saved. Check your connection.'
      : `Not saved: ${(err as Error).message}`;
    writeFailed(problem);
    return { ok: false, problem };
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
