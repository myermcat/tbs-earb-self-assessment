import type { Assessment, Rubric } from './types';
import { formatCode } from './firebase';
import { el, clear, tone, bar } from './dom';
import { score, isRedFlag, allQuestionScores, type Result } from './scoring';
import { csvHeader, csvRow, toCsv } from './csv';
import { confirmTyped } from './confirm';
import { flags } from './flags';
import { download } from './storage';
import { deleteRecord, isHosted, listRecords, sourceLine, type StoredRecord } from './store';

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

  // Withdrawn records stay in the list and out of every statistic.
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

  // Where the portfolio is weak, by domain and then across the domains. The second cut is the
  // one a single assessment cannot show: security spread thin across four domains looks fine
  // in every one of them.
  const avgOf = (pick: (row: Row) => number | null) => {
    const vals = rows.map(pick).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const byDomain = el('section', { class: 'card' }, [
    el('h2', {}, ['Average by domain']),
    el('p', { class: 'muted small' }, [`Across ${rows.length} record${rows.length === 1 ? '' : 's'}.`]),
  ]);
  rubric.domains.forEach((d, i) => {
    const v = avgOf((row) => row.r.domains[i]?.score ?? null);
    byDomain.appendChild(barRow(d.label, `${d.weight}% of the total`, v));
  });
  root.appendChild(byDomain);

  const topics = (rubric.topics ?? []);
  if (topics.length) {
    const byTopic = el('section', { class: 'card' }, [
      el('h2', {}, ['Average across the domains']),
      el('p', { class: 'muted small' }, ['The same answers grouped by subject. These do not add up to the overall.']),
    ]);
    topics.forEach((t, i) => {
      const v = avgOf((row) => row.r.topics[i]?.score ?? null);
      const flagged = rows.reduce((n, row) => n + (row.r.topics[i]?.redFlags.length ?? 0), 0);
      byTopic.appendChild(barRow(t.label, flagged ? `${flagged} answered no` : '', v));
    });
    root.appendChild(byTopic);
  }

  // The records themselves, weakest first: the list is a worklist, not an alphabet.
  const table = el('table', { class: 'detail' }, [
    el('thead', {}, [el('tr', {}, [
      el('th', {}, ['Initiative']), el('th', {}, ['Department']), el('th', {}, ['Stage']),
      el('th', {}, ['Score']), el('th', {}, ['Band']), el('th', {}, ['Answered']),
      el('th', {}, ['No']), el('th', {}, ['State']), el('th', {}, ['Updated']), el('th', {}, ['']),
    ])]),
  ]);
  const body = el('tbody', {});
  const ordered = [...rows].sort((a, b) => (a.r.overall ?? 99) - (b.r.overall ?? 99));
  for (const row of ordered) {
    const a = row.rec.assessment;
    // Records come from a store, and a store holds whatever was written to it. One document
    // saved by an older version, or half-written, must not take the whole portfolio down.
    const about = a.initiative ?? {};
    body.appendChild(el('tr', { class: row.redFlags ? 'red-flag' : '' }, [
      el('td', {}, [about.name || el('span', { class: 'muted' }, ['(unnamed)'])]),
      el('td', {}, [about.department || '--']),
      el('td', {}, [about.lifecycleStage || '--']),
      el('td', { class: tone(row.r.overall) }, [row.r.overall === null ? '--' : row.r.overall.toFixed(1)]),
      el('td', { class: 'small' }, [row.r.band?.label ?? '--']),
      el('td', { class: 'small' }, [`${Math.round(row.r.completeness * 100)}%`]),
      el('td', { class: 'small' }, [row.redFlags ? String(row.redFlags) : '']),
      el('td', { class: 'small' }, [state(row.rec)]),
      el('td', { class: 'small muted' }, [when(row.rec.updatedAt)]),
      /**
       * An admin can delete a record, and has to type the initiative name to do it. Copied
       * from the way GitHub deletes a repository, for the reason that pattern exists: a
       * prototype accumulates test submissions, and a confirmation somebody can agree to by
       * reflex stops being one.
       */
      el('td', {}, [
        el('details', { class: 'set-menu row-menu' }, [
          el('summary', { class: 'set-menu-btn', title: 'More', 'aria-label': 'More actions' }, ['\u22EF']),
          el('div', { class: 'set-menu-pop' }, [
        el('button', {
          class: 'menu-item menu-danger',
          /**
           * Typed out, and what has to be typed is the code.
           *
           * It used to be the initiative name, which two departments can share, which somebody
           * can read off the row above by mistake, and which is the field most likely to be
           * blank. The code belongs to one assessment and to no other, and copying it out of
           * the row you meant is the act that proves you meant that row.
           */
          onclick: () => confirmTyped({
            title: `Delete the ${a.initiative.name || 'unnamed'} assessment?`,
            consequences: [
              `Every answer in it: ${row.r.answered} of ${row.r.scoreable} questions.`,
              'The reasoning and the evidence links on each answer.',
              'Every audited score, verdict and reason written against it.',
              'The record of who saved each version of it.',
              a.id
                ? `The code ${formatCode(a.id)} stops working, and anybody holding it loses the assessment.`
                : 'Its code.',
            ],
            phrase: a.id ? formatCode(a.id) : (a.initiative.name || 'unnamed'),
            phraseLabel: a.id ? 'this assessment\u2019s code' : 'the initiative name',
            commitLabel: 'Delete this assessment',
            onCommit: () => {
              const id = a.id;
              if (!isHosted() || !id) {
                // A record that never went to a store cannot be removed from one. This is the
                // draft in somebody's browser, and only they can discard that.
                alert('This record is not in a shared store, so there is nothing to remove. A draft can only be discarded by the person who has it.');
                return;
              }
              void deleteRecord(id).then((res) => {
                if (!res.ok) { alert(res.problem); return; }
                renderDashboard(root, rubric, sessionFiles);
              });
            },
          }),
        }, ['Delete this assessment']),
          ]),
        ]),
      ]),
    ]));
  }
  table.appendChild(body);
  root.appendChild(el('section', { class: 'card' }, [
    el('h2', {}, ['Every record, weakest first']),
    el('div', { class: 'table-wrap' }, [table]),
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
      el('li', {}, [el('b', {}, ['Clear out test submissions. ']), 'Raised at TBS and parked.']),
    ]),
    el('p', { class: 'small muted' }, [
      'Open question for TBS: is this a separate role, or an assessor with more buttons?',
    ]),
  ]));

  // The backlog lives in Settings, under This build. A pointer is enough here.
  root.appendChild(el('p', { class: 'small muted' }, [
    'What is being built, and what is waiting on somebody, is in Settings under This build.',
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

function state(rec: StoredRecord): HTMLElement | string {
  if (rec.status === 'audited') return el('span', { class: 'badge' }, ['audited']);
  if (rec.status === 'submitted') return el('span', { class: 'badge' }, ['submitted']);
  if (rec.status === 'withdrawn') return el('span', { class: 'badge badge-warn' }, ['withdrawn']);
  return el('span', { class: 'muted' }, ['draft']);
}

function when(iso: string): string {
  if (!iso) return '--';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '--' : d.toISOString().slice(0, 10);
}

function kpi(value: string, label: string): HTMLElement {
  return el('div', { class: 'kpi' }, [
    el('div', { class: 'kpi-v' }, [value]),
    el('div', { class: 'kpi-l' }, [label]),
  ]);
}
