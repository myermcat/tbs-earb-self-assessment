/**
 * The backlog page, and the one rule it broke on 1 October.
 *
 * NOTES/backlog.html is generated from NOTES/backlog.data.mjs by tools/build-backlog.mjs, and
 * until today nothing ran that builder except a person typing the command. npm test chains
 * fourteen suites and none of them touched it, so every rule about what the page shows was
 * enforced by nobody.
 *
 * What went wrong without it: the builder dropped any section with no open rows, and the same
 * list feeds the heading, the card and the link down the left, so all three went together. The
 * engine's Broken section held nine bugs, every one of them fixed, and the tab read as though
 * nothing had ever been broken in it. Reported in these words: do not remove sections in the
 * backlog when you are done with them. Where did the bugs section go.
 *
 *   node test/backlog.mjs
 *
 * The builder resolves its input and output from its own location rather than the working
 * directory, so each case here builds a throwaway tree in a temporary folder and never writes
 * anything inside the repository. The last check is the exception and the most useful one: it
 * rebuilds from the real data and compares, which catches a page committed one edit behind.
 */
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let fails = 0;
function ok(what, cond, detail = '') {
  if (!cond) fails++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${what}${cond || !detail ? '' : ` ${detail}`}`);
}

/** Builds a page from whatever data is handed in, in a folder of its own. */
async function build(data) {
  const dir = await mkdtemp(join(tmpdir(), 'earb-backlog-'));
  await mkdir(join(dir, 'tools'));
  await mkdir(join(dir, 'NOTES'));
  await copyFile(join(ROOT, 'tools', 'build-backlog.mjs'), join(dir, 'tools', 'build-backlog.mjs'));
  await writeFile(join(dir, 'NOTES', 'backlog.data.mjs'), data);
  const out = await run('node', [join(dir, 'tools', 'build-backlog.mjs')]).catch((e) => e);
  const html = await readFile(join(dir, 'NOTES', 'backlog.html'), 'utf8').catch(() => '');
  await rm(dir, { recursive: true, force: true });
  return { html, stdout: out.stdout ?? '', stderr: out.stderr ?? '' };
}

const item = (o) => ({
  kind: 'bug', status: 'open', priority: 'medium', owner: 'ours', golive: false,
  t: 'A thing', why: 'Because.', ...o,
});

const fixture = (items, sections) => `
export const updated = '2026-10-01';
export const tracks = [{ id: 'engine', title: 'The engine' }];
export const sections = ${JSON.stringify(sections)};
export const items = ${JSON.stringify(items)};
`;

const SECS = [
  { id: 'e-broken', track: 'engine', title: 'Broken' },
  { id: 'e-live', track: 'engine', title: 'Still going' },
  { id: 'e-never', track: 'engine', title: 'Never used' },
  { id: 'e-done', track: 'engine', title: 'Done' },
];

console.log('\nThe backlog page\n');

/* ---------- a section emptied by finishing its contents ---------------------------------- */
{
  const { html } = await build(fixture([
    item({ id: 'a', track: 'engine', section: 'e-broken', status: 'closed', closedAt: '2026-09-20T12:00:00-04:00' }),
    item({ id: 'b', track: 'engine', section: 'e-broken', status: 'closed', closedAt: '2026-09-20T12:00:00-04:00' }),
    item({ id: 'c', track: 'engine', section: 'e-live' }),
  ], SECS));

  /**
   * The whole point. All three of these left together before, which is why the tab looked like
   * a tab that had never had a bug in it.
   */
  ok('a section whose work is all finished keeps its heading',
     /<h2 id="s-engine-e-broken">Broken /.test(html));
  ok('and keeps its place in the list down the left',
     html.includes('data-sec="s-engine-e-broken"'));
  // Empty on purpose. Asked for in those words: placeholders stay empty, do not explain.
  ok('and leaves an empty placeholder rather than a sentence about itself',
     html.includes('<p class="settled"></p>'),
     (html.match(/<p class="settled">[^<]*/) ?? ['missing'])[0]);
  // Zero, because every other count on this page means what is still open, and one that meant
  // something else here would be the only number on the page that lied.
  ok('and its count still means what every other count on the page means',
     /<h2 id="s-engine-e-broken">Broken <span class="c">0<\/span>/.test(html));
  ok('a section with work left in it is untouched',
     /<h2 id="s-engine-e-live">Still going <span class="c">1<\/span>/.test(html)
     && html.includes('data-id="c"'));
  ok('and draws no note about being finished', (html.match(/class="settled"/g) ?? []).length === 1);

  /**
   * A section nobody has ever filed anything in is still dropped. Keeping a heading for one
   * would put an empty Broken on a tab where nothing has ever broken, which is not a record of
   * anything.
   */
  ok('a section nobody has ever used is still left out',
     !html.includes('s-engine-e-never'));
}

/* ---------- a subitem counts, even though it does not draw as a row ---------------------- */
{
  /**
   * Children draw tucked under their parent rather than as rows of their own, so the list the
   * builder reads to decide whether a section is finished leaves them out. Eleven sections in
   * the real file hold children and two hold more than eight, so a section could have claimed
   * its work was done while a subitem filed in it was still open.
   *
   * Legal on every other rule: the open child sits under an open parent, and that parent lives
   * in another section, which four real items do.
   */
  const { html, stderr } = await build(fixture([
    item({ id: 'done-one', track: 'engine', section: 'e-broken', status: 'closed', closedAt: '2026-09-20T12:00:00-04:00' }),
    item({ id: 'parent', track: 'engine', section: 'e-live' }),
    item({ id: 'kid', track: 'engine', section: 'e-broken', parent: 'parent' }),
  ], SECS));
  ok('the page builds at all', !!html, stderr.slice(0, 160));
  ok('a section with an unfinished subitem in it does not claim to be finished',
     !/<p class="settled">/.test(html), (html.match(/<p class="settled">[^<]*/) ?? [''])[0]);
}

/* ---------- the committed page is the data ----------------------------------------------- */
{
  /**
   * Rebuilt from the real file and compared byte for byte. Nothing in the suite ever did this,
   * so NOTES/backlog.html could sit one edit behind NOTES/backlog.data.mjs indefinitely and the
   * page everybody reads would be quietly wrong. It happened today.
   */
  const data = await readFile(join(ROOT, 'NOTES', 'backlog.data.mjs'), 'utf8');
  const { html, stderr } = await build(data);
  const live = await readFile(join(ROOT, 'NOTES', 'backlog.html'), 'utf8');
  ok('the real data builds without complaint', !!html, stderr.slice(0, 200));
  ok('and the committed page is exactly what the data builds',
     html === live,
     html ? `rebuilt ${html.length} bytes, committed ${live.length}. Run: node tools/build-backlog.mjs` : '');

  /**
   * The file's own rule, at the top of backlog.data.mjs: Broken comes first in every tab that
   * has anything broken in it.
   */
  for (const tab of ['engine', 'questions']) {
    const pane = (live.split(`data-track="${tab}"`)[2] ?? '');
    const first = (pane.match(/<h2 id="s-[a-z-]+">([^<]*?) /) ?? [])[1];
    ok(`Broken still comes first in the ${tab} tab`, first === 'Broken', `first heading is ${first}`);
  }
}

/**
 * Closing something records when it closed.
 *
 * The question that asked for this was "what did we do today", and the only answer the file
 * could give was the whole finished list with no way to tell this week's work from last
 * month's. A close with no time is that question going unanswerable again, so the build
 * refuses it rather than letting one item quietly opt out.
 */
{
  const bare = await build(fixture([
    item({ id: 'a', track: 'engine', section: 'e-broken', status: 'closed' }),
  ], SECS));
  ok('a closed item with no closedAt stops the build',
     !bare.html && /closedAt/.test(bare.stderr), bare.stderr.slice(0, 160));

  const wrong = await build(fixture([
    item({ id: 'a', track: 'engine', section: 'e-broken', status: 'closed', closedAt: 'Tuesday' }),
  ], SECS));
  ok('and so does a closedAt that is not a date', !wrong.html && /not a date/.test(wrong.stderr));

  const stray = await build(fixture([
    item({ id: 'a', track: 'engine', section: 'e-broken', closedAt: '2026-09-30T10:00:00-04:00' }),
  ], SECS));
  ok('a time on something still open stops it too',
     !stray.html && /not closed/.test(stray.stderr));

  /**
   * A day on its own is a ceiling rather than a moment, and the page has to say so. Everything
   * the 28 September rebuild carried over wears that day because the record before it kept no
   * dates, and a page that printed it as a finishing time would be inventing one.
   */
  const exact = await build(fixture([
    item({ id: 'a', track: 'engine', section: 'e-broken', status: 'closed', closedAt: '2026-09-30T14:05:00-04:00' }),
    item({ id: 'b', track: 'engine', section: 'e-broken', status: 'closed', closedAt: '2026-09-28' }),
  ], SECS));
  ok('an exact time is drawn as a day', /class="when"[^>]*>Sep 30</.test(exact.html));
  ok('and a bare date says it is only a ceiling', /class="when"[^>]*>by Sep 28</.test(exact.html));
  ok('the ceiling says as much when you hover it',
     /title="Finished on or before September 28, 2026/.test(exact.html));
}

console.log(fails ? `\n${fails} backlog check(s) failed\n` : '\nthe page keeps its sections\n');
process.exit(fails ? 1 : 0);
