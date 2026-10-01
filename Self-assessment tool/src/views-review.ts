import { classRank, type Assessment, type AuditEntry, type Rubric } from './types';
import { refOf } from './storage';
import { el, clear, tone, bar } from './dom';
import { allQuestionScores, score, triageOrder, type QuestionScore, type Result, type SectionScore } from './scoring';
import { t } from './i18n';
import { flags, type Flag } from './flags';
import { csvHeader, csvRow, toCsv } from './csv';
// readJsonFiles went quiet with the drop zone on 1 October and comes back with it.
import { download, slug } from './storage';
import { humanSize, openAttachment } from './attach';
import { rubricFor } from './library';
import { confirmStep } from './confirm';
import { SAD_CAT } from './cat';
import { ICON_DOWN } from './icons';
import { currentUser, formatCode, listAudits, putAudit, type AssessorAudit } from './firebase';
import { isHosted, poolRecords, type PoolAnswer } from './store';
import { repaint } from './views-submit';
import { nameIsChecked } from './who';
import BUILTIN from '../rubric/rubric.v1-dan.json';
import { DEMO_MARK, storeKey } from './keys';

/**
 * The assessor side. Nick and Allison stop transcribing decks and start auditing anomalies.
 * Loads one or many self-assessment .json files, ranks them, and drills into any one.
 */

interface Loaded {
  file: string;
  a: Assessment;
  /** The set this submission was answered against, when this browser holds it. */
  rubric: Rubric;
  /** True when the set it was answered against is not here, so the active one was used. */
  substituted: boolean;
  /** Answers with no question in the set it was scored with, so they counted for nothing. */
  lost?: number;
  r: Result;
  fs: Flag[];
  /** The store handed back a newer version of this one after the assessor had opened it. */
  changed?: boolean;
  /**
   * What other assessors have written against this submission, read-only.
   *
   * One document each, beside the assessment, so nobody's reading is overwritten by the next
   * person's. There is no single score of record: EARB is handed both opinions and the board
   * decides between them, which is a judgement and not a calculation.
   */
  others?: AssessorAudit[];
  /** Whether the audits for this one have been fetched, so an empty list means empty. */
  auditsRead?: boolean;
  /** Everybody who has written an audit against this one, for the list to say so. */
  auditedBy?: string[];
  /** Whether this assessor is one of them, which is the thing they look for first. */
  auditedByMe?: boolean;
  /**
   * Whether this row arrived from the shared store rather than from a file on this machine.
   *
   * Kept because the session list is written to this browser and restored on every load, so a
   * record deleted from the store a week ago came back for ever, sat in the worklist, and was
   * counted as something somebody had opened from a file. Reported as both: a submission that
   * was deleted still showing in the table, and "1 opened from files here" by somebody who has
   * never opened a file.
   */
  fromStore?: boolean;
}

/**
 * Where this assessor's own audit lives, and what the screen says about it.
 *
 * Everything typed here used to stay in this browser and leave as a downloaded file, so a
 * second assessor saw none of it, a cleared browser lost all of it, and the department it was
 * written about never saw a word. It is a document now, named with the writer's address,
 * beside the assessment it is about.
 *
 * It saves itself, which is a deliberate departure from the submitter's side. Saving there is
 * one act each time because the stored copy is a publication. An audit is nobody's publication:
 * it is the assessor's working record, read by the department and by the board, and the failure
 * that matters is losing it rather than sending it too early.
 */
type AuditSave = { state: 'off' | 'saved' | 'saving' | 'failed'; problem?: string };

/**
 * A column heading that carries a note, the way a spreadsheet cell carries one.
 *
 * Drawn by the page rather than handed to the browser's own title tooltip. That one waits about
 * a second of stationary hovering, shows nothing at all on a touch screen, cannot be reached
 * from the keyboard, and gives a reader no sign it is there to be looked for. Reported twice as
 * showing nothing.
 *
 * THE NOTE IS NOT INSIDE THE HEADING. One element is shared by every column and it lives on the
 * body. Putting the sentence inside the cell made it part of that column's name, which a screen
 * reader then reads out against every cell underneath it, and it put the note inside the
 * table's sideways scroller, which cuts it off below about 1100px. On the body it is
 * position:fixed, placed when it opens and clamped to the screen.
 */
let columnNote: HTMLElement | null = null;
function theColumnNote(): HTMLElement {
  if (!columnNote || !columnNote.isConnected) {
    columnNote = el('span', { class: 'note-pop', id: 'column-note', role: 'note' }, []);
    document.body.appendChild(columnNote);
  }
  return columnNote;
}

function noteHead(label: string, note: string, side: 'left' | 'right' = 'left',
                  before: (Node | null)[] = []): HTMLElement {
  const head = el('th', {
    class: 'has-note', tabindex: '0', 'aria-describedby': 'column-note',
  }, [...before, el('span', { class: 'note-word' }, [label])]);

  const hide = () => theColumnNote().classList.remove('on');
  const show = () => {
    const pop = theColumnNote();
    pop.textContent = note;
    // Measured while shown, because a hidden element measures nothing.
    pop.classList.add('on');
    const h = head.getBoundingClientRect();
    const w = pop.offsetWidth;
    const edge = 8;
    // Hangs from whichever edge was asked for, then is pushed back on screen if that put it
    // off. The clamp is what makes `side` a preference rather than a promise.
    const wanted = side === 'right' ? h.right - w : h.left;
    pop.style.left = `${Math.round(Math.max(edge, Math.min(wanted, window.innerWidth - w - edge)))}px`;
    pop.style.top = `${Math.round(h.bottom + 6)}px`;
  };

  head.addEventListener('pointerenter', show);
  head.addEventListener('pointerleave', hide);
  head.addEventListener('focus', show);
  head.addEventListener('blur', hide);
  // Fixed coordinates go stale the moment anything moves, and this header is sticky, so the
  // note would sit over the wrong column.
  window.addEventListener('scroll', hide, { passive: true });
  window.addEventListener('resize', hide, { passive: true });
  return head;
}

/**
 * Where this audit is, in as few words as the state needs.
 *
 * It used to say where the audit went, who could read it, who could not change it and what the
 * other assessors had done, which is the page explaining its own design. A save state is a
 * state: four words when it is saved, the store's own words when it is not.
 */
function auditWhere(l: Loaded): string {
  if (!isHosted()) return 'Kept in this browser';
  if (!currentUser()) return 'Not saved: sign in';
  if (!l.a.id) return 'Kept in this browser';
  if (auditSave.state === 'saving') return 'Saving';
  if (auditSave.state === 'failed') return `Not saved: ${auditSave.problem ?? 'the store refused it'}`;
  return 'Saved';
}
let auditSave: AuditSave = { state: 'off' };
const auditTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Whether anybody has audited the submissions on this list, and who.
 *
 * Reported as: I assessed one of the questions, and nothing in the list says I did. The audits
 * are documents beside each assessment now, so a list that reads assessments learns nothing
 * about them without asking, and it was not asking.
 *
 * One request per row, made once per session and in parallel. That is the honest cost of the
 * shape: the state lives per assessor and cannot be read off the assessment without putting a
 * marker back on it, which is the thing the subcollection exists to avoid. At the size this
 * runs it is a handful of requests; the day a pool holds a hundred, one collection-group query
 * replaces all of them and that is a decision with an index behind it.
 */
let listAuditsRead = false;
async function readListAudits(after: () => void): Promise<void> {
  if (listAuditsRead || !isHosted() || !currentUser()) return;
  const rows = loaded.filter((l) => l.a.id);
  if (!rows.length) return;
  listAuditsRead = true;
  const me = currentUser()?.email ?? '';
  await Promise.all(rows.map(async (l) => {
    try {
      const all = await listAudits(l.a.id!);
      l.auditedBy = all.map((x) => x.reviewerName?.trim() || x.reviewer);
      l.auditedByMe = all.some((x) => x.reviewer === me);
    } catch {
      /* Refused or offline. The row says nothing rather than saying nobody has looked. */
    }
  }));
  after();
}

/** Read every audit on this submission, and adopt this assessor's own as the one being edited. */
async function readAudits(l: Loaded): Promise<void> {
  // Marked before anything can fail or be awaited, because this ends in a repaint and a
  // repaint comes back here. Left until after the first early return, it never got marked at
  // all on a build with no store, and the redraw called it again for as long as the page lived.
  l.auditsRead = true;
  const code = l.a.id;
  if (!isHosted() || !code) return;
  try {
    const all = await listAudits(code);
    const me = currentUser()?.email ?? '';
    l.others = all.filter((x) => x.reviewer !== me);
    const mine = all.find((x) => x.reviewer === me);
    // The stored copy wins only where this browser is holding nothing, so an audit typed
    // offline is never thrown away by a read that happens to land after it.
    if (mine && !Object.keys(l.a.audit?.perQuestion ?? {}).length) {
      l.a.audit = {
        reviewer: mine.reviewer, reviewedAt: mine.reviewedAt,
        perQuestion: mine.perQuestion ?? {}, overallNote: mine.overallNote,
      };
    }
    auditSave = { state: 'saved' };
  } catch (err) {
    auditSave = { state: 'failed', problem: (err as Error).message };
  }
}

/**
 * Send this assessor's audit, a moment after they stop typing.
 *
 * The wait is what turns a typed sentence into one write rather than one per keystroke, and
 * the store counts every one of them.
 */
