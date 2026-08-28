import { CLASSIFICATIONS, type Assessment, type EvidenceRef, type Question, type Rubric } from './types';
import { el, clear, tone } from './dom';
import { score, type Result, type SectionScore } from './scoring';
import { autosave, download, slug } from './storage';
import { humanSize, openAttachment, readAttachment, totalAttachedBytes, TOTAL_LIMIT, TOTAL_WARN } from './attach';
import { canSave, highestEvidenceMarking, markingProblems } from './marking';

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

  /** Move to another page of the questionnaire. This one does rebuild, by definition. */
  const navigate = (target: string) => {
    page = target;
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
    sheet.appendChild(aboutSection(rubric, a, refresh, repaintApp));
    if (!a.initiative.lifecycleStage) {
      sheet.appendChild(el('section', { class: 'card warn' }, [
        el('strong', {}, ['Pick a lifecycle stage before you start scoring']),
        el('p', { class: 'small' }, [
          'It changes what is expected of you. Current-state questions count for less if there is nothing built yet.',
        ]),
      ]));
    }
  } else {
    const ds = r.domains.find((d) => d.domain.id === here.domainId);
    const ss = ds?.sections.find((x) => x.section.id === here.sectionId);
    if (!ds || !ss) { page = 'about'; repaintApp(); return; }
    sheet.appendChild(sectionHead(ds, ss, r, here));
    for (const qs of ss.questions) {
      sheet.appendChild(questionBlock(rubric, a, qs.question, refresh));
    }
  }

  sheet.appendChild(pager(list, here, navigate, onDone));
  root.appendChild(footerBar(a, r, onDone, here));
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
    counts.textContent =
      `${cur.weight}% of ${d.domain.label}, which is ${d.domain.weight}% of the total. ` +
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

  const overview = el('button', {
    class: `toc-row toc-overview ${here.key === 'about' ? 'on' : ''}`,
    onclick: () => navigate('about'),
  }, [el('span', { class: 'toc-label' }, ['Overview'])]);
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
  const step = (label: string, target: string, owns: (s: Stop) => boolean, count: (rr: Result) => [number, number]) => {
    const countEl = el('span', { class: 'step-count' });
    const fill = el('i');
    const btn = el('button', {
      onclick: () => navigate(target),
    }, [
      el('span', { class: 'step-label' }, [label]),
      countEl,
      el('span', { class: 'step-bar' }, [fill]),
    ]);

    const apply = (rr: Result) => {
      const [done, total] = count(rr);
      const complete = total > 0 && done === total;
      const on = owns(stopOf(list, page));
      btn.className = `step ${on ? 'on' : ''} ${complete ? 'complete' : ''}`;
      btn.setAttribute('aria-current', on ? 'page' : 'false');
      countEl.textContent = `${done} of ${total}`;
      fill.style.width = total > 0 ? `${Math.round((done / total) * 100)}%` : '0%';
    };
    register(apply, r);
    return btn;
  };

  return el('nav', { class: 'stepper', 'aria-label': 'Parts of the assessment' }, [
    step('Overview', 'about', (st) => st.domainId === null, () => [a.initiative.lifecycleStage ? 1 : 0, 1]),
    ...rubric.domains.map((d) =>
      step(shortLabel(d.label), firstStopIn(list, d.id), (st) => st.domainId === d.id, (rr) => {
        const ds = rr.domains.find((x) => x.domain.id === d.id);
        return [ds?.answered ?? 0, ds?.total ?? 0];
      }),
    ),
  ]);
}

/** "Application & Virtual Architecture" is too long for a tab. */
function shortLabel(s: string): string {
  return s.replace(/\s*&\s*\w+/, '').replace(/\s*Architecture$/, '');
}

