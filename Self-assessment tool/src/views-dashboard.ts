import type { Assessment, Rubric } from './types';
import { el, clear, tone, bar } from './dom';
import { score, isRedFlag, allQuestionScores, type Result } from './scoring';
import { csvHeader, csvRow, toCsv } from './csv';
import { flags } from './flags';
import { ICON_DOWN } from './icons';
import { download } from './storage';
import { isHosted, listRecords, sourceLine, type StoredRecord } from './store';

/**
 * Dan's view. One page over every record, so nobody has to collect files to see how the
 * portfolio is doing. It recalculates from the answers each time it is drawn, so it is current
 * by construction - there is no stored roll-up to go stale.
 *
 * It is honest about its own reach: with no hosted store it can only see this browser and the
 * files opened this session, and the top of the page says which.
 */

interface Row { rec: StoredRecord; r: Result; redFlags: number }

export function renderDashboard(root: HTMLElement, rubric: Rubric, sessionFiles: Assessment[] = []): void {
  clear(root);
  root.appendChild(el('section', { class: 'card' }, [
    el('div', { class: 'head-row' }, [el('h1', {}, ['Dashboard'])]),
    el('p', { class: 'muted' }, ['Reading the records…']),
  ]));

  void listRecords(sessionFiles).then((records) => paint(root, rubric, records, sessionFiles));
}