function scheduleAuditSave(l: Loaded, after: () => void = () => {}): void {
  const code = l.a.id;
  if (!isHosted() || !code || !currentUser()) return;
  clearTimeout(auditTimers.get(code));
  auditSave = { state: 'saving' };
  after();
  /**
   * The wait must not be a reason for a program to stay alive.
   *
   * A pending timer holds Node's event loop open, so a suite that touched one audit control sat
   * there after its last assertion with nothing left to do. Browsers have no unref and need
   * none; this is one word and it costs the page nothing.
   */
  const timer = setTimeout(() => {
    const audit = l.a.audit;
    if (!audit) return;
    // Stamped locally as well as in the document, so a browser that later belongs to somebody
    // else can tell whose work it is holding.
    audit.reviewer = currentUser()?.email ?? '';
    /**
     * An entry nobody has filled in is not an audit of that question.
     *
     * Opening a submission draws every question and gives each one a blank entry so the
     * controls have somewhere to write. Saving the map whole put 176 of them in the store, 174
     * of them empty, which makes "what has this assessor looked at" unanswerable and the
     * document twenty times the size of the work in it.
     */
    const written: Record<string, AuditEntry> = {};
    for (const [qid, e] of Object.entries(audit.perQuestion)) {
      const hasScore = typeof e.auditedScore === 'number';
      if (hasScore || e.verdict || (e.note ?? '').trim() || (e.history ?? []).length) written[qid] = e;
    }
    void putAudit(code, {
      reviewer: currentUser()?.email ?? '',
      reviewerName: auditor,
      reviewedAt: audit.reviewedAt || new Date().toISOString(),
      perQuestion: written,
      overallNote: audit.overallNote,
    }).then(
      () => { auditSave = { state: 'saved' }; after(); },
      (err: Error) => { auditSave = { state: 'failed', problem: err.message }; after(); },
    );
  }, 1200);
  (timer as unknown as { unref?: () => void }).unref?.();
  auditTimers.set(code, timer);
}

let loaded: Loaded[] = [];

/**
 * The assessor's work, kept the way the submitter's is.
 *
 * Everything an assessor typed lived in memory until they saved a file: a reload, a crash or a
 * stray click took the afternoon with it. The submitter side has autosaved to the browser
 * since the first day, and there was no reason for this side to be different.
 *
 * Only the parsed submissions and the audit on them are kept, which is the same information
 * the files already hold, in the same browser that was reading them.
 */
const AUDIT_KEY = storeKey('audit-session');

function keepSession(): void {
  try {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(loaded.map((l) => ({ file: l.file, a: l.a, fromStore: l.fromStore }))));
  } catch {
    /* private window, or full. The session still holds in this tab. */
  }
}

function restoreSession(rubric: Rubric): void {
  if (loaded.length) return;
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    if (!raw) return;
    const rows = JSON.parse(raw) as { file: string; a: Assessment; fromStore?: boolean }[];
    for (const row of rows) {
      if (row?.a?.fileType !== 'gc-arch-assessment') continue;
      /**
       * A browser that opened the demonstration page before the names were separated has four
       * invented submissions in this key, and the real assessor page would restore them into
       * the worklist on every load for ever, scored and ranked beside real departments. Every
       * record a demonstration build makes carries its own mark, so they are known wherever
       * they arrived from.
       */
      if (row.a.meta?.appVersion === DEMO_MARK) continue;
      /**
       * An audit belongs to the person who wrote it, and this browser is not that person.
       *
       * Reported after signing in as somebody else: a question said "you: 3" about a score
       * another account had given. The audit was restored out of this browser's own key with no
       * regard for who is signed in, and the screen labels the audit it holds as yours. It is
       * one document per assessor in the store now, so the right copy is read back by address;
       * what is held here for somebody else is dropped rather than relabelled.
       */
      const holder = row.a.audit?.reviewer ?? '';
      if (holder && holder !== (currentUser()?.email ?? '')) delete row.a.audit;
      const own = rubricFor(BUILTIN as unknown as Rubric, row.a.rubric);
      const use = own ?? rubric;
      const r = score(use, row.a);
      loaded.push({ file: row.file, a: row.a, rubric: use, substituted: !own,
        lost: own ? 0 : lostAnswers(use, row.a), r, fs: flags(use, row.a, r),
        fromStore: row.fromStore });
    }
  } catch {
    /* a half-written record is not worth failing the page over */
  }
}

/**
 * Why the number in the Score column is not the score the department got.
 *
 * Reported as: what is "question set missing", what do you mean missing. Missing from this
 * browser, and what it costs is the number. A restored session never writes the note that
 * opening a file writes, so after a reload this is the only place a reader can find out.
 */
function substitutedWhy(l: Loaded): string {
  const lost = l.lost ?? 0;
  return t(
    `This browser does not have ${l.a.rubric.version}, so the score in this row was worked out with ${l.rubric.version}`
    + (lost ? `, and ${lost} answer${lost === 1 ? '' : 's'} ${lost === 1 ? 'does' : 'do'} not exist in it.` : '.')
    + ' Add that set in Settings to see the score the department got.',
    `Ce navigateur n’a pas ${l.a.rubric.version}; la note de cette ligne a donc été calculée avec ${l.rubric.version}`
    + (lost ? `, et ${lost} réponse${lost > 1 ? 's' : ''} n’existe${lost > 1 ? 'nt' : ''} pas dans cet ensemble.` : '.')
    + ' Ajoutez cet ensemble dans Paramètres pour voir la note obtenue par le ministère.',
  );
}

/** Answer ids with no question in the set they were scored with, so they counted for nothing. */
function lostAnswers(use: Rubric, a: Assessment): number {
  const known = new Set(use.domains.flatMap((d) => d.sections.flatMap((s) => s.questions.map((q) => q.id))));
  return Object.keys(a.answers).filter((id) => !known.has(id)).length;
}

/** Called by every control that changes an audit, so nothing waits for a file to be saved. */
export function auditChanged(): void { keepSession(); }

/** What the dashboard can see of this session: the files the assessor opened. */
export function openedThisSession(): Assessment[] { return loaded.map((l) => l.a); }

/**
 * The shared pool, fetched once a visit and remembered.
 *
 * This screen used to read files and nothing else, which meant an assessor could sign in, be
 * handed a perfectly working store, and be told the pool was empty while a submission was
 * sitting in it. The fetch happens here rather than in the boot sequence because this is the
 * only screen that needs it, and it is guarded so a repaint does not re-ask.
 */
type Pool =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ok'; found: number }
  | { state: 'anonymous' }
  | { state: 'refused'; problem: string }
  | { state: 'failed'; problem: string };

let poolNow: Pool = { state: 'idle' };
let asked = false;

/** Ask again after signing in, after a delete, or when the assessor presses Check again. */
export function forgetPool(): void { asked = false; poolNow = { state: 'idle' }; listAuditsRead = false; }

function absorb(rubric: Rubric, answer: PoolAnswer): void {
  if (answer.state !== 'ok') {
    poolNow = answer.state === 'off' ? { state: 'idle' } : answer as Pool;
    return;
  }
  let added = 0;
  // Which rows the store accounted for in this answer, by identity rather than by name, so a
  // row it handed over cannot be judged missing from it afterwards.
  const seen = new Set<Loaded>();
  for (const rec of answer.records) {
    const a = rec.assessment;
    if (a?.fileType !== 'gc-arch-assessment') continue;
    const own = rubricFor(BUILTIN as unknown as Rubric, a.rubric);
    const use = own ?? rubric;
    const r = score(use, a);
    const row: Loaded = {
      file: a.initiative?.name?.trim() || a.ref || rec.id,
      a, rubric: use, substituted: !own, r, fs: flags(use, a, r), fromStore: true,
    };
    /**
     * A submission is no longer a thing that stops moving. A submitter keeps working after
     * telling TBS it is ready, and their changes are written as they go, so a copy this browser
     * opened last week is a copy of last week. Where the store holds something newer, it wins,
     * and the audit written here travels across to it.
     */
    const held = loaded.findIndex((l) => (a.ref && l.a.ref === a.ref) || (a.id && l.a.id === a.id));
    if (held >= 0) {
      const mine = loaded[held];
      /**
       * Matched to something the store handed over, whatever name this browser had for it.
       *
       * A row is matched on the reference as well as the id, and the two can disagree: a record
       * made before codes were readable was written back under a new name, so this browser can
       * hold the old one. Judging afterwards by id alone then called a record the store had
       * just handed over missing from it, and the row for an assessment sitting in the pool
       * said Not in the store. The store's name is the true one, so the row takes it.
       */
      seen.add(mine);
      mine.fromStore = true;
      if (a.id && mine.a.id !== a.id) mine.a.id = a.id;
      const theirs = a.meta?.updatedAt ?? '';
      const ours = mine.a.meta?.updatedAt ?? '';
      if (!(theirs > ours)) continue;
      if (mine.a.audit && !row.a.audit) row.a.audit = mine.a.audit;
      row.changed = true;
      loaded[held] = row;
      seen.delete(mine);
      seen.add(row);
      added++;
      continue;
    }
    loaded.push(row);
    seen.add(row);
    added++;
  }
  /**
   * A row the store no longer has.
   *
   * The session list is written to this browser and restored on every load, so a record an
   * admin deleted came back for ever: it sat in the worklist, it was counted as something
   * somebody had opened from a file, and pressing delete on it answered that there was no such
   * submission, about a row on screen. Both were reported in the same sitting.
   *
   * Deleted means gone, including a row this assessor has audited. Keeping those was an idea
   * of mine rather than anybody's requirement, and it is what left a record somebody had
   * deleted sitting on their screen through three attempts to be rid of it: there is no
   * control on this list that removes a row, so a row nothing drops is a row that stays for
   * ever. An audit of a record that no longer exists has nothing to be an audit of.
   */
  let dropped = 0;
  for (let i = loaded.length - 1; i >= 0; i--) {
    const l = loaded[i];
    if (seen.has(l)) continue;
    /**
     * Sessions written before rows remembered where they came from have no flag on them, and
     * the first version of this test skipped them, so the record this was reported about went
     * on coming back. A file opened from disk is named by its filename, and a record from the
     * store is named by its initiative, so the one case that cannot be told apart is a file
     * somebody named after the initiative. That file reappears once more and is then marked.
     */
    const came = l.fromStore ?? !/\.json$/i.test(l.file);
    if (!came || !l.a.id) continue;
    loaded.splice(i, 1);
    dropped++;
  }
  if (added || dropped) keepSession();
  poolNow = { state: 'ok', found: answer.records.length };
}

function askPool(rubric: Rubric): void {
  if (asked || !isHosted()) return;
  asked = true;
  poolNow = { state: 'loading' };
  void poolRecords()
    .then((answer) => { absorb(rubric, answer); })
    .catch((err: unknown) => { poolNow = { state: 'failed', problem: (err as Error).message }; })
    .then(() => { repaint(); });
}

