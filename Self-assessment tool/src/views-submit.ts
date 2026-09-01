import { CLASSIFICATIONS, type Assessment, type EvidenceRef, type Question, type Rubric } from './types';
import { el, clear, tone } from './dom';
import { score, type Result, type SectionScore } from './scoring';
import { autosave, onSaveStateChange, saveAssessmentFile, saveStatus } from './storage';
import { humanSize, openAttachment, readAttachment, totalAttachedBytes, TOTAL_LIMIT, TOTAL_WARN } from './attach';
import { canSave, markingProblems } from './marking';

const KINDS: EvidenceRef['kind'][] = ['document', 'diagram', 'dashboard', 'system', 'report', 'other'];

/**
 * Rubric ids reach the DOM as element ids and aria references, and they are written by whoever
 * maintains the question set. Four sections already share the id "defining-the-current-state",
 * one per domain, so anything built from a section id has to be namespaced by its domain as
 * well as sanitised.
 */
export const cssId = (...parts: string[]): string =>
  parts.join('--').replace(/[^A-Za-z0-9_-]/g, '_');

/**
 * 176 questions in one scroll reads as a single undifferentiated sheet, however the questions
 * inside it are styled. So the questionnaire is one weighted section per page: 21 stops, the
 * overview plus Dan's twenty sections, each holding between three and fourteen questions.
 *
 * A page that can be finished is the thing that makes the parts feel like parts.
 */
let page = 'about';

interface Stop {
  key: string;
  label: string;
  domainId: string | null;
  sectionId: string | null;
}

function stops(rubric: Rubric): Stop[] {
  const out: Stop[] = [{ key: 'about', label: 'Overview', domainId: null, sectionId: null }];
  for (const d of rubric.domains) {
    for (const sec of d.sections) {
      out.push({ key: `${d.id}/${sec.id}`, label: sec.label, domainId: d.id, sectionId: sec.id });
    }
  }
  return out;
}

const stopOf = (list: Stop[], key: string): Stop => list.find((x) => x.key === key) ?? list[0];

/** The first stop of a domain, which is where its tab leads. */
const firstStopIn = (list: Stop[], domainId: string): string =>
  list.find((x) => x.domainId === domainId)?.key ?? 'about';

/**
 * Where somebody coming back should land. Answers left blank scatter among answered ones over
 * several sittings, and hunting for them is the worst part of returning to a long form.
 */
export function firstGap(rubric: Rubric, a: Assessment): { key: string; questionId: string | null } | null {
  if (overviewProgress(a)[0] < overviewProgress(a)[1]) return { key: 'about', questionId: null };
  for (const d of rubric.domains) {
    for (const sec of d.sections) {
      for (const q of sec.questions) {
        const ans = a.answers[q.id];
        // Not applicable counts as dealt with, so it is not a gap.
        if (!ans?.na && typeof ans?.score !== 'number') {
          return { key: `${d.id}/${sec.id}`, questionId: q.id };
        }
      }
    }
  }
  return null;
}

/**
 * History, so the browser's Back button walks back through the stops.
 *
 * Wrapped because pushState throws a SecurityError on a file:// page in some browsers, and
 * the tool has to work from a file. When it throws, navigation still works; only Back does not.
 */
function pushStop(key: string): void {
  try {
    window.history.pushState({ stop: key }, '', `#${key}`);
  } catch {
    /* file:// without history support. Navigation is unaffected. */
  }
}

export function currentStopKey(): string { return page; }
export function setStopKey(key: string): void { page = key; }

/** Set by the shell when the reader asks to be taken to the next gap. */
let scrollToQuestion: string | null = null;
export function goToFirstGap(rubric: Rubric, a: Assessment): boolean {
  const gap = firstGap(rubric, a);
  if (!gap) return false;
  page = gap.key;
  scrollToQuestion = gap.questionId;
  return true;
}

/**
 * Repainting only this view leaves the shell stale - most visibly the classification banner,
 * which the shell draws. The shell hands us its own paint so a marking change is reflected
 * everywhere at once.
 */
let repaintApp: () => void = () => {};
export function setRepaint(fn: () => void): void { repaintApp = fn; }

/**
 * Scoring a question used to rebuild the entire page, about four thousand nodes, because the
 * aggregate readouts (the domain tabs, the section averages, the footer total, the save gate)
 * had no way to update on their own. Rebuilding is why a section the reader had opened closed
 * itself, why focus jumped out of a field, and why no completion animation could survive a
 * click.
 *
 * So every aggregate readout registers a closure that repaints only itself from a fresh
 * Result. A score click recomputes the score once and runs those closures, which touches a few
 * dozen nodes. The score is still the single source of truth; nothing here caches a number.
 */
type Readout = (r: Result) => void;
let readouts: Readout[] = [];
const register = (fn: Readout, r: Result) => { fn(r); readouts.push(fn); };

/**
 * The domain tabs belong in the shell's sticky block, beside the header and the marking
 * banner. Two separately pinned strips leave a seam that page content shows through, and the
 * seam moves as the header wraps. They are built here, because they register readouts, and
 * handed to the shell to place.
 */
let tabsNode: HTMLElement | null = null;
export function takeSubmitTabs(): HTMLElement | null {
  const n = tabsNode;
  tabsNode = null;
  return n;
}

