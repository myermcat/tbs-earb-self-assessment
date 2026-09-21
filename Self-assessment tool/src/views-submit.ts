import { CLASSIFICATIONS, classRank, type Assessment, type EvidenceRef, type Question,
  type Rubric } from './types';
import { el, clear, tone } from './dom';
import { codeChip } from './code-chip';
import { domainRedFlags, score, sectionRedFlags, type Result, type SectionScore } from './scoring';
import { autosave, clearSaveWatchers, saveAssessmentFile , refOf } from './storage';
import { humanSize, openAttachment, totalAttachedBytes, TOTAL_WARN } from './attach';
import { demandPledge } from './pledge';
import { confirmStep } from './confirm';
import { t } from './i18n';
import { isHosted } from './store';
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

/**
 * The category being looked at, across every domain, or null for all of them.
 *
 * Dan's ask was that somebody looking at the tool can see security, because the first question
 * from the room will be where their security is. A domain and a category are parallel axes, so
 * drawing them the same way is what confuses: a question sits in exactly one domain and carries
 * any number of categories. So the domains stay the tabs, which are where you are, and the
 * categories are a lens over them, which is what you are looking at.
 *
 * A vertical bar on the right was the first suggestion and was rejected on width: it costs about
 * a fifth of the reading column at every width, and the questions are long text. A strip costs
 * one row of height and works the same on a phone, so there is one design and not two.
 */
let lens: string | null = null;
export function goToFirstGap(rubric: Rubric, a: Assessment): boolean {
  const gap = firstGap(rubric, a);
  if (!gap) return false;
  page = gap.key;
  scrollToQuestion = gap.questionId;
  return true;
}

/**
 * Take the reader to one particular question, wherever it lives.
 *
 * The category block on the results page lists questions by subject, and a list of questions
 * you cannot act on is a list that sends somebody hunting through twenty pages. The stop and
 * the scroll target are the same two pieces of state the "next gap" control already sets, so
 * this is the existing seam with a different way in.
 *
 * Editing in place on the results page was the alternative and was rejected: a score needs its
 * 0-to-10 anchors, its stage expectation, its help text, its evidence rows and its
 * justification box, which is most of a question card. Two places to maintain the hardest UI
 * in the tool is two places for them to drift.
 */
export function goToQuestion(rubric: Rubric, questionId: string): boolean {
  for (const d of rubric.domains) {
    for (const sec of d.sections) {
      if (!sec.questions.some((q) => q.id === questionId)) continue;
      page = `${d.id}/${sec.id}`;
      scrollToQuestion = questionId;
      return true;
    }
  }
  return false;
}

/**
 * Repainting only this view leaves the shell stale - most visibly the classification banner,
 * which the shell draws. The shell hands us its own paint so a marking change is reflected
 * everywhere at once.
 */
let repaintApp: () => void = () => {};
export function setRepaint(fn: () => void): void { repaintApp = fn; }
/**
 * The shell owns the offer to save online, because it owns the window that explains what
 * saving an unfinished assessment means. This is the seam the footer's one button pulls.
 */
