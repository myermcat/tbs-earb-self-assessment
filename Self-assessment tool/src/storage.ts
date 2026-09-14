import type { Assessment, Rubric } from './types';
import { newDocId } from './firebase';

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
/**
 * One code, minted the moment an assessment exists.
 *
 * There used to be two, and the user was right that two is one too many. A four-character
 * reference was minted at creation for email subject lines, and a twelve-character access code
 * was minted at the first online save. "Give me the code" then had two answers, and the short
 * one looked exactly like the long one because they came from the same alphabet.
 *
 * So there is one, and it is minted here, at creation, which is what the four-character one
 * always did. It is the assessment's name in the store when it gets there, and it is the thing
 * a person keeps. What follows from minting it early is a good property: an assessment has a
 * code before it has ever been online, so "here is my code" works before the save as well as
 * after, and somebody who types a code for an assessment that was never saved is told that in
 * those words.
 *
 * WHAT DOES NOT GO IN AN EMAIL SUBJECT
 *
 * The whole code. A subject line is logged, forwarded, quoted in replies and answerable to
 * access-to-information, and this code opens the assessment. So the subject carries the first
 * four characters, which is what a subject line was ever for: enough to find the thread in
 * Outlook, and 32^8 short of opening anything.
 */
export function refOf(a: Assessment): string {
  // A file saved before the merge has its own four-character reference. It keeps it, because
  // it is already in subject lines somebody has in their inbox.
  if (a.ref) return a.ref;
  return (a.id ?? '').slice(0, 4) || '----';
}

export function blankAssessment(rubric: Rubric): Assessment {
  const now = new Date().toISOString();
  return {
    fileType: 'gc-arch-assessment',
    formatVersion: 1,
    // The code exists from the first second, so there is never a moment when an assessment
    // cannot be named.
    id: newDocId(),
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
 *   'online'  the copy in the store is this one
 *   'behind'  saved online once, and edited since, so the store holds an older version
 *   'failed'  the last write did not land, and the reason
 *
 * It starts idle. Starting at 'local' meant a page with nothing on it announced "draft saved
 * in browser" before anything had been saved, which is a claim ahead of the fact.
 */
export type SaveState = 'idle' | 'local' | 'pending' | 'saving' | 'online' | 'behind' | 'offline' | 'failed';
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
 * The calls a real write needs. src/store.ts drives all of them.
 *
 * 'local' used to mean two different things at once: there is nowhere else for this to go, and
 * this is on its way online. A badge cannot tell the truth about a queued write while those
 * share a name, so 'pending' is the queue and 'local' is the end of the road.
 */
export function writePending(): void { setSaveState('pending'); }
export function localOnly(): void { setSaveState('local'); }
export function beginWrite(): void { setSaveState('saving'); }
export function writeLanded(): void { setSaveState('online'); }
/** Edited since the last online save. The store holds something older than what is on screen. */
export function writeBehind(): void { setSaveState('behind'); }
export function writeOffline(): void { setSaveState('offline'); }
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

/**
 * Put the draft in the browser's store and answer whether it went in, leaving the save
 * indicator where it is.
 *
 * A store names a record on its first write, and that name has to come back into the draft or
 * the next write makes a second document for the same assessment. Doing that through `autosave`
 * would announce a local save in the middle of a successful online one, which is the wrong
 * thing to tell somebody who is watching the badge.
 */
export function keepDraft(a: Assessment): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

/**
 * What happens after a draft is kept, once there is somewhere else for it to go.
 *
 * The store registers itself here rather than storage.ts importing it, because store.ts
 * already imports this module and a circle between the two would be a build error waiting for
 * whoever adds the next function.
 */
type AfterSave = (a: Assessment) => void;
let afterSave: AfterSave | null = null;
export function registerAfterSave(fn: AfterSave): void { afterSave = fn; }

export function autosave(a: Assessment): void {
  a.meta.updatedAt = new Date().toISOString();
  if (keepDraft(a)) {
    // Where the work stands is store.ts's answer, because only it knows whether there is a
    // store, whether anybody is signed in, and whether this record may be sent at all. With no
    // listener at all the browser is the whole story, which is what 'local' says.
    if (afterSave) afterSave(a);
    else setSaveState('local');
    return;
  }
  // A private window, or storage turned off. Saying nothing here is how somebody loses an
  // afternoon of work believing it was kept.
  setSaveState('failed', 'This browser is not keeping a draft. Save a file before you close the tab.');
}

/**
 * An assessment saved before the code existed gets one now, so every subject line the tool
 * writes from here on can be matched back to it.
 */
export function ensureRef(a: Assessment): Assessment {
  // An assessment saved before the merge has a four-character reference and no code. It gets a
  // code and keeps its reference, because that reference is in subject lines already sent.
  if (!a.id) a.id = newDocId();
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
