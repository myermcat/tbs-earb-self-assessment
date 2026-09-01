import type { Assessment } from './types';
import { loadDraft } from './storage';

/**
 * The seam where the hosted store goes.
 *
 * Everything in this tool is unclassified, so the records can live online and the dashboard can
 * read them without anybody mailing a file around. Nothing is hosted yet: GitHub Pages serves
 * static files and cannot accept a write, so a small write endpoint has to exist first (an
 * Azure Function is the cheapest route, since canada-ca/TBS-OCIO-ESP already builds on Azure
 * Pipelines). Until then `ENDPOINT` is null, and the dashboard runs on whatever this browser
 * and this session can see, saying so on the page rather than pretending to be live.
 *
 * The page's own CSP is `connect-src 'none'`, so the fetch below cannot even leave the page
 * today. That is deliberate: the day the endpoint exists, opening the CSP to exactly that one
 * origin is the change that makes it live, and it is one line in the build.
 */
const ENDPOINT: string | null = null;

export type RecordStatus = 'draft' | 'submitted' | 'audited' | 'withdrawn';
export type StoreSource = 'this-browser' | 'session-files' | 'hosted';

export interface StoredRecord {
  id: string;
  status: RecordStatus;
  source: StoreSource;
  updatedAt: string;
  assessment: Assessment;
}

export function isHosted(): boolean { return ENDPOINT !== null; }

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
      const res = await fetch(`${ENDPOINT}/assessments`);
      const rows = (await res.json()) as Assessment[];
      return rows.map((a, i) => recordOf(a, 'hosted', a.id ?? `hosted-${i}`));
    } catch {
      // Fall through to what is local. A dashboard that shows nothing is worse than a
      // dashboard that shows this browser and says that is all it has.
    }
  }
  const draft = loadDraft();
  if (draft) out.push(recordOf(draft, 'this-browser', 'draft-in-this-browser'));
  sessionFiles.forEach((a, i) => out.push(recordOf(a, 'session-files', `file-${i}`)));
  return out;
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
