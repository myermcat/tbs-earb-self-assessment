import type { Assessment, Rubric } from './types';
import { el, clear, tone, bar } from './dom';
import { nextAnchor, score, strongest, weakest, type Result } from './scoring';
import { flags } from './flags';
import { csvHeader, csvRow, toCsv } from './csv';
import { autosave, download, slug } from './storage';
import { humanSize, totalAttachedBytes } from './attach';
import { markingProblems } from './marking';
import { t } from './i18n';
import { isHosted, putRecord } from './store';
import { currentUser } from './firebase';
import { openShareDialog, sharedPanel } from './views-share';
import { repaint } from './views-submit';
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

  const attached = totalAttachedBytes(a.answers);
  r4.appendChild(el('div', { class: 'actions' }, [
    el('button', {
      class: 'primary', disabled: problems.length > 0,
      onclick: () => sendPackage(rubric, a, { high: highs, total: fs.length }),
    }, [
      attached ? `Save the file to send to TBS (${humanSize(attached)} of evidence attached)` : t('Save the file to send to TBS', 'Enregistrer le fichier à envoyer au SCT'),
    ]),
    el('button', {
      class: 'ghost', disabled: problems.length > 0,
      onclick: () => handOff(a, r.overall, r.band?.label ?? ''),
    }, [t('Draft the email', 'Rédiger le courriel')]),
    el('button', { class: 'ghost', onclick: () => saveCsv(rubric, a, { high: highs, total: fs.length }) }, [t('Save a CSV row', 'Enregistrer une ligne CSV')]),
    el('button', { class: 'ghost', onclick: () => window.print() }, [t('Print or save as PDF', 'Imprimer ou enregistrer en PDF')]),
    el('button', { class: 'ghost', onclick: onBack }, [t('Back to the questions', 'Retour aux questions')]),
  ]));
}

function submitBlock(rubric: Rubric, a: Assessment, r: Result, blocked: boolean): HTMLElement {
  const box = el('div', { class: 'res-sub submit-box' });
  const submitted = !!a.meta.submittedAt;

  if (!isHosted()) {
    box.appendChild(el('div', { class: 'head-row' }, [
      el('h3', {}, [t('Sending it to TBS', 'L\u2019envoi au SCT')]),
      el('span', { class: 'badge badge-warn' }, [t('Not hosted yet', 'Pas encore hébergé')]),
    ]));
    box.appendChild(el('p', { class: 'muted' }, [
      t('There is nowhere to send it yet. Save the file below and pass it on the way you would pass on any document, and the moment a shared store exists this becomes one button.', 'Il n\u2019y a encore nulle part où l\u2019envoyer. Enregistrez le fichier ci-dessous et transmettez-le comme n\u2019importe quel document; dès qu\u2019un dépôt partagé existera, ce sera un seul bouton.'),
    ]));
    return box;
  }

  box.appendChild(el('div', { class: 'head-row' }, [
    el('h2', {}, [
      submitted
        ? t('TBS has been told it is ready', 'Le SCT a été informé que c\u2019est prêt')
        : t('Telling TBS it is ready to review', 'Dire au SCT que c\u2019est prêt à évaluer'),
    ]),
    submitted ? el('span', { class: 'badge' }, [t('Ready to review', 'Prêt à évaluer')]) : null,
  ]));

  if (submitted) {
    const when = new Date(a.meta.submittedAt as string);
    box.appendChild(el('p', { class: 'muted' }, [
      `${Number.isNaN(when.getTime()) ? t('Told on an earlier visit. ', 'Signalé lors d\u2019une visite précédente. ') : t(`Told on ${when.toLocaleString()}. `, `Signalé le ${when.toLocaleString()}. `)}`,
      t('You can keep working. Changes are kept at TBS as you make them, and your assessor reads the current version.', 'Vous pouvez continuer à travailler. Les modifications sont conservées au SCT à mesure, et votre évaluateur lit la version actuelle.'),
    ]));
    return box;
  }

  /**
   * Saving and handing in are two different acts, and naming them as one is what made this
   * screen confusing. Signed in, the work is already at TBS. This button is the sentence that
   * tells an assessor to read it.
   */
  box.appendChild(el('p', { class: 'muted' }, [
    isHosted() && currentUser()
      ? t('Your work is kept at TBS as you go. Nobody has been asked to read it yet.', 'Votre travail est conservé au SCT à mesure. Personne n\u2019a encore été invité à le lire.')
      : t('Your answers are in this browser and nowhere else. Signing in keeps them at TBS as you work.', 'Vos réponses sont dans ce navigateur et nulle part ailleurs. La connexion les conserve au SCT pendant que vous travaillez.'),
  ]));

  const go = el('button', {
    class: 'primary', disabled: blocked,
    title: blocked
      ? t('Fix what is listed above first', 'Corrigez d\u2019abord ce qui est indiqué ci-dessus')
      : t('Tell TBS this assessment is ready to review', 'Dire au SCT que cette évaluation est prête à évaluer'),
    onclick: () => {
      const ev = Object.values(a.answers).reduce((n, x) => n + (x.evidence ?? []).length, 0);
      confirmStep({
        tier: 'caution',
        title: t('Tell TBS this is ready to review?', 'Dire au SCT que c\u2019est prêt à évaluer?'),
        body: `${r.answered} of ${r.scoreable} answers, ${ev} piece${ev === 1 ? '' : 's'} of evidence, and everything you wrote about the initiative. Your assessor sees all of it. This saves nothing new: your work is already kept at TBS. It puts your assessment in front of an assessor, and you can keep working on it afterwards.`,
        stake: t('Everything in this tool is unclassified. By telling them it is ready you are saying this is too.', 'Tout dans cet outil est non classifié. En disant que c\u2019est prêt, vous affirmez que ceci l\u2019est aussi.'),
        commitLabel: t('It is unclassified. Tell them', 'C\u2019est non classifié. Les informer'),
        cancelLabel: t('Not yet', 'Pas encore'),
        onCommit: () => {
          a.meta.submittedAt = new Date().toISOString();
          autosave(a);
          void putRecord(a).then((res) => {
            if (!res.ok) {
              // The submitted stamp comes back off, because it did not go.
              delete a.meta.submittedAt;
              autosave(a);
            }
            const fresh = submitBlock(rubric, a, r, blocked);
            // The reason used to be computed and dropped, so a refused send looked like a
            // button that did nothing at all.
            if (!res.ok) {
              fresh.appendChild(el('p', { class: 'card warn tight small' }, [
                el('strong', {}, [t('It did not send. ', 'L\u2019envoi n\u2019a pas abouti. ')]),
                res.problem,
              ]));
            }
            box.replaceWith(fresh);
          });
        },
      });
    },
  }, [t('Tell TBS it is ready to review', 'Dire au SCT que c\u2019est prêt')]);

  box.appendChild(el('div', { class: 'actions' }, [go]));
  box.appendChild(el('p', { class: 'tiny dim' }, [
    t('It asks you to confirm before anything goes.', 'Une confirmation est demandée avant tout envoi.'),
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

function sendPackage(rubric: Rubric, a: Assessment, counts: { high: number; total: number }) {
  download(`${slug(a.initiative.name)}-self-assessment.json`, JSON.stringify(a, null, 2));
}

/**
 * A page with no network cannot send anything, and should not pretend to. This opens the
 * person's own mail client with the message written for them; they attach the saved file
 * themselves, through the channel their department already trusts.
 */
export function handOff(a: Assessment, overall: number | null = null, band = '') {
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
