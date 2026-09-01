import type { Assessment, Rubric } from './types';
import { el, clear } from './dom';
import { validate } from './rubric';
import { goToFirstGap, renderSubmit, resetOverviewToFirstGap, setRepaint, setStopKey, takeSubmitTabs } from './views-submit';
import { renderResults } from './views-results';
import { renderReview } from './views-review';
import { answeredCount, APP_VERSION, blankAssessment, clearDraft, hasWork, lastSaveInfo,
  loadDraft, readJsonFiles, saveAssessmentFile } from './storage';
import { bannerFor } from './marking';
import BUILTIN from '../rubric/rubric.v1-dan.json';

type Mode = 'home' | 'submit' | 'results' | 'review' | 'admin' | 'settings';

/**
 * Two jobs live in this file, and they belong to different people. A department fills an
 * assessment in; a handful of assessors at TBS read many of them. Mixing both into one path
 * asks every submitter to walk past a door that is not theirs.
 *
 * They are separated by a side, not by a second build. One HTML file that behaves as two
 * things costs nothing to publish; two builds double the publishing story for a tool that is
 * one file, serving one manager and two assessors.
 */
type Side = 'submit' | 'assess';

const SIDE_KEY = 'gc-arch-assessment:side';
const SIDE_OF: Record<Mode, Side | null> = {
  home: 'submit', submit: 'submit', results: 'submit',
  review: 'assess', admin: 'assess',
  settings: null,             // settings belongs to whoever is looking at it
};

function bootSide(): Side {
  // A bookmarked #assessor wins, so an assessor can pin the door they use.
  try {
    if (window.location.hash === '#assessor') return 'assess';
    if (localStorage.getItem(SIDE_KEY) === 'assess') return 'assess';
  } catch {
    /* private window, or storage disabled. The submitter side is the right default. */
  }
  return 'submit';
}

let rubric: Rubric = BUILTIN as unknown as Rubric;
let assessment: Assessment = loadDraft() ?? blankAssessment(rubric);
let side: Side = bootSide();
let mode: Mode = side === 'assess' ? 'review' : 'home';

type SettingsPane = 'questions' | 'answers' | 'danger';
let settingsPane: SettingsPane = 'questions';

/**
 * The assessment a discard just threw away, held in this tab and nowhere else. Undo is offered
 * from here. Nothing is written to disk to support it, so "permanently" stays true of the
 * browser's own store, which is what somebody clearing sensitive material cares about.
 */
let rescued: Assessment | null = null;

function openSettings(pane: SettingsPane) {
  settingsPane = pane;
  go('settings');
}

const app = document.getElementById('app')!;

/** Small counts read better spelled out in body copy. */
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const spell = (n: number): string => (n < WORDS.length ? WORDS[n] : String(n));

function questionCount(r: Rubric): number {
  return r.domains.reduce((n, d) => n + d.sections.reduce((m, x) => m + x.questions.length, 0), 0);
}

function go(next: Mode) {
  mode = next;
  const owner = SIDE_OF[next];
  if (owner && owner !== side) setSide(owner, false);
  paint();
  window.scrollTo({ top: 0 });
}

/** Cross between the two sides, and remember which one, so a return visit opens the same door. */
function setSide(next: Side, move = true) {
  side = next;
  try {
    localStorage.setItem(SIDE_KEY, next);
    window.location.hash = next === 'assess' ? '#assessor' : '';
  } catch {
    /* storage or history unavailable. The side still holds for this visit. */
  }
  if (move) go(next === 'assess' ? 'review' : 'home');
}

const GEAR =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.35.42.63.77.77H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

