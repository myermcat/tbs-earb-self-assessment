import type { Assessment, Rubric } from './types';
import { el, clear, tone } from './dom';
import { nextAnchor, score, strongest, weakest } from './scoring';
import { flags } from './flags';
import { csvHeader, csvRow, toCsv } from './csv';
import { download, slug } from './storage';
import { humanSize, totalAttachedBytes } from './attach';
import { markingProblems } from './marking';

/**
 * What the submitter sees. Deliberately ordered: the number, then the routing,
 * then where they are weak and what to do about it. Detail is available but folded away.
 */
export function renderResults(root: HTMLElement, rubric: Rubric, a: Assessment, onBack: () => void): void {
  clear(root);
  const r = score(rubric, a);
  const fs = flags(rubric, a, r);
  const highs = fs.filter((f) => f.severity === 'high').length;

  root.appendChild(el('section', { class: 'card headline' }, [
    el('div', { class: `bigscore ${tone(r.overall)}` }, [
      el('span', { class: 'num' }, [r.overall === null ? '--' : r.overall.toFixed(1)]),
      el('span', { class: 'outof' }, ['out of 10']),
    ]),
    el('div', { class: 'headline-text' }, [
      el('h1', {}, [a.initiative.name || 'Untitled initiative']),
      el('p', { class: 'muted' }, [
        [a.initiative.department, rubric.lifecycleStages.find((s) => s.id === a.initiative.lifecycleStage)?.label]
          .filter(Boolean).join(' - ') || 'No department or stage set',
      ]),
      r.maturity
        ? el('div', { class: 'maturity' }, [
            el('strong', {}, [r.maturity.label]),
            el('div', { class: 'small' }, [r.maturity.detail]),
          ])
        : null,
      r.band
        ? el('div', { class: `band ${r.band.tone}` }, [
            el('strong', {}, [r.band.label]),
            el('div', {}, [r.band.routing]),
          ])
        : null,
      el('p', { class: 'muted small' }, [
        'This is a suggestion produced from your own scores. TBS confirms routing; a self-assessment does not decide it.',
      ]),
      el('p', { class: 'muted small' }, [
        `${r.answered} of ${r.scoreable} questions answered. ${highs} thing${highs === 1 ? '' : 's'} an assessor will probably ask about.`,
      ]),
    ]),
  ]));

  // Per-domain bars.
  const bars = el('section', { class: 'card' }, [el('h2', {}, ['By architecture domain'])]);
  for (const d of r.domains) {
    bars.appendChild(el('div', { class: 'bar-row' }, [
      el('div', { class: 'bar-label' }, [d.domain.label, el('span', { class: 'muted small' }, [` ${d.weight}% of the total`])]),
      el('div', { class: 'bar-track' }, [
        el('div', { class: `bar-fill ${tone(d.score)}`, style: `width:${((d.score ?? 0) / 10) * 100}%` }),
      ]),
      el('div', { class: `bar-num ${tone(d.score)}` }, [d.score === null ? '--' : d.score.toFixed(1)]),
    ]));
  }
  root.appendChild(bars);

  // The backlog. This is the teach-me-to-fish half of the tool.
  const w = weakest(r, 5);
  if (w.length) {
    const back = el('section', { class: 'card' }, [
      el('h2', {}, ['Your weakest five, and what would move them']),
      el('p', { class: 'muted' }, ['Take these away as backlog items. Nobody else needs to see this part.']),
    ]);
    for (const qs of w) {
      const next = nextAnchor(rubric, qs.question, qs.raw as number);
      back.appendChild(el('div', { class: 'backlog-item' }, [
        el('div', { class: 'q-head' }, [
          el('span', { class: `pill small ${tone(qs.raw)}` }, [String(qs.raw)]),
          el('span', { class: 'q-text' }, [qs.question.text]),
        ]),
        next ? el('p', { class: 'small' }, [el('b', {}, [`To reach ${next.value}: `]), next.label]) : null,
        qs.question.nextSteps?.length
          ? el('ul', { class: 'steps' }, qs.question.nextSteps.map((s) => el('li', {}, [s])))
          : null,
      ]));
    }
    root.appendChild(back);
  }

  const s = strongest(r, 3);
  if (s.length) {
    root.appendChild(el('section', { class: 'card' }, [
      el('h2', {}, ['Your strongest three']),
      el('ul', { class: 'steps' }, s.map((qs) =>
        el('li', {}, [el('b', {}, [`${qs.raw}/10 `]), qs.question.text]))),
    ]));
  }

  // What an assessor will ask. Showing this to the submitter is deliberate - it removes the ambush.
  if (fs.length) {
    const box = el('section', { class: 'card' }, [
      el('h2', {}, ['What an assessor will probably ask']),
      el('p', { class: 'muted' }, ['Better to see this now than in the room.']),
    ]);
    for (const f of fs.slice(0, 12)) {
      box.appendChild(el('div', { class: `flag sev-${f.severity}` }, [
        el('div', {}, [
          el('strong', {}, [f.title]),
          f.questionId ? el('span', { class: 'muted small' }, [` (${f.questionId})`]) : null,
        ]),
        el('div', { class: 'small' }, [f.detail]),
        f.challenge ? el('div', { class: 'small challenge' }, ['"', f.challenge, '"']) : null,
      ]));
    }
    root.appendChild(box);
  }

  // Full detail, folded.
  const table = el('table', { class: 'detail' }, [
    el('thead', {}, [el('tr', {}, [
      el('th', {}, ['#']), el('th', {}, ['Question']), el('th', {}, ['Score']),
      el('th', {}, ['Weight at your stage']), el('th', {}, ['Evidence']),
    ])]),
  ]);
  const tb = el('tbody', {});
  for (const d of r.domains) {
    tb.appendChild(el('tr', { class: 'domain-row' }, [
      el('td', { colspan: 5 }, [d.domain.label, ` - ${d.score === null ? 'not scored' : d.score.toFixed(1) + '/10'}`]),
    ]));
    for (const sec of d.sections) {
    tb.appendChild(el('tr', { class: 'section-row' }, [
      el('td', { colspan: 5 }, [`${sec.section.label}  (${sec.weight}% of ${d.domain.label}) - ${sec.score === null ? 'not scored' : sec.score.toFixed(1) + '/10'}`]),
    ]));
    for (const qs of sec.questions) {
      const ev = a.answers[qs.question.id]?.evidence ?? [];
      tb.appendChild(el('tr', {}, [
        el('td', {}, [qs.question.id]),
        el('td', {}, [qs.question.text]),
        el('td', { class: tone(qs.raw) }, [qs.na ? 'n/a' : qs.raw === null ? '--' : String(qs.raw)]),
        el('td', { class: 'muted small' }, [qs.effectiveWeight ? qs.effectiveWeight.toFixed(1) : '-']),
        el('td', { class: 'small' }, [ev.length ? ev.map((e) => e.title || 'untitled').join('; ') : '--']),
      ]));
    }
    }
  }
  table.appendChild(tb);
  root.appendChild(el('section', { class: 'card' }, [
    el('details', {}, [el('summary', {}, ['Every question and score']), table]),
  ]));

  const problems = markingProblems(a);
  if (problems.length) {
    root.appendChild(el('section', { class: 'card warn' }, [
      el('strong', {}, ['You cannot save this yet']),
      el('ul', { class: 'small' }, problems.slice(0, 8).map((p) => el('li', {}, [p.message]))),
      el('button', { class: 'ghost', onclick: onBack }, ['Go back and fix it']),
    ]));
  }

  const attached = totalAttachedBytes(a.answers);
  root.appendChild(el('section', { class: 'card actions' }, [
    el('button', {
      class: 'primary', disabled: problems.length > 0,
      onclick: () => sendPackage(rubric, a, { high: highs, total: fs.length }),
    }, [
      attached ? `Save the file to send to TBS (${humanSize(attached)} of evidence attached)` : 'Save the file to send to TBS',
    ]),
    el('button', {
      class: 'ghost', disabled: problems.length > 0,
      onclick: () => handOff(a, r.overall, r.band?.label ?? ''),
    }, ['Draft the email']),
    el('button', { class: 'ghost', onclick: () => saveCsv(rubric, a, { high: highs, total: fs.length }) }, ['Save a CSV row']),
    el('button', { class: 'ghost', onclick: () => window.print() }, ['Print or save as PDF']),
    el('button', { class: 'ghost', onclick: onBack }, ['Back to the questions']),
  ]));
}