export function renderSubmit(
  root: HTMLElement,
  rubric: Rubric,
  a: Assessment,
  onDone: () => void,
): void {
  clear(root);
  readouts = [];
  const r = score(rubric, a);

  /**
   * Move to another page of the questionnaire. This one does rebuild, by definition.
   *
   * It also pushes a history entry, because a 21-page form that swallows the browser's Back
   * button is a form people get lost in. popstate is wired once, in the shell.
   */
  const navigate = (target: string) => {
    page = target;
    pushStop(target);
    repaintApp();
    window.scrollTo({ top: 0 });
  };

  /**
   * The cheap path: recompute the score once, let every registered readout update itself.
   *
   * The gate is the one thing a readout cannot handle alone, because the shell draws the
   * classification banner. So when the ability to save flips, fall back to a full repaint.
   * That happens a handful of times in a session, not on every click.
   */
  let couldSave = canSave(a);
  const refresh = () => {
    const nowCanSave = canSave(a);
    if (nowCanSave !== couldSave) { couldSave = nowCanSave; repaintApp(); return; }
    const next = score(rubric, a);
    for (const fn of readouts) fn(next);
  };

  const list = stops(rubric);
  const here = stopOf(list, page);
  page = here.key;

  tabsNode = stepper(rubric, a, r, navigate, list);

  const rail = el('aside', { class: 'rail' });
  const sheet = el('div', { class: 'sheet' });
  root.appendChild(el('div', { class: 'form-layout' }, [rail, sheet]));

  rail.appendChild(sectionRail(rubric, a, r, here, navigate, list));

  if (here.domainId === null) {
    sheet.appendChild(aboutSection(rubric, a, refresh, repaintApp, r));
  } else {
    const ds = r.domains.find((d) => d.domain.id === here.domainId);
    const ss = ds?.sections.find((x) => x.section.id === here.sectionId);
    if (!ds || !ss) { page = 'about'; repaintApp(); return; }
    sheet.appendChild(sectionHead(ds, ss, r, here));
    for (const qs of ss.questions) {
      sheet.appendChild(questionBlock(rubric, a, qs.question, refresh));
    }
  }

  if (!(here.domainId === null && overviewIsWizard(a))) {
    sheet.appendChild(pager(list, here, navigate, onDone));
  }
  root.appendChild(footerBar(rubric, a, r, onDone, here, navigate));

  if (scrollToQuestion) {
    const target = sheet.querySelector(`[data-qid="${cssId(scrollToQuestion)}"]`);
    scrollToQuestion = null;
    if (target && typeof (target as HTMLElement).scrollIntoView === 'function') {
      (target as HTMLElement).scrollIntoView({ block: 'center' });
    }
  }
}

/**
 * The heading of the one section on this page. It carries the section's weight inside its
 * domain and its own running average, so a reader knows what this page is worth without
 * leaving it.
 */
function sectionHead(
  ds: Result['domains'][number],
  ss: SectionScore,
  r: Result,
  here: Stop,
): HTMLElement {
  const pill = el('span', { class: 'pill', 'aria-hidden': true });
  const srPill = el('span', { class: 'sr-only' });
  const counts = el('p', { class: 'muted small' });

  const apply = (rr: Result) => {
    const d = rr.domains.find((x) => x.domain.id === here.domainId);
    const cur = d?.sections.find((x) => x.section.id === here.sectionId);
    if (!cur || !d) return;
    pill.className = `pill ${tone(cur.score)}`;
    pill.textContent = cur.score === null ? '--' : cur.score.toFixed(1);
    srPill.textContent = cur.score === null ? 'not scored yet' : `${cur.score.toFixed(1)} out of 10`;
    const share = cur.section.shareOfDomain ?? cur.weight;
    counts.textContent =
      `${share}% of ${d.domain.label}, which is ${d.domain.weight}% of the total. ` +
      `${cur.answered} of ${cur.total} answered on this page.`;
  };

  const stageNote = (() => {
    const exp = ss.expectation;
    if (exp === 'expected') return null;
    return el('span', { class: `badge ${exp === 'critical' ? 'badge-warn' : 'badge-soft'}` }, [
      exp === 'critical' ? 'Counts more at your stage' : 'Counts less at your stage',
    ]);
  })();

  const node = el('section', { class: 'card section-head-card' }, [
    el('p', { class: 'eyebrow' }, [ds.domain.label]),
    el('div', { class: 'head-row' }, [
      el('h2', {}, [ss.section.label]),
      pill,
      srPill,
      stageNote,
    ]),
    counts,
  ]);
  register(apply, r);
  return node;
}

/**
 * The rail. Both levels of the rubric, permanently on screen and costing no vertical space:
 * which section of which domain this page is, and how far through each one is.
 */
function sectionRail(
  rubric: Rubric,
  a: Assessment,
  r: Result,
  here: Stop,
  navigate: (t: string) => void,
  list: Stop[],
): HTMLElement {
  const nav = el('nav', { class: 'toc', 'aria-label': 'Sections of this assessment' });

  // Every other rail row carries a count and a track. Overview carried neither, which reads
  // as a row stuck at zero.
  const ovCount = el('span', { class: 'toc-count' });
  const ovFill = el('i');
  const overview = el('button', {
    class: `toc-row toc-overview ${here.key === 'about' ? 'on' : ''}`,
    onclick: () => navigate('about'),
  }, [
    el('span', { class: 'toc-label' }, ['Overview']),
    ovCount,
    el('span', { class: 'toc-bar' }, [ovFill]),
  ]);
  register(() => {
    const [done, total] = overviewProgress(a);
    const [fDone, fTotal] = overviewFieldProgress(a);
    ovCount.textContent = `${done}/${total}`;
    ovFill.style.width = fTotal > 0 ? `${Math.round((fDone / fTotal) * 100)}%` : '0%';
    overview.classList.toggle('done', done === total);
  }, r);
  nav.appendChild(overview);

  for (const d of rubric.domains) {
    const open = d.id === here.domainId;
    nav.appendChild(el('div', { class: 'toc-domain' }, [
      el('button', {
        class: `toc-row toc-dom ${open ? 'open' : ''}`,
        onclick: () => navigate(firstStopIn(list, d.id)),
      }, [
        el('span', { class: 'toc-label' }, [shortLabel(d.label)]),
        (() => {
          const c = el('span', { class: 'toc-count' });
          register((rr) => {
            const ds = rr.domains.find((x) => x.domain.id === d.id);
            c.textContent = `${ds?.answered ?? 0}/${ds?.total ?? 0}`;
          }, r);
          return c;
        })(),
      ]),
      ...(open
        ? d.sections.map((sec) => {
            const key = `${d.id}/${sec.id}`;
            const count = el('span', { class: 'toc-count' });
            const fill = el('i');
            const row = el('button', {
              class: `toc-row toc-sec ${here.key === key ? 'on' : ''}`,
              'aria-current': here.key === key ? 'page' : 'false',
              onclick: () => navigate(key),
            }, [
              el('span', { class: 'toc-label' }, [sec.label]),
              count,
              el('span', { class: 'toc-bar' }, [fill]),
            ]);
            register((rr) => {
              const cur = rr.domains
                .find((x) => x.domain.id === d.id)?.sections
                .find((x) => x.section.id === sec.id);
              const done = cur?.answered ?? 0;
              const total = cur?.total ?? 0;
              count.textContent = `${done}/${total}`;
              fill.style.width = total > 0 ? `${Math.round((done / total) * 100)}%` : '0%';
              row.classList.toggle('done', total > 0 && done === total);
            }, r);
            return row;
          })
        : []),
    ]));
  }
  return nav;
}