function paint() {
  clear(app);
  app.className = mode === 'home' ? 'app-home' : mode === 'results' ? 'app-results' : '';

  // The body is built first because the questionnaire's domain tabs live in the chrome and
  // register their own readouts, and renderSubmit clears that registry as it starts.
  const body = el('main', {
    class: [
      'body',
      mode === 'home' ? 'body-home' : '',
      mode === 'submit' ? 'body-submit' : '',
      mode === 'results' ? 'body-results' : '',
    ].filter(Boolean).join(' '),
  });

  if (mode === 'home') renderHome(body);
  else if (mode === 'submit') renderSubmit(body, rubric, assessment, () => go('results'));
  else if (mode === 'results') renderResults(body, rubric, assessment, () => go('submit'));
  else if (mode === 'settings') renderSettings(body);
  else if (mode === 'admin') renderAdmin(body);
  else renderReview(body, rubric);

  // Header, marking and the domain tabs travel as one sticky block. Separately pinned strips
  // leave a seam that page content shows through.
  const chrome = el('div', { class: 'chrome' }, [header()]);
  if (mode === 'submit' || mode === 'results') chrome.appendChild(banner());
  const tabs = takeSubmitTabs();
  if (mode === 'submit' && tabs) chrome.appendChild(tabs);

  app.appendChild(chrome);
  app.appendChild(body);

  // A printed assessment carries its marking at the foot of the page as well as the head.
  // On screen the sticky one above is enough.
  if (mode === 'submit' || mode === 'results') app.appendChild(banner('print-only'));
  if (mode !== 'submit') app.appendChild(footer());
  measureChrome();
}

/**
 * The domain tabs and the rail pin themselves under the header, so they need to know how tall
 * it is. Guarded on a real measurement: jsdom returns zero from getBoundingClientRect, and a
 * sticky offset of zero would put the tabs under the header rather than below it.
 */
function measureChrome(): void {
  const chrome = document.querySelector('.chrome');
  if (!chrome || typeof chrome.getBoundingClientRect !== 'function') return;
  const h = chrome.getBoundingClientRect().height;
  if (h > 0) document.documentElement.style.setProperty('--chrome-h', `${Math.round(h)}px`);
}

/**
 * The three tabs are one path through the work, so they render as a path: start, fill it in,
 * have it reviewed. Settings is not a step on that path, so it takes the usual place and the
 * usual icon at the far right.
 */
function header(): HTMLElement {
  const tab = (label: string, m: Mode) =>
    el('button', { class: `tab ${mode === m ? 'on' : ''}`, onclick: () => go(m) }, [label]);
  const chev = () => el('span', { class: 'chev', 'aria-hidden': true }, ['\u203A']);

  return el('header', { class: 'topbar' }, [
    el('div', { class: 'brand', onclick: () => go(side === 'assess' ? 'review' : 'home') }, [
      el('span', { class: 'brand-mark' }, ['EA']),
      el('strong', {}, [rubric.title]),
      side === 'assess' ? el('span', { class: 'side-badge' }, ['Assessor']) : null,
    ]),
    el('div', { class: 'topbar-right' }, [
      side === 'assess'
        ? el('nav', { class: 'path', 'aria-label': 'Where you are' }, [
            tab('Submissions', 'review'), chev(), tab('Admin', 'admin'),
          ])
        : el('nav', { class: 'path', 'aria-label': 'Where you are' }, [
            tab('Start', 'home'), chev(),
            tab('Fill it in', 'submit'), chev(),
            tab('My results', 'results'),
          ]),
      side === 'assess'
        ? el('button', { class: 'linkish small', onclick: () => setSide('submit') }, ['Leave assessor view'])
        : null,
      el('button', {
        class: `icon-btn ${mode === 'settings' ? 'on' : ''}`,
        title: 'Settings', 'aria-label': 'Settings',
        html: GEAR,
        onclick: () => openSettings('questions'),
      }),
    ]),
  ]);
}

function footer(): HTMLElement {
  return el('footer', { class: 'sitefoot' }, [
    el('span', {}, ['Everything you enter stays on this machine. ']),
    el('button', { class: 'linkish', onclick: () => openSettings('answers') }, ['How that works']),
    el('span', {}, [`  ·  rubric ${rubric.version}  ·  v${APP_VERSION}`]),
  ]);
}

