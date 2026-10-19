/**
 * The demonstration page, opened in a browser that has already used the real ones.
 *
 * All three published pages are one origin, so they are one localStorage. Reported as: when I
 * open your demo link it opens a popup window each time, "This assessment is no longer in the
 * shared store", and "4 from the pool" against "6 submissions open".
 *
 * What was happening was worse than what was reported. The demonstration was reading the
 * submitter's draft and the assessor's saved session, and it was writing over both: its four
 * invented submissions went into the real assessor's session, where the real page restored them
 * on every load for ever.
 *
 * This seeds the bare names the real pages write, boots the demonstration over them, and fails
 * on any name it touches outside its own namespace.
 */
import { readdir, readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

let fails = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) { fails++; console.log(`  FAIL  ${name} ${extra}`); } else console.log(`  ok    ${name}`);
};

const html = await readFile('dist/demo.html', 'utf8');
const MINE = 'gc-arch-assessment:demo:';

/** A real submission, in the shape the real pages keep one. */
const real = {
  fileType: 'gc-arch-assessment', formatVersion: 1, id: 'REALDOCAAAA', ref: 'RL01',
  rubric: { id: 'other-set', version: '0.9', title: 'An older set' },
  initiative: {
    name: 'Coastal Permits Replacement', department: 'A Real Department',
    contact: 'someone@example.gc.ca', lifecycleStage: 'beta', summary: '',
    classification: 'Unclassified',
  },
  answers: {},
  meta: {
    createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-02T09:00:00.000Z',
    submittedAt: '2026-09-02T09:00:00.000Z', appVersion: '0.1.0',
  },
};

/** What the two real pages leave in this browser. */
const bare = {
  'gc-arch-assessment:draft': JSON.stringify(real),
  'gc-arch-assessment:audit-session': JSON.stringify([{ file: 'coastal.json', a: real }]),
  'gc-arch-assessment:signer': JSON.stringify({ name: 'A Real Person', email: 'a.person@tbs-sct.gc.ca' }),
  'gc-arch-assessment:side': 'assess',
  'gc-arch-assessment:lang': 'fr',
  'gc-arch-assessment:rubric-current': 'set-0',
};

const touched = [];
/**
 * Put the real accessors back before this file reads storage itself. Without it the assertions
 * below land in `touched` and the namespace check fails on its own verification, which is what
 * the first run of this file did.
 */
const unwrap = [];
/** Everything the page tried to fetch, so "it reaches nothing" can be checked and not asserted. */
const reached = [];

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://example.gc.ca/demo/',
  pretendToBeVisual: true,
  beforeParse(w) {
    for (const [k, v] of Object.entries(bare)) w.localStorage.setItem(k, v);
    /**
     * localStorage and sessionStorage are one interface, so one wrapper records both, and it
     * records reads as well as writes: the dialog people saw came from a read.
     */
    const proto = w.Storage.prototype;
    for (const call of ['getItem', 'setItem', 'removeItem']) {
      const was = proto[call];
      unwrap.push(() => { proto[call] = was; });
      proto[call] = function wrapped(name, ...rest) {
        touched.push(String(name));
        return was.call(this, name, ...rest);
      };
    }
    w.scrollTo = () => {};
    w.alert = () => {};
    w.print = () => {};
    w.fetch = (...args) => {
      reached.push(String(args[0]));
      return Promise.reject(new Error('the demonstration reached for the network'));
    };
  },
});

const { window } = dom;
const { document } = window;
const app = document.getElementById('app');
await new Promise((r) => setTimeout(r, 400));

const view = () => (app?.textContent ?? '').replace(/\s+/g, ' ');
const dialogs = () => [...document.querySelectorAll('dialog')].map((d) => d.textContent).join(' ');

ok('it opens in the language the real pages were left in',
   document.documentElement.getAttribute('lang') === 'fr',
   document.documentElement.getAttribute('lang'));
ok('the demonstration lists its own invented submissions',
   view().includes('Bureau of Illustrative Inspections'));
ok('and says on its face that it is a demonstration', !!document.querySelector('.demo-banner'));
ok('nothing on the page names the real submission',
   !view().includes('Coastal Permits Replacement'), view().slice(0, 160));
/**
 * Every dialog, and not one guessed class. A selector that matches nothing makes an assertion
 * about what a dialog says pass on the build that was showing the dialog.
 */
ok('no window about an assessment that has gone from the store',
   !/no longer in the shared store/.test(dialogs()), dialogs().slice(0, 120));