/**
 * Why there is nothing from the shared store. An assessor should be able to tell the reasons
 * apart: it does not exist yet, it is still being fetched, this machine cannot reach it, the
 * rules refused this account, or it is reachable and empty.
 */
function poolState(): { title: string; detail: string; badge: string; tone: string } {
  if (!isHosted()) {
    return {
      title: 'No shared pool yet',
      detail: '',
      badge: 'Not hosted yet',
      tone: 'badge-warn',
    };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      title: 'Cannot reach the pool',
      detail: '',
      badge: 'Offline',
      tone: 'badge-warn',
    };
  }
  if (poolNow.state === 'loading') {
    return {
      title: 'Looking in the pool',
      detail: '',
      badge: 'Checking',
      tone: '',
    };
  }
  if (poolNow.state === 'anonymous') {
    return {
      title: 'Sign in to see the pool',
      detail: '',
      badge: 'Not signed in',
      tone: 'badge-warn',
    };
  }
  if (poolNow.state === 'refused') {
    return {
      title: 'Your account cannot read the pool',
      // The store's own words, which are a fact about what happened and not an account of why.
      detail: poolNow.problem,
      badge: 'No access',
      tone: 'badge-warn',
    };
  }
  if (poolNow.state === 'failed') {
    return {
      title: 'The pool did not answer',
      detail: poolNow.problem,
      badge: 'Unreachable',
      tone: 'badge-warn',
    };
  }
  return {
    title: 'Nothing assigned to you yet',
    detail: 'The pool is reachable and holds nothing for you. A submission appears here as soon as a department sends one.',
    badge: 'Up to date',
    tone: '',
  };
}

/** The name typed on the mockup sign-in. Never verified, and labelled so everywhere. */
let auditor = '';
/** What the last Agree-with-all did, so the button reports itself instead of going quiet. */
let lastAgree: { section: string; agreed: number; kept: number } | null = null;
export function setAuditor(name: string): void { auditor = name; }

/**
 * Where the assessor was, so a reload puts them back.
 *
 * Reported as: when I am in an assessment and reload the page, it sends me to the pool view, I
 * want to stay exactly where I was. An assessor reads one submission for twenty minutes and
 * reloads for all the ordinary reasons; coming back to a list and finding the row again is a
 * tax on every one of those.
 */
const WHERE_KEY = storeKey('assessor-open');

/**
 * Asking for the list means the list, even when a submission was open.
 *
 * Reported as: clicking the name of the tool should send me to the assessor home. It did go
 * there, and the screen put the open submission straight back, because remembering where
 * somebody was cannot tell the difference between a reload and somebody asking to leave. The
 * two acts are different and only the page knows which one happened, so the ones that mean
 * leave say so.
 */
export function forgetOpenSubmission(): void {
  rememberWhere(undefined, 'flagged');
}

function rememberWhere(code: string | undefined, depth: Depth): void {
  try {
    if (!code) localStorage.removeItem(WHERE_KEY);
    else localStorage.setItem(WHERE_KEY, JSON.stringify({ code, depth }));
  } catch { /* private window. Opening on the list is no hardship. */ }
}