function pager(list: Stop[], here: Stop, navigate: (t: string) => void, onDone: () => void): HTMLElement {
  const i = list.findIndex((x) => x.key === here.key);
  const prev = i > 0 ? list[i - 1] : null;
  const next = i < list.length - 1 ? list[i + 1] : null;
  return el('section', { class: 'card actions pager' }, [
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

function footerBar(a: Assessment, r: Result, onDone: () => void, here: Stop): HTMLElement {
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
    if (problems.length) {
      const needsFileMark = problems.some((x) => x.kind === 'no-file-marking');
      gate.appendChild(el('div', { class: 'gate small' }, [
        el('div', {}, [
          el('strong', {}, [
            problems.length === 1
              ? 'One thing before you can save: '
              : `${problems.length} things before you can save: `,
          ]),
          problems[0].message,
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
      el('div', { class: 'footer-score' }, [pill, readout]),
      el('div', { class: 'footer-actions' }, [
        save,
        el('button', { class: 'primary', onclick: onDone }, ['See my results']),
      ]),
    ]),
  ]);
  register(apply, r);
  return node;
}

function saveFile(a: Assessment) {
  autosave(a);
  download(`${slug(a.initiative.name)}-self-assessment.json`, JSON.stringify(a, null, 2));
}

function aboutSection(
  rubric: Rubric,
  a: Assessment,
  refresh: () => void,
  rebuild: () => void,
): HTMLElement {
  const set = (k: keyof Assessment['initiative']) => (e: Event) => {
    (a.initiative as Record<string, string>)[k] = (e.target as HTMLInputElement).value;
    autosave(a);
  };
  // Repainting on every keystroke would pull focus out of the field, so the marking gate
  // refreshes when the field is left rather than as it is typed in.
  const settled = () => refresh();

  const stageWrap = el('div', { class: 'stage-grid' });
  for (const st of rubric.lifecycleStages) {
    const id = `stage-${st.id}`;
    const link =
      rubric.dlgBaseUrl && st.dlgPage
        ? el('a', {
            href: `${rubric.dlgBaseUrl.replace(/\/$/, '')}/${encodeURIComponent(st.dlgPage)}`,
            target: '_blank', rel: 'noreferrer', class: 'dlg-link',
          }, [`${st.dlgPage} in the Digital Lifecycle Guide`])
        : el('span', { class: 'dlg-link muted' }, [st.dlgPage ? `${st.dlgPage} - Digital Lifecycle Guide` : '']);

    stageWrap.appendChild(
      el('label', { class: 'stage-card', for: id }, [
        el('input', {
          type: 'radio', name: 'stage', id, value: st.id,
          checked: a.initiative.lifecycleStage === st.id,
          onchange: () => { a.initiative.lifecycleStage = st.id; autosave(a); rebuild(); },
        }),
        el('div', {}, [
          el('strong', {}, [st.label]),
          st.blurb ? el('div', { class: 'muted small' }, [st.blurb]) : null,
          link,
        ]),
      ]),
    );
  }

  return el('section', { class: 'card' }, [
    el('h2', {}, ['About the initiative']),
    el('div', { class: 'grid-2' }, [
      field('Initiative name', el('input', { type: 'text', value: a.initiative.name, oninput: set('name'), onchange: settled })),
      field('Department or agency', el('input', { type: 'text', value: a.initiative.department, oninput: set('department'), onchange: settled })),
      field('Who to contact about this', el('input', { type: 'text', value: a.initiative.contact, oninput: set('contact'), onchange: settled })),
    ]),
    field('In two or three sentences, what is it?', el('textarea', { rows: 3, oninput: set('summary'), onchange: settled }, [a.initiative.summary])),
    el('h3', {}, ['How is this assessment marked?']),
    el('p', { class: 'muted' }, [
      'Mark the file as a whole, at the highest marking of anything you put in it - your own words, and anything you attach. ',
      'Individual scores are not marked; a number is not sensitive. You cannot save until this is set.',
    ]),
    (() => {
      const top = highestEvidenceMarking(a);
      return el('div', {}, [
        el('div', { class: 'marking-row' }, CLASSIFICATIONS.map((c) =>
          el('label', { class: `marking-chip ${a.initiative.classification === c ? 'on' : ''}` }, [
            el('input', {
              type: 'radio', name: 'filemark', value: c,
              checked: a.initiative.classification === c,
              onchange: () => { a.initiative.classification = c; autosave(a); rebuild(); },
            }),
            c,
          ]))),
        top
          ? el('p', { class: 'small muted' }, [`The highest marking on your attached evidence so far is ${top}.`])
          : null,
      ]);
    })(),
    el('h3', {}, ['Where is it in the lifecycle?']),
    el('p', { class: 'muted' }, [
      'This changes what is expected of you. A discovery team has no current solution to document; a live service does.',
    ]),
    stageWrap,
  ]);
}

function field(label: string, control: HTMLElement): HTMLElement {
  return el('label', { class: 'field' }, [el('span', {}, [label]), control]);
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
  wrap.appendChild(el('div', { class: 'q-head' }, [
    el('span', { class: 'qid' }, [q.id]),
    el('span', { class: 'q-text', id: textId }, [q.text]),
    expBadge,
  ]));
  if (q.help) wrap.appendChild(el('p', { class: 'muted small' }, [q.help]));

  // The ladder, shown rather than hidden. It is the guidance, not just the scale.
  const ladderList = el('ul', { class: 'ladder' });
  for (const anchor of ladder) {
    ladderList.appendChild(el('li', {}, [
      el('b', {}, [String(anchor.value)]),
      anchor.name ? el('i', {}, [` ${anchor.name}. `]) : ' ',
      anchor.label,
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

  answerBox.appendChild(el('label', { class: 'field' }, [
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
  answerBox.appendChild(printJust);

  wrap.appendChild(evidenceEditor(a, q, ans.evidence ??= [], refresh));
  return wrap;
}

function evidenceEditor(a: Assessment, q: Question, list: EvidenceRef[], refresh: () => void): HTMLElement {
  const box = el('div', { class: 'evidence' });

  const paint = () => {
    clear(box);
    box.appendChild(el('div', { class: 'ev-head' }, [
      el('strong', {}, ['Evidence']),
      el('span', { class: 'muted small' }, [
        q.evidencePrompt ? q.evidencePrompt : 'Whatever your team already holds. A cost model, a diagram, a report.',
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
            'Attach the file',
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
          attachRow,
          el('input', {
            type: 'text',
            placeholder: ev.attachment ? 'Note (optional)' : 'Or say where it lives - a path, a URL, a system name',
            value: ev.attachment ? (ev.note ?? '') : ev.location,
            oninput: ev.attachment ? upd('note') : upd('location'),
          }),
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
