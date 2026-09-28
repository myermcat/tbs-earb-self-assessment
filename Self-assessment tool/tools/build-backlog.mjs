/**
 * Renders NOTES/backlog.html from NOTES/backlog.data.mjs.
 *
 *   node tools/build-backlog.mjs
 *
 * WHAT THIS PAGE IS FOR. Dan asked on 26 September for a backlog he could look at and say this
 * matters more than that. So the page is built to be scanned and not read: an item is its title
 * and its state on one line, the reasoning is a click away, and everything is folded shut when
 * the page opens.
 *
 * THE ARRANGEMENT. Tabs across the top are Dan's three categories, with the critical path he
 * asked for in front of them. The list down the left is the finer grouping inside whichever tab
 * is open, and it stays put while the page scrolls. The counts sit in a bar along the bottom and
 * they count the tab you are looking at, not the whole file, because a number that never changes
 * as you move around is not telling you anything.
 *
 * ONE RECORD, SEVERAL VIEWS. Nothing appears twice from two sources. An item that blocks going
 * live shows in the first tab and in its own, drawn from one entry with one flag on it, so
 * finishing it is still one edit. The lists of things waiting on somebody and things left until
 * after the prototype used to be separate tables underneath, repeating the same rows; they are
 * marks on the row now.
 *
 * PRIORITIES ARE NOT IN THIS FILE. The three buttons on each row write to the store, so the
 * order everybody sees is the same order. What NOTES/backlog.data.mjs carries is only the value
 * a reader sees before the store answers. See the script at the bottom of this file.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tracks, sections, items, updated } from '../NOTES/backlog.data.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'NOTES', 'backlog.html');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const STATUS = { wait: 'Waiting', next: 'Next', doing: 'Doing', later: 'Later', done: 'Done' };
/** Which status a heading takes from the items under it: the furthest along anything below it. */
const FROM_KIDS = ['doing', 'next', 'wait', 'later', 'done'];
const SIZE = { hours: 'Hours', days: 'Days', weeks: 'Weeks' };
const RANK = { high: 0, medium: 1, low: 2 };

/**
 * Stops a typo becoming an item that exists in the file and appears on no page at all. A section
 * nobody can reach, or two items sharing an id, would both draw a page that looks complete.
 */
{
  const ids = new Set(sections.map((s) => s.id));
  const trackIds = new Set(tracks.map((t) => t.id));
  const wrong = [];
  const seen = new Set();
  const hasKids = new Set(items.filter((i) => i.parent).map((i) => i.parent));
  for (const i of items) {
    if (!ids.has(i.section)) wrong.push(`${i.id}: no section called ${JSON.stringify(i.section)}`);
    if (!trackIds.has(i.track)) wrong.push(`${i.id}: no tab called ${JSON.stringify(i.track)}`);
    if (RANK[i.priority] === undefined) wrong.push(`${i.id}: priority ${JSON.stringify(i.priority)}`);
    if (!STATUS[i.status]) wrong.push(`${i.id}: status ${JSON.stringify(i.status)}`);
    if (seen.has(i.id)) wrong.push(`${i.id}: written twice`);
    seen.add(i.id);
    if (!i.owner) wrong.push(`${i.id}: no owner. Who does the work once it is unblocked?`);
    /**
     * The two fields that stop the rot, enforced rather than encouraged.
     *
     * A 'wait' with no date is the failure this backlog actually has: a question put to Nick on
     * 1 September read exactly like one put yesterday, and one of them had been ignored for four
     * weeks. A 'next' with no size is an item nobody can plan a week around. Neither is asked of
     * a heading, which carries no work of its own.
     */
    if (i.status === 'wait' && !/^\d{4}-\d{2}-\d{2}$/.test(i.asked ?? '')) {
      wrong.push(`${i.id}: waiting on ${i.owes || 'somebody'} since when? asked must be a date.`);
    }
    if (i.status !== 'wait' && i.owes) wrong.push(`${i.id}: owes is for waiting items only`);
    if (!hasKids.has(i.id) && (i.status === 'next' || i.status === 'doing') && !SIZE[i.size]) {
      wrong.push(`${i.id}: size must be hours, days or weeks.`);
    }
  }
  const doing = items.filter((i) => i.status === 'doing');
  if (doing.length > 2) {
    console.error(`${doing.length} items are marked doing. Two at a time is the cap, and a list `
      + `where everything is started is a list where nothing is:\n  `
      + doing.map((i) => i.id).join('\n  '));
    process.exit(1);
  }
  for (const i of items) if (i.parent && !seen.has(i.parent)) wrong.push(`${i.id}: parent ${i.parent} does not exist`);
  for (const s of sections) if (!trackIds.has(s.track)) wrong.push(`section ${s.id}: no tab called ${s.track}`);
  if (wrong.length) { console.error('backlog.data.mjs:\n  ' + wrong.join('\n  ')); process.exit(1); }
}