// French, because the browser this test seeds had been left in French, which is the whole
// point of the one name that crosses.
// Counted off the table rather than written in, so widening the invented pool does not make it
// fail for the one reason it is not testing. row-open, because the banded list also puts a
// group row in the body and those are not submissions.
// this fail for the one reason it is not testing.
{
  const rows = document.querySelectorAll('.triage tbody tr.row-open');
  const said = view().replace(/\s+/g, ' ').match(/Soumissions\s+(\d+)/);
  ok('the count beside the heading is the count of what is in the table',
     !!said && Number(said[1]) === rows.length && rows.length > 1,
     `heading says ${said?.[1]}, table holds ${rows.length}`);
}

// Everything the page does is in `touched` by now, and nothing this file does should be.
const byThePage = [...new Set(touched)];
for (const put of unwrap) put();

for (const [k, v] of Object.entries(bare)) {
  ok(`it leaves ${k.replace('gc-arch-assessment:', '')} exactly as it found it`,
     window.localStorage.getItem(k) === v);
}

const extra = [];
for (let i = 0; i < window.localStorage.length; i++) {
  const k = window.localStorage.key(i);
  if (!k.startsWith(MINE) && !(k in bare)) extra.push(k);
}
ok('it creates no name outside its own namespace', extra.length === 0, extra.join(', '));

// Read from the snapshot, which covers everything the page did including whatever the
// assertions above drove it to do.
/**
 * One name crosses, and it is named here.
 *
 * A demonstration reads the real pages' language choice when it has none of its own, because
 * serving English to somebody who asked for French is the expensive failure for a Government of
 * Canada tool. It never writes it, which the value check above is what proves.
 */
const SHARED = ['gc-arch-assessment:lang'];
const strays = byThePage.filter((k) => !k.startsWith(MINE) && !SHARED.includes(k));
ok('and it touched no name outside its own namespace, beyond the one it is allowed',
   strays.length === 0, strays.join(', '));
ok('which it did read, so the allowance is not dead wording',
   byThePage.includes(SHARED[0]), byThePage.join(', '));
ok('it touched storage at all, so the check above means something', byThePage.length > 0);

/**
 * A name on a path this test never walks.
 *
 * The wrapper above sees only what booting the page touches, which is seven of the names this
 * tool stores: the signer's name waits for a dialog, and the Firebase ones need a build with a
 * project. A demonstration build folds the namespace down to one literal, so the built page
 * answers the whole question whether or not anybody reached the code.
 *
 * The count used to be written out as a number here and it went stale the day the sign-in link
 * added a name. It is counted below now, so it cannot say one thing while the code says
 * another.
 */
const stems = [...new Set([...html.matchAll(/gc-arch-assessment:(?!demo:)[a-z-]*/g)].map((m) => m[0]))]
  .filter((k) => !SHARED.includes(k));
ok('every name in the built page comes from the one helper, beyond the one allowance',
   stems.length === 0, stems.join(', '));
ok('and the allowance is the only bare name in it, so it stays one',
   [...new Set([...html.matchAll(/gc-arch-assessment:(?!demo:)[a-z-]*/g)].map((m) => m[0]))].length === 1);
ok('and the namespace is in the page, so the check above means something',
   html.includes(MINE));

/**
 * Every name this tool stores goes through the one helper, counted rather than stated.
 *
 * A comment above used to say how many there were and was wrong within a week. This reads the
 * source, so the day somebody adds a name without the helper it is the count that disagrees.
 */
const sources = await Promise.all(
  (await readdir('src')).filter((f) => f.endsWith('.ts')).map((f) => readFile(`src/${f}`, 'utf8')),
);
const named = [...new Set(sources.flatMap((src) =>
  [...src.matchAll(/storeKey\('([a-z-]+)'\)/g)].map((m) => m[1])))].sort();
ok('every stored name is made by the helper, and there is more than one',
   named.length >= 10, `${named.length}: ${named.join(', ')}`);

