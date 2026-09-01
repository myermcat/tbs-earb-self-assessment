import type { Assessment, AuditEntry, Rubric } from './types';
import { el, clear, tone } from './dom';
import { allQuestionScores, score, type QuestionScore, type Result } from './scoring';
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

/** What the dashboard can see of this session: the files the assessor opened. */
export function openedThisSession(): Assessment[] { return loaded.map((l) => l.a); }

/** The name typed on the mockup sign-in. Never verified, and labelled so everywhere. */
let auditor = '';
/** What the last Agree-with-all did, so the button reports itself instead of going quiet. */
let lastAgree: { section: string; agreed: number; kept: number } | null = null;
export function setAuditor(name: string): void { auditor = name; }

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
    el('p', { class: 'muted small' }, [
      'Sorted so the ones that need you are at the top. The middle of the list is where you spend the least time.',
    ]),
    el('div', { class: 'table-wrap' }, [table]),
    el('div', { class: 'actions' }, [
      el('button', { class: 'ghost', onclick: () => exportAllCsv(rubric) }, ['Export all as CSV']),
      el('button', { class: 'ghost', onclick: () => { loaded = []; renderReview(root, rubric); } }, ['Clear']),
    ]),
  ]));
}

/**
 * The assessor's page, ordered the way the work actually goes: the anomalies first, with the
 * scoring controls sitting inside each one so nothing has to be looked up, and the remaining
 * questions folded away until somebody wants them. Reading 176 answers is the job this is
 * meant to abolish.
 */