function whereWas(): { code: string; depth: Depth } | null {
  try {
    const raw = localStorage.getItem(WHERE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { code?: string; depth?: Depth; full?: boolean };
    if (!v?.code) return null;
    // `full` is what the first version of this wrote. A browser holding one is put back where
    // it was rather than sent to the list for having an older key in it.
    const depth: Depth = v.depth === 'all' || v.full ? 'all' : 'flagged';
    return { code: v.code, depth };
  } catch {
    return null;
  }
}

export function renderReview(root: HTMLElement, rubric: Rubric): void {
  clear(root);
  restoreSession(rubric);
  askPool(rubric);
  /**
   * Back to the submission that was open, before anything of the list is drawn.
   *
   * The pool answers after the first paint, so this is tried again on the redraw that follows
   * it: a record only in the store is not here to be found the first time through.
   */
  const back = whereWas();
  if (back) {
    const row = loaded.find((l) => l.a.id === back.code);
    if (row) {
      openDetail(row.rubric, root, row, back.depth);
      return;
    }
  }
  // Whether anybody has audited these, which the list could not say before: the audits are
  // documents beside each assessment, so the list has to ask for them.
  void readListAudits(() => renderReview(root, rubric));
  // With nothing loaded this screen is one card, and it centres. A toggle, because clear()
  // empties children and leaves classes, and loading a file re-enters here.
  root.classList.toggle('body-empty', loaded.length === 0);

  /**
   * Submissions are meant to arrive from the shared store. There is no store yet, and even
   * once there is, an assessor can be offline or locked out of it. Either way this screen has
   * to say so and leave a way to work: the files people sent, read here in the browser.
   */
  const pool = poolState();

  const again = isHosted()
    ? el('button', {
        class: 'ghost small',
        // The pool is read once and the answer kept for the session, so a submission sent while
        // this page was open never appears on its own. Reloading works because it starts the
        // session over; this is the same thing without losing whatever was opened from a file.
        onclick: () => { forgetPool(); repaint(); },
      }, ['Check the store again'])
    : null;

  /**
   * The sad cat is for an empty screen. With a list under it, there is nothing for this card
   * to say: where the rows came from is not a question anybody asked, and a count sits beside
   * the heading of the list itself.
   */
  const head = loaded.length
    ? null
    : el('div', { class: 'pool-out' }, [
        el('div', { class: 'pool-art', html: SAD_CAT }),
        el('div', {}, [
          el('h2', {}, [pool.title]),
          pool.detail ? el('p', { class: 'muted' }, [pool.detail]) : null,
          el('div', { class: 'actions' }, [
            el('span', { class: `badge ${pool.tone}` }, [pool.badge]),
            again,
          ]),
        ]),
      ]);

  /**
   * TAKEN OUT ON 1 OCTOBER, AND COMING BACK ON REQUEST.
   *
   * Her words: the app should not be able to deal with files, comment it out for now, and put
   * it back if I ask. This was the drop zone and the picker that read .json submissions people
   * had emailed each other, which is how the assessor side worked before there was a store.
   * The store is the pool now, so a second way in is a second place a submission can come from
   * and a second thing to explain.
   *
   * It is commented and not deleted so that putting it back is reading rather than writing.
   * The heading and the paragraph went with it; what is left is the line saying where these
   * came from, which is about the store.
   *
   *   const drop = el('section', { class: `card dropzone ${loaded.length ? 'dropzone-tight' : ''}` }, [
   *     head,
   *     loaded.length ? null : el('h3', { class: 'pool-alt-h' }, ['Load submissions from files instead']),
   *     loaded.length ? null : el('p', { class: 'muted small' }, [
   *       'Drop the .json files people sent you, or pick them. They are read here in your browser, and nothing is uploaded.',
   *     ]),
   *     loaded.length ? null : fileInput(rubric, root),
   *   ]);
   *   drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
   *   drop.addEventListener('dragleave', () => drop.classList.remove('over'));
   *   drop.addEventListener('drop', async (e) => {
   *     e.preventDefault();
   *     drop.classList.remove('over');
   *     if (e.dataTransfer?.files) await ingest(rubric, e.dataTransfer.files, root);
   *   });
   */
  if (head) root.appendChild(el('section', { class: 'card' }, [head]));
  if (loaded.length) paintList(rubric, root);
}

// TAKEN OUT ON 1 OCTOBER, WITH THE DROP ZONE ABOVE, AND COMING BACK ON REQUEST.
//
// Reading .json submissions is how the assessor side worked before there was a store, and the
// store is the pool now. Kept as text rather than deleted so that putting it back is reading
// rather than writing: every line of both is below, including the messages it printed when a
// file was the wrong shape or replaced something somebody had already audited.
//
// Line comments and not a block, because the code below has block comments of its own and the
// first of their endings would have closed the wrapper around them.
//
// /** The one file control, wherever it is put. */
// function fileInput(rubric: Rubric, root: HTMLElement): HTMLElement {
//   return el('input', {
//     type: 'file', accept: '.json', multiple: true,
//     onchange: async (e: Event) => {
//       const input = e.target as HTMLInputElement;
//       if (input.files) await ingest(rubric, input.files, root);
//     },
//   });
// }
//
// async function ingest(rubric: Rubric, files: FileList, root: HTMLElement) {
//   const read = await readJsonFiles(files);
//   const problems: string[] = [];
//   for (const item of read) {
//     const a = item.data as Assessment;
//     if (item.error || a?.fileType !== 'gc-arch-assessment') {
//       problems.push(`${item.file}: not a self-assessment file`);
//       continue;
//     }
//     /**
//      * Score a submission against the set it was answered against. Recomputing a two-year-old
//      * assessment with today's weights produces a number that was never anybody's score, and
//      * the old behaviour did exactly that behind a one-line notice.
//      */
//     const own = rubricFor(BUILTIN as unknown as Rubric, a.rubric);
//     const use = own ?? rubric;
//     const substituted = !own;
//     if (a.rubric.version !== rubric.version && own) {
//       problems.push(`${item.file}: answered against ${a.rubric.version}. That set is in your library, so the scores here were worked out with it.`);
//     } else if (substituted) {
//       const lost = lostAnswers(use, a);
//       problems.push(
//         `${item.file}: answered against ${a.rubric.version}, which this browser does not have. Scored with ${use.version} instead`
//         + (lost ? `, and ${lost} answer${lost === 1 ? '' : 's'} do not exist in it.` : '.')
//         + ' Add that set in Settings to see its real scores.',
//       );
//     }
//     const r = score(use, a);
//     const had = loaded.find((l) => l.file === item.file);
//     if (had && Object.keys(had.a.audit?.perQuestion ?? {}).length) {
//       problems.push(`${item.file}: this file was already open and has been replaced by the version you just picked. The scores and notes you had typed against the old one are gone.`);
//     }
//     loaded = loaded.filter((l) => l.file !== item.file);
//     loaded.push({ file: item.file, a, rubric: use, substituted,
//       lost: substituted ? lostAnswers(use, a) : 0, r, fs: flags(use, a, r) });
//     keepSession();
//   }
//   renderReview(root, rubric);
//   if (problems.length) {
//     root.appendChild(el('section', { class: 'card warn' }, [
//       el('strong', {}, ['Notes on the files you loaded']),
//       el('ul', {}, problems.map((p) => el('li', {}, [p]))),
//     ]));
//   }
// }

function paintList(rubric: Rubric, root: HTMLElement) {
  /**
   * Ready first, then weakest first, then anything carrying no score at all.
   *
   * The submitter's results page says, in both languages, that marking an assessment ready puts
   * "Ready to review" beside it in this list. The State column is what keeps that promise. The
   * order keeps a second one: an assessor reading from the top reaches finished work before
   * anybody's draft, and scoring a draft is the mistake the State column exists to prevent.
   *
   * The heading over the table names all three rules, because naming one of them produced the
   * report this came from: "6 submissions, weakest first" so why is Legacy code check last. It
   * was both of the other two at once, a draft with no score.
   */
  const rows = triageOrder(loaded);

  /**
   * Twelve columns, given widths instead of left to fight each other.
   *
   * Without these the browser shares the width out by content, and the things that lose are the
   * ones with the shortest content: the actions column shrank until "Open" broke across two
   * lines, while "Must ask" held a column wide enough for its heading to hold a single digit.
   * Reported in exactly those terms. A heading is allowed to wrap; a button is not.
   */
  const widths = ['auto', '5.2rem', '9rem', '5.4rem', '7.2rem', '6rem', '3.6rem', '7rem',
    '3.4rem', '4.2rem', '4.4rem', '6.6rem'];
  const table = el('table', { class: 'triage' }, [
    el('colgroup', {}, widths.map((w) => el('col', { style: `width:${w}` }))),
    el('thead', {}, [el('tr', {}, [
      el('th', {}, ['Initiative']),
      // The department says this, not us and not an assessor. A column reading "Ready to
      // review" with nothing saying who decided it invites somebody to read it as a status the
      // tool worked out.
      // The qualifier goes above the word, because it is read before it: what follows is what
      // the department said about itself, and not a state the tool worked out.
      noteHead('State', 'The submitter says this about their own assessment', 'left',
               [el('span', { class: 'th-sub' }, ['self-marked by submitter'])]),
      el('th', {}, ['Department']), el('th', {}, ['Marking']),
      noteHead('Code and set',
               'Evidence emails quote it in their subject line, so searching for it finds '
               + 'everything sent about this assessment. It is the start of the '
               + 'twelve-character code.'),
      el('th', {}, ['Stage']), el('th', {}, ['Score']), el('th', {}, ['Routing']),
      el('th', {}, ['Must ask']), el('th', {}, ['Evidence']), el('th', {}, ['Complete']),
      // Its own column, because "has anybody looked at this" is a fact about the row and was
      // reading as a tag stuck on the state the department set.
      noteHead('Audited', 'Who has written an audit on this submission', 'right'),
      el('th', {}, ['']),
    ])]),
  ]);
  const tb = el('tbody', {});
  /**
   * Ready and draft are two groups, and the eye should find the join without being told.
   *
   * The list is sorted ready first and a sentence used to say so. The sort is visible; what was
   * not visible is where one group stops, so the first draft row carries a rule above it and
   * the drafts are dimmed.
   */
  let wasReady: boolean | null = null;
  for (const l of rows) {
    const ready = !!l.a.meta?.submittedAt;
    const breaks = wasReady === true && !ready;
    wasReady = ready;
    const highs = l.fs.filter((f) => f.severity === 'high').length;
    /**
     * The row opens the submission, and the button that used to is gone.
     *
     * A worklist where the only way in is a small button at the far right makes somebody cross
     * eleven columns to act on what they have already read. Clicking anywhere that is not
     * itself a control opens it, the keyboard opens it, and Open is still in the row menu for
     * anybody who looks there first.
     */
    const openThis = (e: Event) => {
      if ((e.target as HTMLElement).closest('button, a, summary, input, label, details')) return;
      openDetail(l.rubric, root, l);
    };
    tb.appendChild(el('tr', {
      class: `row-open ${ready ? '' : 'is-draft'} ${breaks ? 'group-break' : ''}`,
      tabindex: 0,
      role: 'link',
      title: `Open ${l.a.initiative?.name || l.file}`,
      onclick: openThis,
      onkeydown: (e: Event) => {
        const k = (e as KeyboardEvent).key;
        if (k !== 'Enter' && k !== ' ') return;
        e.preventDefault();
        openDetail(l.rubric, root, l);
      },
    }, [
      el('td', {}, [
        l.a.initiative?.name || l.file,
        // A submitter keeps working after they say it is ready, so a row can be newer than the
        // copy this assessor last read. Saying so is what stops an audit being written against
        // a version nobody is looking at any more.
        l.changed
          ? el('span', { class: 'badge badge-warn tiny tag', title: 'The store had a newer version than the one you opened' }, ['updated'])
          : null,
      ]),
      // Whether the department says this is finished. A draft in this list is somebody's work
      // in progress, and scoring one is the mistake this column exists to prevent.
      el('td', { class: 'small' }, [
        // One word, because a three-word badge in a narrow column wraps into a shape that
        // reads as broken. The date is on the hover, where a date belongs.
        l.a.meta?.submittedAt
          ? el('span', {
              class: 'badge tag',
              title: `Marked ready to review on ${new Date(l.a.meta.submittedAt).toLocaleString()}`,
            }, ['Ready'])
          : el('span', { class: 'muted', title: 'Nobody has said this one is finished' }, ['Draft']),
      ]),
      el('td', {}, [l.a.initiative?.department ?? '--']),
      el('td', { class: 'small' }, [l.a.initiative?.classification || 'unmarked']),
      // Two facts, one under the other. Side by side they read as one string, and "ZZ99 1.0-dan"
      // is not a thing anybody has.
      el('td', { class: 'small mono' }, [
        l.a.id
          ? el('div', {}, [el('span', { class: 'ref-chip mono' }, [refOf(l.a)])])
          : null,
        el('div', { class: 'dim' }, [
          l.a.rubric.version,
          l.substituted
            ? el('span', {
                class: 'badge badge-warn tiny tag',
                title: substitutedWhy(l),
              }, [t('not comparable', 'non comparable')])
            : null,
        ]),
      ]),
      el('td', { class: 'small' }, [l.rubric.lifecycleStages.find((s) => s.id === l.a.initiative.lifecycleStage)?.label ?? '--']),
      // The badge is three columns from the number it is about, so the number says it too.
      el('td', {
        class: `num ${tone(l.r.overall)}`,
        ...(l.substituted ? { title: substitutedWhy(l) } : {}),
      }, [l.r.overall === null ? '--' : l.r.overall.toFixed(1)]),
      el('td', { class: 'small' }, [l.r.band?.label ?? '--']),
      el('td', { class: highs ? 'num red' : 'num' }, [String(highs)]),
      el('td', { class: 'num' }, [String(Object.values(l.a.answers).reduce((n, x) => n + (x.evidence ?? []).length, 0))]),
      el('td', { class: 'small' }, [`${Math.round(l.r.completeness * 100)}%`]),
      // The detail reads the set this submission was answered against, so the questions and
      // weights on screen are the ones the department actually answered.
      el('td', { class: 'small' }, [auditedCell(l)]),
      el('td', {}, [
        el('div', { class: 'row-acts' }, [
          el('details', { class: 'set-menu row-menu' }, [
            el('summary', { class: 'set-menu-btn', 'aria-label': 'More actions', title: 'More actions' }, ['\u22EF']),
            el('div', { class: 'set-menu-pop' }, [
              el('button', {
                class: 'menu-item',
                onclick: () => openDetail(l.rubric, root, l),
              }, ['Open what needs you']),
              el('button', {
                class: 'menu-item',
                onclick: () => openDetail(l.rubric, root, l, 'all'),
              }, ['Open the full submission']),
              el('div', { class: 'menu-sep' }),
              l.a.id
                /**
                 * Copying says it copied, and the menu goes.
                 *
                 * Reported as: I click it and nothing changes, maybe it copied, and the menu is
                 * still sitting open. Both halves of that are the control's fault. A copy is
                 * silent by nature, so the only evidence it happened has to be put on the
                 * screen, and a menu that stays open after its item has been used reads as an
                 * item that did not work.
                 */
                ? el('button', {
                    class: 'menu-item',
                    onclick: (e: Event) => {
                      const code = formatCode(l.a.id ?? '');
                      const item = e.currentTarget as HTMLElement;
                      const done = (said: string) => {
                        item.textContent = said;
                        window.setTimeout(() => {
                          (item.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');
                          item.textContent = `Copy the access code (${code})`;
                        }, 900);
                      };
                      try {
                        const write = navigator.clipboard?.writeText(code);
                        if (write) void write.then(() => done(`Copied ${code}`), () => done('Press the keys to copy it'));
                        else done('Press the keys to copy it');
                      } catch {
                        done('Press the keys to copy it');
                      }
                    },
                  }, [`Copy the access code (${formatCode(l.a.id ?? '')})`])
                : null,
              /**
               * There is no control here that removes anything.
               *
               * "Take it off this list" dropped the row from this browser and left the record
               * in the store, which is a distinction nobody reading a list of submissions can
               * be expected to hold. It was renamed once from "Close this one" for the same
               * reason and the rename did not fix it. Reported as: remove this button. Reload
               * the pool to get the list back, and deleting lives in the danger zone.
               */
            ]),
          ]),
        ]),
      ]),
    ]));
  }
  table.appendChild(tb);

  root.appendChild(el('section', { class: 'card' }, [
    el('h2', {}, [
      t('Submissions', 'Soumissions'),
      el('span', { class: 'muted small count-beside' }, [` ${loaded.length}`]),
    ]),
    /**
     * The toolbar. It goes above the table, where it reads as belonging to it.
     *
     * Two full-size buttons used to sit under the table: an export and a Clear that emptied
     * every submission and every score, verdict and reason the assessor had typed. Nothing
     * destroys work from a toolbar, at the same size and in the same colour as a benign control
     * beside it, and closing one submission you are finished with is what an assessor actually
     * wants. So closing is per row, and the one that closes everything is the last item in a
     * menu, in red, under a separator.
     */
    el('div', { class: 'res-toolbar' }, [
      el('button', {
        class: 'ghost small btn-icon',
        html: `${ICON_DOWN}<span>Export as CSV</span>`,
        onclick: () => askExportCsv(rubric),
      }),
      /**
       * TAKEN OUT ON 1 OCTOBER WITH THE DROP ZONE, and coming back with it.
       *
       *   el('label', { class: 'filelabel ghost small btn-icon', title: 'Read .json submissions people sent you. They are read in this browser and nothing is uploaded.' }, [
       *     el('span', {}, ['Open files']),
       *     fileInput(rubric, root),
       *   ]),
       */
      el('span', { class: 'spacer' }),
      /**
       * Checking the pool again, and nothing else.
       *
       * There was a "Close all and erase the audit" here. It did not touch anybody's
       * assessment, but it read as though it did, and what it actually erased was the
       * assessor's own scores, verdicts and reasons, which live in this browser and nowhere
       * else. A control that reads as deleting other people's work and in fact deletes your own
       * is wrong twice over. Closing is per row, where an assessor closes the one they have
       * finished with. Deleting a record from the store is an admin's act, in Settings, one
       * assessment at a time, and it asks for the code.
       */
      /**
       * There is one of these on this screen and there were two.
       *
       * "Check the pool again" sat on this toolbar and "Check the store again" sat on the line
       * above the table, doing the same thing in different words, which reads as two features.
       * The one on the source line stays, because that line is what it is about.
       */
    ]),
    el('div', { class: 'table-wrap' }, [table]),
  ]));
}

/**
 * One section's heading, with the control Dan asked for by name.
 *
 * A section an assessor has read and has nothing to say about should take one click, not one
 * per question, and it must touch no score. It is here rather than inside either screen
 * because both of them show sections now: the triage folds the unflagged ones and the full
 * view lays all of them out, and a control that existed on only one of those would be a
 * control people could not find.
 */
function sectionHead(
  sec: SectionScore,
  a: Assessment,
  audit: NonNullable<Assessment['audit']>,
  repaint: () => void,
): HTMLElement {
  return el('h4', { class: 'section-head' }, [
    sec.section.label,
    el('span', { class: 'muted small' }, [`${sec.weight}% of this domain`]),
    el('span', { class: `pill small ${tone(sec.score)}` }, [sec.score === null ? '--' : sec.score.toFixed(1)]),
    el('button', {
      class: 'ghost small',
      title: 'Mark every question in this section as agreed. Changes no scores.',
      onclick: () => {
        let agreed = 0;
        let kept = 0;
        for (const qs of sec.questions) {
          const e = (audit.perQuestion[qs.question.id] ??= { auditedScore: null, verdict: '', note: '' });
          // A score the assessor has already changed is not one they agree with, and neither
          // is a question they have already judged some other way.
          if (typeof e.auditedScore === 'number' && e.auditedScore !== (a.answers[qs.question.id]?.score ?? null)) {
            kept++;
            continue;
          }
          if (e.verdict && e.verdict !== 'agree') { kept++; continue; }
          e.verdict = 'agree';
          e.by = auditor || 'unnamed';
          e.at = new Date().toISOString();
          agreed++;
        }
        lastAgree = { section: sec.section.id, agreed, kept };
        keepSession();
        repaint();
      },
    }, ['Agree with all']),
    lastAgree && lastAgree.section === sec.section.id
      ? el('span', { class: 'small muted' }, [
          `${lastAgree.agreed} marked as agreed`,
          lastAgree.kept ? `, ${lastAgree.kept} left as you scored ${lastAgree.kept === 1 ? 'it' : 'them'}` : '',
        ])
      : null,
  ]);
}


/**
 * The assessor's page, ordered the way the work actually goes: the anomalies first, with the
 * scoring controls sitting inside each one so nothing has to be looked up, and the remaining
 * questions folded away until somebody wants them. Reading 176 answers is the job this is
 * meant to abolish.
 */
/**
 * One submission, at one of three depths.
 *
 * Her shape, in her own words after a sitting with real records: the screen you land on is
 * useful as it is, a looking glass over the whole submission, and everything to do with
 * assessing it should be a block you press rather than the rest of that page. What you changed
 * stays on the front, because it is the record of what this assessor has already decided and
 * it belongs with the summary of the thing.
 *
 * So: 'overview' is the submission, with a door marked Assessment. 'needs' is the anomalies,
 * which is the screen the tool was built around. 'all' is the assessment laid out the way the
 * department filled it in. The last two are two tabs of one place, because they are two ways
 * of reading the same work, and the sign-off sits under both.
 *
 * It is one function because every part of it is computed from the same twenty locals. Three
 * functions would be three copies of that arithmetic.
 */
type Depth = 'flagged' | 'all';

function openDetail(rubric: Rubric, root: HTMLElement, l: Loaded, depth: Depth = 'flagged') {
  clear(root);
  rememberWhere(l.a.id, depth);
  const { a, r, fs } = l;
  /**
   * Opening a submission is not auditing it.
   *
   * This stamped reviewedAt with the time the screen was drawn, so a record somebody had
   * glanced at claimed to have been reviewed. On a build with no store that is worse than
   * cosmetic: the portfolio is handed the same objects this screen mutates, so it called a
   * record audited because an assessor had opened it. The stamp belongs where the work is
   * written, and scheduleAuditSave already puts it there.
   */
  const audit = (a.audit ??= { reviewer: '', reviewedAt: '', perQuestion: {}, overallNote: '' });
  const byQuestion = new Map<string, Flag[]>();
  for (const f of fs) {
    if (!f.questionId) continue;
    byQuestion.set(f.questionId, [...(byQuestion.get(f.questionId) ?? []), f]);
  }
  /** Questions reachable through an aggregated card, so they are not also listed below. */
  const inAggregate = new Set(fs.flatMap((f) => f.questionIds ?? []));
  // A question can carry its own finding and sit inside an aggregate at the same time. It is
  // still one question to look at: count it once, and show it once, inside the aggregate.
  const needLook = new Set([...byQuestion.keys(), ...inAggregate]);
  const questionOf = new Map(allQuestionScores(r).map((qs) => [qs.question.id, qs]));
  /**
   * A redraw leaves the page where it was.
   *
   * Reported as: when I click on numbers, it moves my screen somewhere. The screen is rebuilt
   * from nothing on a score, so the document gets shorter or taller for a moment and the
   * browser keeps the same offset against a different page. Putting the offset back after the
   * rebuild is the whole of it.
   */
  const repaint = () => {
    const at = window.scrollY;
    openDetail(rubric, root, l, depth);
    window.scrollTo({ top: at });
  };
  // Other people's audits arrive after the page does. Nothing waits on them: the screen draws
  // with this assessor's own work and redraws when the rest lands.
  if (!l.auditsRead) void readAudits(l).then(repaint);

  const changed = Object.entries(audit.perQuestion).filter(
    ([qid, e]) => typeof e.auditedScore === 'number' && e.auditedScore !== (a.answers[qid]?.score ?? null),
  );
  const evidenceCount = Object.values(a.answers).reduce((n, x) => n + (x.evidence ?? []).length, 0);

  root.appendChild(el('nav', { class: 'card tight crumbs', 'aria-label': 'Where you are' }, [
    el('button', {
      class: 'linkish',
      onclick: () => { rememberWhere(undefined, 'flagged'); renderReview(root, rubric); },
    }, ['Submissions']),
    el('span', { class: 'crumb-sep', 'aria-hidden': true }, ['\u203A']),
    el('span', { class: 'crumb-here' }, [a.initiative?.name || l.file]),
  ]));

  /**
   * Who has audited this, above everything else on the page.
   *
   * One word for one thing. The list column says audited, this says audited, and the trail at
   * the foot is about saving, which is what a department does to its own answers.
   */
  {
    const mine = Object.keys(audit.perQuestion).length > 0;
    const who = [...(mine ? ['You'] : []), ...(l.others ?? []).map((x) => x.reviewerName?.trim() || x.reviewer)];
    root.appendChild(el('section', { class: `card tight audited-by ${who.length ? '' : 'none-yet'}` }, [
      who.length
        ? el('p', {}, [el('b', {}, [who.join(', ')]), ' audited this'])
        : el('p', {}, ['Nobody has audited this yet']),
    ]));
  }

  /**
   * The heading of this view goes at the top of it.
   *
   * It had drifted below the version trail, so opening a submission led with who saved it last
   * and how many saves there had been, and the name of the initiative and its score came after.
   * Reported as: why did this move, it is the heading of the view.
   */
  root.appendChild(el('section', { class: 'card headline' }, [
    el('div', { class: `bigscore ${tone(r.overall)}` }, [
      el('span', { class: 'num' }, [r.overall === null ? '--' : r.overall.toFixed(1)]),
      el('span', { class: 'outof' }, ['self-scored']),
    ]),
    el('div', { class: 'headline-text' }, [
      el('h1', {}, [a.initiative.name || l.file]),
      el('p', { class: 'muted small' }, [
        [a.initiative.department, a.initiative.contact,
         rubric.lifecycleStages.find((x) => x.id === a.initiative.lifecycleStage)?.label]
          .filter(Boolean).join('  ·  '),
      ]),
      el('div', { class: `marking-inline ${a.initiative.classification ? '' : 'unmarked'}` }, [
        a.initiative.classification ? `Marked ${a.initiative.classification}` : 'This submission is unmarked',
      ]),
      a.initiative.summary ? el('p', { class: 'small' }, [a.initiative.summary]) : null,
      r.maturity ? el('div', { class: 'maturity' }, [
        el('strong', {}, [r.maturity.label]), el('div', { class: 'small' }, [r.maturity.detail]),
      ]) : null,
      r.band ? el('div', { class: `band ${r.band.tone}` }, [
        el('strong', {}, [r.band.label]), el('div', { class: 'small' }, [r.band.routing]),
      ]) : null,
    ]),
  ]));


  /**
   * The same answers cut by category, for the person who has to decide what to ask about.
   *
   * The submitter gets this on their results page and the assessor did not, which is the wrong
   * way round: a department that is fine overall and weak on security is exactly the case an
   * assessor exists to catch, and the four domain numbers hide it by dividing those questions
   * four ways.
   *
   * Read-only here. An assessor's opinion of a question belongs in the audit, which is its own
   * screen with its own reasons attached, and a second place to change a score is a second
   * place for the two to disagree.
   */
  {
    const domainIds = new Set(rubric.domains.map((d) => d.id));
    const cats = r.topics.filter((x) => x.total > 0 && !domainIds.has(x.topic.id));
    if (cats.length) {
      const box = el('section', { class: 'card' }, [
        el('h2', {}, ['By category']),
        el('p', { class: 'muted small' }, [
          'The same questions grouped by what they are about. One question can be in several ',
          'categories at once, so these do not add up to the overall.',
        ]),
      ]);
      for (const cat of cats) {
        const mine = allQuestionScores(r)
          .filter((qs) => (qs.question.topics ?? []).includes(cat.topic.id))
          .sort((x, y) => (x.answered ? (x.raw as number) : 99) - (y.answered ? (y.raw as number) : 99));
        const rows = el('div', { class: 'cat-list' }, mine.map((qs) => {
          const said = qs.answered ? (qs.raw as number).toFixed(0)
            : a.answers[qs.question.id]?.na ? 'n/a' : 'not answered';
          return el('div', { class: 'cat-q cat-q-flat' }, [
            el('span', { class: `cat-q-score ${qs.answered ? tone(qs.raw as number) : 'dim'}` }, [said]),
            el('span', { class: 'cat-q-text' }, [
              qs.question.text,
              el('span', { class: 'cat-q-where' }, [qs.question.id]),
            ]),
          ]);
        }));
        box.appendChild(section(`cat:${cat.topic.id}`, { class: 'cat-open' }, [
          el('summary', { class: 'bar-row' }, [
            el('div', { class: 'bar-label' }, [
              cat.topic.label,
              el('span', { class: 'muted small' }, [` ${cat.answered} of ${cat.total} answered`]),
              cat.redFlags.length
                ? el('span', { class: 'badge badge-bad' }, [`${cat.redFlags.length} answered no`])
                : null,
            ]),
            el('div', { class: 'bar-track' }, [
              el('div', { class: `bar-fill ${bar(cat.score)}`, style: `width:${((cat.score ?? 0) / 10) * 100}%` }),
            ]),
            el('div', { class: `bar-num ${tone(cat.score)}` }, [cat.score === null ? '--' : cat.score.toFixed(1)]),
          ]),
          rows,
        ]));
      }
      root.appendChild(box);
    }
  }

  root.appendChild(el('section', { class: 'card' }, [
    el('div', { class: 'kpi-row' }, [
      kpi(`${Math.round(r.completeness * 100)}%`, 'complete'),
      kpi(String(fs.filter((f) => f.severity === 'high').length), 'must ask'),
      kpi(String(needLook.size), 'questions flagged'),
      kpi(String(evidenceCount), 'pieces of evidence'),
      kpi(String(changed.length), 'you changed'),
    ]),
  ]));

  /**
   * Two ways of reading the same work, as two tabs.
   *
   * What needs you is the screen this tool was built around and the one Dan was shown. All the
   * questions is the assessment as the department filled it in. Neither is a better answer than
   * the other, so neither is buried inside the other.
   */
  const tab = (label: string, to: Depth) => el('button', {
    class: `tab ${depth === to ? 'on' : ''}`,
    'aria-current': depth === to ? 'page' : undefined,
    onclick: () => openDetail(rubric, root, l, to),
  }, [label]);
  root.appendChild(el('nav', { class: 'card tight assess-tabs', 'aria-label': 'This assessment' }, [
    tab('Flagged questions', 'flagged'),
    tab('All questions', 'all'),
  ]));

  if (depth === 'flagged') {
    // ---- 1. the anomalies, with the controls in place ------------------------------------
    const flagBox = el('section', { class: 'card' }, [
      el('h2', {}, ['Audit these']),
      el('p', { class: 'muted small' }, [
          `${needLook.size} of ${r.scoreable} questions need a look. Score them here; the rest is below if you want it.`,
      ]),
    ]);

    for (const f of fs.filter((x) => !x.questionId)) {
      if (!f.questionIds?.length) { flagBox.appendChild(flagCard(f)); continue; }
      // An aggregated finding: one card, with its questions behind a fold so the assessor
      // opens them only if the count alone is not enough to act on.
      const rows = el('div', {});
      for (const qid of f.questionIds) {
        const qs = questionOf.get(qid);
        if (qs) rows.appendChild(auditRow(rubric, a, qs, audit, byQuestion.get(qid) ?? [], repaint, true, l));
      }
      flagBox.appendChild(el('div', { class: `flag sev-${f.severity}` }, [
        flagTitle(f),
        el('div', { class: 'small' }, [f.detail]),
        f.challenge ? el('div', { class: 'small challenge' }, [f.challenge]) : null,
        section(`flag:${f.id ?? f.title}`, {}, [
          el('summary', { class: 'small' }, [`Score these ${f.questionIds.length}`]),
          rows,
        ]),
      ]));
    }

    if (!needLook.size) {
      flagBox.appendChild(el('p', {}, ['Nothing anomalous. Spot-check and move on.']));
    }
    for (const [qid, qflags] of byQuestion) {
      if (inAggregate.has(qid)) continue;   // already shown inside its aggregate
      const qs = questionOf.get(qid);
      if (!qs) continue;
      flagBox.appendChild(auditRow(rubric, a, qs, audit, qflags, repaint, true, l));
    }
    root.appendChild(flagBox);

  }

  // The assessment as the department filled it in, by domain and section.
  if (depth === 'all') {
    for (const d of r.domains) {
      const box = el('section', { class: 'card' }, [
        el('h2', {}, [
          d.domain.label,
          el('span', { class: `pill small ${tone(d.score)}` }, [d.score === null ? '--' : d.score.toFixed(1)]),
        ]),
      ]);
      for (const sec of d.sections) {
        const rows = el('div', {});
        let flaggedHere = 0;
        for (const qs of sec.questions) {
          const qflags = byQuestion.get(qs.question.id) ?? [];
          if (qflags.length) flaggedHere++;
          rows.appendChild(auditRow(rubric, a, qs, audit, qflags, repaint, qflags.length > 0, l));
        }
        box.appendChild(section(`full:${sec.section.id}`, { class: 'full-section', open: true }, [
          el('summary', { class: 'section-summary' }, [
            el('span', { class: 'section-title' }, [sec.section.label]),
            el('span', { class: 'muted small' }, [`${sec.questions.length} questions`]),
            flaggedHere ? el('span', { class: 'badge badge-warn tiny' }, [`${flaggedHere} flagged`]) : null,
          ]),
          sectionHead(sec, a, audit, repaint),
          rows,
        ]));
      }
      root.appendChild(box);
    }
  }

  // ---- 2. what the assessor changed ----------------------------------------------------
  if (changed.length) {
    const box = el('section', { class: 'card' }, [
      el('h2', {}, ['What you changed']),
      el('p', { class: 'muted small' }, [
        'The gap between what they claimed and what you scored. This is the calibration record.',
      ]),
    ]);
    for (const [qid, entry] of changed) {
      const qs = questionOf.get(qid);
      const self = a.answers[qid]?.score ?? null;
      const delta = (entry.auditedScore as number) - (self ?? 0);
      box.appendChild(el('div', { class: 'audit-row changed' }, [
        el('div', { class: 'q-head' }, [
          el('span', { class: 'qid' }, [qid]),
          el('span', { class: 'q-text' }, [qs?.question.text ?? qid]),
        ]),
        el('div', { class: 'small' }, [
          `They said ${self ?? '--'}, you scored ${entry.auditedScore} `,
          el('span', { class: `delta ${delta > 0 ? 'up' : 'down'}` }, [`${delta > 0 ? '+' : ''}${delta}`]),
          entry.verdict ? ` · ${entry.verdict}` : '',
          entry.note ? ` · ${entry.note}` : '',
        ]),
      ]));
    }
    root.appendChild(box);
  }

  // ---- 4. sign off ---------------------------------------------------------------------
  root.appendChild(el('section', { class: 'card' }, [
    el('p', { class: 'small' }, [
      'Auditing as ', el('b', {}, [auditor || 'unnamed']), ' ',
      /**
       * Not a warning when there is an account behind the name.
       *
       * On a build with a provider this is the address the provider gave, and the store will
       * not even list the pool to an address it has not checked (deploy/firestore.rules,
       * email_verified). The card printed "unverified" against it unconditionally, which was
       * not a cautious statement but a false one. The header already got this right.
       */
      nameIsChecked()
        ? el('span', { class: 'badge' }, ['signed in'])
        : el('span', { class: 'badge badge-warn' }, ['not checked']),
      el('span', { class: 'muted' }, [' Recorded against every score you change.']),
    ]),
    /**
     * Where this audit lives, in a sentence, because it used to live nowhere.
     *
     * Everything typed here stayed in one browser and left as a downloaded file. A second
     * assessor saw none of it and a cleared browser lost all of it, and nothing on screen said
     * so. Saying where the work is takes one line and is the difference between a tool
     * somebody can rely on and one they find out about afterwards.
     */
    el('p', { class: 'small audit-where' }, [auditWhere(l)]),
    el('label', { class: 'field' }, [
      el('span', {}, ['Overall note for the board']),
      el('textarea', {
        rows: 4,
        oninput: (e: Event) => {
          audit.overallNote = (e.target as HTMLTextAreaElement).value;
          keepSession();
        },
      }, [audit.overallNote ?? '']),
    ]),
    el('div', { class: 'actions' }, [
      (() => {
        const missing = unexplainedChanges(a);
        return el('button', {
          class: 'primary', disabled: missing.length > 0,
          title: missing.length
            ? `A changed score needs a reason: ${missing.join(', ')}`
            : 'Save your audit',
          onclick: () => {
            audit.reviewedAt = new Date().toISOString();
            audit.reviewer = auditor || audit.reviewer;
            download(`${slug(a.initiative.name)}-audited.json`, JSON.stringify(a, null, 2));
          },
        }, [missing.length ? `${missing.length} change${missing.length === 1 ? '' : 's'} need a reason` : 'Save the audited file']);
      })(),
      el('button', { class: 'ghost', onclick: () => window.print() }, ['Print the one-pager']),
    ]),
  ]));

  // Saving is what a department does to its own answers, so this is the last thing on the
  // page rather than the first: an assessor reads it once they have a reason to.
  /**
   * Whose version this is, and the ones before it.
   *
   * On the full view and not on the list, because it is the question an assessor asks once they
   * have decided to read something, not while they are scanning. The name is typed by whoever
   * pressed save and checked by nobody, which is said here every time it is shown: the same
   * rule the assessor's own name has always lived under.
   *
   * A save replaces the document, so this trail is not a history of the answers. It is a
   * history of who put a version there, when, and what it scored at the time, which is enough
   * to see that a number moved and to go and ask the person who moved it.
   */
  {
    const by = a.meta?.savedBy;
    const trail = [...(a.meta?.saves ?? [])].reverse();
    const MOMENT: Record<string, string> = {
      first: 'first saved online',
      ready: 'marked ready to review',
      unready: 'ready mark taken off',
      save: 'saved',
    };
    const box = el('section', { class: 'card' }, [
      el('h2', {}, ['Saved versions']),
      by
        ? el('p', {}, [
            el('b', {}, [by.name]), ' ', el('span', { class: 'mono small' }, [by.email]),
            el('span', { class: 'badge badge-warn tiny tag' }, ['not checked']),
            el('div', { class: 'muted small' }, [
              `${new Date(by.at).toLocaleString()}. On save the tool asks the submitter for a name and a `,
              'work email address, and refuses an address that does not end in gc.ca or canada.ca. ',
              'That is all the checking there is. Nobody confirms the person behind it.',
            ]),
          ])
        : el('p', { class: 'muted' }, [
            'Nobody. This version was saved before the tool asked who was saving, or it came from a file.',
          ]),
    ]);
    if (trail.length > 1) {
      const list = el('details', { class: 'trail' }, [
        el('summary', {}, [`Earlier saves (${trail.length - 1})`]),
      ]);
      const table = el('table', { class: 'trail-table' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', {}, ['When']), el('th', {}, ['Who']), el('th', {}, ['What']),
          el('th', {}, ['Score']),
          // "Answered" read as something an assessor had done. It is the department's own
          // progress at that save: how many of the 176 they had filled in by then.
          noteHead('Answers filled in',
                   'How many of the questions the department had filled in at that save',
                   'right'),
        ])]),
      ]);
      const tbody = el('tbody', {});
      for (const x of trail) {
        tbody.appendChild(el('tr', {}, [
          el('td', { class: 'small' }, [new Date(x.at).toLocaleString()]),
          el('td', { class: 'small' }, [x.name, el('div', { class: 'mono dim tiny' }, [x.email])]),
          // The two named moments survive when the trail fills up, because they are the ones
          // somebody asks about afterwards.
          el('td', { class: 'small' }, [
            x.moment && x.moment !== 'save'
              ? el('span', { class: 'badge tag' }, [MOMENT[x.moment] ?? x.moment])
              : MOMENT.save,
          ]),
          el('td', { class: `num ${tone(x.score ?? null)}` }, [
            typeof x.score === 'number' ? x.score.toFixed(1) : '--',
          ]),
          el('td', { class: 'num' }, [typeof x.answered === 'number' ? String(x.answered) : '--']),
        ]));
      }
      table.appendChild(tbody);
      list.appendChild(el('div', { class: 'table-wrap' }, [table]));
      box.appendChild(list);
    }
    root.appendChild(box);
  }
}

