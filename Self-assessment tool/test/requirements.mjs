/**
 * The requirements page against the data it is generated from.
 *
 * NOTES/requirements.html is a built artefact that is committed, and nothing checked that the
 * committed copy was what the data builds. So it sat one edit behind NOTES/requirements.data.mjs
 * and the page everybody reads was quietly wrong, which is the same defect test/backlog.mjs was
 * written for and the reason this file mirrors it.
 *
 * It cost more than a stale page. deploy/publish-preview.sh rebuilt this file as a publish step,
 * AFTER its own gate had checked the tree was clean, so every successful publish left the
 * repository dirty and the next publish refused on it. Two sessions hit that refusal, each
 * worked around it, and neither found the cause, because the cause was a file nobody was
 * watching. The rebuild is gone from the publish script and this is what replaces it: the
 * committed page has to be current before anything can be published, and the suite says so
 * rather than the publish silently making it true.
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
const ok = (name, cond, extra = '') => {
  if (!cond) { fails++; console.log(`  FAIL  ${name} ${extra}`); } else console.log(`  ok    ${name}`);
};

/**
 * Built in a copy of the tree rather than in place, so a test of the generator never writes
 * the file it is checking. Running it in place would make every run pass.
 */
async function build(data) {
  const dir = await mkdtemp(join(tmpdir(), 'earb-requirements-'));
  await mkdir(join(dir, 'tools'));
  await mkdir(join(dir, 'NOTES'));
  await copyFile(join(ROOT, 'tools', 'build-requirements.mjs'), join(dir, 'tools', 'build-requirements.mjs'));
  await writeFile(join(dir, 'NOTES', 'requirements.data.mjs'), data);
  const out = await run('node', [join(dir, 'tools', 'build-requirements.mjs')]).catch((e) => e);
  const html = await readFile(join(dir, 'NOTES', 'requirements.html'), 'utf8').catch(() => '');
  await rm(dir, { recursive: true, force: true });
  return { html, stdout: out.stdout ?? '', stderr: out.stderr ?? '' };
}

{
  const data = await readFile(join(ROOT, 'NOTES', 'requirements.data.mjs'), 'utf8');
  const { html, stdout, stderr } = await build(data);
  const live = await readFile(join(ROOT, 'NOTES', 'requirements.html'), 'utf8');

  ok('the real data builds without complaint', !!html, stderr.slice(0, 300));
  ok('and the committed page is exactly what the data builds',
     html === live,
     html
       ? `rebuilt ${html.length} bytes, committed ${live.length}. Run: node tools/build-requirements.mjs`
       : 'nothing was built');

  /**
   * The counts in the banner are the first thing anybody reads and the first thing to go stale,
   * because they are derived from the list rather than typed beside it.
   */
  const total = Number((live.match(/(\d+) requirements, baselined/) ?? [])[1] ?? 0);
  const rows = (live.match(/<span class="req-id mono">/g) ?? []).length;
  ok('the number it claims is the number of requirements on the page',
     total > 0 && total === rows, `banner says ${total}, page carries ${rows}`);

  /**
   * Counted off the requirement rows and not off every st-done on the page. The first version
   * of this check counted the class, which is also worn by the legend at the top, so it
   * reported the page one short of itself and the page was right.
   */
  const built = Number((live.match(/<b>(\d+)<\/b><span>built<\/span>/) ?? [])[1] ?? -1);
  const marked = (live.match(
    /<span class="req-id mono">[A-Z]+\d+<\/span>\s*<span class="req-t">[\s\S]*?<\/span>\s*<span class="st st-done">/g,
  ) ?? []).length;
  ok('and the built count matches what is marked built on a requirement',
     built >= 0 && built === marked, `banner says ${built}, rows marked ${marked}`);

  ok('the generator says what it wrote', /requirements\.html\s+\d+ requirements/.test(stdout),
     stdout.slice(0, 160));
}

/**
 * A requirement with no state would be invisible to every count above, so the page would stay
 * self-consistent while under-reporting itself. Proved by asking the generator for one.
 */
{
  const data = await readFile(join(ROOT, 'NOTES', 'requirements.data.mjs'), 'utf8');
  const live = await readFile(join(ROOT, 'NOTES', 'requirements.html'), 'utf8');
  const broken = data.replace(/state: '(built|agreed|proposed|open|blocked)'/, "state: 'invented'");
  ok('the fixture actually changed, so the check below means something', broken !== data);
  const { html } = await build(broken);
  /**
   * The generator falls back to ['?', 'st-later'], so an unknown state reads as a question mark
   * in the open colour. That is the behaviour worth holding: a reader sees that somebody wrote
   * a state nobody defined, instead of the row quietly looking like every other open one.
   */
  ok('an unknown state renders as a question mark somebody can see',
     />\?</.test(html), 'it rendered an ordinary badge, so a typo in a state is invisible');
  ok('and it is not labelled as built', (html.match(/class="st st-done"/g) ?? []).length
     < (live.match(/class="st st-done"/g) ?? []).length + 1);
}

console.log(fails ? `\n${fails} requirements check(s) failed\n` : '\nthe requirements page matches its data\n');
process.exit(fails ? 1 : 0);