function stepper(
  rubric: Rubric,
  a: Assessment,
  r: Result,
  navigate: (target: string) => void,
  list: Stop[],
): HTMLElement {
  const step = (
    label: string,
    target: string,
    owns: (s: Stop) => boolean,
    count: (rr: Result) => [number, number],
    fill?: () => [number, number],
  ) => {
    const countEl = el('span', { class: 'step-count' });
    const bar = el('i');
    const fillOf = fill;
    const btn = el('button', {
      onclick: () => navigate(target),
    }, [
      el('span', { class: 'step-label' }, [label]),
      countEl,
      el('span', { class: 'step-bar' }, [bar]),
    ]);

    const apply = (rr: Result) => {
      const [done, total] = count(rr);
      const complete = total > 0 && done === total;
      const on = owns(stopOf(list, page));
      btn.className = `step ${on ? 'on' : ''} ${complete ? 'complete' : ''}`;
      btn.setAttribute('aria-current', on ? 'page' : 'false');
      countEl.textContent = `${done} of ${total}`;
      const [fDone, fTotal] = fillOf ? fillOf() : [done, total];
      bar.style.width = fTotal > 0 ? `${Math.round((fDone / fTotal) * 100)}%` : '0%';
    };
    register(apply, r);
    return btn;
  };

  return el('nav', { class: 'stepper', 'aria-label': 'Parts of the assessment' }, [
    step('Overview', 'about', (st) => st.domainId === null,
      () => overviewProgress(a), () => overviewFieldProgress(a)),
    ...rubric.domains.map((d) =>
      step(shortLabel(d.label), firstStopIn(list, d.id), (st) => st.domainId === d.id, (rr) => {
        const ds = rr.domains.find((x) => x.domain.id === d.id);
        return [ds?.answered ?? 0, ds?.total ?? 0];
      }),
    ),
  ]);
}

/**
 * The overview asks for six things, so counting it as one was misleading. None of them are
 * scored; they are what an assessor needs to know before reading a score.
 */
export function overviewProgress(a: Assessment): [number, number] {
  const groups = [
    !!(a.initiative.name.trim() && a.initiative.department.trim()
      && a.initiative.contact.trim() && a.initiative.summary.trim()),
    !!a.initiative.classification,
    !!a.initiative.lifecycleStage,
  ];
  return [groups.filter(Boolean).length, groups.length];
}

/**
 * The bar and the count measure different things on purpose.
 *
 * The count is groups, because the overview is three screens. The bar is the six underlying
 * fields, because a bar that cannot move until four fields are filled reads as broken: you
 * type your name, nothing happens, and the tool looks like it is ignoring you.
 */
export function overviewFieldProgress(a: Assessment): [number, number] {
  const fields = [
    a.initiative.name.trim(),
    a.initiative.department.trim(),
    a.initiative.contact.trim(),
    a.initiative.summary.trim(),
    a.initiative.classification,
    a.initiative.lifecycleStage,
  ];
  return [fields.filter(Boolean).length, fields.length];
}

/** "Application & Virtual Architecture" is too long for a tab. */
function shortLabel(s: string): string {
  return s.replace(/\s*&\s*\w+/, '').replace(/\s*Architecture$/, '');
}

function pager(list: Stop[], here: Stop, navigate: (t: string) => void, onDone: () => void): HTMLElement {
  const i = list.findIndex((x) => x.key === here.key);
  const prev = i > 0 ? list[i - 1] : null;
  const next = i < list.length - 1 ? list[i + 1] : null;
  return el('nav', { class: 'actions pager', 'aria-label': 'Move between sections' }, [
    prev
      ? el('button', { class: 'ghost', onclick: () => navigate(prev.key) }, [`Back: ${prev.label}`])
      : null,
    next
      ? el('button', { class: 'primary', onclick: () => navigate(next.key) }, [
          `Next: ${next.label}`,
          el('span', { class: 'arrow', 'aria-hidden': true }, ['\u2192']),
        ])
      : el('button', { class: 'primary', onclick: onDone }, ['See my results']),
  ]);
}

function footerBar(
  rubric: Rubric,
  a: Assessment,
  r: Result,
  onDone: () => void,
  here: Stop,
  navigate: (t: string) => void,
): HTMLElement {
  const gate = el('div', {});
  const pill = el('span', { class: 'pill', 'aria-hidden': true });
  const readout = el('span', { class: 'muted small' });
  const save = el('button', { class: 'ghost', onclick: () => saveFile(a) }, ['Save to a file']);

  /**
   * Two bars. One answer in 176 moves the whole-assessment bar by half a percent, which is
   * invisible; the median section holds nine questions, so a section bar moves about eleven
   * percent per answer. The one that can show progress is the one worth animating.
   */
  const secBar = el('i');
  const secLabel = el('span', { class: 'pbar-label' });
  const allBar = el('i');
  const allLabel = el('span', { class: 'pbar-label' });
  let sectionWasComplete = false;

  const apply = (rr: Result) => {
    const problems = markingProblems(a);
    clear(gate);
    gate.className = '';
    if (problems.length) {
      const needsFileMark = problems.some((x) => x.kind === 'no-file-marking');
      // Short enough to take in at a glance. The reader is trying to save, not to read.
      gate.className = 'gate-band';
      gate.appendChild(el('div', { class: 'gate small' }, [
        el('div', {}, [
          el('strong', {}, [needsFileMark ? 'Mark this file to save it' : 'Fix this to save']),
          needsFileMark ? '' : `: ${problems[0].message}`,
        ]),
        // Telling somebody to mark the file and making them go and find the control is how a
        // gate turns into a notice people learn to read past. The control is here.
        needsFileMark
          ? el('div', { class: 'gate-marks' }, CLASSIFICATIONS.map((c) =>
              el('button', {
                class: 'mark-btn',
                onclick: () => { a.initiative.classification = c; autosave(a); repaintApp(); },
              }, [c]),
            ))
          : null,
      ]));
    }
    pill.className = `pill ${tone(rr.overall)}`;
    pill.textContent = rr.overall === null ? '--' : rr.overall.toFixed(1);
    readout.textContent =
      `${rr.maturity ? rr.maturity.label : 'not scored yet'} - ${rr.answered} of ${rr.scoreable} answered`;
    save.disabled = problems.length > 0;
    save.title = problems.length
      ? problems.map((p) => p.message).join('\n')
      : 'Save a copy you can reopen later';

    const cur = here.domainId
      ? rr.domains.find((x) => x.domain.id === here.domainId)?.sections.find((x) => x.section.id === here.sectionId)
      : undefined;
    const done = cur?.answered ?? 0;
    const total = cur?.total ?? 0;
    secLabel.textContent = cur ? `This section ${done} of ${total}` : 'Overview';
    secBar.style.width = total > 0 ? `${Math.round((done / total) * 100)}%` : '0%';

    allLabel.textContent = `Whole assessment ${rr.answered} of ${rr.scoreable}`;
    allBar.style.width = rr.scoreable > 0 ? `${Math.round((rr.answered / rr.scoreable) * 100)}%` : '0%';

    // The reward for finishing a section, on an element that is pinned, so it is seen however
    // far down the page the reader is.
    const nowComplete = total > 0 && done === total;
    if (nowComplete && !sectionWasComplete) {
      secBar.classList.remove('celebrate');
      void secBar.offsetWidth;                     // restart the animation
      secBar.classList.add('celebrate');
      confetti(rr.answered >= rr.scoreable ? 'whole' : 'section');
    }
    sectionWasComplete = nowComplete;
    secBar.classList.toggle('done', nowComplete);
  };

  const node = el('div', { class: 'sticky-footer' }, [
    gate,
    el('div', { class: 'progress-row' }, [
      el('div', { class: 'pbar' }, [secLabel, el('div', { class: 'progress-shell' }, [secBar])]),
      el('div', { class: 'pbar' }, [allLabel, el('div', { class: 'progress-shell' }, [allBar])]),
    ]),
    el('div', { class: 'footer-inner' }, [
      el('div', { class: 'footer-score' }, [
        pill,
        readout,
        saveIndicator(),
      ]),
      el('div', { class: 'footer-actions' }, [
        (() => {
          const jump = el('button', { class: 'ghost', onclick: () => {
            if (goToFirstGap(rubric, a)) repaintApp();
          } }, ['Next unanswered']);
          register((rr) => { jump.hidden = rr.answered >= rr.scoreable; }, r);
          return jump;
        })(),
        save,
        el('button', { class: 'primary', onclick: onDone }, ['See my results']),
      ]),
    ]),
  ]);
  register(apply, r);
  return node;
}

