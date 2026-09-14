import { classRank, type Assessment, type AuditEntry, type Rubric } from './types';
import { refOf } from './storage';
import { el, clear, tone } from './dom';
import { allQuestionScores, score, type QuestionScore, type Result } from './scoring';
import { flags, type Flag } from './flags';
import { csvHeader, csvRow, toCsv } from './csv';
import { download, readJsonFiles, slug } from './storage';
import { humanSize, openAttachment } from './attach';
import { rubricFor } from './library';
import { confirmStep } from './confirm';
import { SAD_CAT } from './cat';
import { ICON_DOWN } from './icons';
import { formatCode } from './firebase';
import { isHosted, poolRecords, type PoolAnswer } from './store';
import { repaint } from './views-submit';
import BUILTIN from '../rubric/rubric.v1-dan.json';

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
  r: Result;
  fs: Flag[];
  /** The store handed back a newer version of this one after the assessor had opened it. */
  changed?: boolean;
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
const AUDIT_KEY = 'gc-arch-assessment:audit-session';

function keepSession(): void {
  try {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(loaded.map((l) => ({ file: l.file, a: l.a }))));
  } catch {
    /* private window, or full. The session still holds in this tab. */
  }
}

function restoreSession(rubric: Rubric): void {
  if (loaded.length) return;
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    if (!raw) return;
    const rows = JSON.parse(raw) as { file: string; a: Assessment }[];
    for (const row of rows) {
      if (row?.a?.fileType !== 'gc-arch-assessment') continue;
      const own = rubricFor(BUILTIN as unknown as Rubric, row.a.rubric);
      const use = own ?? rubric;
      const r = score(use, row.a);
      loaded.push({ file: row.file, a: row.a, rubric: use, substituted: !own, r, fs: flags(use, row.a, r) });
    }
  } catch {
    /* a half-written record is not worth failing the page over */
  }
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
export function forgetPool(): void { asked = false; poolNow = { state: 'idle' }; }