function kpi(value: string, label: string): HTMLElement {
  return el('div', { class: 'kpi' }, [
    el('span', { class: 'kpi-num' }, [value]),
    el('span', { class: 'kpi-label' }, [label]),
  ]);
}

/**
 * The severity of a finding, in words as well as in colour.
 *
 * The submitter's copy of this list has said the word since it was written, for the reason
 * given there: colour on its own is not a signal for everybody reading it. The assessor's copy
 * carried the colour alone, and once severity stopped being a fill the dot was all that was
 * left of it.
 */
function flagTitle(f: Flag): HTMLElement {
  return el('div', { class: 'flag-title' }, [
    el('span', { class: 'sev-dot' }),
    el('strong', {}, [f.title]),
    el('span', { class: 'badge tiny' }, [f.severity]),
  ]);
}

function flagCard(f: Flag): HTMLElement {
  return el('div', { class: `flag sev-${f.severity}` }, [
    flagTitle(f),
    el('div', { class: 'small' }, [f.detail]),
    f.challenge ? el('div', { class: 'small challenge' }, [f.challenge]) : null,
  ]);
}

/**
 * Who has audited this submission, for its own column.
 *
 * Asked for as a column rather than a tag beside the state, and the two are different facts:
 * the state is what the department said about itself, and this is what assessors have done
 * since. Nobody having looked is said in words, because an empty cell reads as a cell that has
 * not loaded.
 */