const STYLE = `<style>
:root{color-scheme:light;--bg:#f7f8fa;--surface:#fff;--surface-2:#f1f3f6;--line:#e2e6ec;--line-2:#cdd4dd;
--ink:#16191d;--ink-2:#4a5361;--ink-3:#79828f;--accent:#2a4b8d;--accent-soft:#eaf0fb;--accent-line:#b9caea;
--good:#1f6b3c;--good-bg:#e9f4ed;--warn:#a8620a;--warn-bg:#fdf3e3;--hot:#a32222;--hot-bg:#fbeceb;
--mono:ui-monospace,SFMono-Regular,Menlo,monospace;--head:64px}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#101216;--surface:#191c22;--surface-2:#21252d;
--line:#2b303a;--line-2:#3a4150;--ink:#e8eaee;--ink-2:#a8b0bd;--ink-3:#7b8492;--accent:#6f96e0;
--accent-soft:#1b2436;--accent-line:#2f4570;--good:#5fbf82;--good-bg:#14251b;--warn:#e0a34a;--warn-bg:#2a2113;
--hot:#e8756b;--hot-bg:#2d1817}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}

/* The tabs. They sit on the top edge and stay there. */
.top{position:sticky;top:0;z-index:30;background:var(--surface);border-bottom:1px solid var(--line)}
.top-in{max-width:1180px;margin:0 auto;padding:.55rem 1.1rem .1rem;display:flex;align-items:flex-end;
gap:1rem;flex-wrap:wrap}
.brand{font-weight:700;font-size:.82rem;letter-spacing:.02em;color:var(--ink-2);padding-bottom:.55rem;
margin-right:auto;white-space:nowrap}
.brand span{color:var(--ink-3);font-weight:500}
.tabs{display:flex;gap:.25rem;align-items:flex-end}
/* Folder tabs: square shoulders at the top, and the open one joins the page below it. */
.tab{appearance:none;border:1px solid var(--line);border-bottom:0;background:var(--surface-2);
color:var(--ink-2);font:inherit;font-size:.86rem;font-weight:600;padding:.42rem .85rem;
border-radius:7px 7px 0 0;cursor:pointer;position:relative;top:1px}
.tab:hover{color:var(--ink)}
.tab[aria-selected=true]{background:var(--surface);color:var(--accent);border-color:var(--line);
box-shadow:0 -2px 0 var(--accent) inset}
.tab .c{font-family:var(--mono);font-size:.74rem;color:var(--ink-3);margin-left:.35rem}
.tab[aria-selected=true] .c{color:var(--accent)}

.cols{max-width:1180px;margin:0 auto;padding:0 1.1rem}
/* Each tab is its own two-column page: the list on the left, the items on the right. */
.pane{display:grid;grid-template-columns:200px minmax(0,1fr);gap:1.6rem;align-items:start}
[hidden]{display:none!important}
/* The left list stays put. It is the only navigation the page has. */
.side{position:sticky;top:calc(var(--head) + .6rem);padding:1.2rem 0 2rem;max-height:calc(100vh - var(--head) - 4rem);
overflow:auto}
.side a{display:flex;justify-content:space-between;gap:.5rem;align-items:baseline;
text-decoration:none;color:var(--ink-2);font-size:.85rem;padding:.3rem .5rem;border-radius:6px;
border-left:2px solid transparent}
.side a:hover{background:var(--surface-2);color:var(--ink)}
.side a.here{color:var(--accent);border-left-color:var(--accent);background:var(--accent-soft)}
.side a .c{font-family:var(--mono);font-size:.72rem;color:var(--ink-3)}
.side .lead{font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-3);
font-weight:700;margin:.2rem .5rem .45rem}

main{padding:1.2rem 0 3rem;min-width:0}
.tab-hint{color:var(--ink-2);font-size:.9rem;margin:0 0 1.5rem;max-width:74ch}
h2{font-size:1.02rem;margin:2rem 0 .55rem;scroll-margin-top:calc(var(--head) + .8rem);
display:flex;gap:.55rem;align-items:baseline}
h2:first-of-type{margin-top:0}
h2 .c{font-family:var(--mono);font-size:.75rem;color:var(--ink-3);font-weight:500}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden}

/* A row: the priority buttons on the right, the fold on the left. */
.row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.6rem;align-items:start;
border-top:1px solid var(--line);padding:.1rem .55rem .1rem 0}
.row:first-child{border-top:0}
.row[data-priority=high]{box-shadow:2px 0 0 var(--hot) inset}
.item{min-width:0}
.item>summary{cursor:pointer;list-style:none;display:flex;flex-wrap:wrap;align-items:baseline;
gap:.4rem .5rem;padding:.55rem .6rem .55rem .85rem}
.item>summary::-webkit-details-marker{display:none}
.item>summary::before{content:'\\25B8';color:var(--ink-3);font-size:.7rem;margin-left:-.5rem;width:.7rem}
.item[open]>summary::before{content:'\\25BE'}
.item>summary:hover{background:var(--surface-2)}
.item .t{font-weight:640;font-size:.93rem;flex:1 1 22rem;min-width:0}
.why{padding:.1rem .8rem .8rem 1.55rem;color:var(--ink-2);font-size:.86rem;max-width:74ch;white-space:pre-wrap}
.kids{margin:.2rem 0 .8rem 1.4rem;border-left:2px solid var(--line);padding-left:.3rem}
.kids .row{border-top:1px solid var(--line)}
.kids .row:first-child{border-top:0}

.chip{font-size:.63rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
border:1px solid;border-radius:999px;padding:.07rem .42rem;white-space:nowrap}
.st-done{color:var(--good);border-color:var(--good);background:var(--good-bg)}
.st-next{color:var(--accent);border-color:var(--accent-line);background:var(--accent-soft)}
.st-wait{color:var(--warn);border-color:var(--warn);background:var(--warn-bg)}
.st-later{color:var(--ink-3);border-color:var(--line-2);background:var(--surface-2)}
.k-bug{color:var(--hot);border-color:var(--hot);background:var(--hot-bg)}
.k-question{color:var(--ink-2);border-color:var(--line-2);background:var(--surface-2)}
.k-golive{color:var(--accent);border-color:var(--accent-line);background:var(--accent-soft)}
.st-doing{color:#fff;border-color:var(--accent);background:var(--accent)}
.sz{color:var(--ink-3);border-color:var(--line-2);background:transparent;font-weight:600}
.who{color:var(--ink-2);border-color:var(--line-2);background:var(--surface-2)}
/* How long somebody has owed us an answer. It goes amber at a fortnight and red at a month,
   because the thing this page kept failing to say is that nobody has replied since. */
.stale{font-size:.72rem;color:var(--warn);white-space:nowrap}
.stale[data-days-over="14"]{font-weight:700}
.stale[data-days-over="28"]{color:var(--hot);font-weight:700}

/* Three buttons, high to low. The one in force is filled. */
.prio{display:flex;gap:2px;padding:.62rem 0 0;flex:0 0 auto}
.prio button{appearance:none;font:inherit;font-size:.62rem;font-weight:700;letter-spacing:.04em;
width:1.55rem;height:1.35rem;border:1px solid var(--line-2);background:var(--surface);color:var(--ink-3);
cursor:pointer;padding:0}
.prio button:first-child{border-radius:5px 0 0 5px}
.prio button:last-child{border-radius:0 5px 5px 0}
.prio button+button{border-left:0}
.prio button:hover{color:var(--ink)}
.prio button[aria-pressed=true][data-p=high]{background:var(--hot);border-color:var(--hot);color:#fff}
.prio button[aria-pressed=true][data-p=medium]{background:var(--warn);border-color:var(--warn);color:#fff}
.prio button[aria-pressed=true][data-p=low]{background:var(--line-2);border-color:var(--line-2);color:var(--ink)}
.prio[data-locked=true] button{cursor:default;opacity:.55}

/* The counts, along the bottom, for the tab you are looking at. */
.foot{position:sticky;bottom:0;z-index:25;background:var(--surface);border-top:1px solid var(--line)}
.foot-in{max-width:1180px;margin:0 auto;padding:.4rem 1.1rem;display:flex;gap:1.1rem;align-items:baseline;
flex-wrap:wrap;font-size:.76rem;color:var(--ink-3)}
.foot b{font-family:var(--mono);font-size:.92rem;color:var(--ink);font-weight:600}
/* The counts are also the filter. Pressing one shows only those, which is what the separate
   tables of waiting and deferred rows used to be, without a second copy of every row. */
.foot button{appearance:none;font:inherit;font-size:.76rem;color:var(--ink-3);background:none;
border:1px solid transparent;border-radius:999px;padding:.1rem .5rem;cursor:pointer;display:flex;
gap:.3rem;align-items:baseline}
.foot button:hover{border-color:var(--line-2);color:var(--ink-2)}
.foot button[aria-pressed=true]{background:var(--accent-soft);border-color:var(--accent-line);color:var(--accent)}
.foot button[aria-pressed=true] b{color:var(--accent)}
.foot .sp{margin-left:auto;font-size:.72rem}
.foot a{color:var(--accent)}
.empty{color:var(--ink-3);font-size:.86rem;padding:.9rem;background:var(--surface);
border:1px dashed var(--line-2);border-radius:10px}
@media(max-width:820px){
  .pane{grid-template-columns:minmax(0,1fr);gap:0}
  .side{position:static;max-height:none;padding:.9rem 0 0;display:flex;flex-wrap:wrap;gap:.3rem}
  .side .lead{width:100%;margin:0 0 .2rem}
  .side a{border-left:0;border:1px solid var(--line);background:var(--surface)}
  .brand{margin-right:0;width:100%;padding-bottom:.2rem}
}
</style>`;

