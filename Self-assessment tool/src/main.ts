import type { Assessment, Rubric } from './types';
import { el, clear } from './dom';
import { validate } from './rubric';
import { goToFirstGap, renderSubmit, resetOverviewToFirstGap, setRepaint, setStopKey, takeSubmitTabs } from './views-submit';
import { renderResults } from './views-results';
import { renderReview } from './views-review';
import { APP_VERSION, blankAssessment, clearDraft, loadDraft, readJsonFiles } from './storage';
import { bannerFor } from './marking';
import BUILTIN from '../rubric/rubric.v1-dan.json';

type Mode = 'home' | 'submit' | 'results' | 'review' | 'settings';

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
  review: 'assess',
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
        ? el('nav', { class: 'path', 'aria-label': 'Where you are' }, [tab('Submissions', 'review')])
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
        onclick: () => go('settings'),
      }),
    ]),
  ]);
}

function footer(): HTMLElement {
  return el('footer', { class: 'sitefoot' }, [
    el('span', {}, ['Everything you enter stays on this machine. ']),
    el('button', { class: 'linkish', onclick: () => go('settings') }, ['How that works']),
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
  const answered = Object.keys(draft.answers).filter((k) => typeof draft.answers[k].score === 'number').length;
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
      el('button', {
        class: 'linkish',
        onclick: () => {
          if (!confirm(
            `Discard ${answered} answered question${answered === 1 ? '' : 's'} and start again?\n\n` +
            'This cannot be undone. If you want to keep them, cancel, continue, and save a file first.',
          )) return;
          clearDraft();
          assessment = blankAssessment(rubric);
          go('submit');
        },
      }, ['Discard this and start again']),
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

function renderSettings(root: HTMLElement) {
  root.appendChild(el('section', { class: 'card' }, [
    el('h1', {}, ['Settings']),
    el('p', { class: 'muted' }, ['The question set in use, and how this page handles what you enter.']),
  ]));

  root.appendChild(el('section', { class: 'card' }, [
    el('h2', {}, ['Question set']),
    el('dl', { class: 'kv' }, [
      el('dt', {}, ['Title']), el('dd', {}, [rubric.title]),
      el('dt', {}, ['Version']), el('dd', { class: 'mono' }, [rubric.version]),
      el('dt', {}, ['Status']), el('dd', {}, [rubric.status]),
      el('dt', {}, ['Size']), el('dd', {}, [
        `${questionCount(rubric)} questions in ${rubric.domains.reduce((n, d) => n + d.sections.length, 0)} sections`,
      ]),
    ]),
    rubric.provenance ? el('p', { class: 'small muted' }, [rubric.provenance]) : null,
    rubric.importWarnings?.length
      ? el('div', { class: 'card warn tight' }, [
          el('strong', { class: 'small' }, ['Noted when this question set was imported']),
          el('ul', { class: 'small' }, rubric.importWarnings.map((w) => el('li', {}, [w]))),
        ])
      : null,
    el('h3', {}, ['Use a different question set']),
    el('p', { class: 'small muted' }, [
      'The questions, weights and scale live in one JSON file. Load another and the whole assessment changes.',
    ]),
    el('label', { class: 'filelabel' }, [
      'Load a question set',
      el('input', {
        type: 'file', accept: '.json', hidden: true,
        onchange: async (e: Event) => {
          const f = (e.target as HTMLInputElement).files;
          if (!f?.length) return;
          const [item] = await readJsonFiles(f);
          const v = validate(item.data);
          if (!v.ok) { alert(`That question set will not load:\n\n- ${v.problems.join('\n- ')}`); return; }
          rubric = v.rubric;
          assessment = blankAssessment(rubric);
          go('settings');
        },
      }),
    ]),
  ]));

  root.appendChild(provenancePanel());
}

/**
 * The tool is meant to be hosted while the information stays local: the page is code, the
 * answers never leave the browser. Someone asked to type Protected B material into a page
 * loaded from the internet is entitled to see that claim made plainly, and to be told how to
 * check it.
 */
function provenancePanel(): HTMLElement {
  const where = (() => {
    const p = window.location.protocol;
    if (p === 'file:') return 'a file on this machine';
    if (p === 'https:' || p === 'http:') return window.location.host || 'a web address';
    return 'this page';
  })();

  return el('section', { class: 'card' }, [
    el('h2', {}, ['Where your answers go']),
    el('p', { class: 'small' }, [
      'This page was loaded from ', el('b', {}, [where]),
      '. That was the only thing that came over the network. Everything you type from here on stays on this machine.',
    ]),
    el('ul', { class: 'small' }, [
      el('li', {}, [
        el('b', {}, ['It cannot send anything anywhere. ']),
        'The page declares ',
        el('code', { class: 'mono' }, ["default-src 'none'; connect-src 'none'"]),
        ', a browser rule that blocks every outbound request. The browser enforces it. View source and search for it.',
      ]),
      el('li', {}, [
        el('b', {}, ['Your answers are held in two places. ']),
        'A draft kept by this browser on this machine, and the file you choose to save.',
      ]),
      el('li', {}, [
        el('b', {}, ['Reloading does not lose anything. ']),
        'Every browser keeps a small private store on disk for each site it visits. This page ',
        'writes the whole assessment there as you type, and reads it back when you return, so ',
        'closing the tab or restarting the machine is safe. That store belongs to one browser ',
        'on one machine, so it does not follow you to another, and clearing your browsing data ',
        'clears it. The file you save is the copy that travels.',
      ]),
      el('li', {}, [
        el('b', {}, ['Work at your own classification. ']),
        'Open your own material beside this page. Attaching a file copies it into the assessment you save, and nowhere else.',
      ]),
    ]),
  ]);
}

/**
 * A folded section printed as nothing at all: hiding the <summary> hid the title, and
 * `details { display: block }` does not reveal a closed <details> in Blink or WebKit. So every
 * section is opened before the print dialog and put back afterwards, which is the only thing
 * that actually works.
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