/**
 * THE POOL LOOKS LIKE A PORTFOLIO AND NOT LIKE A GENERATOR.
 *
 * Everything below was a column with one value down the page at some point. Eight records at
 * three shapes gave three scores twenty times, every row was Unclassified, every row had
 * nothing attached, and the five category readings printed the same average and the same names
 * under all five. None of that fails a test on its own, and all of it reads to a room as a tool
 * that cannot tell its own records apart.
 */
{
  const rows = [...document.querySelectorAll('.triage tbody tr.row-open')];
  const col = (i) => rows.map((r) => r.children[i]?.textContent?.trim() ?? '');
  const spread = (xs) => new Set(xs.filter(Boolean)).size;

  ok('the pool is twenty records', rows.length === 20, String(rows.length));
  ok('at more than three stages of life', spread(col(5)) >= 6, [...new Set(col(5))].join(', '));
  ok('carrying more than one marking', spread(col(3)) === 3, [...new Set(col(3))].join(', '));
  ok('and more than one answer in the evidence column', spread(col(9)) > 2,
     [...new Set(col(9))].join(', '));

  const scores = col(6).map(Number).filter((n) => !Number.isNaN(n));
  ok('the scores run across the range and not around one number',
     Math.max(...scores) - Math.min(...scores) > 5,
     `${Math.min(...scores)} to ${Math.max(...scores)}`);

  /**
   * Counted from the chips rather than from commas.
   *
   * Each assessor on a row is its own element now, because two full names run together were
   * four lines of plain text that had to be read to be counted. Splitting the cell's text on
   * a comma stopped working the moment the comma went, and it would have gone on passing if
   * the names had happened to contain one.
   */
  const auditCells = [...document.querySelectorAll('.triage tbody tr.row-open')]
    .map((r) => [...(r.children[11]?.querySelectorAll('.audit-chip-name') ?? [])]
      .map((n) => n.textContent.trim()));
  const audited = auditCells.filter((names) => names.length);
  ok('several have been read, by more than two people', audited.length >= 5
     && spread(audited.flat()) >= 3, audited.map((n) => n.join('+')).join(' | '));
  ok('and one of them by three', audited.some((names) => names.length === 3),
     audited.map((n) => n.join('+')).join(' | '));

  /**
   * THE INVENTED ASSESSORS HAVE TO READ AS INVENTED, AND NOT MERELY BE INVENTED.
   *
   * Two goes at this. They first carried the first names of two people who will be in the room
   * the day this is shown, against opinions those two never held. Changing them to a different
   * set of ordinary names fixed nothing, because a room cannot tell which plausible names are
   * real and a plausible name is a claim that somebody said this.
   *
   * So the test is an allow-list and not a deny-list. A deny-list passes every name nobody
   * thought to write down, which is how the second version passed. Adding a name here is a
   * decision that it announces itself the way Office of Example Operations does.
   */
  const INVENTED = ['Reviewer One', 'Reviewer Two', 'Reviewer Three'];
  // Off the chips read above, for the same reason they are.
  const names = [...new Set(auditCells.flat())];
  ok('every assessor in the column is one of the invented ones',
     names.length > 0 && names.every((n) => INVENTED.includes(n)), names.join(' | '));

  /**
   * The way back out, asked for after the door in: somebody shown the demonstration had no
   * route to the real tool from inside it except retyping an address. There is nothing to sign
   * out of, because nobody signed in.
   */
  const out = document.querySelector('.demo-banner .demo-out');
  ok('the demonstration says how to leave it', !!out, document.querySelector('.demo-banner')?.textContent ?? 'no banner');
  ok('pointing at the real page beside this one', out?.getAttribute('href') === '/assessor/',
     out?.getAttribute('href') ?? 'none');
  ok('and it is on the strip that is on every screen',
     !!document.querySelector('.chrome .demo-banner .demo-out'));
}