const byId = new Map(items.map((i) => [i.id, i]));
const kidsOf = (id) => items.filter((i) => i.parent === id);
const order = (a, b) => RANK[a.priority] - RANK[b.priority] || items.indexOf(a) - items.indexOf(b);

/** The rows a section shows: its own items, with anything that has a parent tucked under it. */
function rowsIn(sectionId, trackId) {
  return items
    .filter((i) => i.section === sectionId && !i.parent
      && (trackId !== 'golive' || i.golive))
    .sort(order);
}

const isGroup = (i) => items.some((k) => k.parent === i.id);
/** A heading takes the state of the furthest-along thing under it. */
const statusOf = (i) => {
  if (!isGroup(i)) return i.status;
  const kids = items.filter((k) => k.parent === i.id).map((k) => statusOf(k));
  return FROM_KIDS.find((st) => kids.includes(st)) ?? i.status;
};

function chips(i) {
  const out = [];
  if (i.kind === 'bug') out.push('<span class="chip k-bug">Bug</span>');
  if (i.kind === 'question') out.push('<span class="chip k-question">Question</span>');
  if (i.golive) out.push('<span class="chip k-golive">Go live</span>');
  const st = statusOf(i);
  out.push(`<span class="chip st-${st}">${STATUS[st]}</span>`);
  if (!isGroup(i) && SIZE[i.size] && st !== 'done') out.push(`<span class="chip sz">${SIZE[i.size]}</span>`);
  if (i.owner && i.owner !== 'ours' && st !== 'done') out.push(`<span class="chip who">${esc(i.owner)}</span>`);
  /**
   * How long it has been. Written as a date and turned into a count of days in the browser,
   * because this page is read weeks after it is built and a number baked in at build time would
   * be the one thing on the page that quietly stops being true.
   */
  if (i.owes && i.asked) {
    out.push(`<span class="stale" data-asked="${esc(i.asked)}">${esc(i.owes)} owes it</span>`);
  } else if (i.owes) {
    out.push(`<span class="stale">${esc(i.owes)} owes it</span>`);
  }
  return out.join('');
}

