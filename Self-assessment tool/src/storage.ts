import type { Assessment, Rubric } from './types';

/**
 * There is no server. Persistence is two things:
 *   1. an autosave into this browser, so closing the tab does not lose work;
 *   2. a save-to-file, which produces the .json the submitter keeps and sends on.
 * Nothing leaves the machine unless the person exports it and sends it themselves.
 */

const KEY = 'gc-arch-assessment:draft';
export const APP_VERSION = '0.1.0';

/**
 * A short code somebody can read aloud, and that never changes.
 *
 * No I, O, 0 or 1, because this gets typed into an email subject and read back off a screen.
 */
function newRef(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function blankAssessment(rubric: Rubric): Assessment {
  const now = new Date().toISOString();
  return {
    fileType: 'gc-arch-assessment',
    formatVersion: 1,
    ref: newRef(),
    rubric: { id: rubric.id, version: rubric.version, title: rubric.title },
    initiative: { name: '', department: '', contact: '', lifecycleStage: '', summary: '', classification: '' },
    answers: {},
    meta: { createdAt: now, updatedAt: now, appVersion: APP_VERSION },
  };
}

/**
 * Where the work stands, so nobody has to wonder.
 *
 *   'idle'    nothing has been written yet this visit
 *   'saving'  a write is in flight
 *   'local'   held by this browser, and nothing has been submitted yet
 *   'online'  submitted, so later changes write through to TBS
 *   'failed'  the last write did not land, and the reason
 *
 * It starts idle. Starting at 'local' meant a page with nothing on it announced "draft saved
 * in browser" before anything had been saved, which is a claim ahead of the fact.
 */
export type SaveState = 'idle' | 'saving' | 'local' | 'online' | 'failed';
let saveState: SaveState = 'idle';
let saveDetail = '';
const saveWatchers = new Set<() => void>();

export function onSaveStateChange(fn: () => void): () => void {
  saveWatchers.add(fn);
  return () => saveWatchers.delete(fn);
}

/**
 * Every watcher is a closure over a DOM node, and the questionnaire rebuilds its footer on
 * every repaint, so without this the set grew by one detached closure per repaint. The render
 * that owns the indicator clears them the way it clears its other readouts.
 */
export function clearSaveWatchers(): void { saveWatchers.clear(); }

/**
 * The three calls a real write needs. Nothing drives them yet: there is no endpoint, so the
 * only reachable states are idle, local and failed. They exist so the seam in src/store.ts has
 * something to call, and so the indicator's wording is settled before the write is built.
 */
export function beginWrite(): void { setSaveState('saving'); }
export function writeLanded(): void { setSaveState('online'); }
export function writeFailed(reason: string): void { setSaveState('failed', reason); }
export function saveStatus(): { state: SaveState; detail: string } {
  return { state: saveState, detail: saveDetail };
}
function setSaveState(state: SaveState, detail = '') {
  if (state === saveState && detail === saveDetail) return;
  saveState = state;
  saveDetail = detail;
  for (const fn of saveWatchers) fn();
}

export function autosave(a: Assessment): void {
  a.meta.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
    setSaveState('local');
  } catch {
    // A private window, or storage turned off. Saying nothing here is how somebody loses an
    // afternoon of work believing it was kept.
    setSaveState('failed', 'This browser is not keeping a draft. Save a file before you close the tab.');
  }
}

/**
 * An assessment saved before the code existed gets one now, so every subject line the tool
 * writes from here on can be matched back to it.
 */
export function ensureRef(a: Assessment): Assessment {
  if (!a.ref) a.ref = newRef();
  return a;
}

export function loadDraft(): Assessment | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as Assessment;
    return a?.fileType === 'gc-arch-assessment' ? ensureRef(a) : null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function download(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** How many questions carry a score. Home and Settings must never disagree about this. */
/**
 * Questions dealt with, which includes the ones marked not applicable.
 *
 * Deciding a question does not apply IS answering it, and the questionnaire's own footer has
 * counted it that way since the start. This did not, so the start page reported a smaller
 * number than the page the person had just left.
 */
export function answeredCount(a: Assessment): number {
  return Object.values(a.answers).filter((x) => typeof x.score === 'number' || x.na === true).length;
}

/** Anything at all in the file: an answer, or a fact about the initiative. */
/**
 * Whether there is anything here worth protecting from a swap or a discard.
 *
 * It used to count scores and the overview fields only, so somebody who had written
 * justifications and gathered evidence without scoring anything registered as empty: both
 * confirmations were skipped for them, and the discard button was disabled. This counts what
 * marking.ts has always counted for the same question.
 */
export function hasWork(a: Assessment): boolean {
  if (answeredCount(a) > 0) return true;
  if (Object.values(a.initiative).some((v) => typeof v === 'string' && v.trim() !== '')) return true;
  return Object.values(a.answers).some(
    (ans) => (ans.justification ?? '').trim() !== ''
      || (ans.evidence ?? []).length > 0
      || ans.na === true,
  );
}

/**
 * Whether a file has been written in this tab since the page loaded, and what it was called.
 *
 * Deliberately module state, lost on reload. After a reload we genuinely do not know whether a
 * file exists on disk, and the honest fallback is to assume none does, which makes the warning
 * before a discard stricter rather than laxer.
 */
let lastSave: { name: string; at: number } | null = null;
export function lastSaveInfo(): { name: string; at: number } | null { return lastSave; }

/** The one place an assessment becomes a file, so every save path records that it happened. */
export function saveAssessmentFile(a: Assessment): string {
  autosave(a);
  // The reference is in the filename, so two saves of two assessments never look alike in a
  // downloads folder and an assessor can match a file to an email without opening it.
  const name = `${slug(a.initiative.name)}-${a.ref ?? 'earb'}-self-assessment.json`;
  download(name, JSON.stringify(a, null, 2));
  lastSave = { name, at: Date.now() };
  return name;
}

export function slug(s: string): string {
  return (s || 'assessment').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

export async function readJsonFiles(files: FileList | File[]): Promise<{ file: string; data: unknown; error?: string }[]> {
  const out: { file: string; data: unknown; error?: string }[] = [];
  for (const f of Array.from(files)) {
    try {
      out.push({ file: f.name, data: JSON.parse(await f.text()) });
    } catch (e) {
      out.push({ file: f.name, data: null, error: (e as Error).message });
    }
  }
  return out;
}