/**
 * SETTINGS IS REACHABLE ON THE DEMONSTRATION, AND IT WAS HANDING OUT REAL DOCUMENTS.
 *
 * The demonstration asks nobody to sign in, so the gate that holds the assessor's settings shut
 * is open here by design, and the gear is on every screen. Two panes behind it offered the real
 * thing:
 *
 * The team's working pages, the backlog and the requirements, which name colleagues and the
 * state of internal decisions. Their test was "no project configured, or an admin", and a
 * demonstration has no project configured. Having no project is not the same as being trusted.
 *
 * And the question set as a Google Sheet, which anybody holding the link can write comments
 * into. That card had no test on it at all.
 *
 * The demonstration's address is sent to people outside the team and it is published with no
 * sign-in, so every one of those was one click from a stranger.
 */
{
  const gear = [...document.querySelectorAll('button.icon-btn')]
    .find((b) => /settings|param/i.test(`${b.getAttribute('aria-label') ?? ''} ${b.getAttribute('title') ?? ''}`));
  ok('the demonstration has settings on it, so the checks below mean something', !!gear,
     [...document.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.textContent?.trim().slice(0, 18)).join(' | ').slice(0, 300));
  gear?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));

  /**
   * Re-queried on every call. Switching pane repaints the rail, so rows captured once are
   * detached nodes from the second click onward and every click after the first does nothing.
   */
  const open = async (label) => {
    const row = [...document.querySelectorAll('.set-navrow')]
      .find((b) => new RegExp(label, 'i').test(b.textContent ?? ''));
    row?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 150));
    return !!row;
  };

  ok('and more than one pane in it', document.querySelectorAll('.set-navrow').length > 1,
     String(document.querySelectorAll('.set-navrow').length));
  await open('documentation');
  const docsHrefs = [...document.querySelectorAll('.set-pane a')].map((a) => a.getAttribute('href') ?? '');
  ok('documentation offers the explanation that was made to be shown',
     docsHrefs.some((h) => /domains-and-categories/.test(h)), docsHrefs.join(' | '));
  ok('and not the spreadsheet anybody with the link can comment on',
     !docsHrefs.some((h) => /docs\.google\.com/.test(h)), docsHrefs.join(' | '));

  await open('this build|cette version');
  const buildText = document.querySelector('.set-pane')?.textContent ?? '';
  const buildHrefs = [...document.querySelectorAll('.set-pane a')].map((a) => a.getAttribute('href') ?? '');
  ok('this build offers neither the backlog nor the requirements',
     !buildHrefs.some((h) => /backlog\.html|requirements\.html/.test(h)), buildHrefs.join(' | '));
  ok('and says the store is none, naming no host',
     /sends nothing and keeps nothing/.test(buildText) && !/Writing to/.test(buildText),
     buildText.slice(0, 200));

  /**
   * isHosted() is true on a demonstration and endpointHost() is empty on one, so the footer
   * read "What you send is kept at ." on the page whose promise is that nothing is kept.
   */
  const foot = document.querySelector('.sitefoot')?.textContent ?? '';
  ok('and the footer says nothing is kept rather than trailing off',
     /Nothing on this page is kept anywhere/.test(foot) && !/kept at \./.test(foot),
     foot.slice(0, 120));

  ok('and none of that reached the network', reached.length === 0, reached.join(' | '));

  // Back to the list, because the checks below read it and settings is still on screen.
  [...document.querySelectorAll('.chrome button, .crumbs button, .crumbs a')]
    .find((b) => /submissions|soumissions/i.test(b.textContent ?? ''))
    ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 250));
  ok('and the list is back on screen afterwards',
     document.querySelectorAll('.triage tbody tr.row-open').length === 20,
     String(document.querySelectorAll('.triage tbody tr.row-open').length));
}

/**
 * THE INVENTED POOL CARRIES INVENTED AUDITS, AND READING THEM REACHES NOTHING.
 *
 * The audits are the point of the demonstration now: four assessors are shown it on 22 October
 * and seven of the twenty submissions have been read, some by people who disagree. The screens that
 * say so were both dark, for two different reasons, and only one of them was the one anybody
 * expected.
 *
 * isHosted() is TRUE in a demonstration - store.ts has it as isDemo() || isConfigured() ||
 * ENDPOINT - so the hosted guard on these reads was never what stopped them. readListAudits
 * was stopped by its account check; readAudits was stopped by nothing at all and fell through
 * to a real request, from the one build whose whole promise is that no path through it reaches
 * real work. That is the half worth a test, because the guard reads as though it covers it.
 */
{
  const rows = [...document.querySelectorAll('.triage tbody tr.row-open')];
  const chips = (r) => (r.children[11]?.querySelectorAll('.audit-chip') ?? []).length;
  const audited = rows.map((r) => r.children[11]?.textContent?.trim() ?? '');
  ok('the invented pool says who audited what', rows.some((r) => chips(r) > 0),
     audited.join(' | '));
  ok('including one two people have both read', rows.some((r) => chips(r) > 1),
     audited.join(' | '));
  ok('and the rest honestly say nobody has', audited.some((t) => /Nobody yet/.test(t)),
     audited.join(' | '));

  const before = reached.length;
  const two = rows.find((r) => chips(r) > 1);
  two?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  const said = app.textContent;
  ok('opening one shows what the other assessors wrote on it',
     document.querySelectorAll('.other-audit').length > 0,
     String(document.querySelectorAll('.other-audit').length));
  ok('and marks the questions they wrote on', document.querySelectorAll('.audit-row .q-faces').length > 0,
     String(document.querySelectorAll('.audit-row .q-faces').length));
  ok('and offers the filter onto just those', /Audited by others/.test(said), said.slice(0, 120));
  ok('and none of it reached the network', reached.length === before,
     reached.slice(before).join(' | '));
}

ok('the demonstration reached nothing at all, from first paint to here',
   reached.length === 0, reached.join(' | '));

window.close();
console.log(fails ? `\n${fails} demonstration storage check(s) failed\n` : '\nthe demonstration keeps to itself\n');
process.exit(fails ? 1 : 0);
