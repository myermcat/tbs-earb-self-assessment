import type { Assessment, Rubric } from './types';
import { el, clear, tone, bar } from './dom';
import { nextAnchor, score, strongest, weakest, type Result } from './scoring';
import { flags } from './flags';
import { autosave } from './storage';
import { markingProblems } from './marking';
import { codeChip } from './code-chip';
import { t } from './i18n';
import { isHosted, putRecord, savedOnline } from './store';
import { currentUser, formatCode, pageAddress } from './firebase';
import { openShareDialog, sharedPanel } from './views-share';
import { repaint, saveOnline } from './views-submit';
import { confirmStep } from './confirm';

/**
 * What the submitter sees. Deliberately ordered: the number, then the routing,
 * then where they are weak and what to do about it. Detail is available but folded away.
 */
export function renderResults(root: HTMLElement, rubric: Rubric, a: Assessment, onBack: () => void): void {
  clear(root);
  addSnapHint(root);
  const r = score(rubric, a);
  const fs = flags(rubric, a, r);
  const highs = fs.filter((f) => f.severity === 'high').length;

  /**
   * The verdict, and the only card on the page.
   *
   * The rule this page now holds to: a box means either "this is the number" or "this blocks
   * you". Everything else is a heading on the page ground with a rule over it. Ten cards of
   * one size, one fill and one width read as a striped background, which is what they were.
   *
   * The heading comes before the number in the DOM and after it on screen, so a screen reader
   * hears what the number is about before it hears the number.
   */
  root.appendChild(el('section', { class: 'card headline verdict', 'data-part': 'Score' }, [
    el('i', { class: 'verdict-edge', 'aria-hidden': true }),
    el('div', { class: 'headline-text' }, [
      el('h1', {}, [a.initiative.name || t('Untitled initiative', 'Initiative sans titre')]),
      el('p', { class: 'muted' }, [
        [a.initiative.department, rubric.lifecycleStages.find((s) => s.id === a.initiative.lifecycleStage)?.label]
          .filter(Boolean).join(' - ') || t('No department or stage set', 'Aucun ministère ni étape indiqué'),
        // The reference travels with the score, because this is the page somebody prints and
        // sends on, and it is what an assessor matches an email to.
        a.ref ? el('span', { class: 'ref-chip' }, [a.ref]) : null,
      ]),
      r.maturity
        ? el('div', { class: 'maturity' }, [
            el('strong', {}, [r.maturity.label]),
            el('div', { class: 'small' }, [r.maturity.detail]),
          ])
        : null,
      // A routing suggestion calculated from a fifth of the questions is not a suggestion, it
      // is a guess wearing one. It appears once most of the assessment is answered.
      r.band && r.completeness >= 0.8
        ? el('div', { class: `band ${r.band.tone}` }, [
            el('strong', {}, [r.band.label]),
            el('div', {}, [r.band.routing]),
            r.band.source === 'interpolated'
              ? el('div', { class: 'tiny dim' }, [
                  'This threshold is provisional. It was filled in to bridge two numbers TBS named, ',
                  'and has not been confirmed.',
                ])
              : null,
          ])
        : el('div', { class: 'band neutral' }, [
            el('strong', {}, ['No routing suggestion yet']),
            el('div', {}, [
              `Answer most of the assessment first. At ${Math.round(r.completeness * 100)}% there is `,
              'not enough of it to say whether this needs a board slot.',
            ]),
          ]),
      el('p', { class: 'muted small' }, [
        'This is a suggestion produced from your own scores. TBS confirms routing; a self-assessment does not decide it.',
      ]),
      // How complete this is, said before anything else about it, because a score computed
      // from a third of the questions is not the same claim as a score from all of them.
      (() => {
        const pct = Math.round(r.completeness * 100);
        const full = r.answered >= r.scoreable;
        return el('div', { class: `completeness ${full ? 'full' : 'partial'}` }, [
          el('div', { class: 'completeness-bar' }, [el('i', { style: `width:${pct}%` })]),
          el('p', { class: 'small' }, [
            el('b', {}, [`${r.answered} of ${r.scoreable} answered (${pct}%). `]),
            full
              ? 'Everything has been scored.'
              : 'This score is calculated from what has been answered so far. An unanswered question is left out of the sum, so it does not count as a zero, and the score will move as you fill the rest in.',
          ]),
          el('p', { class: 'small' }, [
            `${highs} thing${highs === 1 ? '' : 's'} an assessor will probably ask about.`,
          ]),
        ]);
      })(),
    ]),
    el('div', { class: `bigscore ${tone(r.overall)}` }, [
      el('span', { class: 'num' }, [r.overall === null ? '--' : r.overall.toFixed(1)]),
      el('span', { class: 'outof' }, [t('out of 10', 'sur 10')]),
    ]),
  ]));

  /**
   * Anything that blocks saving comes second, where it cannot be scrolled past. It used to be
   * eight blocks down, under the folded table.
   */
  const problems = markingProblems(a);
  if (problems.length) {
    root.appendChild(el('section', { class: 'card warn alert', 'data-part': 'Fix first' }, [
      el('strong', {}, [t('You cannot save this yet', 'Vous ne pouvez pas encore enregistrer')]),
      el('ul', { class: 'small' }, problems.slice(0, 8).map((p) => el('li', {}, [p.message]))),
      el('button', { class: 'ghost', onclick: onBack }, [t('Go back and fix it', 'Revenir et corriger')]),
    ]));
  }

  /**
   * Region 1. The same 176 answers at three grains, so they are one region and not three
   * cards: the domain bars, the topic bars, and every row.
   */
  const r1 = el('section', { class: 'res-region', 'aria-labelledby': 'res-score', 'data-part': 'Breakdown' }, [
    el('h2', { id: 'res-score' }, ['Where the score comes from']),
  ]);
  root.appendChild(r1);

  const bars = el('div', { class: 'res-sub' }, [el('h3', {}, ['By architecture domain'])]);
  for (const d of r.domains) {
    bars.appendChild(el('div', { class: 'bar-row' }, [
      el('div', { class: 'bar-label' }, [d.domain.label, el('span', { class: 'muted small' }, [` ${d.weight}% of the total`])]),
      el('div', { class: 'bar-track' }, [
        el('div', { class: `bar-fill ${bar(d.score)}`, style: `width:${((d.score ?? 0) / 10) * 100}%` }),
      ]),
      el('div', { class: `bar-num ${tone(d.score)}` }, [d.score === null ? '--' : d.score.toFixed(1)]),
    ]));
  }
  r1.appendChild(bars);

  // The same answers cut a second way. Security questions sit in all four domains, so a
  // department that is weak on security cannot see it in the domain bars: the weakness is
  // spread across four numbers that each look fine. These topic scores are that view. They do
  // not add up to the overall, and the page says so, because a question belongs to one domain
  // but can belong to several topics.
  const withTopics = r.topics.filter((t) => t.total > 0);
  if (withTopics.length) {
    const tbox = el('div', { class: 'res-sub' }, [
      el('h3', {}, ['Across the domains']),
      el('p', { class: 'muted small' }, [
        'The same questions, grouped by subject. A question can be about two things at once, ',
        'so these do not add up to the overall.',
        rubric.topicsNote ? el('span', { class: 'badge badge-warn' }, ['provisional grouping']) : null,
      ]),
    ]);
    for (const t of withTopics) {
      tbox.appendChild(el('div', { class: 'bar-row' }, [
        el('div', { class: 'bar-label' }, [
          t.topic.label,
          el('span', { class: 'muted small' }, [` ${t.answered} of ${t.total} answered`]),
          t.redFlags.length
            ? el('span', { class: 'badge badge-bad' }, [`${t.redFlags.length} answered no`])
            : null,
        ]),
        el('div', { class: 'bar-track' }, [
          el('div', { class: `bar-fill ${bar(t.score)}`, style: `width:${((t.score ?? 0) / 10) * 100}%` }),
        ]),
        el('div', { class: `bar-num ${tone(t.score)}` }, [t.score === null ? '--' : t.score.toFixed(1)]),
      ]));
    }
    /**
     * A category with no questions in it is the most useful thing on this block.
     *
     * Dan named nine categories on 8 September. Two of them, Accessibility and Official
     * Languages, match no question in the instrument: a sweep of all 176 found official
     * languages in two and accessibility in three, always in another sense. Hiding an empty
     * category makes the instrument look complete. Naming it is what gets it filled.
     */
    const empty = r.topics.filter((x) => x.total === 0);
    if (empty.length) {
      tbox.appendChild(el('p', { class: 'muted small' }, [
        el('b', {}, [`Nothing in this question set asks about ${empty.map((x) => x.topic.label).join(' or ')}. `]),
        'The category is here because TBS named it. It scores nothing until a question is tagged with it.',
      ]));
    }
    if (rubric.topicsNote) {
      tbox.appendChild(el('p', { class: 'tiny dim' }, [rubric.topicsNote]));
    }
    r1.appendChild(tbox);
  }

  // The backlog. This is the teach-me-to-fish half of the tool, and it is one region with the
  // strongest three, because both answer the question of what to do on Monday.
  const r2 = el('section', { class: 'res-region', 'aria-labelledby': 'res-work', 'data-part': 'To do' }, [
    el('h2', { id: 'res-work' }, ['What to do about it']),
    el('p', { class: 'muted' }, ['Take these away as backlog items. Nobody else needs to see this part.']),
  ]);
  const w = weakest(r, 5);
  if (w.length) {
    const back = el('div', { class: 'res-sub' }, [
      el('h3', {}, ['Your weakest five, and what would move them']),
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
    r2.appendChild(back);
  }

  const s = strongest(r, 3);
  if (s.length) {
    r2.appendChild(el('div', { class: 'res-sub' }, [
      el('h3', {}, ['Your strongest three']),
      el('ul', { class: 'steps' }, s.map((qs) =>
        el('li', {}, [el('b', {}, [`${qs.raw}/10 `]), qs.question.text]))),
    ]));
  }
  if (r2.querySelector('.res-sub')) root.appendChild(r2);

  // What an assessor will ask. Showing this to the submitter is deliberate - it removes the ambush.
  if (fs.length) {
    const box = el('section', { class: 'res-region', 'aria-labelledby': 'res-ask', 'data-part': 'Assessor' }, [
      el('h2', { id: 'res-ask' }, ['What an assessor will probably ask']),
      el('p', { class: 'muted' }, ['Better to see this now than in the room.']),
    ]);
    for (const f of fs.slice(0, 12)) {
      box.appendChild(el('div', { class: `flag sev-${f.severity}` }, [
        el('div', { class: 'flag-title' }, [
          el('span', { class: 'sev-dot' }),
          el('strong', {}, [f.title]),
          // The severity in words as well as in colour, because colour on its own is not a
          // signal for everybody reading this.
          el('span', { class: 'badge tiny' }, [f.severity]),
          f.questionId ? el('span', { class: 'qid' }, [f.questionId]) : null,
        ]),
        el('div', { class: 'small' }, [f.detail]),
        f.challenge ? el('div', { class: 'small challenge' }, [f.challenge]) : null,
      ]));
    }
    root.appendChild(box);
  }

  // Full detail, folded.
  const table = el('table', { class: 'detail' }, [
    el('thead', {}, [el('tr', {}, [
      el('th', { scope: 'col' }, ['#']), el('th', { scope: 'col' }, ['Question']),
      el('th', { scope: 'col' }, ['Score']),
      el('th', { scope: 'col' }, ['Weight at your stage']), el('th', { scope: 'col' }, ['Evidence']),
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
  r1.appendChild(el('div', { class: 'res-sub' }, [
    el('h3', {}, ['Every question and score']),
    el('details', {}, [
      el('summary', {}, [`Show the table, ${r.scoreable} rows`]),
      el('div', { class: 'table-wrap' }, [table]),
    ]),
  ]));

  /**
   * Submitting, which is one deliberate act.
   *
   * Nothing goes anywhere while an assessment is being filled in, so this is the moment work
   * becomes visible to TBS, and the moment somebody confirms what they are sending. After the
   * first submit, later edits write through on their own, which is why the button changes
   * rather than disappearing.
   */
  /**
   * Region 4. Who is on it, then what happens to it, then the things you can do with it. Left
   * as three loose peers this is where the wall used to rebuild itself, at the bottom of the
   * page, which is where a reader gives up.
   */
  const r4 = el('section', { class: 'res-region', 'aria-labelledby': 'res-send', 'data-part': 'Send' }, [
    el('h2', { id: 'res-send' }, ['Getting it to TBS']),
  ]);
  r4.appendChild(sharedPanel(a, () => openShareDialog(a, currentUser()?.email ?? '', () => repaint())));
  r4.appendChild(submitBlock(rubric, a, r, problems.length > 0));
  root.appendChild(r4);

  r4.appendChild(el('div', { class: 'actions' }, [
    // Saving online is the act on this page, so it is the strong control here as well as in
    // the questionnaire footer. Everything a file used to do is in the File menu.
    isHosted() && !savedOnline(a)
      ? el('button', {
          class: 'primary', disabled: problems.length > 0,
          onclick: () => saveOnline(),
        }, [t('Save online', 'Enregistrer en ligne')])
      : null,
    el('button', { class: 'ghost', onclick: () => window.print() }, [
      t('Print or save as a PDF', 'Imprimer ou enregistrer en PDF'),
    ]),
    el('button', { class: 'ghost', onclick: onBack }, [t('Back to the questions', 'Retour aux questions')]),
  ]));
}

function submitBlock(rubric: Rubric, a: Assessment, r: Result, blocked: boolean): HTMLElement {
  const box = el('div', { class: 'res-sub submit-box' });
  const submitted = !!a.meta.submittedAt;

  if (!isHosted()) {
    box.appendChild(el('div', { class: 'head-row' }, [
      el('h3', {}, [t('Handing it to an assessor', 'La remise \u00e0 un \u00e9valuateur')]),
      el('span', { class: 'badge badge-warn' }, [t('Not hosted yet', 'Pas encore h\u00e9berg\u00e9')]),
    ]));
    box.appendChild(el('p', { class: 'muted' }, [
      t('This copy of the tool has nowhere to keep an assessment, so there is nothing an assessor could open. The hosted copy gives every assessment an access code, and that code is how it is handed over.',
        'Cette copie de l\u2019outil n\u2019a nulle part o\u00f9 conserver une \u00e9valuation, il n\u2019y a donc rien qu\u2019un \u00e9valuateur puisse ouvrir. La copie h\u00e9berg\u00e9e attribue un code d\u2019acc\u00e8s \u00e0 chaque \u00e9valuation, et ce code est la fa\u00e7on de la remettre.'),
    ]));
    return box;
  }

  box.appendChild(el('div', { class: 'head-row' }, [
    el('h3', {}, [
      submitted
        ? t('Marked ready for an assessor', 'Marqu\u00e9e pr\u00eate pour un \u00e9valuateur')
        : t('Marking it ready for an assessor', 'Marquer comme pr\u00eate pour un \u00e9valuateur'),
    ]),
    submitted ? el('span', { class: 'badge' }, [t('Ready to review', 'Pr\u00eate \u00e0 \u00e9valuer')]) : null,
  ]));

  if (submitted) {
    const when = new Date(a.meta.submittedAt as string);
    box.appendChild(el('p', { class: 'muted' }, [
      Number.isNaN(when.getTime())
        ? t('Marked ready on an earlier visit. ', 'Marqu\u00e9e pr\u00eate lors d\u2019une visite pr\u00e9c\u00e9dente. ')
        : t(`Marked ready on ${when.toLocaleString()}. `, `Marqu\u00e9e pr\u00eate le ${when.toLocaleString()}. `),
      t('You can keep working. An assessor reads the version you last saved online, so save again after you change anything.',
        'Vous pouvez continuer \u00e0 travailler. Un \u00e9valuateur lit la version que vous avez enregistr\u00e9e en ligne en dernier; enregistrez de nouveau apr\u00e8s toute modification.'),
    ]));
    return box;
  }

  /**
   * What this button does, and the reason its name changed.
   *
   * It was called "Ask an assessor to review it", which reads as a message going somewhere. No
   * message goes anywhere. It sets a mark on the assessment and saves it, and the mark is what
   * an assessor sees beside it in their list. Telling somebody is still a thing a person does,
   * in whatever they already use, and the code is what they need in hand to do it.
   */
  box.appendChild(el('p', { class: 'muted' }, [
    t('Marking it ready puts "Ready to review" beside this assessment in the assessor\u2019s list, so somebody looking through the pool can tell it is finished.',
      'Le marquage affiche \u00ab Pr\u00eate \u00e0 \u00e9valuer \u00bb \u00e0 c\u00f4t\u00e9 de cette \u00e9valuation dans la liste de l\u2019\u00e9valuateur, pour qu\u2019on voie qu\u2019elle est termin\u00e9e.'),
  ]));
  box.appendChild(el('p', { class: 'muted' }, [
    t('The tool sends nothing and tells nobody. Tell your assessor yourself, the way you would tell them about any other document, and give them the access code so they can open it.',
      'L\u2019outil n\u2019envoie rien et n\u2019avertit personne. Informez vous-m\u00eame votre \u00e9valuateur, comme pour tout autre document, et donnez-lui le code d\u2019acc\u00e8s pour qu\u2019il puisse l\u2019ouvrir.'),
  ]));

  const go = el('button', {
    class: 'primary', disabled: blocked,
    title: blocked
      ? t('Fix what is listed above first', 'Corrigez d\u2019abord ce qui est indiqu\u00e9 ci-dessus')
      : t('Mark this assessment ready to review', 'Marquer cette \u00e9valuation comme pr\u00eate \u00e0 \u00e9valuer'),
    onclick: () => {
      const ev = Object.values(a.answers).reduce((n, x) => n + (x.evidence ?? []).length, 0);
      confirmStep({
        tier: 'caution',
        title: t('Mark this ready to review?', 'Marquer ceci comme pr\u00eat \u00e0 \u00e9valuer?'),
        body: `${r.answered} of ${r.scoreable} answers, ${ev} piece${ev === 1 ? '' : 's'} of evidence, and everything you wrote about the initiative. Anybody who opens this assessment sees all of it. Marking it ready saves it online and puts "Ready to review" beside it in the assessor\u2019s list. Nothing is sent, and you can keep working on it afterwards.`,
        extra: a.id ? codeChip(a.id) : undefined,
        note: a.id
          ? t('Send your assessor this code. It is the only way they can open it.',
              'Envoyez ce code \u00e0 votre \u00e9valuateur. C\u2019est le seul moyen pour lui de l\u2019ouvrir.')
          : undefined,
        stake: t('Everything in this tool is unclassified. Marking it ready says this assessment is too.',
          'Tout dans cet outil est non classifi\u00e9. Le marquer comme pr\u00eat affirme que cette \u00e9valuation l\u2019est aussi.'),
        commitLabel: t('It is unclassified. Mark it ready', 'C\u2019est non classifi\u00e9. Marquer comme pr\u00eat'),
        cancelLabel: t('Not yet', 'Pas encore'),
        onCommit: () => {
          a.meta.submittedAt = new Date().toISOString();
          autosave(a);
          void putRecord(a).then((res) => {
            if (!res.ok) {
              // The mark comes back off, because it never reached the store, and an assessor
              // would never have seen it.
              delete a.meta.submittedAt;
              autosave(a);
            }
            const fresh = submitBlock(rubric, a, r, blocked);
            // The reason used to be computed and dropped, so a refused save looked like a
            // button that did nothing at all.
            if (!res.ok) {
              fresh.appendChild(el('p', { class: 'card warn tight small' }, [
                el('strong', {}, [t('It was not marked. ', 'Le marquage n\u2019a pas abouti. ')]),
                res.problem,
              ]));
            }
            box.replaceWith(fresh);
          });
        },
      });
    },
  }, [t('Mark it ready to review', 'Marquer comme pr\u00eate')]);

  box.appendChild(el('div', { class: 'actions' }, [go]));
  box.appendChild(el('p', { class: 'tiny dim' }, [
    t('It asks you to confirm first, and the mark can be nothing but a mark.',
      'Une confirmation est demand\u00e9e d\u2019abord, et le marquage n\u2019est rien de plus qu\u2019un marquage.'),
  ]));
  return box;
}

/**
 * The results stop on each screen, so a reader needs to know how many screens there are and
 * which one they are on. One dot per section, filled for the one in view.
 *
 * IntersectionObserver is guarded: jsdom has none, and the page has to render without it.
 */
function addSnapHint(root: HTMLElement): void {
  if (typeof IntersectionObserver !== 'function') return;
  queueMicrotask(() => {
    const sections = [...root.querySelectorAll(':scope > section')];
    if (sections.length < 2) return;

    const hint = el('nav', { class: 'snap-hint', 'aria-label': 'Parts of your results' });
    const named = (sec: Element, i: number) =>
      sec.querySelector('h1, h2')?.textContent?.trim() || `Part ${i + 1} of ${sections.length}`;
    const dots = sections.map((sec, i) =>
      el('button', {
        class: 'snap-dot', 'aria-label': named(sec, i), title: named(sec, i),
        onclick: () => (sec as HTMLElement).scrollIntoView({ block: 'start', behavior: 'smooth' }),
      }, [
        el('span', { class: 'snap-name' }, [sec.getAttribute('data-part') || named(sec, i)]),
      ]),
    );
    for (const d of dots) hint.appendChild(d);
    root.parentElement?.appendChild(hint);

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const i = sections.indexOf(e.target);
        dots.forEach((d, j) => d.classList.toggle('on', j === i));
      }
      // The window is the scroll container now, so the observer watches against it. Passing the
      // old container here left the dots dead without saying anything.
    }, { rootMargin: '-20% 0px -60% 0px', threshold: 0 });
    for (const sec of sections) io.observe(sec);
  });
}

/**
 * A draft message, in the person's own mail client, carrying the access code.
 *
 * The tool sends nothing, and this is the one place that comes close enough to need saying so.
 * It opens whatever handles mail on that machine with the message already written; the person
 * reads it, addresses it and sends it themselves, through the channel their department already
 * trusts. Nothing leaves this page.
 *
 * It used to carry a sentence telling the person to attach a file they had just saved, from
 * when a file was the only way to move an assessment. The code moves it now, so the code is
 * what the message carries, and there is nothing to attach.
 */
export function handOff(a: Assessment, overall: number | null = null, band = '') {
  const subject = `GC EA self-assessment - ${a.initiative.name || 'untitled initiative'}`;
  const where = pageAddress();
  const body = [
    `Initiative: ${a.initiative.name}`,
    `Department: ${a.initiative.department}`,
    `Lifecycle stage: ${a.initiative.lifecycleStage}`,
    `Marking: ${a.initiative.classification}`,
    `Self-assessed score: ${overall === null ? 'not scored' : overall.toFixed(1)} out of 10${band ? ` (${band})` : ''}`,
    '',
    a.id
      ? `Open it here: ${where}`
      : 'This assessment has not been saved online yet, so there is nothing to open.',
    a.id ? `Access code: ${formatCode(a.id)}` : '',
    '',
    a.id
      ? 'Anyone with that code can open the assessment and change it, so pass it on the way you would pass on the assessment itself.'
      : '',
  ].filter((line) => line !== '').join('\r\n');
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