function absorb(rubric: Rubric, answer: PoolAnswer): void {
  if (answer.state !== 'ok') {
    poolNow = answer.state === 'off' ? { state: 'idle' } : answer as Pool;
    return;
  }
  let added = 0;
  for (const rec of answer.records) {
    const a = rec.assessment;
    if (a?.fileType !== 'gc-arch-assessment') continue;
    const own = rubricFor(BUILTIN as unknown as Rubric, a.rubric);
    const use = own ?? rubric;
    const r = score(use, a);
    const row: Loaded = {
      file: a.initiative?.name?.trim() || a.ref || rec.id,
      a, rubric: use, substituted: !own, r, fs: flags(use, a, r),
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
      const theirs = a.meta?.updatedAt ?? '';
      const ours = mine.a.meta?.updatedAt ?? '';
      if (!(theirs > ours)) continue;
      if (mine.a.audit && !row.a.audit) row.a.audit = mine.a.audit;
      row.changed = true;
      loaded[held] = row;
      added++;
      continue;
    }
    loaded.push(row);
    added++;
  }
  if (added) keepSession();
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
      detail: 'Submissions are meant to arrive in one place that you and the departments both see. That store is not built, so there is nothing to fetch.',
      badge: 'Not hosted yet',
      tone: 'badge-warn',
    };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      title: 'Cannot reach the pool',
      detail: 'This machine is offline. Your submissions are still there and will appear when the connection is back.',
      badge: 'Offline',
      tone: 'badge-warn',
    };
  }
  if (poolNow.state === 'loading') {
    return {
      title: 'Looking in the pool',
      detail: 'Asking the store what it has for you.',
      badge: 'Checking',
      tone: '',
    };
  }
  if (poolNow.state === 'anonymous') {
    return {
      title: 'Sign in to see the pool',
      detail: 'The store only answers somebody it knows. Files you were sent still open here without signing in.',
      badge: 'Not signed in',
      tone: 'badge-warn',
    };
  }
  if (poolNow.state === 'refused') {
    return {
      title: 'Your account cannot read the pool',
      detail: `Signing in worked. The store then refused to list submissions for this address, which is what it does until an admin grants you the assessor role. The store's words: ${poolNow.problem}`,
      badge: 'No access',
      tone: 'badge-warn',
    };
  }
  if (poolNow.state === 'failed') {
    return {
      title: 'The pool did not answer',
      detail: `Something went wrong reaching the store: ${poolNow.problem}`,
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

export function renderReview(root: HTMLElement, rubric: Rubric): void {
  clear(root);
  restoreSession(rubric);
  askPool(rubric);
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
    ? el('button', { class: 'ghost small', onclick: () => { forgetPool(); repaint(); } }, ['Check again'])
    : null;

  /**
   * The sad cat is for an empty screen. Once submissions are on the page, telling the assessor
   * that nothing is assigned to them contradicts the list directly underneath, so what is left
   * is one line saying where they came from and a way to ask again.
   */
  const head = loaded.length
    ? el('div', { class: 'pool-in' }, [
        el('span', { class: 'badge' }, [
          poolNow.state === 'ok'
            ? `${poolNow.found} from the pool`
            : 'From files',
        ]),
        el('span', { class: 'muted small' }, [
          `${loaded.length} submission${loaded.length === 1 ? '' : 's'} open.`,
        ]),
        again,
      ])
    : el('div', { class: 'pool-out' }, [
        el('div', { class: 'pool-art', html: SAD_CAT }),
        el('div', {}, [
          el('h2', {}, [pool.title]),
          el('p', { class: 'muted' }, [pool.detail]),
          el('div', { class: 'actions' }, [
            el('span', { class: `badge ${pool.tone}` }, [pool.badge]),
            again,
          ]),
        ]),
      ]);

  const drop = el('section', { class: 'card dropzone' }, [
    head,
    el('h3', { class: 'pool-alt-h' }, [
      loaded.length ? 'Load more from files' : 'Load submissions from files instead',
    ]),
    el('p', { class: 'muted small' }, [
      'Drop the .json files people sent you, or pick them. They are read here in your browser, and nothing is uploaded.',
    ]),
    el('input', {
      type: 'file', accept: '.json', multiple: true,
      onchange: async (e: Event) => {
        const input = e.target as HTMLInputElement;
        if (input.files) await ingest(rubric, input.files, root);
      },
    }),
  ]);

  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', async (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    if (e.dataTransfer?.files) await ingest(rubric, e.dataTransfer.files, root);
  });

  root.appendChild(drop);
  if (loaded.length) paintList(rubric, root);
}

async function ingest(rubric: Rubric, files: FileList, root: HTMLElement) {
  const read = await readJsonFiles(files);
  const problems: string[] = [];
  for (const item of read) {
    const a = item.data as Assessment;
    if (item.error || a?.fileType !== 'gc-arch-assessment') {
      problems.push(`${item.file}: not a self-assessment file`);
      continue;
    }
    /**
     * Score a submission against the set it was answered against. Recomputing a two-year-old
     * assessment with today's weights produces a number that was never anybody's score, and
     * the old behaviour did exactly that behind a one-line notice.
     */
    const own = rubricFor(BUILTIN as unknown as Rubric, a.rubric);
    const use = own ?? rubric;
    const substituted = !own;
    if (a.rubric.version !== rubric.version && own) {
      problems.push(`${item.file}: answered against ${a.rubric.version}. That set is in your library, so the scores here were worked out with it.`);
    } else if (substituted) {
      const known = new Set(
        use.domains.flatMap((d) => d.sections.flatMap((sec) => sec.questions.map((q) => q.id))),
      );
      const lost = Object.keys(a.answers).filter((id) => !known.has(id)).length;
      problems.push(
        `${item.file}: answered against ${a.rubric.version}, which this browser does not have. Scored with ${use.version} instead`
        + (lost ? `, and ${lost} answer${lost === 1 ? '' : 's'} do not exist in it.` : '.')
        + ' Add that set in Settings to see its real scores.',
      );
    }
    const r = score(use, a);
    const had = loaded.find((l) => l.file === item.file);
    if (had && Object.keys(had.a.audit?.perQuestion ?? {}).length) {
      problems.push(`${item.file}: this file was already open and has been replaced by the version you just picked. The scores and notes you had typed against the old one are gone.`);
    }
    loaded = loaded.filter((l) => l.file !== item.file);
    loaded.push({ file: item.file, a, rubric: use, substituted, r, fs: flags(use, a, r) });
    keepSession();
  }
  renderReview(root, rubric);
  if (problems.length) {
    root.appendChild(el('section', { class: 'card warn' }, [
      el('strong', {}, ['Notes on the files you loaded']),
      el('ul', {}, problems.map((p) => el('li', {}, [p]))),
    ]));
  }
}

