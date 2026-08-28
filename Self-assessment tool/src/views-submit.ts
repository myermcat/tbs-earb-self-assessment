import { CLASSIFICATIONS, type Assessment, type EvidenceRef, type Question, type Rubric } from './types';
import { el, clear, tone } from './dom';
import { score, type SectionScore } from './scoring';
import { autosave, download, slug } from './storage';
import { humanSize, openAttachment, readAttachment, totalAttachedBytes, TOTAL_LIMIT, TOTAL_WARN } from './attach';
import { highestEvidenceMarking, markingProblems } from './marking';

const KINDS: EvidenceRef['kind'][] = ['document', 'diagram', 'dashboard', 'system', 'report', 'other'];

/**
 * 176 questions is far too many for one page, so the questionnaire is paged: an overview,
 * then one page per architecture domain, with each of Dan's weighted sections collapsible
 * and carrying its own running average.
 */
let page: 'about' | string = 'about';

/**
 * Repainting only this view leaves the shell stale - most visibly the classification banner,
 * which the shell draws. The shell hands us its own paint so a marking change is reflected
 * everywhere at once.
 */
let repaintApp: () => void = () => {};
export function setRepaint(fn: () => void): void { repaintApp = fn; }

export function renderSubmit(
  root: HTMLElement,
  rubric: Rubric,
  a: Assessment,
  onDone: () => void,
): void {
  clear(root);
  const repaint = () => repaintApp();
  const r = score(rubric, a);

  root.appendChild(stepper(rubric, a, r, repaint));

  if (page === 'about') {
    root.appendChild(aboutSection(rubric, a, repaint));
    if (!a.initiative.lifecycleStage) {
      root.appendChild(el('section', { class: 'card warn' }, [
        el('strong', {}, ['Pick a lifecycle stage before you start scoring']),
        el('p', { class: 'small' }, [
          'It changes what is expected of you. Current-state questions count for less if there is nothing built yet.',
        ]),
      ]));
    }
  } else {
    const ds = r.domains.find((d) => d.domain.id === page);
    if (!ds) { page = 'about'; repaint(); return; }
    root.appendChild(el('section', { class: 'card' }, [
      el('h2', {}, [ds.domain.label, el('span', { class: `pill ${tone(ds.score)}` }, [ds.score === null ? '--' : ds.score.toFixed(1)])]),
      ds.domain.description ? el('p', { class: 'muted' }, [ds.domain.description]) : null,
      el('p', { class: 'muted small' }, [
        `${ds.domain.weight}% of the overall score. ${ds.answered} of ${ds.total} answered.`,
      ]),
    ]));
    for (const ss of ds.sections) root.appendChild(sectionBlock(rubric, a, ss, repaint));
  }

  root.appendChild(pager(rubric, r, repaint, onDone));
  root.appendChild(footerBar(rubric, a, r, onDone));
}

function stepper(rubric: Rubric, a: Assessment, r: ReturnType<typeof score>, repaint: () => void): HTMLElement {
  const step = (label: string, target: string, done: number, total: number) =>
    el('button', {
      class: `step ${page === target ? 'on' : ''} ${total > 0 && done === total ? 'complete' : ''}`,
      onclick: () => { page = target; repaint(); window.scrollTo({ top: 0 }); },
    }, [
      el('span', { class: 'step-label' }, [label]),
      total > 0 ? el('span', { class: 'step-count' }, [`${done} of ${total}`]) : null,
      total > 0
        ? el('span', { class: 'step-bar' }, [el('i', { style: `width:${Math.round((done / total) * 100)}%` })])
        : null,
    ]);

  return el('nav', { class: 'stepper' }, [
    step('Overview', 'about', a.initiative.lifecycleStage ? 1 : 0, 1),
    ...r.domains.map((d) => step(shortLabel(d.domain.label), d.domain.id, d.answered, d.total)),
  ]);
}

/** "Application & Virtual Architecture" is too long for a tab. */
function shortLabel(s: string): string {
  return s.replace(/\s*&\s*\w+/, '').replace(/\s*Architecture$/, '');
}