let saveOnlineFn: () => void = () => {};
export function setSaveOnline(fn: () => void): void { saveOnlineFn = fn; }
/** The same offer, for any screen that wants to put it in front of somebody. */
export function saveOnline(): void { saveOnlineFn(); }
/** Redraw the whole shell. Anything that changes what a screen should show can call it. */
export function repaint(): void { repaintApp(); }

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
  clearSaveWatchers();          // one live indicator, not one per repaint
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

  {
    const tabs = stepper(rubric, a, r, navigate, list);
    const strip = lensStrip(rubric, repaintApp);
    // The strip rides with the tabs so the shell places both, and so the two never separate.
    tabsNode = strip ? el('div', { class: 'stepper-stack' }, [tabs, strip]) : tabs;
  }

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
    if (!lens) {
      sheet.appendChild(sectionHead(ds, ss, r, here));
      for (const qs of ss.questions) {
        sheet.appendChild(questionBlock(rubric, a, qs.question, refresh));
      }
    } else {
      /**
       * With a lens on, the sections stop dividing the page.
       *
       * Filtering inside one section put somebody on an empty page: Business holds one security
       * question across six sections, so five of them answered "where is my security" with
       * nothing at all. A category runs through the sections the way it runs through the
       * domains, so the lens shows the whole domain at once and names the section on each
       * question instead. The tabs carry the rest of the answer, because they are counting the
       * same category in the other three.
       */
      const label = (rubric.topics ?? []).find((c) => c.id === lens)?.label ?? lens;
      const hits = ds.sections.flatMap((sec) =>
        sec.questions
          .filter((qs) => (qs.question.topics ?? []).includes(lens as string))
          .map((qs) => ({ qs, sec })));

      sheet.appendChild(el('div', { class: 'lens-head' }, [
        el('h2', {}, [t(`${label} in ${ds.domain.label}`, `${label} dans ${ds.domain.label}`)]),
        el('p', { class: 'muted small' }, [
          hits.length
            ? t(`${hits.length} question${hits.length === 1 ? '' : 's'} here. The tabs above count the same category in the other domains.`,
                `${hits.length} question${hits.length === 1 ? '' : 's'} ici. Les onglets ci-dessus comptent la même catégorie dans les autres domaines.`)
            : t('No question in this domain is about it. The tabs above show which domains are.',
                'Aucune question de ce domaine ne la concerne. Les onglets ci-dessus indiquent lesquels le sont.'),
          ' ',
          el('button', { class: 'linkish', onclick: () => { lens = null; repaintApp(); } },
            [t('Show every question again', 'Afficher de nouveau toutes les questions')]),
        ]),
      ]));
      // The section is named when it changes, not on every card. Repeated above each question
      // it reads as part of the question rather than as the heading of a run.
      let lastSection = '';
      for (const { qs, sec } of hits) {
        if (sec.section.id !== lastSection) {
          lastSection = sec.section.id;
          sheet.appendChild(el('p', { class: 'lens-from' }, [sec.section.label]));
        }
        sheet.appendChild(questionBlock(rubric, a, qs.question, refresh));
      }
    }
  }

  if (!(here.domainId === null && overviewIsWizard(a))) {
    sheet.appendChild(pager(list, here, navigate, onDone));
  }
  root.appendChild(footerBar(rubric, a, r, onDone, here, navigate));

  if (scrollToQuestion) {
    const target = sheet.querySelector(`[data-qid="${cssId(scrollToQuestion)}"]`);
    scrollToQuestion = null;
    if (target) {
      const node = target as HTMLElement;
      /**
       * Say which one, for a moment. Scrolling a question into the middle of a screen of
       * near-identical question cards does not tell anybody which one they were brought to, and
       * somebody arriving from the category list clicked a specific question by name.
       *
       * The mark is outside the scroll guard on purpose. It used to be inside it, and a browser
       * with no scrollIntoView got neither, which is also every test.
       */
      node.classList.add('brought-here');
      if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
        window.setTimeout(() => node.classList.remove('brought-here'), 2600);
      }
      if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'center' });
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
    const flags = sectionRedFlags(cur);
    node.classList.toggle('red-flag', flags.length > 0);
    clear(flagNote);
    if (flags.length) {
      flagNote.appendChild(el('div', { class: 'flag-note' }, [
        el('strong', {}, [`${flags.length} red flag${flags.length === 1 ? '' : 's'} in this section. `]),
        'Answered no where the answer should be yes. Nothing is blocked, and an assessor will look.',
      ]));
    }
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

  const flagNote = el('div', {});
  const node = el('section', { class: 'card section-head-card' }, [
    el('p', { class: 'eyebrow' }, [ds.domain.label]),
    el('div', { class: 'head-row' }, [
      el('h2', {}, [ss.section.label]),
      pill,
      srPill,
      stageNote,
    ]),
    counts,
    flagNote,
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
  // On a narrow screen the rail lies down into a horizontal strip, directly under the domain
  // tabs, which show the same five things. On the overview there are no section rows to add,
  // so the strip was the tabs printed twice. The class lets the stylesheet hide it there.
  const nav = el('nav', {
    class: `toc ${here.domainId === null ? 'no-sections' : ''}`,
    'aria-label': 'Sections of this assessment',
  });

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
              row.classList.toggle('red-flag', !!cur && sectionRedFlags(cur).length > 0);
            }, r);
            return row;
          })
        : []),
    ]));
  }
  return nav;
}

/**
 * One row of chips under the domain tabs: what the questions on screen are about.
 *
 * Counts are on the chips because the first thing anybody asks of a category is how much of it
 * there is, and because a category with two questions behind it should say so before somebody
 * reads a score built on two answers.
 */
