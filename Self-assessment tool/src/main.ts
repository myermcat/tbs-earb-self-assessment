import type { Assessment, Rubric } from './types';
import { el, clear } from './dom';
import { validate } from './rubric';
import { renderSubmit, setRepaint } from './views-submit';
import { renderResults } from './views-results';
import { renderReview } from './views-review';
import { APP_VERSION, blankAssessment, clearDraft, loadDraft, readJsonFiles } from './storage';
import { bannerFor } from './marking';
import BUILTIN from '../rubric/rubric.v1-dan.json';

type Mode = 'home' | 'submit' | 'results' | 'review';

let rubric: Rubric = BUILTIN as unknown as Rubric;
let assessment: Assessment = loadDraft() ?? blankAssessment(rubric);
let mode: Mode = 'home';

const app = document.getElementById('app')!;

function go(next: Mode) {
  mode = next;
  paint();
  window.scrollTo({ top: 0 });
}

function paint() {
  clear(app);
  app.appendChild(header());
  if (mode === 'submit' || mode === 'results') app.appendChild(banner());
  const body = el('main', { class: 'body' });
  app.appendChild(body);

  if (mode === 'home') renderHome(body);
  else if (mode === 'submit') renderSubmit(body, rubric, assessment, () => go('results'));
  else if (mode === 'results') renderResults(body, rubric, assessment, () => go('submit'));
  else renderReview(body, rubric);

  if (mode === 'submit' || mode === 'results') app.appendChild(banner());
  app.appendChild(footer());
}

/**
 * A GC document carries its marking at the top and the bottom of every page. The tool does
 * the same, on screen and on anything printed, so nobody circulates an unmarked assessment.
 */
function banner(): HTMLElement {
  const mark = bannerFor(assessment);
  return el('div', { class: `marking-banner ${mark === 'UNMARKED' ? 'unmarked' : ''}` }, [mark]);
}

function header(): HTMLElement {
  const tab = (label: string, m: Mode) =>
    el('button', { class: `tab ${mode === m ? 'on' : ''}`, onclick: () => go(m) }, [label]);
  return el('header', { class: 'topbar' }, [
    el('div', { class: 'brand', onclick: () => go('home') }, [
      el('span', { class: 'brand-mark' }, ['EA']),
      el('strong', {}, [rubric.title]),
      el('span', { class: 'ver' }, [`rubric ${rubric.version}`]),
      rubric.status !== 'approved' ? el('span', { class: 'badge badge-warn' }, [rubric.status]) : null,
    ]),
    el('nav', {}, [tab('Home', 'home'), tab('Fill it in', 'submit'), tab('Review submissions', 'review')]),
  ]);
}

function footer(): HTMLElement {
  return el('footer', { class: 'sitefoot' }, [
    el('span', {}, [
      `Runs entirely in this browser. No server, no network calls, nothing uploaded. v${APP_VERSION}`,
    ]),
  ]);
}

function renderHome(root: HTMLElement) {
  const draft = loadDraft();

  root.appendChild(el('section', { class: 'card' }, [
    el('h1', {}, ['Score your own architecture, before anyone else does']),
    el('p', {}, [
      'This replaces the assessment template and the slide walkthrough. You answer questions about the ',
      el('b', {}, ['work you already run']),
      ', score yourself against a published scale, and point at evidence you already have. Nothing new needs inventing for us.',
    ]),
    el('ul', { class: 'steps' }, [
      el('li', {}, [
        `There are ${rubric.domains.reduce((n, d) => n + d.sections.reduce((m, s) => m + s.questions.length, 0), 0)} questions across `,
        `${rubric.domains.length} architecture domains. Nobody finishes in one sitting, and you do not have to - your `,
        'progress is kept and you can save a file and come back.',
      ]),
      el('li', {}, ['Everything happens in this page, on your machine. Work with your own material open beside you, at whatever classification it is held at.']),
      el('li', {}, ['You save a file. You decide when to send it, and through which channel. This tool has no way to send anything.']),
      el('li', {}, ['The scale is also the guide. A low score comes with what "better" looks like, so you leave with a backlog rather than a verdict.']),
    ]),
    el('div', { class: 'actions' }, [
      el('button', { class: 'primary', onclick: () => go('submit') }, [draft ? 'Carry on where you left off' : 'Start']),
      el('label', { class: 'ghost filelabel' }, [
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
      draft
        ? el('button', {
            class: 'ghost',
            onclick: () => {
              if (confirm('Start a new blank assessment? The autosaved draft in this browser will be discarded.')) {
                clearDraft();
                assessment = blankAssessment(rubric);
                go('submit');
              }
            },
          }, ['Start a new one'])
        : null,
    ]),
  ]));

  if (rubric.status !== 'approved') {
    root.appendChild(el('section', { class: 'card warn' }, [
      el('strong', {}, [`Rubric ${rubric.version} - ${rubric.status}`]),
      el('p', { class: 'small' }, [rubric.provenance ?? '']),
      rubric.importWarnings?.length
        ? el('ul', { class: 'small' }, rubric.importWarnings.map((w) => el('li', {}, [w])))
        : null,
    ]));
  }

  root.appendChild(el('section', { class: 'card' }, [
    el('h2', {}, ['Swap in a different rubric']),
    el('p', { class: 'muted' }, [
      'The questions, weights and scale live in one JSON file. Replace it and the whole instrument changes - no code, no release.',
    ]),
    el('label', { class: 'ghost filelabel' }, [
      'Load a rubric file',
      el('input', {
        type: 'file', accept: '.json', hidden: true,
        onchange: async (e: Event) => {
          const f = (e.target as HTMLInputElement).files;
          if (!f?.length) return;
          const [item] = await readJsonFiles(f);
          const v = validate(item.data);
          if (!v.ok) { alert(`That rubric will not load:\n\n- ${v.problems.join('\n- ')}`); return; }
          rubric = v.rubric;
          assessment = blankAssessment(rubric);
          go('home');
        },
      }),
    ]),
  ]));
}

setRepaint(() => paint());

const check = validate(rubric);
if (!check.ok) {
  app.textContent = `The built-in rubric is invalid: ${check.problems.join('; ')}`;
} else {
  paint();
}