function auditedCell(l: Loaded): HTMLElement {
  const who = l.auditedBy ?? [];
  if (!who.length) return el('span', { class: 'muted', title: 'Nobody has written an audit on this one' }, ['Nobody yet']);
  const title = `Audited by ${who.join(', ')}`;
  if (!l.auditedByMe) return el('span', { class: 'audited-who', title }, [who.join(', ')]);
  const others = who.length - 1;
  return el('span', { class: 'audited-who audited-mine', title }, [
    el('b', {}, ['You']),
    others ? `, and ${others} other${others === 1 ? '' : 's'}` : '',
  ]);
}

/** How a verdict reads when it is somebody else's, where there is no room for a dropdown. */
const VERDICT_SAID: Record<string, string> = {
  agree: 'agreed', adjust: 'adjusted', insufficient: 'not enough evidence',
};

/** One question, with its flags, its evidence, and the controls to re-score it. */
function auditRow(
  rubric: Rubric,
  a: Assessment,
  qs: QuestionScore,
  audit: NonNullable<Assessment['audit']>,
  qflags: Flag[],
  repaint: () => void,
  flagged: boolean,
  l: Loaded,
): HTMLElement {
  const q = qs.question;
  const ans = a.answers[q.id];
  const entry: AuditEntry = (audit.perQuestion[q.id] ??= { auditedScore: null, verdict: '', note: '' });
  const standing = entry.auditedScore;
  const ev = ans?.evidence ?? [];
  const wasChanged = typeof entry.auditedScore === 'number' && entry.auditedScore !== (ans?.score ?? null);

  return el('div', {
    class: `audit-row ${flagged ? 'flagged' : ''} ${wasChanged ? 'changed' : ''}`,
    'data-qid': q.id,
  }, [
    el('div', { class: 'q-head' }, [
      el('span', { class: `pill small ${tone(qs.raw)}` }, [qs.na ? 'n/a' : qs.raw === null ? '--' : String(qs.raw)]),
      el('span', { class: 'qid' }, [q.id]),
      el('span', { class: 'q-text' }, [q.text]),
      wasChanged
        ? el('span', { class: `delta ${(entry.auditedScore as number) > (ans?.score ?? 0) ? 'up' : 'down'}` }, [
            `you: ${entry.auditedScore}`,
          ])
        : null,
    ]),

    ...qflags.map((f) => el('div', { class: `flag sev-${f.severity}` }, [
      flagTitle(f),
      el('div', { class: 'small' }, [f.detail]),
      f.challenge ? el('div', { class: 'small challenge' }, [f.challenge]) : null,
    ])),

    ans?.justification
      ? el('p', { class: 'said small' }, ['They said: ', ans.justification])
      : el('p', { class: 'muted small' }, ['No justification given.']),

    ev.length
      ? el('ul', { class: 'ev-list small' }, ev.map((e) =>
          el('li', {}, [
            el('b', {}, [e.title || e.attachment?.name || 'untitled']),
            `. ${e.kind}, ${e.classification || 'unmarked'}`,
            e.attachment
              ? el('span', {}, [
                  `, ${humanSize(e.attachment.size)}. `,
                  el('button', { class: 'ghost small', onclick: () => openAttachment(e.attachment!) }, ['Open']),
                ])
              : el('span', {}, [
                  '. Not attached. Recorded as living at: ',
                  /^https?:\/\//.test(e.location)
                    ? el('a', { href: e.location, target: '_blank', rel: 'noreferrer' }, [e.location])
                    : el('i', {}, [e.location || 'no location given']),
                ]),
            e.note ? `. ${e.note}` : '',
          ]),
        ))
      : el('p', { class: 'muted small' }, ['No evidence referenced.']),

    // The exchange, and the two facts that show by default: it was edited, and by whom.
    (entry.history ?? []).length
      ? el('details', { class: 'exchange' }, [
          el('summary', {}, [
            el('b', {}, ['Edited']),
            ' by ',
            (entry.history ?? []).map((m) => m.by).filter((v, i, arr) => arr.indexOf(v) === i).join(', '),
            el('span', { class: 'tiny dim' }, [` · ${(entry.history ?? []).length} change${(entry.history ?? []).length === 1 ? '' : 's'}`]),
          ]),
          el('ol', { class: 'exchange-list small' }, (entry.history ?? []).map((m) =>
            el('li', {}, [
              el('b', {}, [`${m.score ?? '--'} `]),
              `by ${m.by} `,
              m.unverified === false
                ? el('span', { class: 'badge tiny' }, ['signed in'])
                : el('span', { class: 'badge badge-warn tiny' }, ['not checked']),
              m.note ? el('div', { class: 'muted' }, [m.note]) : el('div', { class: 'warn-text' }, ['No reason given.']),
            ]),
          )),
        ])
      : null,

    /**
     * What the other assessors made of this question.
     *
     * One block each, read-only, because they are one document each and nobody's reading is
     * overwritten by the next person's. There is no combined number here on purpose: two
     * assessors who disagree are a thing for the board to settle in the room, and a tool that
     * averaged them would be making that decision quietly and badly.
     */
    ...(l.others ?? [])
      .map((other) => ({ other, e: other.perQuestion?.[q.id] }))
      .filter(({ e }) => e && (typeof e.auditedScore === 'number' || (e.note ?? '').trim() || e.verdict))
      .map(({ other, e }) => el('div', { class: 'other-audit' }, [
        el('div', { class: 'other-head small' }, [
          el('b', {}, [other.reviewerName?.trim() || other.reviewer]),
          el('span', { class: 'muted' }, [' scored ']),
          el('b', {}, [e!.auditedScore === null || e!.auditedScore === undefined ? '--' : String(e!.auditedScore)]),
          e!.verdict ? el('span', { class: 'badge tiny' }, [VERDICT_SAID[e!.verdict] ?? e!.verdict]) : null,
        ]),
        (e!.note ?? '').trim()
          ? el('div', { class: 'small' }, [e!.note ?? ''])
          : el('div', { class: 'small muted' }, ['No reason given.']),
      ])),

    auditControls(a, q, entry, standing, l, repaint),
  ]);
}