function openDetail(rubric: Rubric, root: HTMLElement, l: Loaded) {
  clear(root);
  const { a, r, fs } = l;
  const audit = (a.audit ??= { reviewer: '', reviewedAt: new Date().toISOString(), perQuestion: {}, overallNote: '' });
  const byQuestion = new Map<string, Flag[]>();
  for (const f of fs) {
    if (!f.questionId) continue;
    byQuestion.set(f.questionId, [...(byQuestion.get(f.questionId) ?? []), f]);
  }
  /** Questions reachable through an aggregated card, so they are not also listed below. */
  const inAggregate = new Set(fs.flatMap((f) => f.questionIds ?? []));
  // A question can carry its own finding and sit inside an aggregate at the same time. It is
  // still one question to look at: count it once, and show it once, inside the aggregate.
  const needLook = new Set([...byQuestion.keys(), ...inAggregate]);
  const questionOf = new Map(allQuestionScores(r).map((qs) => [qs.question.id, qs]));
  const repaint = () => openDetail(rubric, root, l);

  const changed = Object.entries(audit.perQuestion).filter(
    ([qid, e]) => typeof e.auditedScore === 'number' && e.auditedScore !== (a.answers[qid]?.score ?? null),
  );
  const attachments = Object.values(a.answers).reduce((n, x) => n + (x.evidence ?? []).filter((e) => e.attachment).length, 0);

  root.appendChild(el('section', { class: 'card tight actions' }, [
    el('button', { class: 'ghost', onclick: () => renderReview(root, rubric) }, ['Back to the list']),
    el('span', { class: 'muted small' }, [l.file]),
  ]));

  root.appendChild(el('section', { class: 'card headline' }, [
    el('div', { class: `bigscore ${tone(r.overall)}` }, [
      el('span', { class: 'num' }, [r.overall === null ? '--' : r.overall.toFixed(1)]),
      el('span', { class: 'outof' }, ['self-scored']),
    ]),
    el('div', { class: 'headline-text' }, [
      el('h1', {}, [a.initiative.name || l.file]),
      el('p', { class: 'muted small' }, [
        [a.initiative.department, a.initiative.contact,
         rubric.lifecycleStages.find((x) => x.id === a.initiative.lifecycleStage)?.label]
          .filter(Boolean).join('  ·  '),
      ]),
      el('div', { class: `marking-inline ${a.initiative.classification ? '' : 'unmarked'}` }, [
        a.initiative.classification ? `Marked ${a.initiative.classification}` : 'This submission is unmarked',
      ]),
      a.initiative.summary ? el('p', { class: 'small' }, [a.initiative.summary]) : null,
      r.maturity ? el('div', { class: 'maturity' }, [
        el('strong', {}, [r.maturity.label]), el('div', { class: 'small' }, [r.maturity.detail]),
      ]) : null,
      r.band ? el('div', { class: `band ${r.band.tone}` }, [
        el('strong', {}, [r.band.label]), el('div', { class: 'small' }, [r.band.routing]),
      ]) : null,
    ]),
  ]));

  root.appendChild(el('section', { class: 'card' }, [
    el('div', { class: 'kpi-row' }, [
      kpi(String(fs.filter((f) => f.severity === 'high').length), 'must ask'),
      kpi(String(needLook.size), 'questions flagged'),
      kpi(`${Math.round(r.completeness * 100)}%`, 'complete'),
      kpi(String(attachments), 'files attached'),
      kpi(String(changed.length), 'you changed'),
    ]),
  ]));

  // ---- 1. the anomalies, with the controls in place ------------------------------------
  const flagBox = el('section', { class: 'card' }, [
    el('h2', {}, ['Audit these']),
    el('p', { class: 'muted small' }, [
        `${needLook.size} of ${r.scoreable} questions need a look. Score them here; the rest is below if you want it.`,
    ]),
  ]);

  for (const f of fs.filter((x) => !x.questionId)) {
    if (!f.questionIds?.length) { flagBox.appendChild(flagCard(f)); continue; }
    // An aggregated finding: one card, with its questions behind a fold so the assessor
    // opens them only if the count alone is not enough to act on.
    const rows = el('div', {});
    for (const qid of f.questionIds) {
      const qs = questionOf.get(qid);
      if (qs) rows.appendChild(auditRow(rubric, a, qs, audit, byQuestion.get(qid) ?? [], repaint, true));
    }
    flagBox.appendChild(el('div', { class: `flag sev-${f.severity}` }, [
      el('div', { class: 'flag-title' }, [el('span', { class: 'sev-dot' }), el('strong', {}, [f.title])]),
      el('div', { class: 'small' }, [f.detail]),
      f.challenge ? el('div', { class: 'small challenge' }, [f.challenge]) : null,
      el('details', {}, [
        el('summary', { class: 'small' }, [`Score these ${f.questionIds.length}`]),
        rows,
      ]),
    ]));
  }

  if (!needLook.size) {
    flagBox.appendChild(el('p', {}, ['Nothing anomalous. Spot-check and move on.']));
  }
  for (const [qid, qflags] of byQuestion) {
    if (inAggregate.has(qid)) continue;   // already shown inside its aggregate
    const qs = questionOf.get(qid);
    if (!qs) continue;
    flagBox.appendChild(auditRow(rubric, a, qs, audit, qflags, repaint, true));
  }
  root.appendChild(flagBox);

  // ---- 2. what the assessor changed ----------------------------------------------------
  if (changed.length) {
    const box = el('section', { class: 'card' }, [
      el('h2', {}, ['What you changed']),
      el('p', { class: 'muted small' }, [
        'The gap between what they claimed and what you scored. This is the calibration record.',
      ]),
    ]);
    for (const [qid, entry] of changed) {
      const qs = questionOf.get(qid);
      const self = a.answers[qid]?.score ?? null;
      const delta = (entry.auditedScore as number) - (self ?? 0);
      box.appendChild(el('div', { class: 'audit-row changed' }, [
        el('div', { class: 'q-head' }, [
          el('span', { class: 'qid' }, [qid]),
          el('span', { class: 'q-text' }, [qs?.question.text ?? qid]),
        ]),
        el('div', { class: 'small' }, [
          `They said ${self ?? '--'}, you scored ${entry.auditedScore} `,
          el('span', { class: `delta ${delta > 0 ? 'up' : 'down'}` }, [`${delta > 0 ? '+' : ''}${delta}`]),
          entry.verdict ? ` · ${entry.verdict}` : '',
          entry.note ? ` · ${entry.note}` : '',
        ]),
      ]));
    }
    root.appendChild(box);
  }

  // ---- 3. everything else, folded away -------------------------------------------------
  const restBox = el('section', { class: 'card' });
  const rest = el('div', {});
  let restCount = 0;
  for (const d of r.domains) {
    const domainRows: HTMLElement[] = [];
    for (const sec of d.sections) {
      const rows = sec.questions.filter((qs) => !byQuestion.has(qs.question.id) && !inAggregate.has(qs.question.id));
      if (!rows.length) continue;
      domainRows.push(el('h4', { class: 'section-head' }, [
        sec.section.label,
        el('span', { class: 'muted small' }, [`${sec.weight}% of this domain`]),
        el('span', { class: `pill small ${tone(sec.score)}` }, [sec.score === null ? '--' : sec.score.toFixed(1)]),
        // Dan asked for this by name: a section an assessor has read and has nothing to say
        // about should take one click, not one per question. It touches no score.
        el('button', {
          class: 'ghost small',
          title: 'Mark every question in this section as agreed. Changes no scores.',
          onclick: () => {
            let agreed = 0;
            let kept = 0;
            for (const qs of sec.questions) {
              const e = (audit.perQuestion[qs.question.id] ??= { auditedScore: null, verdict: '', note: '' });
              // A score the assessor has already changed is not one they agree with.
              if (typeof e.auditedScore === 'number' && e.auditedScore !== (a.answers[qs.question.id]?.score ?? null)) {
                kept++;
                continue;
              }
              e.verdict = 'agree';
              e.by = auditor || 'unnamed';
              e.at = new Date().toISOString();
              agreed++;
            }
            lastAgree = { section: sec.section.id, agreed, kept };
            repaint();
          },
        }, ['Agree with all']),
        lastAgree && lastAgree.section === sec.section.id
          ? el('span', { class: 'small muted' }, [
              `${lastAgree.agreed} marked as agreed`,
              lastAgree.kept ? `, ${lastAgree.kept} left as you scored ${lastAgree.kept === 1 ? 'it' : 'them'}` : '',
            ])
          : null,
      ]));
      for (const qs of rows) {
        domainRows.push(auditRow(rubric, a, qs, audit, [], repaint, false));
        restCount++;
      }
    }
    if (!domainRows.length) continue;
    rest.appendChild(el('h3', {}, [
      d.domain.label,
      el('span', { class: `pill small ${tone(d.score)}` }, [d.score === null ? '--' : d.score.toFixed(1)]),
    ]));
    for (const n of domainRows) rest.appendChild(n);
  }
  restBox.appendChild(el('details', {}, [
    el('summary', { class: 'section-summary' }, [
      el('span', { class: 'section-title' }, [`Everything else`]),
      el('span', { class: 'muted small' }, [`${restCount} questions with nothing flagged`]),
    ]),
    rest,
  ]));
  root.appendChild(restBox);

  // ---- 4. sign off ---------------------------------------------------------------------
  root.appendChild(el('section', { class: 'card' }, [
    el('p', { class: 'small' }, [
      'Auditing as ', el('b', {}, [auditor || 'unnamed']), ' ',
      el('span', { class: 'badge badge-warn' }, ['unverified']),
      el('span', { class: 'muted' }, [' Recorded against every score you change.']),
    ]),
    el('label', { class: 'field' }, [
      el('span', {}, ['Overall note for the board']),
      el('textarea', {
        rows: 4,
        oninput: (e: Event) => { audit.overallNote = (e.target as HTMLTextAreaElement).value; },
      }, [audit.overallNote ?? '']),
    ]),
    el('div', { class: 'actions' }, [
      (() => {
        const missing = unexplainedChanges(a);
        return el('button', {
          class: 'primary', disabled: missing.length > 0,
          title: missing.length
            ? `A changed score needs a reason: ${missing.join(', ')}`
            : 'Save your audit',
          onclick: () => {
            audit.reviewedAt = new Date().toISOString();
            audit.reviewer = auditor || audit.reviewer;
            download(`${slug(a.initiative.name)}-audited.json`, JSON.stringify(a, null, 2));
          },
        }, [missing.length ? `${missing.length} change${missing.length === 1 ? '' : 's'} need a reason` : 'Save the audited file']);
      })(),
      el('button', { class: 'ghost', onclick: () => window.print() }, ['Print the one-pager']),
    ]),
  ]));
}

