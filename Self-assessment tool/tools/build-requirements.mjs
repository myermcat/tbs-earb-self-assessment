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
/* One requirement per row: the number, the sentence, the state, then who owes it and why it
   is there. The number is what gets quoted, so it is first and it is monospaced. */
.reqs{display:flex;flex-direction:column;gap:0}
.req{display:grid;grid-template-columns:3.2rem 1fr auto;gap:.2rem .6rem;
padding:.6rem .1rem;border-bottom:1px solid var(--line)}
.req:last-child{border-bottom:0}
.req-id{grid-column:1;grid-row:1;font-size:.78rem;color:var(--ink-3);padding-top:.1rem}
.req-t{grid-column:2;grid-row:1;font-weight:600}
.req .st{grid-column:3;grid-row:1;justify-self:end}
.req-owner{grid-column:2;grid-row:2;font-size:.74rem;font-weight:700;letter-spacing:.04em;
text-transform:uppercase;color:var(--warn)}
.req-note{grid-column:2;font-size:.85rem;color:var(--ink-2)}
.lead{font-size:1rem;color:var(--ink-2);max-width:74ch;margin:.2rem 0 .8rem}
.legend{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin:0 0 1.4rem;
padding:.5rem .7rem;background:var(--surface);border:1px solid var(--line);border-radius:10px}
.legend .muted{font-size:.8rem}
.nav-kpi b{margin-right:.15rem}
footer a{color:var(--accent)}
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

/**
 * Renders NOTES/requirements.html from NOTES/requirements.data.mjs.
 *
 *   node tools/build-requirements.mjs
 *
 * Generated rather than typed, for the reason in the data file: ids get quoted in
 * conversation, states change as decisions are made, and owners move. Maintaining those three
 * by hand inside prose is how a requirements document stops being true.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { intro, sections, updated } from '../NOTES/requirements.data.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'NOTES', 'requirements.html');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const STATE = {
  built: ['Built', 'st-done'],
  agreed: ['Agreed', 'st-next'],
  proposed: ['Proposed', 'st-wait'],
  open: ['Open', 'st-later'],
};

const count = (st) => sections.reduce((n, s) => n + s.reqs.filter((r) => r.state === st).length, 0);
const total = sections.reduce((n, s) => n + s.reqs.length, 0);

function req(r) {
  const [label, cls] = STATE[r.state] ?? ['?', 'st-later'];
  return [
    '<div class="req">',
    `<span class="req-id mono">${esc(r.id)}</span>`,
    `<span class="req-t">${esc(r.text)}</span>`,
    `<span class="st ${cls}">${label}</span>`,
    r.owner ? `<span class="req-owner">${esc(r.owner === 'ours' ? 'ours to answer' : `${r.owner} owes this`)}</span>` : '',
    r.note ? `<span class="req-note">${esc(r.note)}</span>` : '',
    '</div>',
  ].filter(Boolean).join('\n');
}

const html = [
  '<title>EARB tool requirements</title>',
  '<link rel="icon" href="data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<rect width="32" height="32" rx="7" fill="#1f6b3c"/>' +
      '<path d="M9 17l5 5 9-11" fill="none" stroke="#eaf7ef" stroke-width="3.4" ' +
      'stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>',
    ) + '">',
  STYLE,
  '<div class="head"><div class="head-in"><h1>EARB self-assessment: requirements</h1>',
  `<p class="sub">Updated ${esc(updated)}. ${total} requirements.</p></div></div>`,

  '<nav class="topnav"><div class="topnav-in">',
  [
    ['built', 'built'],
    ['agreed', 'agreed, not built'],
    ['proposed', 'proposed'],
    ['open', 'open'],
  ].map(([st, label]) => `<span class="nav-kpi"><b>${count(st)}</b><span>${label}</span></span>`).join('\n'),
  '<span class="nav-sep"></span>',
  sections.map((s) => `<a class="nav-lay" href="#${s.id}">${esc(s.title)}</a>`).join('\n'),
  '</div></nav>',

  '<div class="wrap">',
  ...intro.map((p) => `<p class="lead">${esc(p)}</p>`),
  '<div class="legend small">',
  Object.entries(STATE).map(([, [label, cls]]) => `<span class="st ${cls}">${label}</span>`).join(' '),
  '<span class="muted">Built is in the tool today. Agreed is decided and not built. Proposed is our reading, waiting on somebody. Open is undecided.</span>',
  '</div>',

  ...sections.map((s, i) => [
    `<h2 id="${s.id}">${i + 1}. ${esc(s.title)}</h2>`,
    `<p class="hint">${esc(s.lead)}</p>`,
    '<div class="card reqs">',
    s.reqs.map(req).join('\n'),
    '</div>',
  ].join('\n')),

  `<footer>Generated from NOTES/requirements.data.mjs by tools/build-requirements.mjs. The backlog is <a href="backlog.html">next door</a>.</footer></div>`,
].join('\n');

writeFileSync(out, html + '\n');
console.log(`requirements.html  ${total} requirements: ${count('built')} built, ${count('agreed')} agreed, ${count('proposed')} proposed, ${count('open')} open`);