function paint(
  root: HTMLElement,
  rubric: Rubric,
  records: StoredRecord[],
  sessionFiles: Assessment[] = [],
): void {
  clear(root);

  /**
   * A withdrawn record is out of every number on this page and still on the submissions list,
   * at the foot of it, where it can be put back. Withdrawing is the reversible move and it is
   * only reversible while it is visible somewhere.
   */
  const live = records.filter((rec) => rec.status !== 'withdrawn');
  const rows: Row[] = live.map((rec) => {
    const r = score(rubric, rec.assessment);
    const redFlags = allQuestionScores(r).filter(isRedFlag).length;
    return { rec, r, redFlags };
  });

  const scored = rows.filter((row) => row.r.overall !== null);
  const avg = scored.length
    ? scored.reduce((n, row) => n + (row.r.overall as number), 0) / scored.length
    : null;
  // The board-referral line: the floor of the band above the worst one, so "below it" means
  // the assessment lands in the band that says come and explain. Dan has given three
  // different numbers for this, so it is labelled provisional wherever it shows.
  const ladder = [...rubric.bands].sort((x, y) => x.min - y.min);
  const gate = ladder[1] ?? null;
  const threshold = gate ? gate.min : null;
  const provisional = gate?.source === 'interpolated' || ladder[0]?.source === 'interpolated';
  const below = threshold === null ? null
    : scored.filter((row) => (row.r.overall as number) < threshold).length;

  root.appendChild(el('section', { class: 'card' }, [
    el('div', { class: 'head-row' }, [
      el('h1', {}, ['Dashboard']),
      /**
       * A badge only where something is wrong with the page's reach.
       *
       * It read "Live", which is a word about an initiative on every other screen in this tool
       * and here meant something else entirely: that this page is talking to the real store.
       * Asked, in those words: what is live, what does live mean here, is it that the portfolio
       * is live. The line underneath already says "N records from the hosted store", so the
       * badge was the same fact in a word that could be read three ways.
       */
      isHosted() ? null : el('span', { class: 'badge badge-warn' }, ['Not hosted yet']),
    ]),
    el('p', { class: 'small' }, ['Showing: ', el('b', {}, [sourceLine(records)]), '.']),
    /**
     * The same toolbar the submissions list has, because the two exports are the same control.
     *
     * This one sat in a card of its own at the foot of the page, which gave a button the
     * standing of a section. Key-value storage is eventually consistent, so Check again is
     * beside it: a submission sent a moment ago may not be in this read yet, and the hover
     * says so rather than a paragraph above the numbers.
     */
    el('div', { class: 'res-toolbar' }, [
      el('button', {
        class: 'ghost small btn-icon',
        html: `${ICON_DOWN}<span>Export the portfolio as CSV</span>`,
        onclick: () => {
          const csv = toCsv([
            csvHeader(rubric),
            ...rows.map((row) => csvRow(rubric, row.rec.assessment, {
              high: 0, total: flags(rubric, row.rec.assessment, row.r).length,
            })),
          ]);
          download('gc-arch-portfolio.csv', csv, 'text/csv');
        },
      }),
      el('span', { class: 'spacer' }),
      isHosted()
        ? el('button', {
            class: 'ghost small',
            title: 'A submission sent in the last minute may not be in this read yet, and longer if this page read the list a moment ago.',
            onclick: () => renderDashboard(root, rubric, sessionFiles),
          }, ['Check again'])
        : null,
    ]),
    el('div', { class: 'kpi-row' }, [
      kpi(String(live.length), live.length === 1 ? 'record' : 'records'),
      kpi(avg === null ? '--' : avg.toFixed(1), 'average overall'),
      kpi(below === null ? '--' : String(below), threshold === null ? 'below the threshold' : `below ${threshold}, for the board`),
      kpi(String(rows.reduce((n, row) => n + row.redFlags, 0)), 'answered no'),
      kpi(String(records.filter((rec) => rec.status === 'audited').length), 'audited'),
    ]),
    provisional
      ? el('p', { class: 'tiny dim' }, [
          'That threshold is provisional: it was filled in between two numbers TBS named, and nobody has confirmed it.',
        ])
      : null,
  ]));

  if (!rows.length) {
    root.appendChild(el('section', { class: 'card' }, [
      el('p', {}, ['No records to show. Fill one in on the assessment side, or open some files on the assessor side, and they appear here.']),
    ]));
    return;
  }

  /**
   * Where the portfolio is weak, twice: by architecture domain, then by category.
   *
   * These are two different groupings of the same answers, not two cuts of one. A question sits
   * in exactly one domain and the domains carry weights that add up to the overall. A question
   * carries any number of categories and they add up to nothing. The headings used to read
   * "Average by domain" and "Average across the domains", which put them side by side as one
   * thing measured two ways, and the second was the category block. Reported in those words:
   * do not shove one into the other.
   */
  const avgOf = (pick: (row: Row) => number | null) => {
    const vals = rows.map(pick).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  /**
   * One block holding both, the way the submitter's results page holds them.
   *
   * Asked for in those words: combine average by architecture domain and average by category the
   * same way they are combined in the submitter part, so they are together, and keep the styling
   * choices similar on both sides. They were two cards with a gap, which reads as two unrelated
   * findings when they are the same answers grouped twice. The results page solved this already
   * with one bordered box and a rule between the halves, so this uses the same box.
   */
  const where = el('section', { class: 'card' }, [
    // It was called Where the portfolio is weak and it is every average, strong ones included.
    // A magnifying glass over the weak ones would be a different screen.
    el('h2', {}, ['Averages']),
  ]);
  const cuts = el('div', { class: 'cuts' });
  where.appendChild(cuts);
  root.appendChild(where);

  const byDomain = el('div', { class: 'res-sub cut' }, [
    el('h3', {}, ['By architecture domain']),
  ]);
  rubric.domains.forEach((d, i) => {
    const v = avgOf((row) => row.r.domains[i]?.score ?? null);
    byDomain.appendChild(barRow(d.label, `${d.weight}% of the total`, v));
  });
  cuts.appendChild(byDomain);

  /**
   * The category block, matched by id and never by position.
   *
   * A question set declares its categories and four of them are the four domains repeated, so
   * this list has to drop them the way the results page and the submission detail already do.
   * The trap is that r.topics stays as long as the set declares: filter the labels alone and
   * index i into the scores, and the screen draws five bars with the domains' numbers under the
   * categories' names, which is a wrong number that looks right. Look each one up by its id.
   */
  const domainIds = new Set(rubric.domains.map((d) => d.id));
  const categories = (rubric.topics ?? []).filter((t) => !domainIds.has(t.id));
  const scoreOf = (row: Row, id: string) => row.r.topics.find((x) => x.topic.id === id) ?? null;
  const shown = categories.filter((t) => rows.some((row) => (scoreOf(row, t.id)?.total ?? 0) > 0));
  if (shown.length) {
    const byCategory = el('div', { class: 'res-sub cut' }, [
      el('h3', {}, ['By category']),
    ]);
    for (const t of shown) {
      const v = avgOf((row) => scoreOf(row, t.id)?.score ?? null);
      const flagged = rows.reduce((n, row) => n + (scoreOf(row, t.id)?.redFlags.length ?? 0), 0);
      byCategory.appendChild(barRow(t.label, flagged ? `${flagged} answered no` : '', v));
    }
    cuts.appendChild(byCategory);
  }

  /**
   * THE LIST OF RECORDS IS NOT HERE. IT IS THE SUBMISSIONS TAB.
   *
   * Asked, and there was no argument for it: the same records, from the same read, in the same
   * worklist order, with fewer columns and no way into a submission. Withdrawing and the
   * withdrawn rows went to the list with it; the export went to the toolbar above.
   */

  /**
   * TWO BLOCKS THAT MEAN SOMETHING AT TEN RECORDS.
   *
   * Everything else on this page is an output: the average, how many sit below the threshold,
   * how many answered no. An output is a result, and the test a dashboard has to pass is
   * whether a bad number names something to do on Monday. Nobody can act on an average.
   *
   * These two are the levers. Both work at any volume, which the rest of what this page could
   * show does not - weakest questions across the GC, averages by department and what good
   * evidence looks like all need more records than exist, and are filed as #130 to #132.
   */
  {
    /**
     * Where the department and the assessor disagree about what a number means.
     *
     * This is the only reading here that is about the INSTRUMENT rather than about the
     * departments. A question every department scores itself high on and every assessor marks
     * down is not twenty departments being optimistic; it is a question that does not ask what
     * its author thinks it asks. That is a thing TBS can change, and nothing else on this page
     * points at one.
     *
     * Only standing changes count. An assessor who looked and agreed has written no number, and
     * counting their silence as agreement would make the gap look smaller the less anybody did.
     */
    type Gap = { qid: string; label: string; n: number; sum: number };
    const gaps = new Map<string, Gap>();
    const label = new Map<string, string>();
    for (const d of rubric.domains) for (const sec of d.sections) for (const q of sec.questions) {
      label.set(q.id, q.text);
    }
    let changed = 0;
    let scored = 0;
    let sum = 0;
    let withAudit = 0;
    for (const rec of live) {
      if (!rec.audits?.length) continue;
      withAudit++;
      for (const audit of rec.audits) {
        for (const [qid, e] of Object.entries(audit.perQuestion ?? {})) {
          if (typeof e.auditedScore !== 'number') continue;
          scored++;
          const theirs = rec.assessment.answers?.[qid]?.score;
          if (typeof theirs !== 'number' || theirs === e.auditedScore) continue;
          changed++;
          const delta = e.auditedScore - theirs;
          sum += delta;
          const g = gaps.get(qid) ?? { qid, label: label.get(qid) ?? qid, n: 0, sum: 0 };
          g.n++; g.sum += delta;
          gaps.set(qid, g);
        }
      }
    }
    if (withAudit) {
      const mean = changed ? sum / changed : 0;
      const worst = [...gaps.values()]
        .sort((a, b) => Math.abs(b.sum / b.n) - Math.abs(a.sum / a.n) || b.n - a.n)
        .slice(0, 5);
      const box = el('section', { class: 'card' }, [
        el('h2', {}, ['Self-scores against assessors']),
        el('div', { class: 'kpi-row' }, [
          kpi(String(withAudit), withAudit === 1 ? 'record audited' : 'records audited'),
          kpi(String(scored), 'questions re-scored'),
          kpi(String(changed), 'scores changed'),
          kpi(changed ? `${mean > 0 ? '+' : ''}${mean.toFixed(1)}` : '--',
              mean < 0 ? 'departments scored high by' : 'departments scored low by'),
        ]),
      ]);
      if (worst.length) {
        const list = el('div', { class: 'cat-list' }, worst.map((g) => {
          const avg = g.sum / g.n;
          return el('div', { class: 'cat-q cat-q-flat' }, [
            el('span', { class: `cat-q-score ${avg < 0 ? 'red' : ''}` }, [
              `${avg > 0 ? '+' : ''}${avg.toFixed(1)}`,
            ]),
            el('span', { class: 'cat-q-text' }, [
              g.label,
              el('span', { class: 'cat-q-where' }, [`${g.qid} \u00B7 ${g.n} time${g.n === 1 ? '' : 's'}`]),
            ]),
          ]);
        }));
        box.appendChild(el('h3', {}, ['Furthest apart']));
        box.appendChild(list);
      }
      root.appendChild(box);
    }
  }

  {
    /**
     * What is waiting, and how long the oldest has waited.
     *
     * The number to act on is the longest wait rather than the count: five submissions two days
     * old is a working week, and one submission five weeks old is a department that has heard
     * nothing since it pressed the button. A count cannot tell those apart.
     */
    const waiting = live
      .filter((rec) => rec.assessment.meta?.submittedAt && !(rec.audits?.length))
      .map((rec) => ({ rec, since: Date.parse(rec.assessment.meta?.submittedAt ?? '') }))
      .filter((x) => !Number.isNaN(x.since))
      .sort((a, b) => a.since - b.since);
    const started = live.filter((rec) => (rec.audits?.length ?? 0) > 0).length;
    const drafts = live.filter((rec) => !rec.assessment.meta?.submittedAt).length;
    const days = (t: number) => Math.floor((Date.now() - t) / 86400000);
    if (waiting.length || started || drafts) {
      const oldest = waiting[0];
      root.appendChild(el('section', { class: 'card' }, [
        el('h2', {}, ['Waiting on an assessor']),
        el('div', { class: 'kpi-row' }, [
          kpi(String(waiting.length), 'nobody has opened'),
          kpi(oldest ? String(days(oldest.since)) : '--', 'days, the longest wait'),
          kpi(String(started), 'being audited'),
          kpi(String(drafts), 'still drafts'),
        ]),
        oldest
          ? el('p', { class: 'small' }, [
              el('b', {}, [oldest.rec.assessment.initiative?.name || '(unnamed)']),
              ' \u00B7 ',
              oldest.rec.assessment.initiative?.department || '--',
              ' \u00B7 ',
              `marked ready ${new Date(oldest.since).toLocaleDateString()}`,
            ])
          : null,
      ]));
    }
  }

  // What this role can do that an assessor cannot, and what nobody has decided yet.
  root.appendChild(el('section', { class: 'card' }, [
    el('h2', {}, ['Admin actions']),
    el('span', { class: 'badge badge-warn' }, ['Mostly not built']),
    el('ul', { class: 'steps' }, [
      el('li', {}, [el('b', {}, ['Withdraw a record. ']), 'Out of every statistic on this page, still in the list. Nothing is deleted.']),
      el('li', {}, [el('b', {}, ['Re-assign an assessor. ']), 'When somebody leaves, or a file needs a second pair of eyes.']),
      el('li', {}, [
        el('b', {}, ['Question sets. ']),
        'Built. Settings holds every set this browser knows, marks the active one, and takes a new one. Adding a set keeps the old ones, and deleting one asks twice.',
      ]),
      /**
       * What this line was: "Clear out test submissions. Raised at TBS and parked." Nobody
       * reading it could tell what had been raised, with whom, or what parked meant. It was
       * about removing many records at once, which nothing here does: they go one at a time,
       * and each one makes you type its code out.
       */
      el('li', {}, [
        el('b', {}, ['Clear out test submissions in one go. ']),
        'Not built. A prototype fills up with them, and today each is deleted on its own row, which asks you to type its code out first.',
      ]),
    ]),
    el('p', { class: 'small muted' }, [
      'Open question for TBS: is this a separate role, or an assessor with more buttons?',
    ]),
  ]));

}

function barRow(label: string, sub: string, v: number | null): HTMLElement {
  return el('div', { class: 'bar-row' }, [
    el('div', { class: 'bar-label' }, [label, sub ? el('span', { class: 'muted small' }, [` ${sub}`]) : null]),
    el('div', { class: 'bar-track' }, [
      el('div', { class: `bar-fill ${bar(v)}`, style: `width:${((v ?? 0) / 10) * 100}%` }),
    ]),
    el('div', { class: `bar-num ${tone(v)}` }, [v === null ? '--' : v.toFixed(1)]),
  ]);
}

function kpi(value: string, label: string): HTMLElement {
  return el('div', { class: 'kpi' }, [
    el('div', { class: 'kpi-v' }, [value]),
    el('div', { class: 'kpi-l' }, [label]),
  ]);
}