function lensStrip(rubric: Rubric, repaintApp: () => void): HTMLElement | null {
  const domainIds = new Set(rubric.domains.map((d) => d.id));
  const all = rubric.domains.flatMap((d) => d.sections.flatMap((sec) => sec.questions));
  const cats = (rubric.topics ?? [])
    .filter((c) => !domainIds.has(c.id))
    .map((c) => ({ c, n: all.filter((q) => (q.topics ?? []).includes(c.id)).length }))
    .filter((x) => x.n > 0);
  if (!cats.length) return null;

  const chip = (label: string, id: string | null, n: number | null) => el('button', {
    class: `lens-chip ${lens === id ? 'on' : ''}`,
    'aria-pressed': lens === id ? 'true' : 'false',
    onclick: () => { lens = lens === id ? null : id; repaintApp(); },
  }, [label, n === null ? null : el('span', { class: 'lens-n' }, [String(n)])]);

  // No label. "About" in small capitals was a third thing to read before the first chip, and the
  // leading chip already says what the row does.
  return el('div', { class: 'lens-strip' }, [
    chip(t('All questions', 'Toutes les questions'), null, null),
    ...cats.map((x) => chip(x.c.label, x.c.id, x.n)),
  ]);
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
    flags?: (rr: Result) => boolean,
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
      const flagged = flags ? flags(rr) : false;
      btn.className = `step ${on ? 'on' : ''} ${complete ? 'complete' : ''} ${flagged ? 'red-flag' : ''}`;
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
    /**
     * With a lens on, a domain tab counts what it holds OF that category.
     *
     * This is the line that makes the two axes click, and it costs no room at all. Choosing
     * Security turns "Business 12 of 61" into "Business 3 of 8", so the same 25 questions are
     * seen spread across all four domains at once. That is the answer to the question Dan
     * expects from the room, which is where their security is: here, and in all four.
     */
    ...rubric.domains.map((d) =>
      step(shortLabel(d.label), firstStopIn(list, d.id), (st) => st.domainId === d.id, (rr) => {
        const ds = rr.domains.find((x) => x.domain.id === d.id);
        if (!lens) return [ds?.answered ?? 0, ds?.total ?? 0];
        const inLens = (ds?.sections ?? []).flatMap((sec) => sec.questions)
          .filter((qs) => (qs.question.topics ?? []).includes(lens as string));
        return [inLens.filter((qs) => qs.raw !== null || qs.na).length, inLens.length];
      }, undefined, (rr) => {
        const ds = rr.domains.find((x) => x.domain.id === d.id);
        return !!ds && domainRedFlags(ds).length > 0;
      }),
    ),
  ]);
}


/**
 * The subject line for an artefact that has to travel by email.
 *
 * It carries the two things an assessor needs to match the message to an answer: which
 * initiative, and which question. The first version read "EARB evidence - m - [question]",
 * which meant nothing to anybody who had not written it.
 */
/**
 * The subject line for an artefact that has to travel by email.
 *
 * It carries the question and a short code for the assessment, and deliberately not the
 * initiative name. A subject line is permanent once the mail is sent: with the name in it,
 * renaming the initiative silently invalidated every email already gone, and there is no way
 * to un-send one. The code is made when the assessment is created and never changes, so a
 * rename costs nothing and nothing has to be locked.
 */
export function evidenceSubject(a: Assessment, questionId: string): string {
  /**
   * The first four characters of the code, never the whole of it.
   *
   * A subject line is logged, forwarded, quoted back in every reply and answerable to
   * access-to-information, and the code opens the assessment. Four characters is what a subject
   * line was ever for: enough to find the thread in Outlook, and eight characters short of
   * opening anything.
   */
  return `EARB evidence ${refOf(a)}, question ${questionId}`;
}

/**
 * Setting the file's marking, from wherever it was set.
 *
 * Choosing anything above unclassified takes over the screen once, because a panel below the
 * fold is not a warning - it was scrolled past, which is how this bug was found. After the
 * pledge is given, switching between classified markings does not ask again: the advice panel
 * on the overview is the reference to come back to.
 */