/**
 * Which sections an assessor had open, kept across a redraw.
 *
 * Reported as: I press the score and the whole thing closes. Every control redrew the screen,
 * and an open `details` was derived state with nothing remembering it, so the section somebody
 * was working inside shut under the cursor with the question half done. The alternative, never
 * redrawing, loses the things that are computed from the audit: whether the line counts as
 * changed, the summary of what was changed, and whether the file can be saved yet. So the
 * screen still redraws and the open sections survive it.
 */
const openSections = new Set<string>();

function section(key: string, attrs: Record<string, unknown>, kids: (Node | string | null)[]): HTMLElement {
  const d = el('details', { ...attrs, open: openSections.has(key) }, kids) as HTMLDetailsElement;
  d.addEventListener('toggle', () => {
    if (d.open) openSections.add(key); else openSections.delete(key);
  });
  return d;
}

/**
 * The controls an assessor scores with.
 *
 * Three things were wrong with these and all three were reported in one sitting.
 *
 * The score was a number spinner. A submitter picks from eleven rungs with a name and a
 * sentence against each, and an assessor disagreeing with that pick was typing a bare integer
 * into a box with up and down arrows. The same row of buttons the submitter uses says what the
 * numbers mean, shows which one the department chose, and cannot be set to 11.
 *
 * Touching any of them collapsed the section. Every control called repaint(), which rebuilds
 * the whole screen, and an open `details` is derived state: it closed under the cursor, with
 * the question you were part way through inside it. Nothing here repaints the page any more.
 * The pieces that have to change on a keystroke change themselves, which is the pattern the
 * questionnaire has used since the same thing happened there.
 *
 * And an empty entry is not an audit. Opening a submission used to write a blank entry for all
 * 176 questions and save every one of them, so the record of what an assessor had looked at
 * was a list of everything they had scrolled past.
 */
