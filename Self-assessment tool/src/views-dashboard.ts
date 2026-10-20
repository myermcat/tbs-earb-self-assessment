import type { Assessment, Rubric } from './types';
import { addressOf } from './firebase';
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
   * A DRAFT IS NOT IN ANY NUMBER ON THIS PAGE, AND NEITHER IS A WITHDRAWN RECORD.
   *
   * Asked for in those words: the dashboard should not include drafts. A draft is a department
   * still answering, so its score is a number taken before they had finished, and averaging it
   * beside finished work is the mistake the State column on the submissions list exists to
   * prevent. The same reading of a draft runs through the whole tool: no score colour on its
   * row, its own group behind its own button, and nothing on it that reads as a finding.
   *
   * A withdrawn record is out for a different reason, and was out already. Somebody took it out
   * of the statistics on purpose and it stays on the submissions list where it can be put back,
   * because withdrawing is reversible only while it is visible somewhere.
   */
  const live = records.filter((rec) => rec.status !== 'withdrawn' && rec.status !== 'draft');
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
    /**
     * Counted off what the page counts, which is the submissions and not the pool.
     *
     * It was handed every record, so it said twenty while the figures above it were worked out
     * from seventeen. The same rule as the heading on the submissions list: a number beside
     * words is about the thing under it or it is the one number nothing explains.
     */
    el('p', { class: 'small' }, ['Showing: ', el('b', {}, [sourceLine(live)]), '.']),
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
      /**
       * CHECK AGAIN IS NOT HERE. IT WAS THE RELOAD BUTTON.
       *
       * Asked twice: is it the same as reload, it looks redundant. It was not quite the same,
       * and the difference did not matter here. It re-read the store without rebuilding the
       * page, which is worth having on a screen holding something a reload would lose. This
       * screen holds nothing: every number on it is computed from the records as it draws, so
       * a reload reads the store afresh and arrives at exactly the same place.
       *
       * The eventual-consistency caveat it carried is still true - a submission sent in the
       * last minute may not be in this read - and it is true of a reload as well, so it was
       * never this button that answered it.
       *
       * The submissions list keeps its own, which is a different question on a screen that
       * does hold session state.
       */
    ]),
    el('div', { class: 'kpi-row' }, [
      kpi(String(live.length), live.length === 1 ? 'record' : 'records'),
      kpi(avg === null ? '--' : avg.toFixed(1), 'average overall'),
      /**
       * The caveat goes on the number it is about, not in a line underneath the row.
       *
       * It was a sentence below five tiles reading "that threshold is provisional", and asked:
       * which threshold, and who is it for. Neither was answerable from where it sat. The
       * number is the only thing it is about, so it is marked on the number, and the sentence
       * that could not say which one is gone.
       */
      /**
       * The word provisional was on the tile with nothing saying what it described, and was
       * asked exactly that. What is provisional is the 3: it was drawn between two numbers
       * TBS gave at different times and nobody has confirmed it. That is a fact about the
       * rubric rather than about this page, so it is on the hover and the tile says what the
       * number counts.
       */
      kpi(below === null ? '--' : String(below),
          threshold === null ? 'below the threshold' : `below ${threshold}, for the board`,
          provisional
            ? `The ${threshold} is provisional. It was filled in between two numbers TBS named at different times, and nobody has confirmed it.`
            : ''),
      // "answered no" with no noun was asked what it counted and where. It counts questions,
      // and only the ones the set asks as a yes or a no.
      kpi(String(rows.reduce((n, row) => n + row.redFlags, 0)), 'questions answered no',
          'Questions the set asks as a yes or a no, where a department answered no.'),
      kpi(String(records.filter((rec) => rec.status === 'audited').length), 'audited'),
    ]),
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
  const where = el('section', { class: 'card after-leads' }, [
    // It was called Where the portfolio is weak and it is every average, strong ones included.
    // A magnifying glass over the weak ones would be a different screen.
    el('h2', {}, ['Averages']),
  ]);
  const cuts = el('div', { class: 'cuts' });
  where.appendChild(cuts);
  /**
   * The averages are built here and appended last, under the cards that name something to do.
   *
   * Reading order is the strongest statement a page makes about what matters, and this had the
   * averages at the top because that is the order they were written in. An average is a result
   * nobody can act on. What is unlike the others, and who has been waiting a month, are both
   * things somebody picks up on a Monday, so they come first and the context sits under them.
   */

  /**
   * SPREAD, AND WHAT FALLS OUTSIDE IT.
   *
   * Asked for on 19 October: standard deviation on the dashboard and on each category, with
   * anything outside it treated as an anomaly that can be opened from here.
   *
   * Population rather than sample, because this is not a sample of anything. These ARE the
   * assessments; there is no wider population being estimated from them, so dividing by n is
   * the honest denominator and dividing by n-1 would be answering a question nobody asked.
   *
   * ONE STANDARD DEVIATION IS A WIDE NET AT THIS SIZE AND THE SCREEN SAYS SO RATHER THAN
   * HIDING IT. With ten records a single submission moves the mean visibly and moves the
   * spread with it, so "outside one deviation" can mean "unlike the others" or it can mean
   * "there are not enough others yet". The boundary is printed with the count it was computed
   * from, which is the only honest way to show a statistic over ten things.
   */
  const spread = (vals: (number | null)[]) => {
    const xs = vals.filter((v): v is number => typeof v === 'number');
    if (xs.length < 2) return null;
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    return { mean, sd, n: xs.length };
  };

  /** Opening a submission from here, through the address, so Back works out of it. */
  const openRecord = (rec: StoredRecord) => {
    if (!rec.assessment.id) return;
    window.location.hash = `#assessor/${addressOf(rec.assessment.id)}`;
  };

  const outlierRow = (rec: StoredRecord, value: number, mean: number, unit = '') =>
    el('button', {
      class: 'outlier',
      title: `Open ${rec.assessment.initiative?.name || 'this assessment'}`,
      onclick: () => openRecord(rec),
    }, [
      // A number with no unit beside it is a number nobody can read. On the waiting card this
      // was 21.0, which asked what 21 was, and which is not a score to one decimal place.
      el('span', { class: `outlier-n ${value < mean ? 'red' : ''}` },
         [unit ? `${Math.round(value)} ${unit}` : value.toFixed(1)]),
      el('span', { class: 'outlier-name' }, [rec.assessment.initiative?.name || '(unnamed)']),
      el('span', { class: 'outlier-dept' }, [rec.assessment.initiative?.department || '--']),
    ]);

  {
    const all = spread(rows.map((row) => row.r.overall));
    if (all) {
      const low = all.mean - all.sd;
      const high = all.mean + all.sd;
      const out = rows
        .filter((row) => typeof row.r.overall === 'number'
                && (row.r.overall < low || row.r.overall > high))
        .sort((a, b) => (a.r.overall as number) - (b.r.overall as number));
      /**
       * The heading names the method, because she could not tell the method was there.
       *
       * Reported in those words: I do not see the word standard deviation anywhere, it should
       * be in a heading at least so I know it exists. It was a label under a number in a row
       * of four identical ones, which is the same as not being on the page.
       */
      const box = el('section', { class: 'card lead-card' }, [
        el('h2', {}, ['Standard deviation']),
        /**
         * IT SAYS WHAT IT MEASURED, NOT WHAT THAT MEANS.
         *
         * This read "7 submissions are unlike the others", which is a claim about rarity the
         * arithmetic underneath does not support. Measured on a pool of twenty: seven records
         * fall outside one deviation, which is thirty-five per cent, and roughly a third of
         * ANY distribution falls outside one deviation. A third of a portfolio is not a set of
         * anomalies, it is the shape of a spread.
         *
         * The number was right and the sentence over it was not, so the sentence goes. Outside
         * one deviation is exactly what was computed and it lets the reader judge what it is
         * worth. Whether one deviation is the right boundary at all is a question for TBS,
         * because anomaly is their word, and the tool should not answer it by wording.
         */
        /**
         * ONE WORD FOR THE THING, EVERYWHERE IT APPEARS.
         *
         * This card called them "submissions outside one deviation", its own fold called them
         * "the furthest from the mean", and the category folds called them "outside the
         * deviation". Three names for one set, on one screen. Asked for in those words: do you
         * mean outliers, name them consistently throughout the blocks.
         *
         * Outlier, and the definition said once, here, where the method is named.
         *
         * And the band reads as a sentence rather than as an equation. It said "3.0-7.6 holds
         * the other 13 of 20", which asked the reader to work out that a range can hold
         * things.
         */
        lead(
          String(out.length),
          out.length === 1 ? 'outlier, further than one deviation from the mean'
            : 'outliers, further than one deviation from the mean',
          [
            `mean ${all.mean.toFixed(1)}`,
            `deviation ${all.sd.toFixed(2)}`,
            `${all.n - out.length} of ${all.n} score between ${low.toFixed(1)} and ${high.toFixed(1)}`,
          ],
          out.length ? 'warn' : '',
        ),
      ]);
      /**
       * The six furthest from the mean, not all of them.
       *
       * Outside one deviation is about a third of any normal spread, so this list grows with
       * the pool and stops being a list of anomalies and starts being most of the portfolio
       * again. Six is enough to act on; the whole of it is the submissions list sorted by
       * score, which is a thing that exists now.
       */
      if (out.length) {
        const far = [...out].sort((a, b) =>
          Math.abs((b.r.overall as number) - all.mean) - Math.abs((a.r.overall as number) - all.mean));
        const top = far.slice(0, 6);
        /**
         * The shortlist is the furthest from the mean, which is true at any pool size.
         *
         * A boundary answers "how many are unusual" and the answer moves with the shape of the
         * pool. "The six furthest from the mean" answers "which ones should I look at first"
         * and does not depend on a boundary being the right one.
         */
        box.appendChild(folded(
          out.length > top.length
            ? `${top.length} furthest of ${out.length} outliers`
            : out.length === 1 ? '1 outlier' : `${out.length} outliers`,
          [el('div', { class: 'outliers' }, top
            .sort((a, b) => (a.r.overall as number) - (b.r.overall as number))
            .map((row) => outlierRow(row.rec, row.r.overall as number, all.mean)))],
        ));
      }
      root.appendChild(box);
    }
  }

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
      /**
       * The spread goes beside the average, because an average alone cannot tell a category
       * everybody is mediocre at from one where half are excellent and half have not started.
       * Those are different problems and only the second has anybody to ask.
       */
      const sp = spread(rows.map((row) => scoreOf(row, t.id)?.score ?? null));
      byCategory.appendChild(barRow(
        t.label,
        [flagged ? `${flagged} answered no` : '', sp ? `\u00B1${sp.sd.toFixed(1)}` : '']
          .filter(Boolean).join(' \u00B7 '),
        v,
      ));
      if (sp) {
        const out = rows
          .map((row) => ({ row, v: scoreOf(row, t.id)?.score ?? null }))
          .filter((x): x is { row: Row; v: number } => typeof x.v === 'number'
                  && (x.v < sp.mean - sp.sd || x.v > sp.mean + sp.sd))
          .sort((a, b) => a.v - b.v);
        if (out.length) {
          // The deviation is already on the bar this sits under, so the summary is the count
          // and the word, and nothing else.
          byCategory.appendChild(folded(
            out.length === 1 ? '1 outlier' : `${out.length} outliers`,
            [el('div', { class: 'outliers outliers-tight' },
              out.slice(0, 6).map((x) => outlierRow(x.row.rec, x.v, sp.mean)))],
          ));
        }
      }
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
      const box = el('section', { class: 'card lead-card' }, [
        el('h2', {}, ['Self-scores vs. assessors\u2019 scores']),
        /**
         * THE FIGURE, AND THEN A SENTENCE THAT CONTAINS IT IN ORDINARY TEXT.
         *
         * Four wordings hung a fragment off the big number - points higher than assessors gave
         * them, points higher departments than assessors, points departments above their
         * assessors, points higher on average - and each answered the last question while
         * leaving the shape that caused it, a number the reader has to finish.
         *
         * So the next version wrote the sentence she had asked for and put the figure inside
         * it, emphasised, with nothing in front. That lost the thing the big number was for.
         * Her correction: leave the first 2.8 as it was, big, and have 2.8 points in the middle
         * of the sentence set as the rest of the sentence.
         *
         * Both, then. The figure is what the eye lands on and the sentence under it says what
         * the figure means, reading on its own without the heading above it.
         *
         * The sign stays off the figure. A minus belongs to the subtraction it came from,
         * assessor minus department, and the word higher belongs to the department; printing
         * both put two directions in one sentence. How far apart they are is the size, and
         * which way round is what the words say.
         */
        changed
          ? lead(
              Math.abs(mean).toFixed(1),
              `On average, departments score themselves ${Math.abs(mean).toFixed(1)} `
              + `point${Math.abs(mean) === 1 ? '' : 's'} ${mean < 0 ? 'higher' : 'lower'} `
              + 'than assessors score them.',
              [
                `${withAudit} record${withAudit === 1 ? '' : 's'} audited`,
                `${scored} question${scored === 1 ? '' : 's'} re-scored`,
                `${changed} changed`,
              ],
              Math.abs(mean) >= 2 ? 'warn' : '',
            )
          : lead('\u2014', 'No assessor has changed a score yet.', [
              `${withAudit} record${withAudit === 1 ? '' : 's'} audited`,
              `${scored} question${scored === 1 ? '' : 's'} re-scored`,
            ]),
      ]);
      if (worst.length) {
        const list = el('div', { class: 'cat-list' }, worst.map((g) => {
          const avg = g.sum / g.n;
          /**
           * A word rather than a sign, for the reason the headline lost its minus: a bare -2.1
           * asks the reader to remember which way the subtraction ran. Per question, because
           * departments over-claim on some and under-claim on others, and that difference is
           * the whole value of the list.
           */
          return el('div', { class: 'cat-q cat-q-flat' }, [
            el('span', { class: `cat-q-score ${avg < 0 ? 'red' : ''}` }, [
              `${Math.abs(avg).toFixed(1)} ${avg < 0 ? 'high' : 'low'}`,
            ]),
            el('span', { class: 'cat-q-text' }, [
              g.label,
              el('span', { class: 'cat-q-where' }, [`${g.qid} \u00B7 ${g.n} time${g.n === 1 ? '' : 's'}`]),
            ]),
          ]);
        }));
        /**
         * Not outliers, and not called outliers. An outlier on this page is a submission
         * further than one deviation from the mean. These are the questions the two sides
         * disagree about most, which is a different thing measured a different way, and giving
         * them the same name would be the consistency she asked for spent on the wrong word.
         */
        box.appendChild(folded(
          worst.length === 1 ? '1 biggest disagreement' : `${worst.length} biggest disagreements`,
          [list]));
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
      const box = el('section', { class: 'card lead-card' }, [
        el('h2', {}, ['Waiting on an assessor']),
        lead(
          oldest ? String(days(oldest.since)) : '\u2014',
          oldest ? 'days, the longest anybody has waited' : 'nothing is waiting',
          [
            `${waiting.length} nobody has opened`,
            `${started} being audited`,
            `${drafts} still draft${drafts === 1 ? '' : 's'}`,
          ],
          oldest && days(oldest.since) >= 14 ? 'warn' : '',
        ),
      ]);
      /**
       * The same shape as the cards above it: one row shown, the rest behind a fold.
       *
       * Asked, looking at it: the outliers here are not in a toggle, it is just one - does it
       * become one when there are more than some number. It should, and the answer is one.
       * The longest wait is the number the card leads with, so the submission it belongs to is
       * on screen without being asked for; everything else waiting is behind the fold, the way
       * the outliers are. Six of them, for the same reason.
       *
       * They are not outliers and are not called outliers. Everything waiting is waiting; what
       * makes the oldest worth naming is that it is the oldest, not that it is unusual.
       */
      if (oldest) {
        box.appendChild(el('div', { class: 'outliers' }, [
          outlierRow(oldest.rec, days(oldest.since), Number.POSITIVE_INFINITY, 'days'),
        ]));
      }
      if (waiting.length > 1) {
        const rest = waiting.slice(1, 7);
        box.appendChild(folded(
          waiting.length - 1 > rest.length
            ? `${rest.length} more waiting, of ${waiting.length - 1}`
            : `${rest.length} more waiting`,
          [el('div', { class: 'outliers' }, rest.map(
            (x) => outlierRow(x.rec, days(x.since), Number.POSITIVE_INFINITY, 'days')))],
        ));
      }
      root.appendChild(box);
    }
  }

  root.appendChild(where);

  /**
   * ADMIN ACTIONS IS NOT HERE. IT WAS A ROADMAP ON A DASHBOARD.
   *
   * Four bullets, two of them describing things that are built - withdrawing a record is in
   * the row menu on the submissions list, and question sets are in Settings - under a badge
   * saying mostly not built. Of the other two, re-assigning an assessor cannot exist yet
   * because nobody is assigned to anything, and clearing out test submissions in one go is a
   * thing nobody wants: deleting is per row and asks for the code.
   *
   * So it was two built things mislabelled as unbuilt, one that is not possible, and one that
   * is not wanted, on a screen four assessors see. The four are already #125 to #128 in the
   * backlog, which is where a list of unbuilt things belongs.
   */

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

