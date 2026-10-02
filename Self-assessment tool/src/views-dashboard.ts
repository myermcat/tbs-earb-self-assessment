import type { Assessment, Rubric } from './types';
import { el, clear, tone, bar } from './dom';
import { score, isRedFlag, allQuestionScores, type Result } from './scoring';
import { csvHeader, csvRow, toCsv } from './csv';
import { flags } from './flags';
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
    el('div', { class: 'head-row' }, [el('h1', {}, ['Portfolio'])]),
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
      el('h1', {}, ['Portfolio']),
      el('span', { class: isHosted() ? 'badge' : 'badge badge-warn' }, [
        isHosted() ? 'Live' : 'Not hosted yet',
      ]),
    ]),
    el('p', { class: 'muted' }, [
      isHosted()
        ? 'Every record in the store, recalculated as this page loads.'
        : 'Nothing is hosted yet, so this page can only see what this browser and this session hold. The day a store exists, the same page reads the whole portfolio. The numbers below are computed the same way in both cases.',
    ]),
    el('p', { class: 'small' }, ['Showing: ', el('b', {}, [sourceLine(records)]), '.']),
    // Key-value storage is eventually consistent: a write can take a minute to be visible at
    // another location, and longer at one that read the old list recently. Somebody watching
    // for a submission that has just been sent needs to know that before they assume it lost.
    isHosted()
      ? el('p', { class: 'small muted' }, [
          'A submission can take up to a minute to appear here, and longer if this page read the list a moment ago. ',
          el('button', { class: 'ghost small', onclick: () => renderDashboard(root, rubric, sessionFiles) }, ['Check again']),
        ])
      : null,
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
    el('h2', {}, ['Where the portfolio is weak']),
    el('p', { class: 'muted small' }, [`Across ${rows.length} record${rows.length === 1 ? '' : 's'}, grouped twice.`]),
  ]);
  const cuts = el('div', { class: 'cuts' });
  where.appendChild(cuts);
  root.appendChild(where);

  const byDomain = el('div', { class: 'res-sub cut' }, [
    el('h3', {}, ['By architecture domain']),
    el('p', { class: 'muted small' }, ['These carry weights and they add up to the overall.']),
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
      el('p', { class: 'muted small' }, [
        'The same questions grouped by what they are about. One question can be in several categories at once, so these do not add up to the overall.',
      ]),
    ]);
    for (const t of shown) {
      const v = avgOf((row) => scoreOf(row, t.id)?.score ?? null);
      const flagged = rows.reduce((n, row) => n + (scoreOf(row, t.id)?.redFlags.length ?? 0), 0);
      byCategory.appendChild(barRow(t.label, flagged ? `${flagged} answered no` : '', v));
    }
    cuts.appendChild(byCategory);
  }

  /**
   * THE LIST OF RECORDS IS NOT HERE ANY MORE. IT IS THE SUBMISSIONS TAB.
   *
   * Asked, and the answer is that there was no argument for it: why do we have it in the
   * portfolio view if we have exactly the same thing in submissions. It was the same records,
   * from the same read, in the same worklist order - weakest first, which is the second of the
   * two rules the submissions list already sorts by - with a thinner set of columns and no way
   * into a submission. Two lists of one thing is two places to keep in step, and the one that
   * loses is always the one somebody forgets.
   *
   * Three things were only here, and all three went to the list rather than being dropped.
   * Withdrawn records, which the submissions list showed undifferentiated among the work.
   * Withdrawing and putting back, which is the move somebody wants when a test submission is
   * cluttering the portfolio, and which belongs on the row it is about. And when a record was
   * last touched, which is on the row's hover.
   *
   * What is left on this page is the only thing that is not a list: the numbers over all of
   * the records at once, and the file of all of them.
   */
  root.appendChild(el('section', { class: 'card' }, [
    el('div', { class: 'actions' }, [
      el('button', {
        class: 'ghost',
        onclick: () => {
          const csv = toCsv([
            csvHeader(rubric),
            ...rows.map((row) => csvRow(rubric, row.rec.assessment, {
              high: 0, total: flags(rubric, row.rec.assessment, row.r).length,
            })),
          ]);
          download('gc-arch-portfolio.csv', csv, 'text/csv');
        },
      }, ['Export the portfolio as CSV']),
    ]),
  ]));


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