function banner(extra = ''): HTMLElement {
  const mark = bannerFor(assessment);
  const unmarked = mark === 'UNMARKED';
  if (!unmarked || extra) {
    return el('div', { class: `marking-banner ${unmarked ? 'unmarked' : ''} ${extra}` }, [
      unmarked ? 'Unmarked' : mark,
    ]);
  }
  // An unmarked banner is the one thing on the page that needs doing, so it is the control
  // for doing it. Saying "go and find the setting" is the failure, not the wording of it.
  return el('button', {
    class: 'marking-banner unmarked',
    onclick: () => {
      go('submit');
      const heading = document.getElementById('marking-control');
      if (heading && typeof heading.scrollIntoView === 'function') heading.scrollIntoView({ block: 'center' });
      heading?.focus?.();
    },
  }, ['Unmarked. Set the classification']);
}

/* ------------------------------------------------------------------------------------------
   Home. One thing to read and one thing to do, then a lighter note on what to expect.
   The rubric controls and the data-handling detail belong in Settings; somebody arriving
   here wants to know what this is and how to start.
   ------------------------------------------------------------------------------------------ */

/**
 * What "Continue" is continuing, said plainly. Somebody arriving at a half-finished assessment
 * should not have to guess whether their work survived, where it went, or whether they need
 * the file they saved last week.
 *
 * Starting over is deliberately quiet. A department fills one of these in once; the button
 * that throws the work away should not be the brightest thing on the page.
 */
function draftNote(draft: Assessment, total: number): HTMLElement {
  const answered = answeredCount(draft);
  const saved = (() => {
    const t = Date.parse(draft.meta?.updatedAt ?? '');
    return Number.isFinite(t) ? new Date(t).toLocaleString() : 'a moment ago';
  })();

  return el('div', { class: 'draft-note' }, [
    el('p', { class: 'small' }, [
      el('b', {}, [`${answered} of ${total} answered, last changed ${saved}.`]),
    ]),
    el('p', { class: 'small muted' }, [
      'Saved locally on this machine, by your browser, as you type. Closing the tab or ',
      'reloading the page does not lose it, and you do not need the file you saved to carry on.',
    ]),
    el('p', { class: 'tiny dim' }, [
      'Starting over is in ',
      el('button', { class: 'linkish', onclick: () => openSettings('danger') }, ['Settings']),
      '.',
    ]),
  ]);
}

function renderHome(root: HTMLElement) {
  const draft = loadDraft();
  const started = !!draft && Object.keys(draft.answers ?? {}).length > 0;
  const total = questionCount(rubric);

  root.appendChild(el('section', { class: 'hero' }, [
    el('div', { class: 'hero-text' }, [
      el('p', { class: 'eyebrow' }, ['Government of Canada Enterprise Architecture']),
      el('h1', {}, ['Assess your own architecture']),
      el('p', { class: 'lead' }, [
        'You answer questions about the work you already run, score yourself against a published scale, ',
        'and point to evidence you already have. Nothing new has to be written for it.',
      ]),
      el('div', { class: 'hero-actions' }, [
        el('button', {
          class: 'primary big',
          // Continuing means going to the first thing left blank, not back to the top.
          onclick: () => {
            resetOverviewToFirstGap(rubric, assessment);
            if (started) goToFirstGap(rubric, assessment);
            go('submit');
          },
        }, [
          started ? 'Continue' : 'Fill it in',
          el('span', { class: 'arrow', 'aria-hidden': true }, ['\u2192']),
        ]),
        el('span', { class: 'or' }, ['or']),
        el('label', { class: 'linkish filelabel-plain' }, [
          'open a saved assessment',
          el('input', {
            type: 'file', accept: '.json', hidden: true,
            onchange: async (e: Event) => {
              const f = (e.target as HTMLInputElement).files;
              if (!f?.length) return;
              const [item] = await readJsonFiles(f);
              const a = item.data as Assessment;
              if (a?.fileType === 'gc-arch-assessment') { assessment = a; go('submit'); }
              else alert(`${item.file} is not a self-assessment file.`);
            },
          }),
        ]),
      ]),
      started ? draftNote(draft!, total) : null,
    ]),
    el('div', { class: 'hero-art', 'aria-hidden': true }, [
      el('span', { class: 'rung r1' }), el('span', { class: 'rung r2' }),
      el('span', { class: 'rung r3' }), el('span', { class: 'rung r4' }),
      el('span', { class: 'rung r5' }),
    ]),
  ]));

  root.appendChild(el('p', { class: 'crossover tiny dim' }, [
    'Reviewing submissions for TBS? ',
    el('button', { class: 'linkish', onclick: () => setSide('assess') }, ['Open the assessor view']),
  ]));

  root.appendChild(el('section', { class: 'note' }, [
    el('h2', {}, ['What to expect']),
    el('ul', {}, [
      el('li', {}, [
        el('b', {}, [`${total} questions, across ${spell(rubric.domains.length)} architecture domains. `]),
        'You do not have to finish in one sitting. Your progress is kept as you go, and you can save a file and come back to it.',
      ]),
      el('li', {}, [
        el('b', {}, ['The scale explains itself. ']),
        'Every score from 0 to 10 has a description, so a low score comes with a plain account of what would improve it.',
      ]),
      el('li', {}, [
        el('b', {}, ['You decide who sees it. ']),
        'Saving produces a file on your machine. Sending it is a separate step, through whatever channel your department already uses.',
      ]),
    ]),
  ]));
}