function paintList(rubric: Rubric, root: HTMLElement) {
  /**
   * Ready first, then weakest first.
   *
   * The submitter's results page says, in both languages, that marking an assessment ready
   * puts "Ready to review" beside it in this list. It did not: the list never read the mark,
   * so a finished assessment and an untouched draft looked the same, and the promise on the
   * other screen was false. Reading it here is what makes the mark mean something.
   */
  const ready = (l: Loaded) => (l.a.meta?.submittedAt ? 0 : 1);
  const rows = [...loaded].sort((x, y) => ready(x) - ready(y) || (x.r.overall ?? 99) - (y.r.overall ?? 99));

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
      el('th', {}, ['Initiative']), el('th', {}, ['State']), el('th', {}, ['Department']), el('th', {}, ['Marking']),
      el('th', {}, ['Code and set']),
      el('th', {}, ['Stage']), el('th', {}, ['Score']), el('th', {}, ['Routing']),
      el('th', {}, ['Must ask']), el('th', {}, ['Evidence']), el('th', {}, ['Complete']), el('th', {}, ['']),
    ])]),
  ]);
  const tb = el('tbody', {});
  for (const l of rows) {
    const highs = l.fs.filter((f) => f.severity === 'high').length;
    tb.appendChild(el('tr', {}, [
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
      el('td', { class: 'small mono' }, [
        l.a.id
          ? el('span', {
              class: 'ref-chip mono',
              title: `The first four characters of this assessment's code, which is what its email subjects quote. The whole code is in the row menu.`,
            }, [refOf(l.a)])
          : null,
        ' ',
        l.a.rubric.version,
        l.substituted ? el('span', { class: 'badge badge-warn tiny' }, ['set missing']) : null,
      ]),
      el('td', { class: 'small' }, [l.rubric.lifecycleStages.find((s) => s.id === l.a.initiative.lifecycleStage)?.label ?? '--']),
      el('td', { class: `num ${tone(l.r.overall)}` }, [l.r.overall === null ? '--' : l.r.overall.toFixed(1)]),
      el('td', { class: 'small' }, [l.r.band?.label ?? '--']),
      el('td', { class: highs ? 'num red' : 'num' }, [String(highs)]),
      el('td', { class: 'num' }, [String(Object.values(l.a.answers).reduce((n, x) => n + (x.evidence ?? []).length, 0))]),
      el('td', { class: 'small' }, [`${Math.round(l.r.completeness * 100)}%`]),
      // The detail reads the set this submission was answered against, so the questions and
      // weights on screen are the ones the department actually answered.
      el('td', {}, [
        el('div', { class: 'row-acts' }, [
          el('button', { class: 'ghost small', onclick: () => openDetail(l.rubric, root, l) }, ['Open']),
          el('details', { class: 'set-menu row-menu' }, [
            el('summary', { class: 'set-menu-btn', 'aria-label': 'More actions', title: 'More actions' }, ['\u22EF']),
            el('div', { class: 'set-menu-pop' }, [
              l.a.id
                ? el('button', {
                    class: 'menu-item',
                    onclick: () => {
                      const code = formatCode(l.a.id ?? '');
                      try { void navigator.clipboard?.writeText(code); } catch { /* no clipboard here */ }
                    },
                  }, [`Copy the access code (${formatCode(l.a.id ?? '')})`])
                : null,
              el('div', { class: 'menu-sep' }),
              el('button', {
                class: 'menu-item menu-danger',
                onclick: () => closeOne(root, rubric, l),
              }, ['Close this one']),
            ]),
          ]),
        ]),
      ]),
    ]));
  }
  table.appendChild(tb);

  root.appendChild(el('section', { class: 'card' }, [
    el('h2', {}, [`${loaded.length} submission${loaded.length === 1 ? '' : 's'}, weakest first`]),
    el('p', { class: 'muted small' }, [
      'Sorted so the ones that need you are at the top. The middle of the list is where you spend the least time.',
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
      el('button', {
        class: 'ghost small',
        onclick: () => { forgetPool(); repaint(); },
      }, ['Check the pool again']),
    ]),
    el('div', { class: 'table-wrap' }, [table]),
  ]));
}