/**
 * Finishing a section deserves more than a bar going green. Small, brief, and entirely
 * decorative: a dozen pieces of paper in the score ramp's own colours, thrown from the footer,
 * gone in a second and a half. Nothing waits on it and it cleans itself up.
 *
 * Skipped outright for anyone who has asked for reduced motion, and in jsdom, where there is
 * no animation to see and no point building nodes for one.
 */
function confetti(scale: 'section' | 'whole'): void {
  if (typeof document.createElement !== 'function') return;
  const reduced = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  const burst = el('div', { class: 'confetti', 'aria-hidden': true });
  const pieces = scale === 'whole' ? 60 : 18;
  for (let i = 0; i < pieces; i++) {
    const p = el('i');
    // Spread across the width, in the eleven score colours, with staggered starts.
    p.style.setProperty('--x', `${Math.round((i / pieces) * 100)}%`);
    p.style.setProperty('--c', `var(--s${i % 11})`);
    p.style.setProperty('--d', `${(i % 7) * 60}ms`);
    p.style.setProperty('--r', `${((i * 37) % 120) - 60}px`);
    burst.appendChild(p);
  }
  document.body.appendChild(burst);
  setTimeout(() => burst.remove(), scale === 'whole' ? 2600 : 1800);
}

/**
 * Three states, and never silent. Conventional wording: a spinner while a write is in flight,
 * a plain past tense when it lands, and a reason plus what to do when it does not.
 */
function saveIndicator(): HTMLElement {
  const node = el('span', { class: 'save-state tiny', role: 'status' });
  const paint = () => {
    const { state, detail } = saveStatus();
    clear(node);
    node.className = `save-state tiny st-${state}`;
    if (state === 'saving') {
      node.appendChild(el('span', { class: 'spin', 'aria-hidden': true }));
      node.appendChild(el('span', {}, ['Saving']));
    } else if (state === 'local') {
      node.appendChild(el('span', {}, ['Draft saved in browser']));
    } else if (state === 'online') {
      node.appendChild(el('span', {}, ['Saved to TBS']));
    } else {
      node.appendChild(el('span', {}, [detail || 'Not saved. Check your connection.']));
    }
  };
  paint();
  onSaveStateChange(paint);
  return node;
}

function saveFile(a: Assessment) {
  saveAssessmentFile(a);
}

/**
 * The overview asks six unrelated things, and as one long card it read as a wall. It is a
 * wizard while anything is missing: one question on screen, with the guide beside the one that
 * needs it. Once all six are answered it becomes a single page again, because by then the
 * reader is editing rather than filling in, and editing wants everything at once.
 */
let overviewStep = 0;

/** True while the overview still has a group to fill, which is when it is a wizard. */
function overviewIsWizard(a: Assessment): boolean {
  const [done, total] = overviewProgress(a);
  return done < total;
}

/** Coming back should land on the first group still empty. */
export function resetOverviewToFirstGap(_rubric: Rubric, a: Assessment): void {
  const filled = [
    !!(a.initiative.name.trim() && a.initiative.department.trim()
      && a.initiative.contact.trim() && a.initiative.summary.trim()),
    !!a.initiative.classification,
    !!a.initiative.lifecycleStage,
  ];
  const gap = filled.findIndex((x) => !x);
  overviewStep = gap === -1 ? 0 : gap;
}

interface OverviewStep {
  key: string;
  title: string;
  help?: string;
  filled: () => boolean;
  build: () => HTMLElement;
}

