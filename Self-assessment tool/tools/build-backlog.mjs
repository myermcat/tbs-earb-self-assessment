/**
 * Renders NOTES/backlog.html from NOTES/backlog.data.mjs.
 *
 *   node tools/build-backlog.mjs
 *
 * The point of generating it: finishing an item is a one-word status change, and this file
 * decides where it then appears. Done items are collected into a permanent Done section and
 * left out of the open lists, so the open lists stay short without anything being deleted.
 * Items waiting on a person are gathered into their own list as well as shown in place.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { quick, layers, resolved, questions, updated } from '../NOTES/backlog.data.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'NOTES', 'backlog.html');

const STYLE = `<style>
:root{color-scheme:light;--bg:#f7f8fa;--surface:#fff;--surface-2:#f1f3f6;--line:#e2e6ec;--line-2:#cdd4dd;
--ink:#16191d;--ink-2:#4a5361;--ink-3:#79828f;--accent:#2a4b8d;--accent-soft:#eaf0fb;--accent-line:#b9caea;
--good:#1f6b3c;--good-bg:#e9f4ed;--warn:#a8620a;--warn-bg:#fdf3e3;--mono:ui-monospace,SFMono-Regular,Menlo,monospace;
--chrome:#e7ebf1e6;--chrome-line:#c6cfda}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#101216;--surface:#191c22;--surface-2:#21252d;
--line:#2b303a;--line-2:#3a4150;--ink:#e8eaee;--ink-2:#a8b0bd;--ink-3:#7b8492;--accent:#6f96e0;
--accent-soft:#1b2436;--accent-line:#2f4570;--good:#5fbf82;--good-bg:#14251b;--warn:#e0a34a;--warn-bg:#2a2113;
--chrome:#1e222ae6;--chrome-line:#414957}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1020px;margin:0 auto;padding:.4rem 1.2rem 5rem}
/* The title band and the pinned bar both run the full width of the window, the way a header
   does. The text inside them lines up with the column below. */