/* ------------------------------------------------------------------------------------------
   Settings. The rubric, and how information is handled. Both matter, and neither is the
   first thing a person needs.
   ------------------------------------------------------------------------------------------ */

/**
 * The admin view. A placeholder, and labelled as one: nobody has decided what the role does
 * beyond withdrawing a record and re-assigning an assessor, so the page says that rather than
 * inventing controls that would have to be unbuilt.
 */
function renderAdmin(root: HTMLElement) {
  root.appendChild(el('section', { class: 'card' }, [
    el('div', { class: 'head-row' }, [
      el('h1', {}, ['Admin']),
      el('span', { class: 'badge badge-warn' }, ['Placeholder']),
    ]),
    el('p', { class: 'muted' }, [
      'Nothing here is built. The role exists in the plan and nobody has decided what it does, ',
      'so this page lists what it is expected to hold and stops there.',
    ]),
    el('ul', { class: 'steps' }, [
      el('li', {}, [el('b', {}, ['Withdraw a record. ']), 'Excluded from the statistics, never deleted.']),
      el('li', {}, [el('b', {}, ['Re-assign an assessor. ']), 'When somebody leaves or a file needs a second pair of eyes.']),
      el('li', {}, [el('b', {}, ['Replace the question set. ']), 'Today this is in Settings, and it probably belongs here.']),
      el('li', {}, [el('b', {}, ['Clear out test submissions. ']), 'Dan raised it and parked it.']),
    ]),
    el('p', { class: 'small muted' }, [
      'Open question for Dan: is this a separate role, or an assessor with more buttons?',
    ]),
  ]));
}

const TRASH =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';

/* ------------------------------------------------------------------------------------------
   Settings: a rail on the left, one pane at a time on the right.
   ------------------------------------------------------------------------------------------ */

function renderSettings(root: HTMLElement) {
  const pane = el('section', { class: 'set-pane' });

  const navRow = (label: string, id: SettingsPane, danger = false) =>
    el('button', {
      class: `set-navrow ${danger ? 'danger' : ''} ${settingsPane === id ? 'on' : ''}`,
      'aria-current': settingsPane === id ? 'page' : 'false',
      onclick: () => { settingsPane = id; paintPane(); },
    }, [label]);

  const nav = el('nav', { class: 'set-nav', 'aria-label': 'Settings' });

  /**
   * Switching pane repaints the pane and nothing else, so there is no scroll jump and no
   * history entry. Focus moves to the new heading, which is what announces the change to a
   * screen reader without an aria-live region reading a whole pane aloud.
   */
  function paintPane() {
    clear(nav);
    nav.appendChild(el('span', { class: 'set-navgroup' }, ['Settings']));
    nav.appendChild(navRow('Question set', 'questions'));
    nav.appendChild(navRow('Your answers', 'answers'));
    nav.appendChild(el('span', { class: 'set-navsep', 'aria-hidden': true }));
    nav.appendChild(navRow('Start again', 'danger', true));

    clear(pane);
    if (settingsPane === 'questions') paneQuestions(pane);
    else if (settingsPane === 'answers') paneAnswers(pane);
    else paneDanger(pane);

    const h = pane.querySelector('h1') as HTMLElement | null;
    h?.focus?.();
  }

  paintPane();
  root.appendChild(el('div', { class: 'set-layout' }, [nav, pane]));
}