function aboutSection(
  rubric: Rubric,
  a: Assessment,
  refresh: () => void,
  rebuild: () => void,
  r: Result,
): HTMLElement {
  const set = (k: keyof Assessment['initiative']) => (e: Event) => {
    (a.initiative as unknown as Record<string, string>)[k] = (e.target as HTMLInputElement).value;
    autosave(a);
  };
  const settled = () => refresh();

  const field = (label: string, control: HTMLElement) =>
    el('label', { class: 'field' }, [el('span', {}, [label]), control]);

  const text = (k: 'name' | 'department' | 'contact', placeholder: string) =>
    el('input', {
      type: 'text', value: a.initiative[k], placeholder,
      // The bar has to move while a field is being typed, so the readouts refresh on input.
      // They only ever write to existing nodes, so focus is never disturbed.
      oninput: (e: Event) => { set(k)(e); settled(); },
      onchange: settled,
    });

  /**
   * Three things, not six. The first is the set of plain facts about the initiative, which
   * belong together and always did; the other two are decisions, and each is a screen of its
   * own because each has consequences the reader should meet on its own.
   */
  const steps: OverviewStep[] = [
    {
      key: 'details',
      title: 'About the initiative',
      help: 'What an assessor needs before a score means anything. None of it is scored.',
      filled: () => !!(a.initiative.name.trim() && a.initiative.department.trim()
        && a.initiative.contact.trim() && a.initiative.summary.trim()),
      build: () => el('div', {}, [
        el('div', { class: 'grid-2' }, [
          field('Initiative name', text('name', 'The name people would recognise')),
          field('Department or agency', text('department', 'Transport Canada, for example')),
          field('Who to contact about this', text('contact', 'Name or team inbox')),
        ]),
        field('In two or three sentences, what is it?', el('textarea', {
          rows: 3, placeholder: 'What it does, and who it is for.',
          oninput: (e: Event) => { set('summary')(e); settled(); },
          onchange: settled,
        }, [a.initiative.summary])),
      ]),
    },
    {
      key: 'marking',
      title: 'How is this assessment marked?',
      help: 'Mark the file as a whole, at the highest marking of anything you put in it: your own words, and anything you attach. Scores are not marked, because a number is not sensitive.',
      filled: () => !!a.initiative.classification,
      build: () => markingChoices(a, rebuild),
    },
    {
      key: 'stage',
      title: 'Where is it in the lifecycle?',
      help: 'This changes what is expected of you. A discovery team has no current solution to document; a live service does.',
      filled: () => !!a.initiative.lifecycleStage,
      build: () => stagePicker(rubric, a, rebuild),
    },
  ];

  const block = (st: OverviewStep, heading: 'h2' | 'h3') =>
    el('div', {
      class: 'ov-block',
      id: st.key === 'marking' ? 'marking-control' : undefined,
      tabindex: st.key === 'marking' ? -1 : undefined,
    }, [
      el(heading, {}, [st.title]),
      st.help ? el('p', { class: 'muted small' }, [st.help]) : null,
      st.build(),
    ]);

  // Everything answered: three blocks on one page, separated, because by now the reader is
  // editing and editing wants all of it visible.
  if (steps.every((x) => x.filled())) {
    return el('div', {}, steps.flatMap((st, i) => [
      i === 0 ? null : el('hr', { class: 'q-split' }),
      el('section', { class: 'card' }, [block(st, 'h2')]),
    ]));
  }

  overviewStep = Math.max(0, Math.min(overviewStep, steps.length - 1));
  const st = steps[overviewStep];
  const advance = () => {
    const wasLastGap = steps.filter((x) => !x.filled()).length === 1 && st.filled();
    if (overviewStep < steps.length - 1) { overviewStep++; repaintApp(); return; }
    if (wasLastGap || steps.every((x) => x.filled())) confetti('section');
    repaintApp();
  };

  // The dots track what is filled as it is filled, so they update on the cheap refresh rather
  // than waiting for a repaint.
  const dots = steps.map(() => el('span', { class: 'ov-dot', 'aria-hidden': true }));
  register(() => {
    steps.forEach((x, i) => {
      dots[i].className = `ov-dot ${x.filled() ? 'filled' : ''} ${i === overviewStep ? 'on' : ''}`;
    });
  }, r);

  const card = el('section', { class: 'card ov-wizard' }, [
    el('div', { class: 'ov-progress' }, [
      el('span', { class: 'muted tiny' }, [`Step ${overviewStep + 1} of ${steps.length}`]),
      el('div', { class: 'ov-dots' }, dots),
    ]),
    block(st, 'h2'),
    el('div', { class: 'actions ov-nav' }, [
      overviewStep > 0
        ? el('button', { class: 'ghost', onclick: () => { overviewStep--; repaintApp(); } }, ['Back'])
        : el('span', {}),
      el('button', { class: 'primary', onclick: advance }, [
        overviewStep < steps.length - 1 ? 'Next' : 'Done',
        el('span', { class: 'arrow', 'aria-hidden': true }, ['\u2192']),
      ]),
    ]),
  ]);

  // Enter moves on, the way it does in every form. Not in the textarea, where it is a newline.
  card.addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    if (ev.key !== 'Enter') return;
    if ((ev.target as HTMLElement)?.tagName === 'TEXTAREA') return;
    ev.preventDefault();
    advance();
  });

  return card;
}

/**
 * Nothing protected or classified goes into this tool at all, settled with Dan on 2 September.
 * The picker stays, because somebody still has to state the marking of the evidence they are
 * pointing at, and picking anything above unclassified is the moment to say what to do instead.
 *
 * The advice appears here and nowhere else. It is a once-a-year situation, so it should not
 * follow anybody around, and this is where they will come looking for it again.
 */