.head{background:var(--surface);border-bottom:1px solid var(--line)}
.head-in{max-width:1020px;margin:0 auto;padding:1.6rem 1.2rem 1rem}
.head h1{margin:0 0 .2rem}
.head .sub{margin:0}
h1{font-size:1.9rem;letter-spacing:-.02em;margin:0 0 .3rem}
.sub{color:var(--ink-2);margin:0 0 1.5rem;max-width:70ch}
h2{font-size:1.15rem;margin:2.3rem 0 .6rem;display:flex;align-items:baseline;gap:.6rem;flex-wrap:wrap}
h2 .owner{font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);
border:1px solid var(--line-2);border-radius:999px;padding:.05rem .5rem}
.hint{color:var(--ink-3);font-size:.85rem;margin:-.35rem 0 .7rem}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:.55rem;margin:0 0 1.6rem}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:.6rem .75rem}
.kpi b{display:block;font-family:var(--mono);font-size:1.45rem;line-height:1.1}
.kpi span{font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:700}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.card.quick{border-left:3px solid var(--accent)}
details.grp{border-top:1px solid var(--line)}
details.grp:first-child{border-top:0}
summary.row{cursor:pointer;list-style:none;display:grid;grid-template-columns:1rem 1fr auto;gap:.15rem .7rem;
padding:.7rem .9rem;align-items:center}
summary.row::-webkit-details-marker{display:none}
summary.row::before{content:'';width:0;height:0;border-left:5px solid var(--ink-3);
border-top:4px solid transparent;border-bottom:4px solid transparent;transition:transform .15s;justify-self:center}
details[open]>summary.row::before{transform:rotate(90deg)}
summary.row .t{font-weight:650;font-size:.95rem}
summary.row .w{grid-column:2;color:var(--ink-2);font-size:.84rem;max-width:72ch}
.leaf{display:grid;grid-template-columns:1rem 1fr auto;gap:.15rem .7rem;padding:.55rem .9rem}
.leaf.solo{border-top:1px solid var(--line)}
.leaf .t{grid-column:2;font-weight:600;font-size:.9rem}
.leaf .w{grid-column:2;color:var(--ink-2);font-size:.82rem;max-width:72ch}
.subs{background:var(--surface-2);padding:.15rem 0 .35rem;border-top:1px solid var(--line)}
.subs .leaf{padding-left:2.1rem}
.n{grid-column:3;justify-self:end;font-family:var(--mono);font-size:.68rem;color:var(--ink-3)}
.st{grid-column:3;grid-row:1;justify-self:end;font-size:.66rem;font-weight:700;letter-spacing:.06em;
text-transform:uppercase;border:1px solid;border-radius:999px;padding:.08rem .45rem;white-space:nowrap;height:fit-content}
.st-done{color:var(--good);border-color:var(--good);background:var(--good-bg)}
.st-next{color:var(--accent);border-color:var(--accent-line);background:var(--accent-soft)}
.st-wait{color:var(--warn);border-color:var(--warn);background:var(--warn-bg)}
.st-later{color:var(--ink-3);border-color:var(--line-2);background:var(--surface-2)}
.callout{background:var(--good-bg);border-left:3px solid var(--good);border-radius:0 8px 8px 0;padding:.55rem .8rem;margin:.45rem 0 0}
.callout .q{font-weight:650;font-size:.92rem;margin-bottom:.1rem}
.callout .a{font-size:.85rem;color:var(--ink-2)}
.callout .a b{color:var(--good)}
table{border-collapse:collapse;width:100%;font-size:.87rem;background:var(--surface)}
th,td{text-align:left;padding:.5rem .7rem;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3)}
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:10px}
footer{margin-top:3rem;color:var(--ink-3);font-size:.8rem}
.done-layer{font-size:.66rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.wait-row .t{font-weight:600}
.done-card .leaf{opacity:.92}
/* The pinned bar is the navigation. The counts are links, the layers are links, and it stays
   put so no section has to be hunted for. */
.topnav{position:sticky;top:0;z-index:20;margin:0 0 1.4rem;padding:.5rem 0;
background:var(--chrome);border-bottom:1px solid var(--chrome-line);backdrop-filter:saturate(1.4) blur(6px)}
.topnav-in{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;
max-width:1020px;margin:0 auto;padding:0 1.2rem}
.nav-kpi{display:flex;align-items:baseline;gap:.3rem;text-decoration:none;color:var(--ink-2);
background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:.16rem .6rem}
.nav-kpi b{font-family:var(--mono);font-size:.95rem;color:var(--ink)}
.nav-kpi span{font-size:.72rem}
.nav-kpi:hover,.nav-lay:hover{border-color:var(--accent-line);color:var(--accent)}
.nav-sep{width:1px;height:1.1rem;background:var(--line-2);margin:0 .2rem}
.nav-lay{font-size:.74rem;text-decoration:none;color:var(--ink-3);border:1px solid transparent;
border-radius:999px;padding:.16rem .45rem}
h2{scroll-margin-top:4.2rem}
h3{scroll-margin-top:4.2rem}
.done-fold{margin:.3rem 0 0}
.done-summary{cursor:pointer;display:flex;gap:.5rem;align-items:baseline;padding:.5rem .75rem;
background:var(--surface);border:1px solid var(--line);border-radius:10px;list-style:none}
.done-summary::-webkit-details-marker{display:none}
.done-summary::before{content:'\\25B8';color:var(--ink-3);font-size:.8rem}
.done-fold[open] .done-summary::before{content:'\\25BE'}
.done-summary:hover{border-color:var(--accent-line)}
.section-title{font-weight:650}
.h3sub{font-size:.98rem;margin:1.2rem 0 .5rem;color:var(--ink-2)}
.kpi a{color:inherit;text-decoration:none}
</style>`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LABEL = { next: 'Next', wait: 'Waiting', later: 'Later', done: 'Done' };

/** A leaf row. `solo` when it is not inside a group. */
function leaf(item, solo = false) {
  return [
    `<div class="leaf${solo ? ' solo' : ''}">`,
    `<span class="t">${esc(item.t)}</span><span class="st st-${item.status}">${LABEL[item.status]}</span>`,
    item.why ? `<span class="w">${esc(item.why)}</span>` : '',
    '</div>',
  ].join('\n');
}

/**
 * A group renders only the subitems that are still open. A group whose every subitem is done
 * disappears from the layer entirely: all of it is in Done.
 */
function group(g) {
  const subs = (g.subs ?? []).filter((s) => s.status !== 'done');
  if (!g.subs) return g.status === 'done' ? '' : leaf(g, true);
  if (!subs.length) return '';
  const status = subs.some((s) => s.status === 'next') ? 'next'
    : subs.some((s) => s.status === 'wait') ? 'wait' : 'later';
  return [
    '<details class="grp" open><summary class="row">',
    `<span class="t">${esc(g.t)}</span><span class="st st-${status}">${LABEL[status]}</span>`,
    g.why ? `<span class="w">${esc(g.why)}</span>` : '',
    '</summary><div class="subs">',
    subs.map((s) => leaf(s)).join('\n'),
    '</div></details>',
  ].join('\n');
}

/** Everything done, with the layer it came from, so the section reads as a record of the work. */
function doneItems() {
  const rows = [];
  const push = (layer, item) => { if (item.status === 'done') rows.push({ layer, item }); };
  for (const item of quick.items) push('Quick action', item);
  for (const l of layers) {
    for (const g of l.groups) {
      if (!g.subs) { push(l.title, g); continue; }
      push(l.title, g);
      for (const s of g.subs) push(l.title, s);
    }
  }
  // A group marked done is a heading over its own done subitems, so drop the heading. And an
  // item recorded in two places is still one piece of work, so keep the first mention only.
  const subTitles = new Set(layers.flatMap((l) => l.groups.flatMap((g) => (g.subs ?? []).map((s) => s.t))));
  const seen = new Set();
  return rows
    .filter((r) => !(r.item.subs && r.item.subs.some((s) => subTitles.has(s.t))))
    .filter((r) => (seen.has(r.item.t) ? false : (seen.add(r.item.t), true)));
}

function count(status) {
  let n = 0;
  const walk = (item) => { if (item.status === status) n++; };
  quick.items.forEach(walk);
  for (const l of layers) for (const g of l.groups) { walk(g); (g.subs ?? []).forEach(walk); }
  return n;
}

const done = doneItems();
/** Done, grouped by where the work came from, newest group first inside each. */
const doneByLayer = (rows) => {
  const order = [];
  const byLayer = new Map();
  for (const r of rows) {
    if (!byLayer.has(r.layer)) { byLayer.set(r.layer, []); order.push(r.layer); }
    byLayer.get(r.layer).unshift(r);      // newest first
  }
  return order.map((layer) => ({ layer, rows: byLayer.get(layer) }));
};
// `seen: true` marks work Dan had already seen on 1 September. Everything else is the
// changelog since that review, which is the list he should be walked through.
const doneNew = done.filter((r) => !r.item.seen);
const doneSeen = done.filter((r) => r.item.seen);
const doneRow = ({ item }) => [
  '<div class="leaf solo">',
  `<span class="t">${esc(item.t)}</span><span class="st st-done">Done</span>`,
  `<span class="w">${esc(item.why ?? '')}</span>`,
  '</div>',
].join('\n');
const openQuick = quick.items.filter((i) => i.status !== 'done');

const waiting = [];
for (const l of layers) {
  for (const g of l.groups) {
    const items = g.subs ? g.subs : [g];
    // Who owes the reply, which is not always whoever owns the layer.
    for (const it of items) if (it.status === 'wait') waiting.push({ layer: l.title, owner: it.owes ?? l.owner, item: it });
  }
}


const html = [
  '<title>EARB tool backlog</title>',
  // Drawn here rather than fetched: the page is one file and makes no requests.
  '<link rel="icon" href="data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<rect width="32" height="32" rx="7" fill="#2a4b8d"/>' +
      '<rect x="7" y="20" width="4" height="6" rx="1" fill="#9ec4ff"/>' +
      '<rect x="14" y="14" width="4" height="12" rx="1" fill="#7fd39b"/>' +
      '<rect x="21" y="7" width="4" height="19" rx="1" fill="#ffd479"/>' +
      '</svg>',
    ) + '">',
  STYLE,
  '<div class="head"><div class="head-in"><h1>EARB self-assessment: backlog</h1>',
  `<p class="sub">Updated ${esc(updated)}.</p></div></div>`,
  // The counts are the navigation: pinned, so every section is one click away from anywhere
  // on the page.
  '<nav class="topnav"><div class="topnav-in">',
  [
    ['#quick', String(count('next')), 'next'],
    ['#waiting', String(waiting.length), 'waiting on somebody'],
    ['#done', String(done.length), 'done'],
    ['#questions', String(questions.length), 'open questions'],
  ].map(([href, n, label]) => `<a class="nav-kpi" href="${href}"><b>${n}</b><span>${esc(label)}</span></a>`).join('\n'),
  '<span class="nav-sep"></span>',
  layers.map((l, i) => `<a class="nav-lay" href="#layer-${i}">${esc(l.title.replace('Interface: ', ''))}</a>`).join('\n'),
  `<a class="nav-lay" href="#resolved">Resolved</a>`,
  '</div></nav>',
  '<div class="wrap">',

  openQuick.length ? [
    `<h2 id="quick">${esc(quick.title)}</h2><p class="hint">${esc(quick.hint)}</p>`,
    '<div class="card quick">',
    openQuick.map((i) => leaf(i, true)).join('\n'),
    '</div>',
  ].join('\n') : '',

  waiting.length ? [
    '<h2 id="waiting">Waiting on somebody</h2><p class="hint">Chased, and not ours to finish. Each of these is also in its layer below.</p>',
    '<div class="tw"><table><thead><tr><th>Item</th><th>Who</th><th>Layer</th><th>Meanwhile</th></tr></thead><tbody>',
    waiting.map((w) => `<tr><td>${esc(w.item.t)}</td><td>${esc(w.owner)}</td><td>${esc(w.layer)}</td><td>${esc(w.item.why ?? '')}</td></tr>`).join('\n'),
    '</tbody></table></div>',
  ].join('\n') : '',

  ...layers.map((l, i) => {
    const body = l.groups.map(group).filter(Boolean).join('\n');
    if (!body) return '';
    return [
      `<h2 id="layer-${i}">${esc(l.title)} <span class="owner">${esc(l.owner)}</span></h2>`,
      '<div class="card">', body, '</div>',
    ].join('\n');
  }),

  '<h2 id="done">Done</h2>',
  `<p class="hint">Built and tested, kept for good, newest first. ${doneNew.length} items since Dan's review on 1 September.</p>`,
  // Closed by default: it is a record to open when somebody asks what changed, and it is
  // longer than everything above it put together.
  '<details class="done-fold"><summary class="done-summary">',
  `<span class="section-title">Everything done</span><span class="muted small">${done.length} items, by layer</span>`,
  '</summary>',
  doneByLayer(doneNew).map(({ layer, rows }) => [
    `<h3 class="h3sub">${esc(layer)} <span class="muted small">${rows.length}</span></h3>`,
    '<div class="card done-card">',
    rows.map(doneRow).join('\n'),
    '</div>',
  ].join('\n')).join('\n'),
  doneSeen.length ? [
    '<h3 class="h3sub">Already there when he reviewed it</h3>',
    '<div class="card done-card">',
    doneSeen.map(doneRow).join('\n'),
    '</div>',
  ].join('\n') : '',
  '</details>',

  '<h2 id="resolved">Resolved questions</h2><p class="hint">Settled, and how.</p>',
  resolved.map((r) => `<div class="callout"><div class="q">${esc(r.q)}</div><div class="a"><b>Resolved.</b> ${esc(r.a)}</div></div>`).join('\n'),

  '<h2 id="questions">Open questions</h2><p class="hint">Not work. Somebody owes an answer.</p>',
  '<div class="tw"><table><thead><tr><th>Question</th><th>Who owes it</th><th>Blocks</th><th>Meanwhile</th></tr></thead><tbody>',
  questions.map((q) => `<tr><td>${esc(q.q)}</td><td>${esc(q.who)}</td><td>${esc(q.blocks)}</td><td>${esc(q.meanwhile)}</td></tr>`).join('\n'),
  '</tbody></table></div>',

  `<footer>${count('next') + count('wait') + count('later')} open, ${done.length} done. Generated from NOTES/backlog.data.mjs by tools/build-backlog.mjs.</footer></div>`,
].filter(Boolean).join('\n');

writeFileSync(out, html + '\n');
console.log(`backlog.html  ${count('next')} next, ${waiting.length} waiting, ${count('later')} later, ${done.length} done`);