function setRow(
  title: string,
  body: string,
  control: HTMLElement | null,
  opts: { tier?: 'caution' | 'danger'; badge?: string } = {},
): HTMLElement {
  return el('div', { class: `set-row ${opts.tier ?? ''}` }, [
    el('div', {}, [
      el('div', { class: 'set-row-title' }, [
        title,
        opts.badge
          ? el('span', { class: `badge ${opts.tier === 'danger' ? 'badge-bad' : 'badge-warn'}` }, [opts.badge])
          : null,
      ]),
      el('p', {}, [body]),
    ]),
    control ? el('div', { class: 'set-row-act' }, [control]) : null,
  ]);
}

function paneQuestions(pane: HTMLElement) {
  pane.appendChild(el('h1', { tabindex: -1 }, ['Question set']));
  pane.appendChild(el('p', { class: 'set-lead' }, ['The questions, weights and scale in use.']));

  pane.appendChild(el('dl', { class: 'kv' }, [
    el('dt', {}, ['Title']), el('dd', {}, [rubric.title]),
    el('dt', {}, ['Version']), el('dd', { class: 'mono' }, [rubric.version]),
    el('dt', {}, ['Status']), el('dd', {}, [rubric.status]),
    el('dt', {}, ['Size']), el('dd', {}, [
      `${questionCount(rubric)} questions in ${rubric.domains.reduce((n, d) => n + d.sections.length, 0)} sections`,
    ]),
  ]));
  if (rubric.provenance) pane.appendChild(el('p', { class: 'small muted' }, [rubric.provenance]));
  if (rubric.importWarnings?.length) {
    pane.appendChild(el('div', { class: 'card warn tight' }, [
      el('strong', { class: 'small' }, ['Noted when this question set was imported']),
      el('ul', { class: 'small' }, rubric.importWarnings.map((w) => el('li', {}, [w]))),
    ]));
  }

  /**
   * Loading a different question set used to wipe every answer the moment a file validated,
   * with no warning at all. It was the most destructive control in the tool and the only one
   * that asked nothing, so it goes through the same confirmation as a discard.
   */
  const picker = el('label', { class: 'filelabel caution' }, [
    'Load a question set',
    el('input', {
      type: 'file', accept: '.json', hidden: true,
      onchange: async (e: Event) => {
        const input = e.target as HTMLInputElement;
        const f = input.files;
        if (!f?.length) return;
        const [item] = await readJsonFiles(f);
        input.value = '';
        const v = validate(item.data);
        if (!v.ok) { alert(`That question set will not load:\n\n- ${v.problems.join('\n- ')}`); return; }

        const swap = () => {
          rubric = v.rubric;
          assessment = blankAssessment(rubric);
          resetOverviewToFirstGap(rubric, assessment);
          settingsPane = 'questions';
          go('settings');
        };
        if (!hasWork(assessment)) { swap(); return; }

        confirmDestructive({
          tier: 'caution',
          title: `Replace the question set and clear ${answeredCount(assessment)} answers?`,
          body: 'A different question set is a different assessment. The answers you have given cannot be carried across to it.',
          saveLabel: 'Save a file, then replace',
          commitLabel: 'Replace anyway',
          cancelLabel: 'Keep my answers',
          onCommit: swap,
        });
      },
    }),
  ]);

  pane.appendChild(setRow(
    'Replace the question set',
    'The questions, weights and scale live in one JSON file. Loading another replaces the whole assessment, and the answers you have given cannot be carried across.',
    picker,
    { tier: 'caution', badge: 'Clears your answers' },
  ));
}