function prio(i) {
  return `<div class="prio" data-for="${esc(i.id)}">`
    + ['high', 'medium', 'low'].map((p) =>
      `<button type="button" data-p="${p}" aria-pressed="${i.priority === p}" `
      + `title="${p[0].toUpperCase() + p.slice(1)} priority">${p[0].toUpperCase()}</button>`).join('')
    + '</div>';
}

function row(i, depth = 0) {
  const kids = kidsOf(i.id).sort(order);
  const body = (i.why ? `<div class="why">${esc(i.why)}</div>` : '')
    + (kids.length ? `<div class="kids">${kids.map((k) => row(k, depth + 1)).join('')}</div>` : '');
  const inner = body
    ? `<details class="item"><summary><span class="t">${esc(i.t)}</span>${chips(i)}</summary>${body}</details>`
    : `<div class="item"><div style="padding:.55rem .6rem .55rem .85rem"><span class="t">${esc(i.t)}</span> ${chips(i)}</div></div>`;
  return `<div class="row" data-id="${esc(i.id)}" data-priority="${i.priority}" `
    + `data-status="${statusOf(i)}" data-kind="${i.kind}" data-golive="${i.golive}" `
    + `data-group="${isGroup(i)}"${i.owes ? ' data-owes="1"' : ''}>${inner}${prio(i)}</div>`;
}

