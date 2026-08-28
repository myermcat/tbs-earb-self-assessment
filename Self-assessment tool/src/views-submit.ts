import { CLASSIFICATIONS, type Assessment, type EvidenceRef, type Question, type Rubric } from './types';
import { el, clear, tone } from './dom';
import { score, type Result, type SectionScore } from './scoring';
import { autosave, download, slug } from './storage';
import { humanSize, openAttachment, readAttachment, totalAttachedBytes, TOTAL_LIMIT, TOTAL_WARN } from './attach';
import { canSave, highestEvidenceMarking, markingProblems } from './marking';

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

  root.appendChild(stepper(rubric, a, r, navigate));

  if (page === 'about') {
    root.appendChild(aboutSection(rubric, a, refresh, repaintApp));
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
    if (!ds) { page = 'about'; repaintApp(); return; }
    root.appendChild(domainHead(ds, r, page));
    for (const ss of ds.sections) root.appendChild(sectionBlock(rubric, a, ss, refresh, r));
  }

  root.appendChild(pager(rubric, navigate, onDone));
  root.appendChild(footerBar(a, r, onDone));
}

/**
 * The domain heading. The score pill is a sibling of the heading text and not inside it, so a
 * screen reader reads "Business Architecture" and then "5.2 out of 10" as separate things.
 */
function domainHead(ds: Result['domains'][number], r: Result, domainId: string): HTMLElement {
  const pill = el('span', { class: 'pill' });
  const srPill = el('span', { class: 'sr-only' });
  const counts = el('p', { class: 'muted small' });

  const apply = (rr: Result) => {
    const d = rr.domains.find((x) => x.domain.id === domainId);
    if (!d) return;
    pill.className = `pill ${tone(d.score)}`;
    pill.textContent = d.score === null ? '--' : d.score.toFixed(1);
    srPill.textContent = d.score === null ? 'not scored yet' : `${d.score.toFixed(1)} out of 10`;
    counts.textContent = `${d.domain.weight}% of the overall score. ${d.answered} of ${d.total} answered.`;
  };

  const node = el('section', { class: 'card' }, [
    el('div', { class: 'head-row' }, [
      el('h2', {}, [ds.domain.label]),
      pill,
      srPill,
    ]),
    ds.domain.description ? el('p', { class: 'muted' }, [ds.domain.description]) : null,
    counts,
  ]);
  register(apply, r);
  return node;
}

function stepper(
  rubric: Rubric,
  a: Assessment,
  r: Result,
  navigate: (target: string) => void,
): HTMLElement {
  const step = (label: string, target: string, count: (rr: Result) => [number, number]) => {
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
      btn.className = `step ${page === target ? 'on' : ''} ${complete ? 'complete' : ''}`;
      btn.setAttribute('aria-current', page === target ? 'page' : 'false');
      countEl.textContent = `${done} of ${total}`;
      fill.style.width = total > 0 ? `${Math.round((done / total) * 100)}%` : '0%';
    };
    register(apply, r);
    return btn;
  };

  return el('nav', { class: 'stepper', 'aria-label': 'Parts of the assessment' }, [
    step('Overview', 'about', () => [a.initiative.lifecycleStage ? 1 : 0, 1]),
    ...rubric.domains.map((d) =>
      step(shortLabel(d.label), d.id, (rr) => {
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

function pager(rubric: Rubric, navigate: (t: string) => void, onDone: () => void): HTMLElement {
  const order = ['about', ...rubric.domains.map((d) => d.id)];
  const i = order.indexOf(page);
  return el('section', { class: 'card actions' }, [
    i > 0 ? el('button', { class: 'ghost', onclick: () => navigate(order[i - 1]) }, ['Back']) : null,
    i < order.length - 1
      ? el('button', { class: 'primary', onclick: () => navigate(order[i + 1]) }, ['Next'])
      : el('button', { class: 'primary', onclick: onDone }, ['See my results']),
  ]);
}

function footerBar(a: Assessment, r: Result, onDone: () => void): HTMLElement {
  const gate = el('div', {});
  const pill = el('span', { class: 'pill' });
  const readout = el('span', { class: 'muted small' });
  const save = el('button', { class: 'ghost', onclick: () => saveFile(a) }, ['Save to a file']);

  const apply = (rr: Result) => {
    const problems = markingProblems(a);
    clear(gate);
    if (problems.length) {
      gate.appendChild(el('div', { class: 'gate small' }, [
        el('strong', {}, [
          problems.length === 1
            ? 'One thing before you can save: '
            : `${problems.length} things before you can save: `,
        ]),
        problems[0].message,
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
  };

  const node = el('div', { class: 'sticky-footer' }, [
    gate,
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

function sectionBlock(
  rubric: Rubric,
  a: Assessment,
  ss: SectionScore,
  refresh: () => void,
  r: Result,
): HTMLElement {
  const stageNote = (() => {
    const exp = ss.section.stageExpectation?.[a.initiative.lifecycleStage];
    if (!exp || exp === 'expected') return null;
    return el('span', { class: `badge ${exp === 'critical' ? 'badge-warn' : 'badge-soft'}` }, [
      exp === 'critical' ? 'Counts more at your stage' : 'Counts less at your stage',
    ]);
  })();

  const body = el('div', {});
  for (const qs of ss.questions) body.appendChild(questionBlock(rubric, a, qs.question, refresh));

  const pill = el('span', { class: 'pill small' });
  const srPill = el('span', { class: 'sr-only' });
  const count = el('span', { class: 'muted small' });
  const details = el('details', { open: ss.answered < ss.total });

  const apply = (rr: Result) => {
    const found = rr.domains
      .flatMap((d) => d.sections)
      .find((x) => x.section.id === ss.section.id && x.questions[0]?.domainId === ss.questions[0]?.domainId);
    const cur = found ?? ss;
    pill.className = `pill small ${tone(cur.score)}`;
    pill.textContent = cur.score === null ? '--' : cur.score.toFixed(1);
    srPill.textContent = cur.score === null ? 'not scored yet' : `${cur.score.toFixed(1)} out of 10`;
    count.textContent = `${cur.answered}/${cur.total}`;
    details.classList.toggle('done', cur.total > 0 && cur.answered === cur.total);
  };

  details.appendChild(el('summary', { class: 'section-summary' }, [
    pill,
    srPill,
    el('span', { class: 'section-title' }, [ss.section.label]),
    el('span', { class: 'muted small' }, [`${ss.weight}% of this domain`]),
    count,
    stageNote,
  ]));
  details.appendChild(body);

  const node = el('section', { class: 'card section' }, [details]);
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
          onclick: () => { ans.score = ans.score === v ? null : v; ans.na = false; autosave(a); paintScores(); paintChosen(); refresh(); },
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
            autosave(a); paintScores(); paintChosen(); refresh();
          },
        }),
        'Not applicable',
      ]),
    );
  };
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
  paintScores();
  wrap.appendChild(scoreRow);
  paintChosen();
  wrap.appendChild(chosen);
  wrap.appendChild(printScore);

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
    wrap.appendChild(el('div', { class: 'field' }, [
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

  wrap.appendChild(el('label', { class: 'field' }, [
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
  wrap.appendChild(printJust);

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