function paneAnswers(pane: HTMLElement) {
  pane.appendChild(el('h1', { tabindex: -1 }, ['Where your answers go']));
  pane.appendChild(el('p', { class: 'set-lead' }, [
    'Everything in this tool is unclassified. Nothing protected or classified belongs in it, ',
    'which is what keeps the rest of this simple.',
  ]));

  pane.appendChild(setRow(
    'Unclassified only',
    'Not the answers and not the evidence. Point at where an artefact already lives and make sure your assessor can open it. Where something cannot be linked because of its marking, send it to your assessor by email and record here that you did, with its marking and the subject line.',
    null,
  ));
  pane.appendChild(setRow(
    'This browser keeps your work as you type',
    `Every browser keeps a small private store on disk for each site it visits. This page writes the whole assessment there as you type, so closing the tab or reloading is safe. It is holding ${answeredCount(assessment)} answers now. That store belongs to one browser on one machine, and clearing your browsing data clears it.`,
    null,
  ));
  pane.appendChild(setRow(
    'Submitting is one deliberate act',
    'Nothing is sent while you are filling this in. You submit when you are finished, and the tool tells you what is about to go before it goes.',
    null,
  ));
  pane.appendChild(setRow(
    'Nothing is recalled once submitted',
    'A submitted assessment is not deleted. It can be withdrawn and left out of the statistics, which is a different thing. A copy may already exist in a backup or in somebody else\'s download, so nothing here claims to erase it.',
    null,
  ));
}

function paneDanger(pane: HTMLElement) {
  pane.appendChild(el('h1', { tabindex: -1 }, ['Start again']));
  pane.appendChild(el('p', { class: 'set-lead' }, [
    'Nothing here can be taken back once this tab is closed.',
  ]));

  if (rescued) {
    const n = answeredCount(rescued);
    pane.appendChild(el('div', { class: 'undo-bar' }, [
      el('div', {}, [
        el('div', { class: 'small' }, [
          el('b', {}, ['Discarded. ']),
          `${n} answer${n === 1 ? '' : 's'} were erased from this browser.`,
        ]),
        el('div', { class: 'tiny dim' }, [
          'Undo is held in this tab only. Reload or close the tab and it is gone for good.',
        ]),
      ]),
      el('button', { class: 'ghost small', onclick: () => {
        assessment = rescued as Assessment;
        rescued = null;
        resetOverviewToFirstGap(rubric, assessment);
        go('settings');
      } }, ['Undo']),
      el('button', { class: 'primary small', onclick: () => { rescued = null; go('submit'); } }, [
        'Start filling it in',
      ]),
    ]));
  }

  const n = answeredCount(assessment);
  const anything = hasWork(assessment);
  const button = el('button', {
    class: 'danger', disabled: !anything, html: `${TRASH}<span>Discard\u2026</span>`,
    onclick: () => confirmDestructive({
      tier: 'danger',
      title: n > 0 ? `Discard ${n} answer${n === 1 ? '' : 's'}?` : 'Discard this assessment?',
      body: 'Discarding empties the form and erases the draft this browser is holding. The questions themselves stay the same.',
      saveLabel: 'Save a file, then discard',
      commitLabel: 'Discard permanently',
      cancelLabel: 'Keep my answers',
      onCommit: () => {
        rescued = assessment;
        clearDraft();
        assessment = blankAssessment(rubric);
        resetOverviewToFirstGap(rubric, assessment);
        go('settings');
      },
    }),
  });

  pane.appendChild(setRow(
    'Discard this assessment and start again',
    anything
      ? `Erases the ${n} answer${n === 1 ? '' : 's'} this browser is holding and empties the form. A file you have already saved is not touched.`
      : 'Nothing to discard. The form is already empty.',
    button,
    { tier: 'danger', badge: 'Cannot be undone' },
  ));
}

/* ------------------------------------------------------------------------------------------
   The confirmation.
   ------------------------------------------------------------------------------------------ */

interface ConfirmOpts {
  tier: 'caution' | 'danger';
  title: string;
  body: string;
  saveLabel: string;
  commitLabel: string;
  cancelLabel: string;
  onCommit: () => void;
}

/**
 * Native <dialog> brings the focus trap, Escape, the inert background and focus restoration,
 * with no dependency. jsdom has no showModal, so there is a plain-confirm fallback: without it
 * every test that reaches Settings would throw.
 *
 * The recommendation is the first button and the only filled one. Saving never auto-discards,
 * because a browser download has no completion event: the person confirms they have the file,
 * which is the only honest thing a page that cannot see the filesystem can do.
 */