function markingChoices(a: Assessment, rebuild: () => void): HTMLElement {
  const wrap = el('div', {});
  const panel = el('div', {});

  const paintPanel = () => {
    clear(panel);
    const c = a.initiative.classification;
    if (!c || c === 'Unclassified') return;

    const subject = `EARB evidence - ${a.initiative.name || 'your initiative'} - [question]`;
    panel.appendChild(el('div', { class: 'mark-advice' }, [
      el('div', { class: 'mark-advice-head' }, [
        el('strong', {}, [`${c} material does not go in this tool`]),
        el('span', { class: 'badge badge-warn' }, ['Read this']),
      ]),
      el('p', { class: 'small' }, [
        'Nothing above unclassified belongs in here, answers or evidence. Two ways through, and ',
        'the first one is almost always available.',
      ]),
      el('ol', { class: 'steps small' }, [
        el('li', {}, [
          el('b', {}, ['Link to it where it already lives, ']),
          'and make sure your assessor can open it. The link is unclassified even when the ',
          'document is not.',
        ]),
        el('li', {}, [
          el('b', {}, ['If it cannot be linked, email it to your assessor ']),
          'and record here that you did. Use this subject line so they can find it again:',
          el('code', { class: 'mono mark-subject' }, [subject]),
          ' and write in the evidence field: ',
          el('code', { class: 'mono' }, [`${c}, sent by email, subject: ...`]),
        ]),
      ]),
      el('p', { class: 'small muted' }, [
        'Describing the shape of a system is usually unclassified. A high-level answer scores ',
        'about 5, and 5 is a fine score.',
      ]),
      (() => {
        const ack = el('label', { class: 'mark-ack' }, [
          el('input', {
            type: 'checkbox', checked: !!a.initiative.markingAcknowledged,
            onchange: (e: Event) => {
              a.initiative.markingAcknowledged = (e.target as HTMLInputElement).checked;
              autosave(a);
            },
          }),
          'I understand, and I will keep this tool unclassified.',
        ]);
        return ack;
      })(),
    ]));
  };

  const families: { name: string; note: string; of: readonly string[] }[] = [
    { name: 'Protected', note: 'Injury to a person, a company or the government.', of: ['Protected A', 'Protected B', 'Protected C'] },
    { name: 'Classified', note: 'Injury to the national interest.', of: ['Confidential', 'Secret', 'Top Secret'] },
  ];

  const chip = (c: string) =>
    el('label', { class: `marking-chip ${a.initiative.classification === c ? 'on' : ''}` }, [
      el('input', {
        type: 'radio', name: 'filemark', value: c,
        checked: a.initiative.classification === c,
        onchange: () => {
          a.initiative.classification = c as Assessment['initiative']['classification'];
          if (c === 'Unclassified') a.initiative.markingAcknowledged = undefined;
          autosave(a);
          if (!overviewIsWizard(a) && c === 'Unclassified') confetti('section');
          paintPanel();
          rebuild();
        },
      }),
      c,
    ]);

  // Unclassified is the answer, so it gets its own row and the weight of one.
  wrap.appendChild(el('div', { class: 'mark-default' }, [chip('Unclassified')]));
  const grid = el('div', { class: 'mark-families' });
  for (const f of families) {
    grid.appendChild(el('fieldset', { class: 'mark-family' }, [
      el('legend', {}, [f.name]),
      el('p', { class: 'tiny muted' }, [f.note]),
      el('div', { class: 'marking-row' }, f.of.map(chip)),
    ]));
  }
  wrap.appendChild(grid);
  paintPanel();
  wrap.appendChild(panel);
  return wrap;
}

/** The stages, grouped by phase, each pointing at its own page in the guide. */
function stagePicker(rubric: Rubric, a: Assessment, rebuild: () => void): HTMLElement {
  const base = (rubric.dlgBaseUrl ?? '').replace(/\/$/, '');
  const link = (path: string | undefined, label: string) =>
    base && path
      ? el('a', { href: `${base}/${path}`, target: '_blank', rel: 'noreferrer', class: 'faint-link tiny' }, [label])
      : null;

  const groups = rubric.phases?.length
    ? rubric.phases
    : [{ name: 'Lifecycle', dlgPath: undefined, blurb: undefined }];

  const wrap = el('div', { class: 'phase-groups' });
  for (const ph of groups) {
    const mine = rubric.lifecycleStages.filter((st) => (st.phase ?? ph.name) === ph.name);
    if (!mine.length) continue;

    const grid = el('div', { class: 'stage-grid' });
    for (const st of mine) {
      const id = `stage-${st.id}`;
      grid.appendChild(el('label', { class: 'stage-card', for: id }, [
        el('input', {
          type: 'radio', name: 'stage', id, value: st.id,
          checked: a.initiative.lifecycleStage === st.id,
          onchange: () => {
            a.initiative.lifecycleStage = st.id;
            autosave(a);
            if (!overviewIsWizard(a)) confetti('section');
            rebuild();
          },
        }),
        el('div', {}, [
          el('strong', {}, [st.label]),
          st.blurb ? el('div', { class: 'muted small' }, [st.blurb]) : null,
          link(st.dlgPath, 'Read about this stage'),
        ]),
      ]));
    }

    wrap.appendChild(el('div', { class: `phase-group phase-${ph.name.toLowerCase()}` }, [
      el('div', { class: 'phase-head' }, [
        el('h4', {}, [ph.name]),
        ph.blurb ? el('span', { class: 'muted tiny' }, [ph.blurb]) : null,
        link(ph.dlgPath, `The ${ph.name} phase`),
      ]),
      grid,
    ]));
  }
  return wrap;
}