function auditControls(
  a: Assessment,
  q: { id: string },
  entry: AuditEntry,
  standing: number | null,
  l: Loaded,
  repaint: () => void,
): HTMLElement {
  const scores = el('div', { class: 'score-row audit-score' });
  const note = el('input', {
    type: 'text',
    placeholder: 'Why? Required for a changed score',
    value: entry.note ?? '',
  }) as HTMLInputElement;
  const delta = el('span', { class: 'audit-delta small' });

  const theirs = a.answers[q.id]?.score ?? null;

  const paintDelta = () => {
    clear(delta);
    if (entry.auditedScore === null || entry.auditedScore === undefined) return;
    if (entry.auditedScore === theirs) { delta.appendChild(el('span', { class: 'muted' }, ['same as theirs'])); return; }
    const dir = theirs === null ? '' : entry.auditedScore > theirs ? 'up' : 'down';
    delta.appendChild(el('span', { class: `delta ${dir}` }, [
      theirs === null ? `you: ${entry.auditedScore}` : `you: ${entry.auditedScore}, they said ${theirs}`,
    ]));
  };

  const markNote = () => {
    note.classList.toggle('needs-marking', needsReason(a, q.id, entry));
  };

  const choose = (v: number | null) => {
    if (v !== entry.auditedScore) {
      entry.auditedScore = v;
      entry.by = auditor || 'unnamed';
      entry.at = new Date().toISOString();
      (entry.history ??= []).push({
        by: entry.by, at: entry.at, score: v, note: entry.note ?? '',
        unverified: !nameIsChecked(),
      });
    }
    keepSession();
    scheduleAuditSave(l);
    // Whether the line counts as changed, the summary of what was changed and whether the file
    // can be saved are all computed from the audit, so the screen is redrawn. The sections an
    // assessor had open survive it.
    repaint();
  };

  function paintScores(): void {
    clear(scores);
    for (let v = 0; v <= 10; v++) {
      const on = entry.auditedScore === v;
      scores.appendChild(el('button', {
        class: `score-btn v${v} ${on ? 'on' : ''} ${theirs === v ? 'theirs' : ''}`,
        type: 'button',
        role: 'radio',
        'aria-checked': on ? 'true' : 'false',
        title: theirs === v ? `${v}. The department chose this one` : String(v),
        onclick: () => choose(on ? null : v),
      }, [String(v)]));
    }
    scores.appendChild(el('button', {
      class: `score-btn audit-clear ${entry.auditedScore === null || entry.auditedScore === undefined ? 'on' : ''}`,
      type: 'button',
      title: 'No score of your own on this question',
      onclick: () => choose(null),
    }, ['none']));
  }

  /**
   * Typing does not redraw and finishing does.
   *
   * Whether the file can be saved depends on this field having something in it, and that is
   * computed where the screen is built. Redrawing on every keystroke would take the caret with
   * it; redrawing when the field is left is both correct and invisible.
   */
  note.addEventListener('change', () => repaint());
  note.addEventListener('input', () => {
    entry.note = note.value;
    const hist = entry.history ?? [];
    const last = hist[hist.length - 1];
    if (last && last.score === entry.auditedScore) last.note = entry.note ?? '';
    markNote();
    keepSession();
    scheduleAuditSave(l);
  });

  paintScores();
  paintDelta();
  markNote();
  void standing;

  return el('div', { class: 'audit-controls' }, [
    el('div', { class: 'audit-line' }, [
      el('span', { class: 'audit-label small' }, ['Your score']),
      scores,
      delta,
    ]),
    el('div', { class: 'audit-line' }, [
      el('select', {
        onchange: (e: Event) => {
          entry.verdict = (e.target as HTMLSelectElement).value as AuditEntry['verdict'];
          keepSession();
          scheduleAuditSave(l);
          repaint();
        },
      }, [
        el('option', { value: '', selected: entry.verdict === '' }, ['Choose a verdict']),
        el('option', { value: 'agree', selected: entry.verdict === 'agree' }, ['Agree with them']),
        el('option', { value: 'adjust', selected: entry.verdict === 'adjust' }, ['Adjusted']),
        el('option', { value: 'insufficient', selected: entry.verdict === 'insufficient' }, ['Not enough evidence']),
      ]),
      note,
    ]),
  ]);
}

/** Dan's rule: a changed number must be justified. An unchanged one needs no words. */
export function needsReason(a: Assessment, qid: string, entry: AuditEntry): boolean {
  const changed = typeof entry.auditedScore === 'number'
    && entry.auditedScore !== (a.answers[qid]?.score ?? null);
  return changed && !(entry.note ?? '').trim();
}

export function unexplainedChanges(a: Assessment): string[] {
  const audit = a.audit;
  if (!audit) return [];
  return Object.entries(audit.perQuestion)
    .filter(([qid, e]) => needsReason(a, qid, e))
    .map(([qid]) => qid);
}

/**
 * One file per question set. A single sheet cannot hold two sets: the columns are the question
 * ids, so mixing them either drops answers or invents columns. Submissions answered against
 * different sets are different sheets, named by version.
 */

/**
 * Downloading one audited submission as a file has gone with the control that offered it.
 *
 * saveAudited was reachable only from "Take it off this list", as the copy somebody was handed
 * before the row went. With the row control gone it had no caller. The audit is in the store and
 * the whole list exports as a sheet, so nothing is stranded; if a per-submission file is wanted
 * again it belongs on the submission itself and not inside a control that removes something.
 */


/**
 * Exporting the whole list, and the one thing the sheet cannot carry.
 *
 * No column in the CSV records how a submission is marked, so a set of rows that includes a
 * Protected B submission produces a file with nothing on it saying so. The window says which
 * marking to treat the file as, because that is the decision the person is about to make
 * without knowing it.
 */
function askExportCsv(active: Rubric): void {
  const sets = new Set(loaded.map((l) => `${l.rubric.id}@${l.rubric.version}`));
  const marked = loaded.filter((l) => (l.a.initiative?.classification ?? '').trim());
  const worst = marked
    .map((l) => l.a.initiative.classification)
    .sort((x, y) => classRank(y) - classRank(x))[0];
  confirmStep({
    tier: 'plain',
    title: `Export ${loaded.length} submission${loaded.length === 1 ? '' : 's'} as CSV?`,
    body: 'One row for each submission: the department, the contact, every question score, and the auditor name. It leaves out the reasoning people typed and the evidence links.',
    stake: marked.length
      ? `${marked.length} of these are marked ${worst}. No column in the sheet records that, so treat the file as ${worst} and keep it somewhere that marking is allowed.`
      : 'No column in the sheet records how a submission is marked, so treat the file at the highest marking any of these carries.',
    note: sets.size > 1
      ? `One sheet cannot hold two question sets, because the columns are the question ids. This saves ${sets.size} files, one for each set.`
      : undefined,
    commitLabel: sets.size > 1 ? `Save ${sets.size} files` : 'Save the file',
    cancelLabel: 'Cancel',
    onCommit: () => exportAllCsv(active),
  });
}

function exportAllCsv(_active: Rubric) {
  const sets = new Map<string, { rubric: Rubric; rows: Loaded[] }>();
  for (const l of loaded) {
    const key = `${l.rubric.id}@${l.rubric.version}`;
    if (!sets.has(key)) sets.set(key, { rubric: l.rubric, rows: [] });
    sets.get(key)!.rows.push(l);
  }
  for (const { rubric: set, rows: group } of sets.values()) {
    const table = [csvHeader(set)];
    for (const l of group) {
      table.push(csvRow(set, l.a, { high: l.fs.filter((f) => f.severity === 'high').length, total: l.fs.length }));
    }
    const suffix = sets.size > 1 ? `-${slug(set.version)}` : '';
    download(`gc-arch-submissions${suffix}.csv`, toCsv(table), 'text/csv');
  }
}