/**
 * The assessor's page, ordered the way the work actually goes: the anomalies first, with the
 * scoring controls sitting inside each one so nothing has to be looked up, and the remaining
 * questions folded away until somebody wants them. Reading 176 answers is the job this is
 * meant to abolish.
 */
function openDetail(rubric: Rubric, root: HTMLElement, l: Loaded) {
  clear(root);
  const { a, r, fs } = l;
  const audit = (a.audit ??= { reviewer: '', reviewedAt: new Date().toISOString(), perQuestion: {}, overallNote: '' });
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
  const repaint = () => openDetail(rubric, root, l);

  const changed = Object.entries(audit.perQuestion).filter(
    ([qid, e]) => typeof e.auditedScore === 'number' && e.auditedScore !== (a.answers[qid]?.score ?? null),
  );
  const evidenceCount = Object.values(a.answers).reduce((n, x) => n + (x.evidence ?? []).length, 0);

  root.appendChild(el('section', { class: 'card tight actions' }, [
    el('button', { class: 'ghost', onclick: () => renderReview(root, rubric) }, ['Back to the list']),
    el('span', { class: 'muted small' }, [l.file]),
  ]));

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
      el('h2', {}, ['Who saved this']),
      by
        ? el('p', {}, [
            el('b', {}, [by.name]), ' ', el('span', { class: 'mono small' }, [by.email]),
            el('span', { class: 'badge badge-warn tiny tag' }, ['unverified']),
            el('div', { class: 'muted small' }, [
              `${new Date(by.at).toLocaleString()}. Typed by whoever pressed save, and checked by nobody. `,
              'It tells you who to ask.',
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
          el('th', {}, ['Score']), el('th', {}, ['Answered']),
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

  root.appendChild(el('section', { class: 'card' }, [
    el('div', { class: 'kpi-row' }, [
      kpi(String(fs.filter((f) => f.severity === 'high').length), 'must ask'),
      kpi(String(needLook.size), 'questions flagged'),
      kpi(`${Math.round(r.completeness * 100)}%`, 'complete'),
      kpi(String(evidenceCount), 'pieces of evidence'),
      kpi(String(changed.length), 'you changed'),
    ]),
  ]));

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
      if (qs) rows.appendChild(auditRow(rubric, a, qs, audit, byQuestion.get(qid) ?? [], repaint, true));
    }
    flagBox.appendChild(el('div', { class: `flag sev-${f.severity}` }, [
      el('div', { class: 'flag-title' }, [el('span', { class: 'sev-dot' }), el('strong', {}, [f.title])]),
      el('div', { class: 'small' }, [f.detail]),
      f.challenge ? el('div', { class: 'small challenge' }, [f.challenge]) : null,
      el('details', {}, [
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
    flagBox.appendChild(auditRow(rubric, a, qs, audit, qflags, repaint, true));
  }
  root.appendChild(flagBox);

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

  // ---- 3. everything else, folded away -------------------------------------------------
  const restBox = el('section', { class: 'card' });
  const rest = el('div', {});
  let restCount = 0;
  for (const d of r.domains) {
    const domainRows: HTMLElement[] = [];
    for (const sec of d.sections) {
      const rows = sec.questions.filter((qs) => !byQuestion.has(qs.question.id) && !inAggregate.has(qs.question.id));
      if (!rows.length) continue;
      domainRows.push(el('h4', { class: 'section-head' }, [
        sec.section.label,
        el('span', { class: 'muted small' }, [`${sec.weight}% of this domain`]),
        el('span', { class: `pill small ${tone(sec.score)}` }, [sec.score === null ? '--' : sec.score.toFixed(1)]),
        // Dan asked for this by name: a section an assessor has read and has nothing to say
        // about should take one click, not one per question. It touches no score.
        el('button', {
          class: 'ghost small',
          title: 'Mark every question in this section as agreed. Changes no scores.',
          onclick: () => {
            let agreed = 0;
            let kept = 0;
            for (const qs of sec.questions) {
              const e = (audit.perQuestion[qs.question.id] ??= { auditedScore: null, verdict: '', note: '' });
              // A score the assessor has already changed is not one they agree with, and
              // neither is a question they have already judged some other way.
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
      ]));
      for (const qs of rows) {
        domainRows.push(auditRow(rubric, a, qs, audit, [], repaint, false));
        restCount++;
      }
    }
    if (!domainRows.length) continue;
    rest.appendChild(el('h3', {}, [
      d.domain.label,
      el('span', { class: `pill small ${tone(d.score)}` }, [d.score === null ? '--' : d.score.toFixed(1)]),
    ]));
    for (const n of domainRows) rest.appendChild(n);
  }
  restBox.appendChild(el('details', {}, [
    el('summary', { class: 'section-summary' }, [
      el('span', { class: 'section-title' }, [`Everything else`]),
      el('span', { class: 'muted small' }, [`${restCount} questions with nothing flagged`]),
    ]),
    rest,
  ]));
  root.appendChild(restBox);

  // ---- 4. sign off ---------------------------------------------------------------------
  root.appendChild(el('section', { class: 'card' }, [
    el('p', { class: 'small' }, [
      'Auditing as ', el('b', {}, [auditor || 'unnamed']), ' ',
      el('span', { class: 'badge badge-warn' }, ['unverified']),
      el('span', { class: 'muted' }, [' Recorded against every score you change.']),
    ]),
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
}

function kpi(value: string, label: string): HTMLElement {
  return el('div', { class: 'kpi' }, [
    el('span', { class: 'kpi-num' }, [value]),
    el('span', { class: 'kpi-label' }, [label]),
  ]);
}

function flagCard(f: Flag): HTMLElement {
  return el('div', { class: `flag sev-${f.severity}` }, [
    el('div', { class: 'flag-title' }, [el('span', { class: 'sev-dot' }), el('strong', {}, [f.title])]),
    el('div', { class: 'small' }, [f.detail]),
    f.challenge ? el('div', { class: 'small challenge' }, [f.challenge]) : null,
  ]);
}

/** One question, with its flags, its evidence, and the controls to re-score it. */
function auditRow(
  rubric: Rubric,
  a: Assessment,
  qs: QuestionScore,
  audit: NonNullable<Assessment['audit']>,
  qflags: Flag[],
  repaint: () => void,
  flagged: boolean,
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
      el('div', { class: 'flag-title' }, [el('span', { class: 'sev-dot' }), el('strong', {}, [f.title])]),
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
              el('span', { class: 'badge badge-warn tiny' }, ['unverified']),
              m.note ? el('div', { class: 'muted' }, [m.note]) : el('div', { class: 'warn-text' }, ['No reason given.']),
            ]),
          )),
        ])
      : null,

    el('div', { class: 'audit-controls' }, [
      el('label', {}, ['Your score ', el('input', {
        type: 'number', min: 0, max: 10, value: entry.auditedScore ?? '',
        onchange: (e: Event) => {
          const v = (e.target as HTMLInputElement).value;
          const next = v === '' ? null : Number(v);
          // Compared against the score as it stood when this row was drawn: oninput has
          // already written the field through, so entry.auditedScore is no baseline.
          if (next !== standing) {
            entry.auditedScore = next;
            entry.by = auditor || 'unnamed';
            entry.at = new Date().toISOString();
            (entry.history ??= []).push({
              by: entry.by, at: entry.at, score: next, note: entry.note ?? '', unverified: true,
            });
          }
          keepSession();
          repaint();
        },
        oninput: (e: Event) => {
          const v = (e.target as HTMLInputElement).value;
          entry.auditedScore = v === '' ? null : Number(v);
        },
      })]),
      el('select', {
        onchange: (e: Event) => { entry.verdict = (e.target as HTMLSelectElement).value as AuditEntry['verdict']; },
      }, [
        el('option', { value: '', selected: entry.verdict === '' }, ['Choose a verdict']),
        el('option', { value: 'agree', selected: entry.verdict === 'agree' }, ['Agree with them']),
        el('option', { value: 'adjust', selected: entry.verdict === 'adjust' }, ['Adjusted']),
        el('option', { value: 'insufficient', selected: entry.verdict === 'insufficient' }, ['Not enough evidence']),
      ]),
      el('input', {
        type: 'text',
        class: needsReason(a, q.id, entry) ? 'needs-marking' : '',
        placeholder: needsReason(a, q.id, entry) ? 'Why? Required for a changed score' : 'Note',
        value: entry.note ?? '',
        oninput: (e: Event) => {
          entry.note = (e.target as HTMLInputElement).value;
          // Only the reason for the score as it now stands. Without this test, typing here
          // rewrote whatever reason happened to be last in the trail, which is the one thing
          // the trail exists to keep.
          const hist = entry.history ?? [];
          const last = hist[hist.length - 1];
          if (last && last.score === entry.auditedScore) last.note = entry.note ?? '';
          keepSession();
        },
        onchange: () => repaint(),
      }),
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
 * Close one submission, and say what that costs when it costs something.
 *
 * An assessor finishing with a file wants it off the list. An assessor who has scored it wants
 * to be asked, because the scores exist in this browser and in a file they may not have saved.
 */
function closeOne(root: HTMLElement, active: Rubric, l: Loaded): void {
  const name = l.a.initiative?.name?.trim() || l.file;
  const scored = Object.keys(l.a.audit?.perQuestion ?? {}).length;
  const drop = () => {
    loaded = loaded.filter((x) => x !== l);
    keepSession();
    renderReview(root, active);
  };
  if (!scored) { drop(); return; }
  confirmStep({
    tier: 'caution',
    title: `Close ${name} and erase the audit on it?`,
    body: `The file stays where it is on your machine. The ${scored} score${scored === 1 ? '' : 's'}, verdict${scored === 1 ? '' : 's'} and reason${scored === 1 ? '' : 's'} typed against it go, from this page and from this browser.`,
    stake: 'An audited file is the only copy that survives this.',
    offer: {
      label: 'Save the audited file first',
      run: () => { saveAudited(l); return `Saving the file for ${name}. Check your downloads folder.`; },
    },
    commitLabel: 'Erase this one',
    cancelLabel: 'Keep it open',
    onCommit: drop,
  });
}

/** One audited submission, as a file. The only copy of an audit that survives the browser. */
function saveAudited(l: Loaded): void {
  const a = l.a;
  const audit = (a.audit ??= { reviewer: '', reviewedAt: '', perQuestion: {}, overallNote: '' });
  audit.reviewedAt = audit.reviewedAt || new Date().toISOString();
  audit.reviewer = audit.reviewer || auditor;
  const name = slug(a.initiative?.name || a.ref || 'submission');
  download(`${name}-audited.json`, JSON.stringify(a, null, 2));
}


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