function pager(rubric: Rubric, r: ReturnType<typeof score>, repaint: () => void, onDone: () => void): HTMLElement {
  const order = ['about', ...rubric.domains.map((d) => d.id)];
  const i = order.indexOf(page);
  const goto = (t: string) => { page = t; repaint(); window.scrollTo({ top: 0 }); };
  return el('section', { class: 'card actions' }, [
    i > 0 ? el('button', { class: 'ghost', onclick: () => goto(order[i - 1]) }, ['Back']) : null,
    i < order.length - 1
      ? el('button', { class: 'primary', onclick: () => goto(order[i + 1]) }, ['Next'])
      : el('button', { class: 'primary', onclick: onDone }, ['See my results']),
  ]);
}

function footerBar(rubric: Rubric, a: Assessment, r: ReturnType<typeof score>, onDone: () => void): HTMLElement {
  const problems = markingProblems(a);
  return el('div', { class: 'sticky-footer' }, [
    problems.length
      ? el('div', { class: 'gate small' }, [
          el('strong', {}, [problems.length === 1 ? 'One thing before you can save: ' : `${problems.length} things before you can save: `]),
          problems[0].message,
        ])
      : null,
    el('div', { class: 'footer-inner' }, [
      el('div', { class: 'footer-score' }, [
        el('span', { class: `pill ${tone(r.overall)}` }, [r.overall === null ? '--' : r.overall.toFixed(1)]),
        el('span', { class: 'muted small' }, [
          r.maturity ? r.maturity.label : 'not scored yet',
          ` - ${r.answered} of ${r.scoreable} answered`,
        ]),
      ]),
      el('div', { class: 'footer-actions' }, [
        el('button', {
          class: 'ghost', disabled: problems.length > 0,
          title: problems.length ? problems.map((p) => p.message).join('\n') : 'Save a copy you can reopen later',
          onclick: () => saveFile(a),
        }, ['Save to a file']),
        el('button', { class: 'primary', onclick: onDone }, ['See my results']),
      ]),
    ]),
  ]);
}

function sectionBlock(rubric: Rubric, a: Assessment, ss: SectionScore, repaint: () => void): HTMLElement {
  const stageNote = (() => {
    const exp = ss.section.stageExpectation?.[a.initiative.lifecycleStage];
    if (!exp || exp === 'expected') return null;
    return el('span', { class: `badge ${exp === 'critical' ? 'badge-warn' : 'badge-soft'}` }, [
      exp === 'critical' ? 'Counts more at your stage' : 'Counts less at your stage',
    ]);
  })();

  const body = el('div', {});
  for (const qs of ss.questions) body.appendChild(questionBlock(rubric, a, qs.question, repaint));

  return el('section', { class: 'card section' }, [
    el('details', { open: ss.answered < ss.total }, [
      el('summary', { class: 'section-summary' }, [
        el('span', { class: `pill small ${tone(ss.score)}` }, [ss.score === null ? '--' : ss.score.toFixed(1)]),
        el('span', { class: 'section-title' }, [ss.section.label]),
        el('span', { class: 'muted small' }, [`${ss.weight}% of this domain`]),
        el('span', { class: 'muted small' }, [`${ss.answered}/${ss.total}`]),
        stageNote,
      ]),
      body,
    ]),
  ]);
}

function saveFile(a: Assessment) {
  autosave(a);
  download(`${slug(a.initiative.name)}-self-assessment.json`, JSON.stringify(a, null, 2));
}