function kpi(value: string, label: string): HTMLElement {
  return el('div', { class: 'kpi' }, [
    el('span', { class: 'kpi-num' }, [value]),
    el('span', { class: 'kpi-label' }, [label]),
  ]);
}

function flagCard(f: Flag): HTMLElement {
  return el('div', { class: `flag sev-${f.severity}` }, [
    el('div', { class: 'flag-title' }, [el('span', { class: 'sev-dot' }), el('strong', {}, [f.title])]),
    el('div', { class: 'small' }, [f.detail]),
    f.challenge ? el('div', { class: 'small challenge' }, [f.challenge]) : null,
  ]);
}

/** One question, with its flags, its evidence, and the controls to re-score it. */
function auditRow(
  rubric: Rubric,
  a: Assessment,
  qs: QuestionScore,
  audit: NonNullable<Assessment['audit']>,
  qflags: Flag[],
  repaint: () => void,
  flagged: boolean,
): HTMLElement {
  const q = qs.question;
  const ans = a.answers[q.id];
  const entry: AuditEntry = (audit.perQuestion[q.id] ??= { auditedScore: null, verdict: '', note: '' });
  const standing = entry.auditedScore;
  const ev = ans?.evidence ?? [];
  const wasChanged = typeof entry.auditedScore === 'number' && entry.auditedScore !== (ans?.score ?? null);

  return el('div', {
    class: `audit-row ${flagged ? 'flagged' : ''} ${wasChanged ? 'changed' : ''}`,
    'data-qid': q.id,
  }, [
    el('div', { class: 'q-head' }, [
      el('span', { class: `pill small ${tone(qs.raw)}` }, [qs.na ? 'n/a' : qs.raw === null ? '--' : String(qs.raw)]),
      el('span', { class: 'qid' }, [q.id]),
      el('span', { class: 'q-text' }, [q.text]),
      wasChanged
        ? el('span', { class: `delta ${(entry.auditedScore as number) > (ans?.score ?? 0) ? 'up' : 'down'}` }, [
            `you: ${entry.auditedScore}`,
          ])
        : null,
    ]),

    ...qflags.map((f) => el('div', { class: `flag sev-${f.severity}` }, [
      el('div', { class: 'flag-title' }, [el('span', { class: 'sev-dot' }), el('strong', {}, [f.title])]),
      el('div', { class: 'small' }, [f.detail]),
      f.challenge ? el('div', { class: 'small challenge' }, [f.challenge]) : null,
    ])),

    ans?.justification
      ? el('p', { class: 'said small' }, ['They said: ', ans.justification])
      : el('p', { class: 'muted small' }, ['No justification given.']),

    ev.length
      ? el('ul', { class: 'ev-list small' }, ev.map((e) =>
          el('li', {}, [
            el('b', {}, [e.title || e.attachment?.name || 'untitled']),
            `. ${e.kind}, ${e.classification || 'unmarked'}`,
            e.attachment
              ? el('span', {}, [
                  `, ${humanSize(e.attachment.size)}. `,
                  el('button', { class: 'ghost small', onclick: () => openAttachment(e.attachment!) }, ['Open']),
                ])
              : el('span', {}, [
                  '. Not attached. Recorded as living at: ',
                  /^https?:\/\//.test(e.location)
                    ? el('a', { href: e.location, target: '_blank', rel: 'noreferrer' }, [e.location])
                    : el('i', {}, [e.location || 'no location given']),
                ]),
            e.note ? `. ${e.note}` : '',
          ]),
        ))
      : el('p', { class: 'muted small' }, ['No evidence referenced.']),

    // The exchange, and the two facts that show by default: it was edited, and by whom.
    (entry.history ?? []).length
      ? el('details', { class: 'exchange' }, [
          el('summary', {}, [
            el('b', {}, ['Edited']),
            ' by ',
            (entry.history ?? []).map((m) => m.by).filter((v, i, arr) => arr.indexOf(v) === i).join(', '),
            el('span', { class: 'tiny dim' }, [` · ${(entry.history ?? []).length} change${(entry.history ?? []).length === 1 ? '' : 's'}`]),
          ]),
          el('ol', { class: 'exchange-list small' }, (entry.history ?? []).map((m) =>
            el('li', {}, [
              el('b', {}, [`${m.score ?? '--'} `]),
              `by ${m.by} `,
              el('span', { class: 'badge badge-warn tiny' }, ['unverified']),
              m.note ? el('div', { class: 'muted' }, [m.note]) : el('div', { class: 'warn-text' }, ['No reason given.']),
            ]),
          )),
        ])
      : null,

    el('div', { class: 'audit-controls' }, [
      el('label', {}, ['Your score ', el('input', {
        type: 'number', min: 0, max: 10, value: entry.auditedScore ?? '',
        onchange: (e: Event) => {
          const v = (e.target as HTMLInputElement).value;
          const next = v === '' ? null : Number(v);
          // Compared against the score as it stood when this row was drawn: oninput has
          // already written the field through, so entry.auditedScore is no baseline.
          if (next !== standing) {
            entry.auditedScore = next;
            entry.by = auditor || 'unnamed';
            entry.at = new Date().toISOString();
            (entry.history ??= []).push({
              by: entry.by, at: entry.at, score: next, note: entry.note ?? '', unverified: true,
            });
          }
          repaint();
        },
        oninput: (e: Event) => {
          const v = (e.target as HTMLInputElement).value;
          entry.auditedScore = v === '' ? null : Number(v);
        },
      })]),
      el('select', {
        onchange: (e: Event) => { entry.verdict = (e.target as HTMLSelectElement).value as AuditEntry['verdict']; },
      }, [
        el('option', { value: '', selected: entry.verdict === '' }, ['Choose a verdict']),
        el('option', { value: 'agree', selected: entry.verdict === 'agree' }, ['Agree with them']),
        el('option', { value: 'adjust', selected: entry.verdict === 'adjust' }, ['Adjusted']),
        el('option', { value: 'insufficient', selected: entry.verdict === 'insufficient' }, ['Not enough evidence']),
      ]),
      el('input', {
        type: 'text',
        class: needsReason(a, q.id, entry) ? 'needs-marking' : '',
        placeholder: needsReason(a, q.id, entry) ? 'Why? Required for a changed score' : 'Note',
        value: entry.note ?? '',
        oninput: (e: Event) => {
          entry.note = (e.target as HTMLInputElement).value;
          const last = (entry.history ?? [])[(entry.history ?? []).length - 1];
          if (last) last.note = entry.note ?? '';
        },
        onchange: () => repaint(),
      }),
    ]),
  ]);
}

/** Dan's rule: a changed number must be justified. An unchanged one needs no words. */
export function needsReason(a: Assessment, qid: string, entry: AuditEntry): boolean {
  const changed = typeof entry.auditedScore === 'number'
    && entry.auditedScore !== (a.answers[qid]?.score ?? null);
  return changed && !(entry.note ?? '').trim();
}

export function unexplainedChanges(a: Assessment): string[] {
  const audit = a.audit;
  if (!audit) return [];
  return Object.entries(audit.perQuestion)
    .filter(([qid, e]) => needsReason(a, qid, e))
    .map(([qid]) => qid);
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