function questionBlock(rubric: Rubric, a: Assessment, q: Question, refresh: () => void): HTMLElement {
  const ans = (a.answers[q.id] ??= { score: null, evidence: [], justification: '' });
  const ladder = (q.anchors ?? rubric.scale.anchors).slice().sort((x, y) => x.value - y.value);
  const wrap = el('div', { class: 'question' });

  const expBadge = (() => {
    const exp = q.stageExpectation?.[a.initiative.lifecycleStage];
    if (!exp || exp === 'expected') return null;
    return el('span', { class: `badge ${exp === 'critical' ? 'badge-warn' : 'badge-soft'}` }, [
      exp === 'critical' ? 'Counts more at your stage' : 'Counts less at your stage',
    ]);
  })();

  const textId = `q-${cssId(q.id)}-text`;
  wrap.setAttribute('data-qid', cssId(q.id));
  wrap.appendChild(el('div', { class: 'q-head' }, [
    el('span', { class: 'qid' }, [q.id]),
    el('span', { class: 'q-text', id: textId }, [q.text]),
    expBadge,
  ]));
  if (q.help) wrap.appendChild(el('p', { class: 'muted small' }, [q.help]));

  // The ladder, shown rather than hidden. It is the guidance, not just the scale.
  const ladderList = el('ul', { class: 'ladder' });
  for (const anchor of ladder) {
    // Two children, because the row is a two-column grid: the number, then everything else.
    // A third child became a third grid item and dropped onto its own row under the number.
    ladderList.appendChild(el('li', {}, [
      el('b', {}, [String(anchor.value)]),
      el('span', {}, [
        anchor.name ? el('i', {}, [`${anchor.name}. `]) : null,
        anchor.label,
      ]),
    ]));
  }
  const ladderBox = el('details', { class: 'ladder-box' }, [
    el('summary', {}, ['What the numbers mean']),
    ladderList,
  ]);
  wrap.appendChild(ladderBox);

  /**
   * The eleven scores are one choice, so they are one radio group and take one tab stop
   * between them, moved with the arrow keys. As eleven separate buttons they were 1,936 tab
   * stops across the assessment, which is not a keyboard interface anybody could use.
   *
   * Not applicable is a different question ("does this apply?"), so it stays a checkbox
   * outside the group. When it is ticked the scores go aria-disabled and give up their tab
   * stop, leaving the checkbox as the way back.
   */
  const scoreRow = el('div', {
    class: 'score-row', role: 'radiogroup', 'aria-labelledby': textId,
  });
  const naBox = el('input', {
    type: 'checkbox',
    onchange: (e: Event) => {
      ans.na = (e.target as HTMLInputElement).checked;
      if (ans.na) ans.score = null;
      autosave(a); paintScores(); paintChosen(); refresh();
    },
  }) as HTMLInputElement;

  const choose = (v: number | null) => {
    ans.score = v;
    ans.na = false;
    autosave(a);
    paintScores();
    paintChosen();
    refresh();
  };

  const paintScores = () => {
    clear(scoreRow);
    const values: number[] = [];
    for (let v = rubric.scale.min; v <= rubric.scale.max; v++) values.push(v);

    // One tab stop: the chosen score, or the first score when nothing is chosen yet.
    const focusIndex = ans.score === null ? 0 : values.indexOf(ans.score);

    values.forEach((v, i) => {
      const rung = ladder.find((x) => x.value === v);
      scoreRow.appendChild(
        el('button', {
          class: `score-btn v${v} ${ans.score === v ? 'on' : ''}`,
          role: 'radio',
          'aria-checked': ans.score === v ? 'true' : 'false',
          'aria-label': rung?.name ? `${v}, ${rung.name}` : String(v),
          'aria-disabled': ans.na ? 'true' : 'false',
          tabindex: ans.na || i !== focusIndex ? -1 : 0,
          disabled: !!ans.na,
          onclick: () => choose(ans.score === v ? null : v),
        }, [String(v)]),
      );
    });

    naBox.checked = !!ans.na;
  };

  scoreRow.addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    const span = rubric.scale.max - rubric.scale.min;
    const cur = ans.score === null ? rubric.scale.min : ans.score;
    let next: number | null = null;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = Math.min(rubric.scale.max, cur + 1);
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = Math.max(rubric.scale.min, cur - 1);
    else if (ev.key === 'Home') next = rubric.scale.min;
    else if (ev.key === 'End') next = rubric.scale.min + span;
    if (next === null || ans.na) return;
    ev.preventDefault();
    choose(next);
    const btn = scoreRow.children[next - rubric.scale.min] as HTMLElement | undefined;
    btn?.focus();
  });
  const chosen = el('div', { class: 'chosen muted small' });

  /**
   * A printed page shows a button's markup, never which one is pressed, so the eleven score
   * buttons print as nothing at all. This carries the answer in words instead, and states an
   * absence rather than leaving a blank: an unanswered question should look unanswered on
   * paper.
   */
  const printScore = el('p', { class: 'print-only print-answer' });

  const paintChosen = () => {
    clear(chosen);
    wrap.classList.toggle('answered', ans.score !== null && !ans.na);
    wrap.classList.toggle('unanswered', ans.score === null && !ans.na);
    wrap.classList.toggle('na', !!ans.na);
    if (ans.score !== null && !ans.na) wrap.style.setProperty('--edge', `var(--s${ans.score})`);
    else wrap.style.removeProperty('--edge');
    const rung = ans.score === null ? null : ladder.slice().reverse().find((x) => x.value <= (ans.score as number));
    printScore.textContent = ans.na
      ? 'Not applicable'
      : ans.score === null
        ? 'Not answered'
        : `Score ${ans.score} of 10${rung?.name ? ` - ${rung.name}` : ''}`;
    if (ans.na || ans.score === null) return;
    if (rung) {
      chosen.appendChild(el('span', {}, [
        rung.name ? el('b', {}, [`${rung.value} - ${rung.name}. `]) : '',
        rung.label,
      ]));
    }
  };
  /**
   * The answering apparatus goes on its own tinted ground, so the question reads as the
   * question and the answering reads as the answering. The evidence was the only tinted block
   * before, which made the evidence look like the separated thing.
   */
  const answerBox = el('div', { class: 'q-ans' });
  wrap.appendChild(answerBox);

  paintScores();
  answerBox.appendChild(el('div', { class: 'score-line' }, [
    scoreRow,
    el('label', { class: 'na' }, [naBox, 'Not applicable']),
  ]));
  paintChosen();
  answerBox.appendChild(chosen);
  answerBox.appendChild(printScore);

  if (q.picklist) {
    const sel = el('select', {
      onchange: (e: Event) => {
        ans.picklist = (e.target as HTMLSelectElement).value;
        autosave(a); paintOther(); refresh();
      },
    }, [el('option', { value: '' }, ['- choose -']),
        ...q.picklist.map((o) => el('option', { value: o.value, selected: ans.picklist === o.value }, [o.label]))]);
    const otherBox = el('div');
    const paintOther = () => {
      clear(otherBox);
      if (ans.picklist === 'other') {
        otherBox.appendChild(el('input', {
          type: 'text', placeholder: 'Describe it', value: ans.picklistOther ?? '',
          oninput: (e: Event) => { ans.picklistOther = (e.target as HTMLInputElement).value; autosave(a); },
        }));
      }
    };
    paintOther();
    answerBox.appendChild(el('div', { class: 'field' }, [
      el('span', {}, ['Which of these describes yours?']),
      sel,
      q.picklistNote ? el('div', { class: 'muted small warn-text' }, [q.picklistNote]) : null,
      otherBox,
    ]));
  }

  // A textarea prints its initial markup, not what was typed into it, so the text is mirrored
  // into an element that does print.
  const printJust = el('p', { class: 'print-only print-said' });
  const mirrorJust = () => {
    const t = (ans.justification ?? '').trim();
    printJust.textContent = t ? `Their reasoning: ${t}` : '';
  };
  mirrorJust();

  const extras = el('div', { class: 'q-extras' });
  extras.appendChild(el('label', { class: 'field' }, [
    el('span', {}, ['Why that score, in your words']),
    el('textarea', {
      rows: 2, placeholder: 'One or two sentences is plenty.',
      oninput: (e: Event) => {
        ans.justification = (e.target as HTMLTextAreaElement).value;
        autosave(a);
        mirrorJust();
      },
    }, [ans.justification ?? '']),
  ]));
  extras.appendChild(printJust);
  extras.appendChild(evidenceEditor(a, q, ans.evidence ??= [], refresh));

  /**
   * A score is the answer. Reasoning and evidence are optional, and 176 questions each showing
   * a textarea and an evidence editor is most of the page given over to fields most questions
   * will not use. They fold, and open on their own wherever there is already something inside,
   * so nothing a person wrote can hide behind a closed disclosure.
   */
  const hasExtras = !!(ans.justification ?? '').trim() || (ans.evidence ?? []).length > 0;
  const extrasBox = el('details', { class: 'q-extras-box', open: hasExtras }, [
    el('summary', { class: 'q-extras-summary' }, [
      el('span', {}, ['Add reasoning or evidence']),
      (() => {
        const badge = el('span', { class: 'q-extras-count' });
        const paintBadge = () => {
          const n = (ans.evidence ?? []).length;
          const words = (ans.justification ?? '').trim() ? 1 : 0;
          badge.textContent = n + words === 0 ? '' : `${words ? 'reasoning' : ''}${words && n ? ', ' : ''}${n ? `${n} file${n === 1 ? '' : 's'}` : ''}`;
        };
        paintBadge();
        extras.addEventListener('input', paintBadge);
        extras.addEventListener('click', () => setTimeout(paintBadge, 0));
        return badge;
      })(),
    ]),
    extras,
  ]);
  wrap.appendChild(extrasBox);
  return wrap;
}