export function setFileMarking(
  a: Assessment,
  c: Assessment['initiative']['classification'],
  after: () => void,
): void {
  const ack = a.initiative.markingAcknowledged;
  a.initiative.classification = c;
  if (c === 'Unclassified') a.initiative.markingAcknowledged = undefined;
  autosave(a);
  after();
  if (!c || c === 'Unclassified') return;
  // Given for this marking, or given before this became per-marking. Moving from Protected B
  // to Secret is a different situation and asks again.
  if (ack === true || ack === c) return;
  demandPledge({
    marking: c,
    // No question is on screen here, so this is an example. The evidence box on each question
    // writes the real one, with that question's number already in it.
    subject: evidenceSubject(a, 'B-Q14'),
    onAcknowledge: () => { a.initiative.markingAcknowledged = c; autosave(a); after(); },
    onUnclassified: () => {
      a.initiative.classification = 'Unclassified';
      a.initiative.markingAcknowledged = undefined;
      autosave(a);
      after();
    },
  });
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
      : el('button', { class: 'primary', onclick: onDone }, [t('See my results', 'Voir mes résultats')]),
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
/**
 * The one control on this bar.
 *
 * It used to be "Save to a file", which is the wrong offer in the wrong place: a file is a
 * thing you do at the end, and the question somebody has while answering is where their work
 * is going. So this is Save online, and saving to a file moved into the File menu with the
 * other things you do to a finished assessment.
 *
 * The marking gate hangs off this button, which is what makes the classification question get
 * answered at all, so the gate moves with it.
 */
  const save = el('button', {
    class: 'ghost',
    onclick: () => {
      if (isHosted()) { saveOnlineFn(); return; }
      saveFile(a);
    },
  }, [isHosted() ? t('Save online', 'Enregistrer en ligne') : t('Save to a file', 'Enregistrer dans un fichier')]);

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
                onclick: () => setFileMarking(a, c, repaintApp),
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
    const [ovDone, ovTotal] = overviewFieldProgress(a);
    const done = cur ? cur.answered : ovDone;
    const total = cur ? cur.total : ovTotal;
    secLabel.textContent = cur
      ? `This section ${done} of ${total}`
      : `Overview ${done} of ${total}`;
    secBar.style.width = total > 0 ? `${Math.round((done / total) * 100)}%` : '0%';

    allLabel.textContent = `Whole assessment ${rr.answered} of ${rr.scoreable}`;
    allBar.style.width = rr.scoreable > 0 ? `${Math.round((rr.answered / rr.scoreable) * 100)}%` : '0%';

    // The reward for finishing a section, on an element that is pinned, so it is seen however
    // far down the page the reader is.
    // Only a scored section is celebrated. Finishing the overview is not an achievement, and
    // she asked for no confetti there.
    const nowComplete = !!cur && total > 0 && done === total;
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
      ]),
      el('div', { class: 'footer-actions' }, [
        (() => {
          const jump = el('button', { class: 'ghost', onclick: () => {
            if (goToFirstGap(rubric, a)) repaintApp();
          } }, ['Next unanswered']);
          register((rr) => { jump.hidden = rr.answered >= rr.scoreable; }, r);
          return jump;
        })(),
        /**
         * The offer to sign in belongs here as well as in the header, because this is the bar
         * somebody looks at when they wonder where their work is going. Signed in there is
         * nothing to press: the save badge in the chrome already says where the work stands.
         */
        save,
        el('button', { class: 'primary', onclick: onDone }, [t('See my results', 'Voir mes résultats')]),
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
/** What Done said when it could not finish. Cleared as soon as the gap is filled. */
let overviewNag = '';

/** True while the overview still has a group to fill, which is when it is a wizard. */
function overviewIsWizard(a: Assessment): boolean {
  const [done, total] = overviewProgress(a);
  return done < total;
}

/**
 * Take the reader to the marking question, wherever they are.
 *
 * The chrome banner said "Unmarked. Set the classification" and then scrolled to an element
 * that only exists on the overview: from any of the twenty question pages it was a dead end.
 * The banner and the gate strip both need this.
 */
export function showMarkingStep(): void {
  page = 'about';
  overviewStep = 1;                      // the marking group, between the facts and the stage
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
      title: t('About the initiative', 'Au sujet de l\u2019initiative'),
      help: t('What an assessor needs before a score means anything. None of it is scored.', 'Ce qu\u2019un évaluateur doit savoir avant qu\u2019une note veuille dire quelque chose. Rien de tout cela n\u2019est noté.'),
      filled: () => !!(a.initiative.name.trim() && a.initiative.department.trim()
        && a.initiative.contact.trim() && a.initiative.summary.trim()),
      build: () => el('div', {}, [
        el('div', { class: 'grid-2' }, [
          field(t('Initiative name', 'Nom de l\u2019initiative'), text('name', t('The name people would recognise', 'Le nom que les gens reconnaîtraient'))),
          field(t('Department or agency', 'Ministère ou organisme'), text('department', t('Transport Canada, for example', 'Transports Canada, par exemple'))),
          field(t('Who to contact about this', 'Personne-ressource'), text('contact', t('Name or team inbox', 'Nom ou boîte d\u2019équipe'))),
        ]),
        /**
         * The code an assessor matches an email to. It goes here because this is where the name
         * is, and the name is the thing people assume identifies the assessment.
         *
         * It reads as a note and not as body copy, because it is neither a question nor an
         * instruction: it is a fact about this assessment that somebody needs once.
         */
        el('aside', { class: 'note-line' }, [
          el('span', { class: 'note-key' }, [t('Reference code', 'Code de référence')]),
          a.id ? codeChip(a.id) : el('b', { class: 'mono' }, ['----']),
          el('span', { class: 'note-say' }, [
            t(`This assessment\u2019s own code, and the only way back to it once it is saved online. It stays the same if you rename the initiative. Emails about this assessment quote its first four characters, ${refOf(a)}, so you can find the thread; the whole code is what opens the assessment, so keep it somewhere and send it only to people who should be able to change this.`,
              `Le code propre à cette évaluation, et le seul moyen d\u2019y revenir une fois enregistrée en ligne. Il ne change pas si vous renommez l\u2019initiative. Les courriels à son sujet citent ses quatre premiers caractères, ${refOf(a)}, pour retrouver le fil; le code entier ouvre l\u2019évaluation, alors conservez-le et ne l\u2019envoyez qu\u2019aux personnes qui doivent pouvoir la modifier.`),
          ]),
        ]),
        field(t('In two or three sentences, what is it?', 'En deux ou trois phrases, de quoi s\u2019agit-il?'), el('textarea', {
          rows: 3, placeholder: 'What it does, and who it is for.',
          oninput: (e: Event) => { set('summary')(e); settled(); },
          onchange: settled,
        }, [a.initiative.summary])),
      ]),
    },
    {
      key: 'marking',
      title: t('How is your evidence marked?', 'Quelle est la cote de vos preuves?'),
      help: 'This assessment is an unclassified document, and everything you type into it has to stay unclassified. What can carry a marking is the evidence behind your answers: a cost model, a diagram, a report. Give the highest marking of anything you will point at, so your assessor knows what they need access to. If it is all unclassified, say so.',
      filled: () => !!a.initiative.classification,
      build: () => markingChoices(a, rebuild),
    },
    {
      key: 'stage',
      title: t('Where is it in the lifecycle?', 'Où en est-elle dans le cycle de vie?'),
      help: t('This changes what is expected of you. A discovery team has no current solution to document; a live service does.', 'Cela change ce qui est attendu de vous. Une équipe en découverte n\u2019a aucune solution actuelle à documenter; un service en production en a une.'),
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
    // Done on the last step used to repaint the same card and say nothing at all when
    // something earlier was still empty. It goes to the gap and names it.
    const gap = steps.findIndex((x) => !x.filled());
    if (gap !== -1) {
      overviewStep = gap;
      overviewNag = `${steps[gap].title} is still empty, so this is not finished yet.`;
      repaintApp();
      return;
    }
    overviewNag = '';
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
      el('span', { class: 'muted tiny' }, [t(`Step ${overviewStep + 1} of ${steps.length}`, `Étape ${overviewStep + 1} de ${steps.length}`)]),
      el('div', { class: 'ov-dots' }, dots),
    ]),
    block(st, 'h2'),
    overviewNag && !st.filled()
      ? el('p', { class: 'ov-nag small warn-text', role: 'status' }, [overviewNag])
      : null,
    // What is left, at all times, so Done is never a button that does nothing.
    (() => {
      const left = steps.filter((x) => !x.filled());
      if (!left.length) return null;
      return el('p', { class: 'tiny dim' }, [
        left.length === steps.length && overviewStep === 0
          ? 'Three things to fill in.'
          : `Still empty: ${left.map((x) => x.title.replace(/\?$/, '')).join(', ')}.`,
      ]);
    })(),
    el('div', { class: 'actions ov-nav' }, [
      overviewStep > 0
        ? el('button', { class: 'ghost', onclick: () => { overviewStep--; repaintApp(); } }, [t('Back', 'Retour')])
        : el('span', {}),
      el('button', { class: 'primary', onclick: advance }, [
        overviewStep < steps.length - 1 ? t('Next', 'Suivant') : t('Done', 'Terminé'),
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
            type: 'checkbox',
            checked: a.initiative.markingAcknowledged === true
              || a.initiative.markingAcknowledged === a.initiative.classification,
            onchange: (e: Event) => {
              a.initiative.markingAcknowledged = (e.target as HTMLInputElement).checked
                ? (a.initiative.classification || undefined)
                : undefined;
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
          setFileMarking(a, c as Assessment['initiative']['classification'], () => {
            paintPanel();
            rebuild();
          });
          if (!overviewIsWizard(a) && c === 'Unclassified') confetti('section');
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
  /**
   * What this question is about, beside the toggle rather than under the text.
   *
   * Asked for in those words: on the right of the What the numbers mean toggle, clipped to the
   * right, grey and barely visible but still visible, blending into the card. A category is a
   * fact about the question and not an instruction to the person answering it, so it sits at
   * the weight of a label and never competes with the question.
   */
  const cats = (q.topics ?? [])
    .map((id) => (rubric.topics ?? []).find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c);
  const catChips = cats.length
    ? el('span', { class: 'q-cats' }, cats.map((c) => el('span', { class: 'q-cat' }, [c.label])))
    : null;

  if (q.answerType !== 'yesno') {
    wrap.appendChild(el('div', { class: 'ladder-row' }, [
      el('details', { class: 'ladder-box' }, [
        el('summary', {}, [t('What the numbers mean', 'Ce que les chiffres veulent dire')]),
        ladderList,
      ]),
      catChips,
    ]));
  } else if (catChips) {
    wrap.appendChild(el('div', { class: 'ladder-row' }, [el('span', {}), catChips]));
  }

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
      // Not applicable is its own answer, so it replaces the score instead of sitting on top
      // of one. Unticking leaves the question unanswered, which is what it is.
      if (ans.na) ans.score = null;
      // Fold the reasoning and evidence away as the box is ticked. Left open and dimmed, the
      // whole apparatus read as one grey slab.
      const box = wrap.querySelector('.q-extras-box') as HTMLDetailsElement | null;
      if (box && ans.na) box.open = false;
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

  const isYesNo = q.answerType === 'yesno';

  const paintScores = () => {
    clear(scoreRow);

    // A yes/no question is two buttons. It still stores a score, so every roll-up, export and
    // flag keeps working with no special case: yes is 10, no is 0.
    if (isYesNo) {
      const opt = (label: string, value: number) =>
        el('button', {
          class: `yn-btn ${ans.score === value ? 'on' : ''} ${value === 0 ? 'no' : 'yes'}`,
          role: 'radio',
          'aria-checked': ans.score === value ? 'true' : 'false',
          'aria-disabled': ans.na ? 'true' : 'false',
          tabindex: ans.na || (ans.score === null ? value !== rubric.scale.max : ans.score !== value) ? -1 : 0,
          disabled: !!ans.na,
          onclick: () => choose(value),
        }, [label]);
      scoreRow.appendChild(opt('Yes', rubric.scale.max));
      scoreRow.appendChild(opt('No', rubric.scale.min));
      naBox.checked = !!ans.na;
      return;
    }

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
          onclick: () => choose(v),
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
    // A no on a yes/no question is a red flag: it colours things and the person carries on.
    wrap.classList.toggle('red-flag', isYesNo && ans.score === rubric.scale.min && !ans.na);
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
    if (isYesNo) {
      chosen.appendChild(el('span', {}, [
        ans.score === rubric.scale.min
          ? 'A no here is a red flag. It does not stop the assessment, and the section is marked so an assessor looks.'
          : 'Yes.',
      ]));
      return;
    }
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
    el('label', { class: 'na' }, [naBox, t('Not applicable', 'Sans objet')]),
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
  /**
   * Not applicable is an answer, so the reasoning and evidence behind a score are not part of
   * this question any more. They are kept, because deleting somebody's work because they
   * ticked a box is not a decision the tool gets to make, and they are folded away with a
   * line saying so. Untick it and everything is where it was.
   */
  const extrasBox = el('details', { class: 'q-extras-box', open: hasExtras && !ans.na }, [
    /**
     * The heading stays put and a short status follows it, which is how a government task
     * list marks a section as started. The label used to read "Add reasoning or evidence"
     * whether or not anything was there, so a filled section looked exactly like an empty
     * one. The arrow is left to mean open and closed, and nothing else.
     */
    el('summary', { class: 'q-extras-summary' }, [
      el('span', {}, [t('Reasoning and evidence', 'Justification et preuves')]),
      (() => {
        const badge = el('span', { class: 'q-extras-count' });
        const paintBadge = () => {
          const n = (ans.evidence ?? []).length;
          const words = (ans.justification ?? '').trim() ? 1 : 0;
          const parts: string[] = [];
          if (words) parts.push('reasoning written');
          if (n) parts.push(`${n} piece${n === 1 ? '' : 's'} of evidence`);
          badge.className = `q-extras-count ${parts.length ? 'filled' : 'empty'}`;
          badge.textContent = parts.length
            ? (ans.na ? `${parts.join(', ')}, kept and not counted` : parts.join(', '))
            : 'nothing yet';
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
      el('strong', {}, [t('Link to the evidence', 'Le lien vers la preuve')]),
      el('span', { class: 'muted small' }, [
        t('Point at where it already lives, and make sure your assessor can open it. ', 'Indiquez où elle se trouve déjà, et assurez-vous que votre évaluateur peut l\u2019ouvrir. '),
        q.evidencePrompt ? q.evidencePrompt : '',
      ]),
    ]));

    list.forEach((ev, i) => {
      const upd = (k: 'title' | 'location' | 'note' | 'kind' | 'classification') => (e: Event) => {
        const was = k === 'classification' ? ev.classification : '';
        (ev as unknown as Record<string, string>)[k] = (e.target as HTMLInputElement).value;
        autosave(a);
        /**
         * Evidence marked higher than the answer given on the overview used to sit there
         * blocking the save with a message. It is a two-way question, and this is the moment
         * to ask it: raise the overview answer, or say the evidence is not that high.
         */
        if (k === 'classification'
            && ev.classification
            && classRank(ev.classification) > classRank(a.initiative.classification)) {
          const wanted = ev.classification;
          const said = a.initiative.classification || 'nothing yet';
          confirmStep({
            tier: 'caution',
            title: `On the overview you said your evidence goes up to ${said}`,
            body: `This piece is marked ${wanted}, which is higher. One of the two answers has to change.`,
            alt: {
              label: `My evidence does go up to ${wanted}`,
              run: () => {
                // Raising the overview answer keeps the pledge already given: they have read
                // what to do about classified material, and saying it again is noise.
                a.initiative.classification = wanted;
                a.initiative.markingAcknowledged = wanted;
                autosave(a); paint(); refresh(); repaintApp();
              },
            },
            // Back to the highest this row may be, which is the overview answer. Reverting to
            // whatever the row held a moment ago put a Protected C row back to unmarked.
            commitLabel: `No, my evidence goes up to ${a.initiative.classification || 'nothing higher'}`,
            cancelLabel: 'Leave both as they are',
            onCommit: () => {
              ev.classification = a.initiative.classification || was;
              autosave(a); paint(); refresh();
            },
          });
        }
        if (k === 'classification') { paint(); refresh(); }
      };

      /**
       * Evidence is a link, and only a link.
       *
       * Attaching went because it cannot survive a store: a document there caps at about a
       * megabyte and the tool allowed fifteen. An artefact that cannot be linked goes to the
       * assessor by email, which is the same route classified material already took.
       *
       * A file attached in an earlier version still opens, so an assessment saved last week
       * loses nothing. Nothing new can be attached.
       */
      const emailed = ev.emailed === true || (ev.location ?? '').startsWith('Emailed to the assessor');

      const attachRow = ev.attachment
        ? el('div', { class: 'att' }, [
            el('span', { class: 'att-name' }, [ev.attachment.name]),
            el('span', { class: 'muted small' }, [humanSize(ev.attachment.size)]),
            el('span', { class: 'badge badge-warn tiny' }, ['attached before, kept']),
            el('button', { class: 'ghost small', onclick: () => openAttachment(ev.attachment!) }, ['Open']),
            el('button', {
              class: 'ghost small danger-text',
              onclick: () => {
                const att = ev.attachment!;
                confirmStep({
                  tier: 'danger',
                  title: `Detach ${att.name}?`,
                  body: 'The copy inside this assessment is removed. Nothing new can be attached, so this cannot be undone from here.',
                  stake: `${humanSize(att.size)}, held only here.`,
                  offer: {
                    label: 'Open it first, so you can save it',
                    run: () => { openAttachment(att); return `Opened ${att.name} in a new tab. Save it from there before detaching.`; },
                  },
                  commitLabel: 'Detach it',
                  cancelLabel: 'Keep it attached',
                  onCommit: () => { delete ev.attachment; autosave(a); paint(); refresh(); },
                });
              },
            }, ['Detach']),
          ])
        : null;

      const unmarked = !ev.classification;
      box.appendChild(el('div', { class: `ev-item ${unmarked ? 'unmarked' : ''}` }, [
        el('div', { class: 'ev-row' }, [
          el('input', { type: 'text', placeholder: 'What is it called?', value: ev.title, oninput: upd('title') }),
          el('select', { onchange: upd('kind') }, KINDS.map((k) => el('option', { value: k, selected: ev.kind === k }, [k]))),
          el('select', { class: unmarked ? 'needs-marking' : '', onchange: upd('classification') }, [
            el('option', { value: '', selected: !ev.classification }, ['- marking required -']),
            ...CLASSIFICATIONS.map((c) => el('option', { value: c, selected: ev.classification === c }, [c])),
          ]),
          el('button', {
            class: 'ghost small danger-text',
            onclick: () => {
              const drop = () => { list.splice(i, 1); autosave(a); paint(); refresh(); };
              const holds = !!(ev.title || ev.location || ev.note || ev.attachment || ev.classification);
              if (!holds) { drop(); return; }
              confirmStep({
                tier: 'danger',
                title: `Remove "${ev.title || ev.attachment?.name || 'this evidence'}"?`,
                body: 'The row goes, with its marking, its link and its note. Nothing else on the question changes.',
                stake: ev.attachment
                  ? `It has ${ev.attachment.name} attached, ${humanSize(ev.attachment.size)}, held only here.`
                  : 'There is no undo for this.',
                commitLabel: 'Remove it',
                cancelLabel: 'Keep it',
                onCommit: drop,
              });
            },
          }, [t('Remove', 'Retirer')]),
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
              const write = () => {
                const subject = evidenceSubject(a, q.id);
                ev.emailed = true;
                ev.emailSubject = subject;
                ev.location = `Emailed to the assessor. Subject: ${subject}`;
                if (!ev.title) ev.title = 'Emailed to the assessor';
                autosave(a); paint(); refresh();
              };
              // It writes over the location field, so anything already typed there is asked
              // about rather than replaced.
              if (!ev.location.trim()) { write(); return; }
              confirmStep({
                tier: 'caution',
                title: 'Replace what you typed as the location?',
                body: 'This field will say the artefact was emailed, with the subject line to use. What is in it now goes.',
                stake: `Now: ${ev.location}`,
                commitLabel: 'Replace it',
                cancelLabel: 'Leave it as it is',
                onCommit: write,
              });
            },
          }, [t('It cannot be linked, I will email it', 'Impossible de créer un lien, je l\u2019enverrai par courriel')]),
          // Any file already attached, so an assessment saved before this changed still opens.
          attachRow,
          ev.attachment && ev.classification && ev.classification !== 'Unclassified'
            ? el('div', { class: 'ev-block warn-text small' }, [
                el('b', {}, [`${ev.classification} cannot be held in this file. `]),
                'Detach it and send it to your assessor by email. Saving is blocked until you do.',
              ])
            : null,
        ]),
        // Once they say they will email it, the exact subject line is here to copy. Retyping
        // it by hand is how an assessor ends up unable to find the message.
        emailed
          ? el('div', { class: 'ev-subject' }, [
              el('span', { class: 'tiny dim' }, [t('Subject line for that email', 'Objet de ce courriel')]),
              el('div', { class: 'ev-subject-row' }, [
                // The line as it was recorded. Regenerating it meant renaming the initiative
                // changed what is shown while the recorded line stayed as it was.
                el('code', { class: 'mono' }, [ev.emailSubject ?? evidenceSubject(a, q.id)]),
                el('button', {
                  class: 'ghost tiny',
                  onclick: (e: Event) => {
                    const btn = e.currentTarget as HTMLButtonElement;
                    const line = ev.emailSubject ?? evidenceSubject(a, q.id);
                    void navigator.clipboard?.writeText?.(line);
                    btn.textContent = 'Copied';
                    setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
                  },
                }, [t('Copy', 'Copier')]),
                // The row is committed to the email route until this is pressed, so there has
                // to be a way back to a link or a file.
                el('button', {
                  class: 'linkish tiny',
                  onclick: () => {
                    const generated = `Emailed to the assessor. Subject: ${ev.emailSubject ?? ''}`;
                    if (ev.location === generated) ev.location = '';
                    delete ev.emailed;
                    delete ev.emailSubject;
                    autosave(a); paint(); refresh();
                  },
                }, [t('It did not go by email', 'Ce n\u2019est pas parti par courriel')]),
              ]),
            ])
          : null,
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
      }, [list.length ? 'Add another piece of evidence' : 'Add a piece of evidence']),
      attached > TOTAL_WARN
        ? el('span', { class: 'small warn-text' }, [
            `${humanSize(attached)} of files came with this assessment from an earlier version. Detach them and send them by email; nothing new can be attached.`,
          ])
        : null,
    ]));
  };

  paint();
  return box;
}
