/**
 * What the site actually serves, checked after a publish.
 *
 * Every other gate in this repository reads a local build. That is one step short of the thing
 * anybody opens: GitHub Pages serves the previous build for a minute or two after a push, a
 * publish can copy the wrong file into the wrong folder, and neither shows up in `npm test`.
 * This waits until the served bytes are the bytes that were just built, and then asks each
 * page what it renders.
 *
 * It reaches the network, so it is not in `npm test` and never runs in CI. `publish-preview.sh`
 * runs it, and `npm run check:published` runs it by hand.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';

const BASE = 'https://myermcat.github.io/tbs-earb-self-assessment-preview';
const PAGES = [
  { name: 'submitter', path: '', built: 'dist/index.html', demo: false },
  { name: 'assessor', path: 'assessor/', built: 'dist/assessor.html', demo: false },
  { name: 'demonstration', path: 'demo/', built: 'dist/demo.html', demo: true },
];
/** Pages is usually a minute. Ten is generous and still ends. */
const WAIT_MS = 10 * 60 * 1000;

let bad = 0;
const ok = (cond, label, detail) => {
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${label}${cond || !detail ? '' : `\n        ${detail}`}`);
  if (!cond) bad++;
};

const digest = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * What a reader sees.
 *
 * Not `body.textContent`. The whole bundle is an inline script inside the body, so that reads
 * the source of the tool and matches every string the tool can ever print. It reported that the
 * two real pages were listing invented submissions, on pages that list nothing of the kind.
 */
function visibleText(root) {
  const walk = root.ownerDocument.createTreeWalker(root, 4);
  const out = [];
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    let hidden = false;
    for (let p = n.parentElement; p; p = p.parentElement) {
      if (p.tagName === 'SCRIPT' || p.tagName === 'STYLE' || p.tagName === 'TEMPLATE' || p.hidden) {
        hidden = true;
        break;
      }
    }
    if (!hidden) out.push(n.nodeValue);
  }
  return out.join(' ').replace(/\s+/g, ' ');
}

/** The served page, once it is the one that was just built. */
async function fetchWhenCurrent(page) {
  const want = digest(readFileSync(page.built, 'utf8'));
  const until = Date.now() + WAIT_MS;
  let served = '';
  for (;;) {
    const res = await fetch(`${BASE}/${page.path}?cb=${process.pid}-${Date.now()}`, {
      cache: 'no-store',
    });
    served = await res.text();
    if (digest(served) === want) return { html: served, current: true };
    if (Date.now() > until) return { html: served, current: false };
    await sleep(15000);
  }
}

for (const page of PAGES) {
  console.log(`--- the ${page.name} page, at ${BASE}/${page.path}`);
  const { html, current } = await fetchWhenCurrent(page);
  ok(current, 'is serving the build that was just published',
    current ? '' : 'ten minutes went by and the served page never matched the local build');

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: `${BASE}/${page.path}`,
    pretendToBeVisual: true,
  });
  // A demonstration page that reaches the store is the defect this whole page exists to avoid,
  // so the request fails here rather than succeeding quietly against the real one.
  dom.window.fetch = () => Promise.reject(new Error('the page reached for the network'));
  await sleep(600);

  const doc = dom.window.document;
  const text = visibleText(doc.body);
  const banner = doc.querySelector('.demo-banner');

  if (page.demo) {
    ok(!!banner, 'says on its face that it is a demonstration');
    ok(text.includes('Bureau of Illustrative Inspections'), 'lists the invented submissions');
    ok(!/Sign in|Se connecter/.test(text), 'opens without asking anybody to sign in');
    ok(!/AIzaSy/.test(html), 'carries no store credentials at all');
  } else {
    ok(!banner, 'does not claim to be a demonstration');
    ok(!text.includes('Bureau of Illustrative Inspections'), 'lists no invented submission');
  }
  dom.window.close();
}

console.log(bad ? `\n${bad} check${bad === 1 ? '' : 's'} failed on the published site` : '\nthe published site behaves');
process.exit(bad ? 1 : 0);