const panes = tracks.map((tr) => {
  /**
   * The first tab is a view and not a place. Its headings are Dan's three categories, because
   * grouping it by the same sections as everywhere else put two headings called Broken on one
   * page, which tells a reader nothing about which is which.
   */
  const drawn = tr.id === 'golive'
    ? tracks.filter((t) => t.id !== 'golive')
      .map((t) => ({ s: { id: t.id, title: t.title }, rows: items.filter((i) => i.golive && i.track === t.id).sort(order) }))
      .filter((x) => x.rows.length)
    : sections.filter((s) => s.track === tr.id)
      .map((s) => ({ s, rows: rowsIn(s.id, tr.id) })).filter((x) => x.rows.length);
  const nav = drawn.map(({ s, rows }) =>
    `<a href="#s-${esc(tr.id)}-${esc(s.id)}" data-sec="s-${esc(tr.id)}-${esc(s.id)}">`
    + `<span>${esc(s.title)}</span><span class="c">${rows.length}</span></a>`).join('');
  const body = drawn.length
    ? drawn.map(({ s, rows }) => [
      `<h2 id="s-${esc(tr.id)}-${esc(s.id)}">${esc(s.title)} <span class="c">${rows.length}</span></h2>`,
      '<div class="card">', rows.map((i) => row(i)).join(''), '</div>',
    ].join('')).join('')
    : '<p class="empty">Nothing here yet.</p>';
  return `<section class="pane" data-track="${esc(tr.id)}" hidden>
<nav class="side"><div class="lead">${esc(tr.title)}</div>${nav}</nav>
<main><p class="tab-hint">${esc(tr.hint)}</p>${body}</main>
</section>`;
}).join('\n');