function aboutSection(rubric: Rubric, a: Assessment, changed: () => void): HTMLElement {
  const set = (k: keyof Assessment['initiative']) => (e: Event) => {
    (a.initiative as Record<string, string>)[k] = (e.target as HTMLInputElement).value;
    autosave(a);
  };
  // Repainting on every keystroke would pull focus out of the field, so the marking gate
  // refreshes when the field is left rather than as it is typed in.
  const settled = () => changed();

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
          onchange: () => { a.initiative.lifecycleStage = st.id; autosave(a); changed(); },
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
              onchange: () => { a.initiative.classification = c; autosave(a); changed(); },
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

function questionBlock(rubric: Rubric, a: Assessment, q: Question, changed: () => void): HTMLElement {
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

  wrap.appendChild(el('div', { class: 'q-head' }, [
    el('span', { class: 'qid' }, [q.id]),
    el('span', { class: 'q-text' }, [q.text]),
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

  // Score buttons 0-10.
  const scoreRow = el('div', { class: 'score-row' });
  const paintScores = () => {
    clear(scoreRow);
    for (let v = rubric.scale.min; v <= rubric.scale.max; v++) {
      scoreRow.appendChild(
        el('button', {
          class: `score-btn v${v} ${ans.score === v ? 'on' : ''}`,
          disabled: !!ans.na,
          onclick: () => { ans.score = ans.score === v ? null : v; ans.na = false; autosave(a); paintScores(); paintChosen(); changed(); },
        }, [String(v)]),
      );
    }
    scoreRow.appendChild(
      el('label', { class: 'na' }, [
        el('input', {
          type: 'checkbox', checked: !!ans.na,
          onchange: (e: Event) => {
            ans.na = (e.target as HTMLInputElement).checked;
            if (ans.na) ans.score = null;
            autosave(a); paintScores(); paintChosen(); changed();
          },
        }),
        'Not applicable',
      ]),
    );
  };
  const chosen = el('div', { class: 'chosen muted small' });
  const paintChosen = () => {
    clear(chosen);
    if (ans.na || ans.score === null) return;
    const rung = ladder.slice().reverse().find((x) => x.value <= (ans.score as number));
    if (rung) {
      chosen.appendChild(el('span', {}, [
        rung.name ? el('b', {}, [`${rung.value} - ${rung.name}. `]) : '',
        rung.label,
      ]));
    }
  };
  paintScores();
  wrap.appendChild(scoreRow);
  paintChosen();
  wrap.appendChild(chosen);

  if (q.picklist) {
    const sel = el('select', {
      onchange: (e: Event) => {
        ans.picklist = (e.target as HTMLSelectElement).value;
        autosave(a); paintOther(); changed();
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
    wrap.appendChild(el('div', { class: 'field' }, [
      el('span', {}, ['Which of these describes yours?']),
      sel,
      q.picklistNote ? el('div', { class: 'muted small warn-text' }, [q.picklistNote]) : null,
      otherBox,
    ]));
  }

  wrap.appendChild(el('label', { class: 'field' }, [
    el('span', {}, ['Why that score, in your words']),
    el('textarea', {
      rows: 2, placeholder: 'One or two sentences is plenty.',
      oninput: (e: Event) => { ans.justification = (e.target as HTMLTextAreaElement).value; autosave(a); },
    }, [ans.justification ?? '']),
  ]));

  wrap.appendChild(evidenceEditor(a, q, ans.evidence ??= [], changed));
  return wrap;
}

function evidenceEditor(a: Assessment, q: Question, list: EvidenceRef[], changed: () => void): HTMLElement {
  const box = el('div', { class: 'evidence' });

  const paint = () => {
    clear(box);
    box.appendChild(el('div', { class: 'ev-head' }, [
      el('strong', {}, ['Evidence']),
      el('span', { class: 'muted small' }, [
        q.evidencePrompt ? q.evidencePrompt : 'Whatever you already have. Nothing needs making for us.',
      ]),
    ]));

    list.forEach((ev, i) => {
      const upd = (k: 'title' | 'location' | 'note' | 'kind' | 'classification') => (e: Event) => {
        (ev as unknown as Record<string, string>)[k] = (e.target as HTMLInputElement).value;
        autosave(a);
        if (k === 'classification') { paint(); changed(); }
      };

      const attachRow = ev.attachment
        ? el('div', { class: 'att' }, [
            el('span', { class: 'att-name' }, [ev.attachment.name]),
            el('span', { class: 'muted small' }, [humanSize(ev.attachment.size)]),
            el('button', { class: 'ghost small', onclick: () => openAttachment(ev.attachment!) }, ['Open']),
            el('button', {
              class: 'ghost small',
              onclick: () => { delete ev.attachment; autosave(a); paint(); changed(); },
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
                    alert(`That would take this file past ${humanSize(TOTAL_LIMIT)}. Point at this one instead of attaching it.`);
                    return;
                  }
                  ev.attachment = att;
                  if (!ev.title) ev.title = f.name;
                  autosave(a); paint(); changed();
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
          el('button', { class: 'ghost small', onclick: () => { list.splice(i, 1); autosave(a); paint(); changed(); } }, ['Remove']),
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

    const attached = totalAttachedBytes(a.answers);
    box.appendChild(el('div', { class: 'actions' }, [
      el('button', {
        class: 'ghost small',
        onclick: () => {
          list.push({ title: '', kind: 'document', location: '', classification: '' });
          autosave(a); paint(); changed();
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