function evidenceEditor(a: Assessment, q: Question, list: EvidenceRef[], refresh: () => void): HTMLElement {
  const box = el('div', { class: 'evidence' });

  const paint = () => {
    clear(box);
    box.appendChild(el('div', { class: 'ev-head' }, [
      el('strong', {}, ['Link to the evidence']),
      el('span', { class: 'muted small' }, [
        'Point at where it already lives, and make sure your assessor can open it. ',
        q.evidencePrompt ? q.evidencePrompt : '',
      ]),
    ]));

    list.forEach((ev, i) => {
      const upd = (k: 'title' | 'location' | 'note' | 'kind' | 'classification') => (e: Event) => {
        (ev as unknown as Record<string, string>)[k] = (e.target as HTMLInputElement).value;
        autosave(a);
        if (k === 'classification') { paint(); refresh(); }
      };

      const attachRow = ev.attachment
        ? el('div', { class: 'att' }, [
            el('span', { class: 'att-name' }, [ev.attachment.name]),
            el('span', { class: 'muted small' }, [humanSize(ev.attachment.size)]),
            el('button', { class: 'ghost small', onclick: () => openAttachment(ev.attachment!) }, ['Open']),
            el('button', {
              class: 'ghost small',
              onclick: () => { delete ev.attachment; autosave(a); paint(); refresh(); },
            }, ['Detach']),
          ])
        : el('label', { class: 'filelabel small' }, [
            'Attach an unclassified file',
            el('input', {
              type: 'file', hidden: true,
              onchange: async (e: Event) => {
                const input = e.target as HTMLInputElement;
                const f = input.files?.[0];
                if (!f) return;
                try {
                  const att = await readAttachment(f);
                  if (totalAttachedBytes(a.answers) + att.size > TOTAL_LIMIT) {
                    alert(`That would take this file past ${humanSize(TOTAL_LIMIT)}. Record where this one lives without attaching it.`);
                    return;
                  }
                  ev.attachment = att;
                  if (!ev.title) ev.title = f.name;
                  autosave(a); paint(); refresh();
                } catch (err) {
                  alert((err as Error).message);
                }
              },
            }),
          ]);

      const unmarked = !ev.classification;
      box.appendChild(el('div', { class: `ev-item ${unmarked ? 'unmarked' : ''}` }, [
        el('div', { class: 'ev-row' }, [
          el('input', { type: 'text', placeholder: 'What is it called?', value: ev.title, oninput: upd('title') }),
          el('select', { onchange: upd('kind') }, KINDS.map((k) => el('option', { value: k, selected: ev.kind === k }, [k]))),
          el('select', { class: unmarked ? 'needs-marking' : '', onchange: upd('classification') }, [
            el('option', { value: '', selected: !ev.classification }, ['- marking required -']),
            ...CLASSIFICATIONS.map((c) => el('option', { value: c, selected: ev.classification === c }, [c])),
          ]),
          el('button', { class: 'ghost small', onclick: () => { list.splice(i, 1); autosave(a); paint(); refresh(); } }, ['Remove']),
        ]),
        el('div', { class: 'ev-row2' }, [
          el('input', {
            type: 'text',
            placeholder: 'Link, or where it lives',
            value: ev.location,
            oninput: upd('location'),
          }),
          el('input', {
            type: 'text', placeholder: 'Note (optional)',
            value: ev.note ?? '', oninput: upd('note'),
          }),
        ]),
        /**
         * Everything in this tool is unclassified, so an artefact that cannot be linked does
         * not come in here at all. It goes to the assessor by email, and this field records
         * that it did. The pattern is given rather than invented, because an assessor has to
         * find it again in Outlook.
         */
        el('div', { class: 'ev-alt' }, [
          ev.attachment ? null : el('button', {
            class: 'linkish tiny',
            onclick: () => {
              const subject = `EARB evidence - ${a.initiative.name || 'initiative'} - ${q.id}`;
              ev.location = `Sent by email. Subject: ${subject}`;
              if (!ev.title) ev.title = 'Sent to the assessor by email';
              autosave(a); paint(); refresh();
            },
          }, ['It cannot be linked, I will email it']),
          // attachRow is the file chip when something is attached, and the picker when not.
          // Skipping it while attached made the attached file invisible.
          attachRow,
        ]),
        unmarked
          ? el('div', { class: 'small warn-text' }, ['This needs a marking before the assessment can be saved.'])
          : null,
      ]));
    });

    // Same reason as the justification: the evidence fields are inputs, so they print empty.
    if (list.length) {
      box.appendChild(el('ul', { class: 'print-only print-evidence' }, list.map((ev) =>
        el('li', {}, [
          ev.title || ev.attachment?.name || 'untitled',
          `. ${ev.kind}, ${ev.classification || 'unmarked'}`,
          ev.attachment ? `, attached (${humanSize(ev.attachment.size)})` : `, at ${ev.location || 'no location given'}`,
          ev.note ? `. ${ev.note}` : '',
        ]),
      )));
    }

    const attached = totalAttachedBytes(a.answers);
    box.appendChild(el('div', { class: 'actions' }, [
      el('button', {
        class: 'ghost small',
        onclick: () => {
          list.push({ title: '', kind: 'document', location: '', classification: '' });
          autosave(a); paint(); refresh();
        },
      }, ['Add evidence']),
      attached > TOTAL_WARN
        ? el('span', { class: 'small warn-text' }, [
            `${humanSize(attached)} attached across this assessment. Departmental mail often stops around 25 MB.`,
          ])
        : null,
    ]));
  };

  paint();
  return box;
}
