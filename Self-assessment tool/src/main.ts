import type { Assessment, Rubric } from './types';
import { el, clear } from './dom';
import { validate } from './rubric';
import { renderSubmit, setRepaint } from './views-submit';
import { renderResults } from './views-results';
import { renderReview } from './views-review';
import { APP_VERSION, blankAssessment, clearDraft, loadDraft, readJsonFiles } from './storage';
import { bannerFor } from './marking';
import BUILTIN from '../rubric/rubric.v1-dan.json';

type Mode = 'home' | 'submit' | 'results' | 'review' | 'settings';

let rubric: Rubric = BUILTIN as unknown as Rubric;
let assessment: Assessment = loadDraft() ?? blankAssessment(rubric);
let mode: Mode = 'home';

const app = document.getElementById('app')!;

/** Small counts read better spelled out in body copy. */
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const spell = (n: number): string => (n < WORDS.length ? WORDS[n] : String(n));

function questionCount(r: Rubric): number {
  return r.domains.reduce((n, d) => n + d.sections.reduce((m, x) => m + x.questions.length, 0), 0);
}

function go(next: Mode) {
  mode = next;
  paint();
  window.scrollTo({ top: 0 });
}

function paint() {
  clear(app);
  app.appendChild(header());
  if (mode === 'submit' || mode === 'results') app.appendChild(banner());
  const body = el('main', { class: `body ${mode === 'home' ? 'body-home' : ''}` });
  app.appendChild(body);

  if (mode === 'home') renderHome(body);
  else if (mode === 'submit') renderSubmit(body, rubric, assessment, () => go('results'));
  else if (mode === 'results') renderResults(body, rubric, assessment, () => go('submit'));
  else if (mode === 'settings') renderSettings(body);
  else renderReview(body, rubric);

  if (mode === 'submit' || mode === 'results') app.appendChild(banner());
  app.appendChild(footer());
}

function header(): HTMLElement {
  const tab = (label: string, m: Mode) =>
    el('button', { class: `tab ${mode === m ? 'on' : ''}`, onclick: () => go(m) }, [label]);
  return el('header', { class: 'topbar' }, [
    el('div', { class: 'brand', onclick: () => go('home') }, [
      el('span', { class: 'brand-mark' }, ['EA']),
      el('strong', {}, [rubric.title]),
    ]),
    el('nav', {}, [
      tab('Home', 'home'),
      tab('Fill it in', 'submit'),
      tab('Review submissions', 'review'),
      tab('Settings', 'settings'),
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

function banner(): HTMLElement {
  const mark = bannerFor(assessment);
  return el('div', { class: `marking-banner ${mark === 'UNMARKED' ? 'unmarked' : ''}` }, [mark]);
}

/* ------------------------------------------------------------------------------------------
   Home. One thing to read and one thing to do, then a lighter note on what to expect.
   The rubric controls and the data-handling detail belong in Settings; somebody arriving
   here wants to know what this is and how to start.
   ------------------------------------------------------------------------------------------ */

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
        'and point to evidence you already have. Nothing needs making for us.',
      ]),
      el('div', { class: 'hero-actions' }, [
        el('button', { class: 'primary big', onclick: () => go('submit') }, [
          started ? 'Carry on' : 'Start',
        ]),
        el('label', { class: 'filelabel big' }, [
          'Open a saved assessment',
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
      started
        ? el('p', { class: 'tiny dim' }, [
            `You have ${Object.keys(draft!.answers).length} of ${total} answered. `,
            el('button', {
              class: 'linkish',
              onclick: () => {
                if (confirm('Start a new blank assessment? The draft kept by this browser will be discarded.')) {
                  clearDraft();
                  assessment = blankAssessment(rubric);
                  go('submit');
                }
              },
            }, ['Start a new one instead']),
          ])
        : null,
    ]),
    el('div', { class: 'hero-art', 'aria-hidden': true }, [
      el('span', { class: 'rung r1' }), el('span', { class: 'rung r2' }),
      el('span', { class: 'rung r3' }), el('span', { class: 'rung r4' }),
      el('span', { class: 'rung r5' }),
    ]),
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
        el('b', {}, ['Work at your own classification. ']),
        'Open your own material beside this page. Attaching a file copies it into the assessment you save, and nowhere else.',
      ]),
    ]),
  ]);
}

setRepaint(() => paint());

const check = validate(rubric);
if (!check.ok) {
  app.textContent = `The built-in rubric is invalid: ${check.problems.join('; ')}`;
} else {
  paint();
}
