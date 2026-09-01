import type { Assessment, Rubric } from './types';
import { el, clear } from './dom';
import { validate } from './rubric';
import { goToFirstGap, renderSubmit, resetOverviewToFirstGap, setRepaint, setStopKey, showMarkingStep, takeSubmitTabs } from './views-submit';
import { renderResults } from './views-results';
import { openedThisSession, renderReview, setAuditor } from './views-review';
import { renderDashboard } from './views-dashboard';
import { addToLibrary, currentId, currentRubric, libraryList, removeFromLibrary, setCurrentId } from './library';
import { confirmStep } from './confirm';
import { saveBadge } from './save-badge';
import { answeredCount, APP_VERSION, autosave, blankAssessment, clearDraft, download, hasWork,
  lastSaveInfo, loadDraft, readJsonFiles, saveAssessmentFile, slug } from './storage';
import { bannerFor, evidenceNote } from './marking';
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

// The set in use is remembered, so a reload does not silently go back to the built-in one.
let rubric: Rubric = currentRubric(BUILTIN as unknown as Rubric);
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
function setSide(next: Side, move = true, target?: Mode) {
  side = next;
  try {
    localStorage.setItem(SIDE_KEY, next);
    window.location.hash = next === 'assess' ? '#assessor' : '';
  } catch {
    /* storage or history unavailable. The side still holds for this visit. */
  }
  if (move) go(target ?? (next === 'assess' ? 'review' : 'home'));
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
  else if ((mode === 'admin' || mode === 'review') && !assessorName.trim()) renderSignIn(body, () => paint());
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
      side === 'assess'
        ? el('span', { class: 'side-badge' }, [
            assessorName.trim() ? `${assessorName.trim()} · unverified` : 'Assessor',
          ])
        : null,
    ]),
    el('div', { class: 'topbar-right' }, [
      // Where the work is kept, on every screen, and one click from the detail.
      saveBadge(() => openSettings('answers')),
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
    const note = evidenceNote(assessment);
    return el('div', { class: `marking-banner ${unmarked ? 'unmarked' : ''} ${extra}` }, [
      unmarked ? 'Unmarked' : mark,
      note ? el('span', { class: 'mark-note' }, [note]) : null,
    ]);
  }
  // An unmarked banner is the one thing on the page that needs doing, so it is the control
  // for doing it. Saying "go and find the setting" is the failure, not the wording of it.
  return el('button', {
    class: 'marking-banner unmarked',
    onclick: () => {
      // The marking question lives on the overview, so go there first. Without this the
      // banner did nothing at all from any of the twenty question pages.
      showMarkingStep();
      go('submit');
      const heading = document.getElementById('marking-control');
      if (heading && typeof heading.scrollIntoView === 'function') heading.scrollIntoView({ block: 'center' });
      heading?.focus?.();
    },
  }, ['Say how your evidence is marked']);
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
              if (a?.fileType !== 'gc-arch-assessment') {
                alert(`${item.file} is not a self-assessment file.`);
                return;
              }
              const open = () => { assessment = a; autosave(assessment); go('submit'); };
              // Opening a file overwrites whatever this browser is holding, which is the same
              // destruction as a discard and used to happen on one click with no warning.
              if (!hasWork(assessment)) { open(); return; }
              confirmDestructive({
                tier: 'caution',
                title: `Open ${item.file} over ${answeredCount(assessment)} answers?`,
                body: 'The file you open replaces what this browser is holding. Anything here that is not in a file of its own is gone.',
                saveLabel: 'Save this one first',
                commitLabel: 'Open the file anyway',
                cancelLabel: 'Keep what I have',
                onCommit: open,
              });
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
  // The portfolio view has no other way in from here, and somebody who runs the programme
  // should not have to find it through the assessor side.
  root.appendChild(el('p', { class: 'crossover tiny dim' }, [
    'Running the programme? ',
    el('button', { class: 'linkish', onclick: () => setSide('assess', true, 'admin') }, ['Open the admin view']),
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
 * Who the assessor says they are. There is no authentication anywhere in this tool and there
 * cannot be until somebody decides how it works, so this screen is shaped like a sign-in and
 * says plainly that it is a mockup. Getting the shape agreed now is worth more than a text
 * field pretending to be nothing.
 *
 * Everything it produces is labelled unverified, in the file and on screen, so nobody can
 * later mistake a typed name for a checked one.
 */
let assessorName = '';

function renderSignIn(root: HTMLElement, onDone: () => void) {
  const input = el('input', {
    type: 'text', value: assessorName, placeholder: 'First and last name',
    oninput: (e: Event) => { assessorName = (e.target as HTMLInputElement).value; },
  }) as HTMLInputElement;

  const go = () => {
    if (!assessorName.trim()) { input.focus(); return; }
    setAuditor(assessorName.trim());
    onDone();
  };

  const card = el('section', { class: 'card signin' }, [
    el('div', { class: 'head-row' }, [
      el('h1', {}, ['Sign in']),
      el('span', { class: 'badge badge-warn' }, ['Mockup']),
    ]),
    el('p', { class: 'muted' }, [
      'There is no sign-in yet. Nobody has decided how assessors will be verified, so this ',
      'screen is the shape of one and nothing more.',
    ]),
    el('div', { class: 'signin-mock' }, [
      el('p', { class: 'small' }, [
        el('b', {}, ['What this will probably become. ']),
        'Your departmental account, the same one you use for Teams, so there is no new ',
        'password and the tool knows who you are without asking.',
      ]),
      el('button', { class: 'ghost', disabled: true }, ['Continue with your departmental account']),
      el('p', { class: 'tiny dim' }, ['Not wired to anything.']),
    ]),
    el('hr', { class: 'q-split' }),
    el('label', { class: 'field' }, [
      el('span', {}, ['For now, type your full name']),
      input,
    ]),
    el('p', { class: 'small warn-text' }, [
      'This is not checked. Anything you score will be recorded as unverified, and it will say ',
      'so beside your name.',
    ]),
    el('div', { class: 'actions' }, [
      el('button', { class: 'primary', onclick: go }, ['Continue as unverified']),
    ]),
  ]);
  card.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); go(); }
  });
  root.appendChild(card);
  setTimeout(() => input.focus?.(), 0);
}

