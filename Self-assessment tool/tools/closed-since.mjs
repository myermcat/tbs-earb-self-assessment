/**
 * What was finished, and when.
 *
 * node tools/closed-since.mjs            everything closed today
 * node tools/closed-since.mjs 7          the last seven days
 * node tools/closed-since.mjs 2026-09-26 since that morning
 *
 * The question this answers is asked out loud, usually as "what did we do today", and before
 * this the only honest answer was to read the git log and guess which commits were backlog
 * items. Every closed item carries the moment it closed, so the list is a filter rather than
 * a reconstruction.
 */
import { items } from '../NOTES/backlog.data.mjs';

const arg = process.argv[2];
const since = !arg ? new Date(new Date().toDateString())
  : /^\d+$/.test(arg) ? new Date(Date.now() - Number(arg) * 864e5)
    : new Date(arg);

if (Number.isNaN(since.getTime())) {
  console.error(`Not a date or a number of days: ${arg}`);
  process.exit(1);
}

const closed = items
  .filter((i) => i.status === 'closed' && i.closedAt && new Date(i.closedAt) >= since)
  .sort((a, b) => a.closedAt.localeCompare(b.closedAt));

/**
 * Ottawa time for a moment, UTC for a bare date. A bare date parses as midnight UTC, so asking
 * for it in Ottawa time lands it on the evening before and prints the wrong day. The same pair
 * is in tools/build-backlog.mjs, for the same reason.
 */
const ZONE = 'America/Toronto';
const bare = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso);
const day = (iso) => new Date(iso)
  .toLocaleDateString('en-CA', { day: 'numeric', month: 'short', timeZone: bare(iso) ? 'UTC' : ZONE });
const time = (iso) => (bare(iso) ? '' : new Date(iso)
  .toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: ZONE }));

const when = since.toLocaleDateString('en-CA', { day: 'numeric', month: 'long', year: 'numeric' });
if (!closed.length) {
  console.log(`Nothing closed since ${when}.`);
} else {
  console.log(`${closed.length} closed since ${when}:\n`);
  for (const i of closed) {
    console.log(`  ${day(i.closedAt)} ${time(i.closedAt).padStart(8)}  ${i.t}`);
    console.log(`  ${' '.repeat(16)}${i.track} · ${i.id}`);
  }
}