const SCRIPT = `<script>
(function () {
  'use strict';
  /**
   * Three jobs: the tabs, the priority buttons, and keeping the counts along the bottom about
   * the tab you are looking at.
   *
   * WHERE A PRIORITY GOES. Into the project's own store, under backlog/<the item's id>, so the
   * order is the same for everybody who opens this page and not a private note in one browser.
   * Reading needs no account. Changing one needs the same sign-in the tool uses, and this page
   * borrows that session rather than having a sign-in of its own: both pages are served from
   * one address, so they share one browser store, and the tool keeps its session there. Signed
   * out, the buttons are shown and do nothing, and say so.
   */
  var cfg = window.EARB_FIREBASE || null;
  var SESSION = 'gc-arch-assessment:firebase-session';
  var BASE = cfg ? 'https://firestore.googleapis.com/v1/projects/' + cfg.projectId
    + '/databases/(default)/documents/backlog' : '';

  function session() {
    try {
      var raw = localStorage.getItem(SESSION);
      if (!raw) return null;
      var s = JSON.parse(raw);
      return s && s.idToken ? s : null;
    } catch (e) { return null; }
  }

  // ------------------------------------------------------------------ the tabs
  var tabs = [].slice.call(document.querySelectorAll('.tab'));
  var panes = [].slice.call(document.querySelectorAll('.pane'));
  // What a tab says is what its own pane holds, counted the same way the bar at the bottom
  // counts it, so the two can never disagree.
  panes.forEach(function (p) {
    var open = p.querySelectorAll('.row:not([data-status=done]):not([data-group=true])').length;
    var tab = document.querySelector('.tab[data-track="' + p.dataset.track + '"] .c');
    if (tab) tab.textContent = String(open);
    // Section counts include what is folded inside an item, for the same reason: a heading that
    // says three over a group holding seven pieces of work is a heading that misleads.
    [].slice.call(p.querySelectorAll('main h2')).forEach(function (h) {
      var card = h.nextElementSibling;
      var n = card ? card.querySelectorAll('.row:not([data-group=true])').length : 0;
      var c = h.querySelector('.c');
      if (c) c.textContent = String(n);
      var link = p.querySelector('.side a[data-sec="' + h.id + '"] .c');
      if (link) link.textContent = String(n);
    });
  });
  function show(id) {
    tabs.forEach(function (t) { t.setAttribute('aria-selected', String(t.dataset.track === id)); });
    panes.forEach(function (p) { p.hidden = p.dataset.track !== id; });
    try { localStorage.setItem('earb-backlog-tab', id); } catch (e) { /* not important enough to fail on */ }
    if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
    count();
  }
  tabs.forEach(function (t) { t.addEventListener('click', function () { show(t.dataset.track); }); });

  // ------------------------------------------------------------------ the counts
  /**
   * What each count means, and what pressing it shows. A heading is not counted: it carries the
   * state of the items under it, and counting it as well says there is more work than there is.
   */
  var MATCH = {
    doing: function (r) { return r.dataset.status === 'doing'; },
    next: function (r) { return r.dataset.status === 'next'; },
    wait: function (r) { return r.dataset.status === 'wait'; },
    later: function (r) { return r.dataset.status === 'later'; },
    done: function (r) { return r.dataset.status === 'done'; },
    bug: function (r) { return r.dataset.kind === 'bug' && r.dataset.status !== 'done'; },
    question: function (r) { return r.dataset.kind === 'question' && r.dataset.status !== 'done'; },
  };
  var filter = '';

  function count() {
    var pane = document.querySelector('.pane:not([hidden])');
    if (!pane) return;
    var rows = [].slice.call(pane.querySelectorAll('.row')).filter(function (r) {
      return r.dataset.group !== 'true';
    });
    Object.keys(MATCH).forEach(function (k) {
      var el = document.getElementById('n-' + k);
      if (el) el.textContent = String(rows.filter(MATCH[k]).length);
    });
  }

  function apply() {
    document.querySelectorAll('.foot button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
    });
    document.querySelectorAll('.pane').forEach(function (pane) {
      pane.querySelectorAll('.card > .row').forEach(function (r) {
        // A heading stays when something under it matches, or the thing you filtered for
        // disappears along with its own title.
        var inside = [].slice.call(r.querySelectorAll('.kids .row'));
        var mine = [r].concat(inside).filter(function (x) { return x.dataset.group !== 'true'; });
        r.hidden = !!filter && !mine.some(MATCH[filter]);
      });
      pane.querySelectorAll('main h2').forEach(function (h) {
        var card = h.nextElementSibling;
        var rows = card ? [].slice.call(card.children) : [];
        var left = rows.filter(function (r) { return !r.hidden; }).length;
        h.hidden = !left;
        if (card) card.hidden = !left;
        var link = pane.querySelector('.side a[data-sec="' + h.id + '"]');
        if (link) link.hidden = !left;
        // Under a filter the heading says how many of the section you are looking at, because a
        // count that keeps reporting the whole section is describing rows that are not there.
        var all = card ? card.querySelectorAll('.row:not([data-group=true])').length : 0;
        var some = card ? [].slice.call(card.querySelectorAll('.row:not([data-group=true])'))
          .filter(function (r) { return filter && MATCH[filter](r); }).length : 0;
        var text = filter ? some + ' of ' + all : String(all);
        var c = h.querySelector('.c');
        if (c) c.textContent = text;
        var lc = link && link.querySelector('.c');
        if (lc) lc.textContent = text;
      });
    });
  }

  document.querySelectorAll('.foot button').forEach(function (b) {
    b.addEventListener('click', function () {
      filter = filter === b.dataset.filter ? '' : b.dataset.filter;
      apply();
    });
  });

  /**
   * How long somebody has owed us an answer, worked out when the page is read and not when it
   * was built. A question put on 1 September and one put yesterday used to look the same.
   */
  (function stale() {
    var today = new Date();
    document.querySelectorAll('.stale[data-asked]').forEach(function (el) {
      var days = Math.floor((today - new Date(el.dataset.asked + 'T00:00:00')) / 86400000);
      if (!isFinite(days) || days < 0) return;
      el.textContent = el.textContent + ', ' + (days === 0 ? 'asked today'
        : days === 1 ? 'asked yesterday' : 'asked ' + days + ' days ago');
      el.dataset.daysOver = days >= 28 ? '28' : days >= 14 ? '14' : '0';
    });
  }());

  // ------------------------------------------------------------------ priorities
  var RANK = { high: 0, medium: 1, low: 2 };
  function resort(card) {
    var rows = [].slice.call(card.children).filter(function (el) { return el.classList.contains('row'); });
    rows.sort(function (a, b) {
      var d = RANK[a.dataset.priority] - RANK[b.dataset.priority];
      return d || (Number(a.dataset.seq) - Number(b.dataset.seq));
    });
    rows.forEach(function (r) { card.appendChild(r); });
  }
  document.querySelectorAll('.card, .kids').forEach(function (card) {
    [].slice.call(card.children).forEach(function (r, n) { r.dataset.seq = String(n); });
  });

  function paint(id, p) {
    document.querySelectorAll('.row[data-id="' + id + '"]').forEach(function (row) {
      row.dataset.priority = p;
      row.querySelectorAll('.prio button').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.p === p));
      });
      if (row.parentElement) resort(row.parentElement);
    });
  }

  var say = document.getElementById('signed');
  function tell(msg) { if (say) say.textContent = msg; }

  function save(id, p) {
    var s = session();
    if (!cfg || !s) {
      tell('Sign in on the tool to change priorities, and this page will pick it up.');
      return Promise.resolve(false);
    }
    return fetch(BASE + '/' + encodeURIComponent(id) + '?updateMask.fieldPaths=priority&updateMask.fieldPaths=setAt', {
      method: 'PATCH',
      headers: { authorization: 'Bearer ' + s.idToken, 'content-type': 'application/json' },
      body: JSON.stringify({ fields: {
        priority: { stringValue: p },
        setAt: { stringValue: new Date().toISOString() },
      } }),
    }).then(function (r) {
      if (r.ok) { tell('Saved for everybody, as ' + s.email + '.'); return true; }
      return r.json().catch(function () { return {}; }).then(function (b) {
        tell('That did not save: ' + ((b.error && b.error.message) || r.status)
          + '. Your session may have run out; sign in on the tool again.');
        return false;
      });
    }).catch(function (e) { tell('That did not save: ' + e.message); return false; });
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('.prio button');
    if (!b) return;
    ev.preventDefault();
    var id = b.parentElement.dataset.for;
    var was = b.parentElement.querySelector('[aria-pressed=true]');
    var before = was ? was.dataset.p : 'medium';
    paint(id, b.dataset.p);
    save(id, b.dataset.p).then(function (ok) { if (!ok) paint(id, before); });
  });

  // ------------------------------------------------------------------ start
  var wanted = (location.hash || '').replace('#', '');
  var remembered = '';
  try { remembered = localStorage.getItem('earb-backlog-tab') || ''; } catch (e) { /* first visit */ }
  var start = tabs.filter(function (t) { return t.dataset.track === wanted; })[0]
    || tabs.filter(function (t) { return t.dataset.track === remembered; })[0] || tabs[0];
  if (start) show(start.dataset.track);

  var s = session();
  if (!cfg) tell('This copy has no store behind it, so priorities cannot be shared from here.');
  else if (s) tell('Signed in as ' + s.email + '. Priorities you set are saved for everybody.');
  else tell('Sign in on the tool to change priorities, and this page will pick it up.');

  if (cfg) {
    fetch(BASE + '?pageSize=300' + (s ? '' : '&key=' + encodeURIComponent(cfg.apiKey)), {
      headers: s ? { authorization: 'Bearer ' + s.idToken } : {},
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (body) {
      if (!body || !body.documents) return;
      body.documents.forEach(function (d) {
        var id = d.name.split('/').pop();
        var p = d.fields && d.fields.priority && d.fields.priority.stringValue;
        if (p && RANK[p] !== undefined) paint(id, p);
      });
      count();
    }).catch(function () { /* the page is complete without it */ });
  }

  // The left list marks where you are.
  var marks = [].slice.call(document.querySelectorAll('.side a'));
  window.addEventListener('scroll', function () {
    var pane = document.querySelector('.pane:not([hidden])');
    if (!pane) return;
    var best = null;
    pane.querySelectorAll('h2').forEach(function (h) {
      if (h.getBoundingClientRect().top < 140) best = h.id;
    });
    marks.forEach(function (a) { a.classList.toggle('here', a.dataset.sec === best); });
  }, { passive: true });
}());
</script>`;

