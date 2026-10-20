/**
 * A SUITE THAT READS THE BUILT PAGE HAS TO BUILD IT IN THE SAME COMMAND.
 *
 * The suites open `dist/*.html`; they do not make it. Run one against a source file you have
 * just edited and it reads the page from last time - and says nothing about it, because from
 * its own point of view nothing is wrong. It opened a file and asserted against what was in
 * it. The failure message is about the old code and is entirely convincing.
 *
 * It cost an hour: a rule rewritten, `tsc` clean, the suite re-run twice, and both runs
 * printing what the previous build did. Every `test:*` alias in package.json does build first
 * today, so the trap is only ever sprung by typing `node test/<one>.mjs` by hand.
 *
 * Which is why this gate exists. The aliases are honest only while whoever adds the next one
 * copies the pattern, and nothing but habit makes them. This reads package.json and fails if
 * a script names a suite that opens dist without a build on the same line - the one mistake
 * that would put the whole suite back to reading yesterday's page without anybody noticing.
 */
import { readFile, readdir } from 'node:fs/promises';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
/** Dot-prefixed names are esbuild's intermediates, written by a script and read by nobody. */
const files = (await readdir('test')).filter((f) => f.endsWith('.mjs') && !f.startsWith('.'));

/**
 * A named page under dist, not the word dist. This file talks about `dist/*.html` in its own
 * prose and matches it in its own pattern, and the first version of this gate therefore
 * reported itself as a suite that reads the built page without building it.
 */
const OPENS_A_PAGE = /dist\/[\w.-]+\.html/;
const readsDist = new Map();
for (const f of files) readsDist.set(f, OPENS_A_PAGE.test(await readFile(`test/${f}`, 'utf8')));

/**
 * Run by deploy/publish-preview.sh against the pages it has just built, not by an alias here.
 * Named rather than skipped by pattern, so a new unwired suite is still caught.
 */
const NOT_AN_ALIAS = new Set(['published.mjs', 'rules.mjs', 'suite-builds.mjs']);

let bad = 0;
const say = (good, what, why = '') => {
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${what}${why ? ` ${why}` : ''}`);
  if (!good) bad += 1;
};

const scripts = Object.entries(pkg.scripts).filter(([k]) => k.startsWith('test:'));
const wired = new Set();
for (const [name, line] of scripts) {
  for (const f of files) {
    if (!line.includes(`test/${f}`)) continue;
    wired.add(f);
    if (!readsDist.get(f)) continue;
    say(/build\.mjs/.test(line), `${name} builds the page it reads`, `-> ${line}`);
  }
}

for (const f of files) {
  if (wired.has(f) || NOT_AN_ALIAS.has(f)) continue;
  say(false, `test/${f} has no npm script`, 'so nothing guarantees it builds before it reads');
}

const everything = pkg.scripts.test ?? '';
for (const [name] of scripts) {
  if (name === 'test:rules') continue;  // needs the Firestore emulator, run on its own
  say(everything.includes(`npm run ${name}`), `${name} is in npm test`);
}

console.log(bad ? `\n${bad} suite wiring check(s) failed` : '\nall suite wiring checks passed');
process.exit(bad ? 1 : 0);