function confirmDestructive(o: ConfirmOpts): void {
  const dlg = document.createElement('dialog') as HTMLDialogElement;

  if (typeof dlg.showModal !== 'function') {
    if (window.confirm(`${o.title}\n\n${o.body}`)) o.onCommit();
    return;
  }

  dlg.className = `confirm tier-${o.tier}`;
  const actions = el('div', { class: 'cf-actions' });
  const body = el('div', { class: 'cf-body' }, [el('p', {}, [o.body])]);

  const stake = () => {
    const last = lastSaveInfo();
    return last
      ? el('p', { class: 'cf-stake ok' }, [
          `You saved ${last.name} at ${new Date(last.at).toLocaleTimeString()}. `,
          'If you still have that file, you can open it again from the start page.',
        ])
      : el('p', { class: 'cf-stake' }, [
          'This browser is holding the only copy. Nothing has been saved to a file since this page was opened.',
        ]);
  };
  let stakeEl = stake();
  body.appendChild(stakeEl);

  const close = () => { try { dlg.close(); } catch { /* already closed */ } dlg.remove(); };

  const paintActions = (saved: boolean) => {
    clear(actions);
    if (!saved) {
      actions.appendChild(el('button', { class: 'primary cf-wide', onclick: () => {
        const name = saveAssessmentFile(assessment);
        const fresh = el('p', { class: 'cf-stake ok' }, [
          `Saving as ${name}. Check your Downloads folder. `,
          'If your browser asked where to put it and you cancelled, save it again.',
        ]);
        stakeEl.replaceWith(fresh);
        stakeEl = fresh;
        paintActions(true);
      } }, [o.saveLabel]));
      actions.appendChild(el('button', { class: 'danger cf-wide', onclick: () => { close(); o.onCommit(); } }, [
        o.commitLabel,
      ]));
    } else {
      actions.appendChild(el('button', { class: 'danger-solid cf-wide', onclick: () => { close(); o.onCommit(); } }, [
        'I have the file. ' + o.commitLabel.toLowerCase(),
      ]));
      actions.appendChild(el('button', { class: 'cf-wide', onclick: () => { saveAssessmentFile(assessment); } }, [
        'Save it again',
      ]));
    }
    // The safest control takes focus, so Enter and Escape both cancel.
    const cancel = el('button', { class: 'cf-wide', onclick: close }, [o.cancelLabel]);
    actions.appendChild(cancel);
    setTimeout(() => cancel.focus?.(), 0);
  };
  paintActions(false);

  dlg.appendChild(el('div', { class: 'cf-head' }, [el('h2', { class: 'cf-title' }, [o.title])]));
  dlg.appendChild(body);
  dlg.appendChild(actions);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
}

/**
 * A folded section printed as nothing at all: hiding the <summary> hid the title, and
 * `details { display: block }` does not reveal a closed <details> in Blink or WebKit. So every
 * section is opened before the print dialog and put back afterwards.
 */
function openEverythingForPrint(): void {
  if (typeof window.addEventListener !== 'function') return;
  let reclose: HTMLDetailsElement[] = [];
  window.addEventListener('beforeprint', () => {
    reclose = [...document.querySelectorAll('details')].filter((d) => !(d as HTMLDetailsElement).open) as HTMLDetailsElement[];
    for (const d of reclose) d.open = true;
  });
  window.addEventListener('afterprint', () => {
    for (const d of reclose) d.open = false;
    reclose = [];
  });
}

/**
 * The browser's Back button should walk back through the questionnaire, since that is what a
 * reader expects of anything that looks like 21 pages.
 */
function wireHistory(): void {
  if (typeof window.addEventListener !== 'function') return;
  window.addEventListener('popstate', (e) => {
    const stop = (e as PopStateEvent).state?.stop;
    if (typeof stop !== 'string') return;
    setStopKey(stop);
    mode = 'submit';
    side = 'submit';
    paint();
  });
}

openEverythingForPrint();
wireHistory();
setRepaint(() => paint());

const check = validate(rubric);
if (!check.ok) {
  app.textContent = `The built-in rubric is invalid: ${check.problems.join('; ')}`;
} else {
  paint();
}