/**
 * The admin view: the portfolio dashboard. It recalculates every record from its answers as the
 * page draws, so there is no stored roll-up to go stale - Dan's dashboard updates itself by
 * never storing a number in the first place. What it can reach depends on whether a store
 * exists, and the page says which.
 */
function renderAdmin(root: HTMLElement) {
  renderDashboard(root, rubric, openedThisSession());
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
   * Replacing the question set belongs to whoever maintains the instrument, not to somebody
   * filling one in. It is offered on the assessor and admin side only.
   *
   * It also used to wipe every answer the moment a file validated, with no warning at all: the
   * most destructive control in the tool and the only one that asked nothing. It now goes
   * through the same confirmation as a discard.
   */
  const picker = el('label', { class: 'filelabel caution' }, [
    'Add a question set',
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

        const added = addToLibrary(v.rubric, new Date().toISOString());
        if (!added.ok) { alert(added.problem); return; }

        // A new set becomes the one in use, which is what somebody adding one wants. The set
        // it replaces stays in the library.
        const swap = () => {
          setCurrentId(added.id);
          rubric = v.rubric;
          clearDraft();
          assessment = blankAssessment(rubric);
          resetOverviewToFirstGap(rubric, assessment);
          settingsPane = 'questions';
          go('settings');
        };
        if (!hasWork(assessment)) { swap(); return; }

        confirmDestructive({
          tier: 'caution',
          title: `Use the new question set and clear ${answeredCount(assessment)} answers?`,
          body: 'A different question set is a different assessment. The answers you have given cannot be carried across to it. The set is in your library either way.',
          saveLabel: 'Save a file, then switch',
          commitLabel: 'Switch anyway',
          cancelLabel: 'Keep my answers',
          onCommit: swap,
        });
      },
    }),
  ]);

  if (side !== 'assess') {
    pane.appendChild(setRow(
      'Changing the question set',
      'Whoever maintains the instrument does this, on the assessor side. It is not offered here, because using a different set clears every answer.',
      null,
    ));
    return;
  }

  /**
   * The library. Sets accumulate: the one in the build, plus every one that has been added.
   * Switching clears answers, so it asks. Deleting asks as well, and offers the file back
   * first, because a set somebody spent a morning building is not recoverable from here.
   */
  const lib = libraryList(BUILTIN as unknown as Rubric);
  const cur = currentId();

  const rows = el('div', { class: 'set-list' });
  for (const entry of lib) {
    const isCurrent = entry.id === cur;
    const acts = el('div', { class: 'set-list-act' });

    if (isCurrent) {
      acts.appendChild(el('span', { class: 'badge' }, ['In use']));
    } else {
      acts.appendChild(el('button', {
        class: 'ghost small',
        onclick: () => {
          const swap = () => {
            setCurrentId(entry.id);
            rubric = entry.rubric;
            clearDraft();
            assessment = blankAssessment(rubric);
            resetOverviewToFirstGap(rubric, assessment);
            go('settings');
          };
          if (!hasWork(assessment)) { swap(); return; }
          confirmDestructive({
            tier: 'caution',
            title: `Switch to this set and clear ${answeredCount(assessment)} answers?`,
            body: 'Answers belong to the set they were given against, so they cannot be carried across.',
            saveLabel: 'Save a file, then switch',
            commitLabel: 'Switch anyway',
            cancelLabel: 'Keep my answers',
            onCommit: swap,
          });
        },
      }, ['Use this one']));
    }

    const why = entry.builtIn
      ? 'This set is built into the page, so it cannot be deleted.'
      : isCurrent
        ? 'This is the set in use. Switch to another one first.'
        : 'Delete this set';
    acts.appendChild(el('button', {
      class: 'ghost small danger-text',
      disabled: !!entry.builtIn || isCurrent,
      title: why,
      onclick: () => {
        confirmStep({
          tier: 'danger',
          title: `Delete "${entry.rubric.title}" ${entry.rubric.version}?`,
          body: 'This removes the question set from this browser. No answers are touched, and nothing else in the tool changes.',
          stake: 'Nobody can get it back from here. If this is the only copy, take the file first.',
          offer: {
            label: 'Download the set, then delete',
            run: () => {
              const name = `${slug(entry.rubric.title)}-${entry.rubric.version}.json`;
              download(name, JSON.stringify(entry.rubric, null, 2));
              return `Saving as ${name}. Check your Downloads folder.`;
            },
          },
          commitLabel: 'Delete permanently',
          cancelLabel: 'Keep it',
          onCommit: () => { removeFromLibrary(entry.id); go('settings'); },
        });
      },
    }, ['Delete']));

    rows.appendChild(el('div', { class: `set-list-row ${isCurrent ? 'on' : ''}` }, [
      el('div', {}, [
        el('div', { class: 'set-row-title' }, [
          entry.rubric.title,
          el('span', { class: 'mono small muted' }, [` ${entry.rubric.version}`]),
          entry.builtIn ? el('span', { class: 'badge' }, ['Built in']) : null,
        ]),
        el('p', { class: 'small muted' }, [
          `${questionCount(entry.rubric)} questions, ${entry.rubric.status}`,
          entry.addedAt ? `. Added ${new Date(entry.addedAt).toLocaleDateString()}` : '',
        ]),
      ]),
      acts,
    ]));
  }

  pane.appendChild(el('h2', { class: 'set-h2' }, [
    'Question sets in this browser',
    el('span', { class: 'muted small' }, [` ${lib.length}`]),
  ]));
  pane.appendChild(el('p', { class: 'small muted' }, [
    'Adding a set keeps the old ones. The one in use decides what everybody answers.',
  ]));
  pane.appendChild(rows);
  pane.appendChild(el('div', { class: 'actions' }, [picker]));
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
    'Nothing is sent anywhere today',
    'There is no submit button yet, and this page cannot reach the network at all: it carries a browser rule that blocks every outbound request. When submitting is built it will be one deliberate act, and it will name what is about to go before it goes.',
    null,
  ));
  pane.appendChild(setRow(
    'One shared copy, once it is hosted',
    'The plan is for submitted assessments to live in one place, so you and your assessor read the same record and nobody works from an older file. That store does not exist yet: today this page can only write to this browser and to a file you save. Nothing about your answers changes when it arrives.',
    null,
  ));
  pane.appendChild(setRow(
    'Nothing will be recalled once submitted',
    'Planned, not built. A submitted assessment will not be deleted. It will be withdrawn and left out of the statistics, which is a different thing: a copy may already exist in a backup or in somebody else\'s download, so nothing here will claim to erase it.',
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
        // Coming back to this pane after answering more questions, Undo would have replaced
        // the newer work with the older copy and thrown the newer away silently.
        const restore = () => {
          assessment = rescued as Assessment;
          rescued = null;
          autosave(assessment);
          resetOverviewToFirstGap(rubric, assessment);
          go('settings');
        };
        if (!hasWork(assessment)) { restore(); return; }
        confirmStep({
          tier: 'danger',
          title: `Put the discarded copy back over ${answeredCount(assessment)} answers?`,
          body: 'You have answered questions since that discard. Restoring the old copy replaces them, and they are not held anywhere else.',
          stake: 'The newer answers cannot be recovered afterwards.',
          commitLabel: 'Restore the old copy',
          cancelLabel: 'Keep what I have now',
          onCommit: restore,
        });
      } }, ['Undo']),
      el('button', {
        class: 'primary small',
        // This is the only copy of what was just discarded, so letting it go is a decision.
        onclick: () => confirmStep({
          tier: 'caution',
          title: 'Let the discarded copy go?',
          body: 'This is the last moment it can be brought back. After this it is gone from the browser as well.',
          stake: `${answeredCount(rescued as Assessment)} answers were in it.`,
          offer: {
            label: 'Save it as a file first',
            run: () => `Saving as ${saveAssessmentFile(rescued as Assessment)}. Check your Downloads folder.`,
          },
          commitLabel: 'Let it go',
          cancelLabel: 'Keep the undo for now',
          onCommit: () => { rescued = null; go('submit'); },
        }),
      }, ['Start filling it in']),
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

