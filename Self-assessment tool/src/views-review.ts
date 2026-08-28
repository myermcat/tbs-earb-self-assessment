import type { Assessment, AuditEntry, Rubric } from './types';
import { el, clear, tone } from './dom';
import { score, strongest, weakest, type Result } from './scoring';
import { flags, type Flag } from './flags';
import { csvHeader, csvRow, toCsv } from './csv';
import { download, readJsonFiles, slug } from './storage';
import { humanSize, openAttachment } from './attach';

/**
 * The assessor side. Nick and Allison stop transcribing decks and start auditing anomalies.
 * Loads one or many self-assessment .json files, ranks them, and drills into any one.
 */

interface Loaded {
  file: string;
  a: Assessment;
  r: Result;
  fs: Flag[];
}

let loaded: Loaded[] = [];

export function renderReview(root: HTMLElement, rubric: Rubric): void {
  clear(root);

  const drop = el('section', { class: 'card dropzone' }, [
    el('h2', {}, ['Load submissions']),
    el('p', { class: 'muted' }, [
      'Drop the .json files people sent you, or pick them. They are read here in your browser - nothing is uploaded.',
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
    if (a.rubric.version !== rubric.version) {
      problems.push(`${item.file}: answered against rubric ${a.rubric.version}, this app has ${rubric.version}. Scores shown are recalculated with the current rubric.`);
    }
    const r = score(rubric, a);
    loaded = loaded.filter((l) => l.file !== item.file);
    loaded.push({ file: item.file, a, r, fs: flags(rubric, a, r) });
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
  const rows = [...loaded].sort((x, y) => (x.r.overall ?? 99) - (y.r.overall ?? 99));

  const table = el('table', { class: 'triage' }, [
    el('thead', {}, [el('tr', {}, [
      el('th', {}, ['Initiative']), el('th', {}, ['Department']), el('th', {}, ['Marking']),
      el('th', {}, ['Stage']), el('th', {}, ['Score']), el('th', {}, ['Suggested routing']),
      el('th', {}, ['Must ask']), el('th', {}, ['Files']), el('th', {}, ['Complete']), el('th', {}, ['']),
    ])]),
  ]);
  const tb = el('tbody', {});
  for (const l of rows) {
    const highs = l.fs.filter((f) => f.severity === 'high').length;
    tb.appendChild(el('tr', {}, [
      el('td', {}, [l.a.initiative.name || l.file]),
      el('td', {}, [l.a.initiative.department]),
      el('td', { class: 'small' }, [l.a.initiative.classification || 'unmarked']),
      el('td', { class: 'small' }, [rubric.lifecycleStages.find((s) => s.id === l.a.initiative.lifecycleStage)?.label ?? '--']),
      el('td', { class: `num ${tone(l.r.overall)}` }, [l.r.overall === null ? '--' : l.r.overall.toFixed(1)]),
      el('td', { class: 'small' }, [l.r.band?.label ?? '--']),
      el('td', { class: highs ? 'num red' : 'num' }, [String(highs)]),
      el('td', { class: 'num' }, [String(Object.values(l.a.answers).reduce((n, x) => n + (x.evidence ?? []).filter((e) => e.attachment).length, 0))]),
      el('td', { class: 'small' }, [`${Math.round(l.r.completeness * 100)}%`]),
      el('td', {}, [el('button', { class: 'ghost small', onclick: () => openDetail(rubric, root, l) }, ['Open'])]),
    ]));
  }
  table.appendChild(tb);

  root.appendChild(el('section', { class: 'card' }, [
    el('h2', {}, [`${loaded.length} submission${loaded.length === 1 ? '' : 's'}, weakest first`]),
    el('p', { class: 'muted' }, [
      'Sorted so the ones that need you are at the top. The middle of the list is where you spend the least time.',
    ]),
    table,
    el('div', { class: 'actions' }, [
      el('button', { class: 'ghost', onclick: () => exportAllCsv(rubric) }, ['Export all as CSV']),
      el('button', { class: 'ghost', onclick: () => { loaded = []; renderReview(root, rubric); } }, ['Clear']),
    ]),
  ]));
}

function openDetail(rubric: Rubric, root: HTMLElement, l: Loaded) {
  clear(root);
  const { a, r, fs } = l;
  const audit = (a.audit ??= { reviewer: '', reviewedAt: new Date().toISOString(), perQuestion: {}, overallNote: '' });

  root.appendChild(el('section', { class: 'card actions' }, [
    el('button', { class: 'ghost', onclick: () => renderReview(root, rubric) }, ['Back to the list']),
  ]));

  root.appendChild(el('section', { class: 'card headline' }, [
    el('div', { class: `bigscore ${tone(r.overall)}` }, [
      el('span', { class: 'num' }, [r.overall === null ? '--' : r.overall.toFixed(1)]),
      el('span', { class: 'outof' }, ['self-scored']),
    ]),
    el('div', { class: 'headline-text' }, [
      el('h1', {}, [a.initiative.name || l.file]),
      el('p', { class: 'muted' }, [
        [a.initiative.department, a.initiative.contact,
         rubric.lifecycleStages.find((s) => s.id === a.initiative.lifecycleStage)?.label]
          .filter(Boolean).join(' - '),
      ]),
      el('div', { class: `marking-inline ${a.initiative.classification ? '' : 'unmarked'}` }, [
        a.initiative.classification ? `Marked ${a.initiative.classification}` : 'This submission is unmarked',
      ]),
      a.initiative.summary ? el('p', {}, [a.initiative.summary]) : null,
      r.band ? el('div', { class: `band ${r.band.tone}` }, [el('strong', {}, [r.band.label]), el('div', {}, [r.band.routing])]) : null,
    ]),
  ]));

  // Flags first. This is the whole point of the page.
  const flagBox = el('section', { class: 'card' }, [
    el('h2', {}, ['Audit these']),
    el('p', { class: 'muted' }, ['Ranked. Everything else in this submission is probably fine.']),
  ]);
  if (!fs.length) flagBox.appendChild(el('p', {}, ['Nothing anomalous. Spot-check and move on.']));
  for (const f of fs) {
    flagBox.appendChild(el('div', { class: `flag sev-${f.severity}` }, [
      el('div', {}, [
        el('strong', {}, [f.title]),
        f.questionId ? el('span', { class: 'muted small' }, [` (${f.questionId})`]) : null,
      ]),
      el('div', { class: 'small' }, [f.detail]),
      f.challenge ? el('div', { class: 'small challenge' }, ['Ask: "', f.challenge, '"']) : null,
    ]));
  }
  root.appendChild(flagBox);

  root.appendChild(el('section', { class: 'card two-col' }, [
    el('div', {}, [
      el('h3', {}, ['Weakest']),
      el('ul', { class: 'steps' }, weakest(r, 3).map((q) =>
        el('li', {}, [el('b', {}, [`${q.raw}/10 `]), q.question.text]))),
    ]),
    el('div', {}, [
      el('h3', {}, ['Strongest']),
      el('ul', { class: 'steps' }, strongest(r, 3).map((q) =>
        el('li', {}, [el('b', {}, [`${q.raw}/10 `]), q.question.text]))),
    ]),
  ]));

  // Per-question audit.
  const auditSec = el('section', { class: 'card' }, [
    el('h2', {}, ['Question by question']),
    el('p', { class: 'muted' }, [
      'Change a score only where you disagree. What you leave alone is recorded as agreement, and the gap between self-score and your score is the calibration data.',
    ]),
    el('label', { class: 'field' }, [
      el('span', {}, ['Your name']),
      el('input', {
        type: 'text', value: audit.reviewer,
        oninput: (e: Event) => { audit.reviewer = (e.target as HTMLInputElement).value; },
      }),
    ]),
  ]);

  for (const d of r.domains) {
    auditSec.appendChild(el('h3', {}, [d.domain.label, el('span', { class: `pill small ${tone(d.score)}` }, [d.score === null ? '--' : d.score.toFixed(1)])]));
    for (const sec of d.sections) {
    auditSec.appendChild(el('h4', { class: 'section-head' }, [
      sec.section.label,
      el('span', { class: 'muted small' }, [` ${sec.weight}% of this domain`]),
      el('span', { class: `pill small ${tone(sec.score)}` }, [sec.score === null ? '--' : sec.score.toFixed(1)]),
    ]));
    for (const qs of sec.questions) {
      const ans = a.answers[qs.question.id];
      const entry: AuditEntry = (audit.perQuestion[qs.question.id] ??= { auditedScore: null, verdict: '', note: '' });
      const ev = ans?.evidence ?? [];
      auditSec.appendChild(el('div', { class: 'audit-row' }, [
        el('div', { class: 'q-head' }, [
          el('span', { class: `pill small ${tone(qs.raw)}` }, [qs.na ? 'n/a' : qs.raw === null ? '--' : String(qs.raw)]),
          el('span', { class: 'qid' }, [qs.question.id]),
          el('span', { class: 'q-text' }, [qs.question.text]),
        ]),
        ans?.justification ? el('p', { class: 'said small' }, ['They said: ', ans.justification]) : el('p', { class: 'muted small' }, ['No justification given.']),
        ev.length
          ? el('ul', { class: 'ev-list small' }, ev.map((e) =>
              el('li', {}, [
                el('b', {}, [e.title || e.attachment?.name || 'untitled']),
                ` - ${e.kind}, ${e.classification || 'unmarked'}`,
                e.attachment
                  ? el('span', {}, [
                      ` - ${humanSize(e.attachment.size)} `,
                      el('button', { class: 'ghost small', onclick: () => openAttachment(e.attachment!) }, ['Open']),
                    ])
                  : el('span', {}, [
                      ' - not attached, pointed at: ',
                      /^https?:\/\//.test(e.location)
                        ? el('a', { href: e.location, target: '_blank', rel: 'noreferrer' }, [e.location])
                        : el('i', {}, [e.location || 'no location given']),
                    ]),
                e.note ? ` - ${e.note}` : '',
              ]),
            ))
          : el('p', { class: 'muted small' }, ['No evidence referenced.']),
        el('div', { class: 'audit-controls' }, [
          el('label', {}, ['Your score ', el('input', {
            type: 'number', min: 0, max: 10, value: entry.auditedScore ?? '',
            oninput: (e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              entry.auditedScore = v === '' ? null : Number(v);
            },
          })]),
          el('select', {
            onchange: (e: Event) => { entry.verdict = (e.target as HTMLSelectElement).value as AuditEntry['verdict']; },
          }, [
            el('option', { value: '', selected: entry.verdict === '' }, ['- verdict -']),
            el('option', { value: 'agree', selected: entry.verdict === 'agree' }, ['Agree with them']),
            el('option', { value: 'adjust', selected: entry.verdict === 'adjust' }, ['Adjusted']),
            el('option', { value: 'insufficient', selected: entry.verdict === 'insufficient' }, ['Not enough evidence']),
          ]),
          el('input', {
            type: 'text', placeholder: 'Note', value: entry.note ?? '',
            oninput: (e: Event) => { entry.note = (e.target as HTMLInputElement).value; },
          }),
        ]),
      ]));
    }
    }
  }
  root.appendChild(auditSec);

  root.appendChild(el('section', { class: 'card' }, [
    el('label', { class: 'field' }, [
      el('span', {}, ['Overall note for the board']),
      el('textarea', {
        rows: 4,
        oninput: (e: Event) => { audit.overallNote = (e.target as HTMLTextAreaElement).value; },
      }, [audit.overallNote ?? '']),
    ]),
    el('div', { class: 'actions' }, [
      el('button', { class: 'primary', onclick: () => {
        audit.reviewedAt = new Date().toISOString();
        download(`${slug(a.initiative.name)}-audited.json`, JSON.stringify(a, null, 2));
      } }, ['Save the audited file']),
      el('button', { class: 'ghost', onclick: () => window.print() }, ['Print the one-pager']),
    ]),
  ]));
}

function exportAllCsv(rubric: Rubric) {
  const rows = [csvHeader(rubric)];
  for (const l of loaded) {
    rows.push(csvRow(rubric, l.a, {
      high: l.fs.filter((f) => f.severity === 'high').length,
      total: l.fs.length,
    }));
  }
  download('assessments.csv', toCsv(rows), 'text/csv');
}