function sendPackage(rubric: Rubric, a: Assessment, counts: { high: number; total: number }) {
  download(`${slug(a.initiative.name)}-self-assessment.json`, JSON.stringify(a, null, 2));
}

/**
 * A page with no network cannot send anything, and should not pretend to. This opens the
 * person's own mail client with the message written for them; they attach the saved file
 * themselves, through the channel their department already trusts.
 */
function handOff(a: Assessment, overall: number | null, band: string) {
  const subject = `GC EA self-assessment - ${a.initiative.name || 'untitled initiative'}`;
  const body = [
    `Initiative: ${a.initiative.name}`,
    `Department: ${a.initiative.department}`,
    `Lifecycle stage: ${a.initiative.lifecycleStage}`,
    `Marking: ${a.initiative.classification}`,
    `Self-assessed score: ${overall === null ? 'not scored' : overall.toFixed(1)} out of 10${band ? ` (${band})` : ''}`,
    '',
    'The assessment file is attached. It contains every answer, the reasoning, and the evidence.',
    '',
    '(Attach the .json file you just saved before sending - a web page cannot attach it for you.)',
  ].join('\r\n');
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function saveCsv(rubric: Rubric, a: Assessment, counts: { high: number; total: number }) {
  const csv = toCsv([csvHeader(rubric), csvRow(rubric, a, counts)]);
  download(`${slug(a.initiative.name)}-self-assessment.csv`, csv, 'text/csv');
}
