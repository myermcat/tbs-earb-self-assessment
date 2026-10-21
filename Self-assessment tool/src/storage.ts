import type { Assessment, Rubric } from './types';
import { answersCsv } from './csv-answers';
import { syncMarking } from './marking';
import { forgetBases, newDocId } from './firebase';
import { DEMO_MARK, isDemoBuild, storeKey } from './keys';

/**
 * There is no server. Persistence is two things:
 *   1. an autosave into this browser, so closing the tab does not lose work;
 *   2. a save-to-file, which produces the .json the submitter keeps and sends on.
 * Nothing leaves the machine unless the person exports it and sends it themselves.
 */

const KEY = storeKey('draft');
export const APP_VERSION = '0.1.0';

/**
 * WHOSE DRAFT THIS IS, AND WHICH PAGE MAY WRITE IT.
 *
 * The submitter's page and the assessor's page are two products on one address, so they are one
 * localStorage and this is one key between them. The assessor's page boots with a blank
 * assessment on purpose, because reading the submitter's draft there is how somebody else's
 * work reached a screen that was never going to show it. A blank one costs nothing to hold. It
 * costs everything the moment anything writes it.
 *
 * Reported twice. The first time, September: making a question set active called clearDraft(),
 * and somebody halfway through 176 questions lost all of it in a tab they were not looking at.
 * The second time, tonight: it's the second time already when i opened a tab with an existing
 * submission in the submitter view, and i reloaded the page, and the submission wasn't there
 * anymore, and it opened a new empty one. adoptSignedIn() runs at the top of every paint, and
 * on a signed-in assessor page it stamped the account's address onto that blank and autosaved
 * it. No click, no warning, and the submitter's tab read the blank on its next reload.
 *
 * So the rule is not about any one call site. A page that did not load this draft may not write
 * it, and the page itself says which it is. Both of those defects were a write from the
 * assessor's page, and neither of them is reachable from here again.
 */
let mayWrite = true;
export function draftIsOursToWrite(ours: boolean): void { mayWrite = ours; }

/**
 * A short code somebody can read aloud, and that never changes.
 *
 * No I, O, 0 or 1, because this gets typed into an email subject and read back off a screen.
 */

export function blankAssessment(rubric: Rubric): Assessment {
  const now = new Date().toISOString();
  return {
    fileType: 'gc-arch-assessment',
    formatVersion: 1,
    // The code exists from the first second, so there is never a moment when an assessment
    // cannot be named.
    id: newDocId(),
    rubric: { id: rubric.id, version: rubric.version, title: rubric.title },
    // An assessment with no evidence points at nothing above unclassified, which is what the
    // marking is derived from. It used to start empty and refuse to save until somebody picked.
    initiative: { name: '', department: '', contact: '', lifecycleStage: '', summary: '', classification: 'Unclassified' },
    answers: {},
    /**
     * A file saved off the demonstration page used to be indistinguishable from a real
     * submission in an assessor's inbox. The invented pool already carries this mark, so one
     * mark answers both and the assessor's list can refuse either.
     */
    meta: { createdAt: now, updatedAt: now, appVersion: isDemoBuild() ? DEMO_MARK : APP_VERSION },
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
  if (!mayWrite) return false;
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
  // Silent, because there is nothing to report: this page is not holding anybody's draft, and
  // the save badge belongs to the person whose draft it is.
  if (!mayWrite) return;
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
    if (a?.fileType !== 'gc-arch-assessment') return null;
    /**
     * A file saved under the old picker carries whatever was chosen there, which may be above
     * or below what its evidence says. The rows are the fact, so the record is brought into
     * line the moment it is opened.
     */
    syncMarking(a);
    return ensureRef(a);
  } catch {
    return null;
  }
}

/**
 * Empty the browser, which is what three screens have been promising.
 *
 * It used to remove one name. Every online save also writes a whole second copy of the document
 * under a name of its own, so discarding left the answers on the machine while the window said
 * they had been erased. Both go now.
 */
export function clearDraft(): void {
  // The September one: a control on the assessor's page called this and took the submitter's
  // answers with it, in a tab nobody was looking at.
  if (!mayWrite) return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  forgetBases();
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
  /**
   * The marking is not work. It is derived from the evidence and a blank assessment carries
   * Unclassified from the moment it exists, so counting it here made an empty file look like
   * one somebody had started: the home page offered Continue on it and the Danger zone offered
   * to discard it.
   */
  const typed = Object.entries(a.initiative)
    .filter(([k]) => k !== 'classification' && k !== 'markingAcknowledged')
    .map(([, v]) => v);
  if (typed.some((v) => typeof v === 'string' && v.trim() !== '')) return true;
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

/**
 * The assessment as the workbook it replaces, filled in.
 *
 * The byte order mark is not decoration. Excel on Windows opens a .csv as Windows-1252 unless
 * it finds one, and the workbook's own column heading has an en dash in it, so without this
 * the first thing somebody sees in the sheet is mojibake in the header row.
 */
export function saveAnswersCsv(rubric: Rubric, a: Assessment): string {
  autosave(a);
  const name = `${slug(a.initiative.name)}-${a.ref ?? 'earb'}-self-assessment.csv`;
  download(name, `\ufeff${answersCsv(rubric, a)}`, 'text/csv');
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