const html = [
  '<title>EARB tool backlog</title>',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<link rel="icon" href="data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
    + '<rect width="32" height="32" rx="7" fill="#2a4b8d"/>'
    + '<rect x="7" y="20" width="4" height="6" rx="1" fill="#9ec4ff"/>'
    + '<rect x="14" y="14" width="4" height="12" rx="1" fill="#7fd39b"/>'
    + '<rect x="21" y="7" width="4" height="19" rx="1" fill="#ffd479"/></svg>') + '">',
  STYLE,
  // Written by deploy/publish-preview.sh into the published site, and absent here, so the key
  // this page needs to reach the store never goes into the repository.
  '<script src="backlog-config.js"></script>',
  '<header class="top"><div class="top-in">',
  `<div class="brand">EARB self-assessment <span>&middot; backlog &middot; ${esc(updated)}</span></div>`,
  '<nav class="tabs" role="tablist">',
  tracks.map((t) => `<button class="tab" role="tab" data-track="${esc(t.id)}" aria-selected="false">`
    + `${esc(t.title)}<span class="c">0</span></button>`).join(''),
  '</nav></div></header>',
  '<div class="cols">', panes, '</div>',
  '<footer class="foot"><div class="foot-in">',
  [
    ['doing', 'doing'], ['next', 'next'], ['wait', 'waiting on somebody'],
    ['later', 'later'], ['bug', 'broken'], ['question', 'open questions'], ['done', 'done'],
  ].map(([k, label]) => `<button type="button" data-filter="${k}" aria-pressed="false">`
    + `<b id="n-${k}">0</b> ${esc(label)}</button>`).join(''),
  '<span class="sp" id="signed"></span>',
  '</div></footer>',
  SCRIPT,
].join('\n');

writeFileSync(out, html + '\n');
const open = items.filter((i) => i.status !== 'done').length;
console.log(`backlog.html  ${items.length} items, ${open} open, ${items.length - open} done, `
  + `${tracks.length} tabs, ${sections.length} sections`);