/**
 * The frame lifts once the page has scrolled under it.
 *
 * A border is the separation at rest, and a shadow is what tells you content is passing
 * beneath. Showing the shadow at the top of the page as well leaves nothing to distinguish the
 * two states, which is the state the tool was in when the frame read as part of the page.
 */
function wireScrollLift(): void {
  if (typeof window.addEventListener !== 'function') return;
  const root = document.documentElement;
  const paint = () => root.classList.toggle('scrolled', (window.scrollY || 0) > 4);
  window.addEventListener('scroll', paint, { passive: true });

  /**
   * A sentinel above the frame, watched rather than polled. Scroll events are the obvious
   * mechanism and they are not reliable everywhere: in the embedded browser used to check this
   * page, a programmatic scroll moved the page and fired nothing. An intersection observer
   * reports the same fact without depending on the event.
   */
  const app = document.getElementById('app');
  if (app && typeof IntersectionObserver === 'function') {
    const sentinel = el('span', { class: 'top-sentinel', 'aria-hidden': true });
    app.insertBefore(sentinel, app.firstChild);
    new IntersectionObserver(
      ([entry]) => root.classList.toggle('scrolled', !entry.isIntersecting),
      { threshold: 0 },
    ).observe(sentinel);
  }
  // The questionnaire's results view scrolls inside its own container, so it reports its own.
  document.addEventListener('scroll', (e) => {
    const t = e.target as HTMLElement | null;
    if (t && t.classList?.contains('body-results')) root.classList.toggle('scrolled', t.scrollTop > 4);
  }, true);
  paint();
}

openEverythingForPrint();
wireHistory();
wireScrollLift();
setRepaint(() => paint());

const check = validate(rubric);
if (!check.ok) {
  app.textContent = `The built-in rubric is invalid: ${check.problems.join('; ')}`;
} else {
  paint();
}