function kpi(value: string, label: string, note = ''): HTMLElement {
  return el('div', { class: 'kpi', ...(note ? { title: note } : {}) }, [
    el('div', { class: 'kpi-v' }, [value]),
    el('div', { class: 'kpi-l' }, [label]),
  ]);
}

/**
 * ONE NUMBER PER CARD IS LOUD AND THE REST IS A QUIET LINE UNDER IT.
 *
 * Her words, on the day three new readings landed on two screens: more data means more on the
 * page, which means less readable, so it has to be obvious by looking which information
 * matters more.
 *
 * What was wrong was not density. This page carried seventeen counters at one weight, in four
 * identical rows, so nothing on it said what to look at first - and a screen where everything
 * is emphasised is a screen where nothing is. The fix is hierarchy rather than deletion: each
 * card keeps everything it had and says which of it is the point.
 *
 * The loud one is always the number that names something to do. Not the mean, which is a
 * result nobody can act on; the count of records outside the usual range, the days the oldest
 * has waited, the direction departments are scoring themselves in. The supporting numbers are
 * still there, on one line, in the order somebody would ask for them.
 */
function lead(value: string, label: string, under: string[], tone = ''): HTMLElement {
  return el('div', { class: 'lead' }, [
    el('div', { class: `lead-v ${tone}` }, [value]),
    el('div', {}, [
      el('div', { class: 'lead-l' }, [label]),
      under.filter(Boolean).length
        ? el('div', { class: 'lead-sub' }, [under.filter(Boolean).join('  \u00B7  ')])
        : null,
    ]),
  ]);
}

/**
 * A list that is closed until somebody wants it.
 *
 * Reported the day the outlier lists went in: the list is good, but it exploded the whole page,
 * and there are not even many examples yet. Both halves are true - a list of anomalies is the
 * useful part of this screen and it is also the part that makes it unreadable at a glance, so
 * it folds, with the count in the summary where it is legible closed.
 */
function folded(summary: string, kids: (Node | null)[]): HTMLElement {
  return el('details', { class: 'fold' }, [el('summary', {}, [summary]), ...kids]);
}
