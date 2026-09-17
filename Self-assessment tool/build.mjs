/**
 * Builds one self-contained HTML file. No runtime dependencies, no network, no server.
 * The output can be emailed, dropped on a share, opened from a USB stick, or served
 * from GitHub Pages - the same file works in all four cases.
 */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

/**
 * Where the built page lands.
 *
 * One variable and not one constant, because the tool is published as two pages now: the
 * submitter's at the site root and the assessor's a folder down. The default is what every
 * test reads, so nothing has to pass this to get the ordinary build.
 *
 *   EARB_OUT=dist/assessor.html EARB_ACCESS=accounts npm run build
 */
const OUT_FILE = (process.env.EARB_OUT ?? '').trim() || 'dist/index.html';
const OUT_DIR = OUT_FILE.includes('/') ? OUT_FILE.slice(0, OUT_FILE.lastIndexOf('/')) : '.';
const watch = process.argv.includes('--watch');

/**
 * Where submissions go, if anywhere. Two answers, and one environment variable picks each:
 *
 *   EARB_ENDPOINT=https://earb-store.example.workers.dev npm run build
 *   EARB_FIREBASE='{"apiKey":"...","projectId":"..."}' npm run build
 *
 * With neither the page keeps its `connect-src 'none'`, which means it cannot make a request
 * at all. With one, exactly the origins that answer belong in the policy and nothing else: the
 * security story stays a story about named hosts and never a story about the internet.
 */
const ENDPOINT = (process.env.EARB_ENDPOINT ?? '').trim().replace(/\/$/, '');
const ORIGIN = ENDPOINT ? new URL(ENDPOINT).origin : '';

/**
 * The Firebase project, carried as one JSON value so the key and the project id arrive
 * together. Two variables would let a build have half a config and say nothing about it.
 *
 * It is checked here because the alternative is a page that builds, loads, looks right, and
 * has no store behind it. A shell that mangles the quoting is the ordinary way this goes wrong.
 */
const FIREBASE = (process.env.EARB_FIREBASE ?? '').trim();
if (FIREBASE) {
  // A stack trace would bury the one sentence that helps, so the refusal is the whole output.
  const refuse = (why) => { console.error(`Build refused: ${why}`); process.exit(1); };
  let parsed;
  try {
    parsed = JSON.parse(FIREBASE);
  } catch {
    refuse('EARB_FIREBASE is not JSON. Expected \'{"apiKey":"...","projectId":"..."}\' in single quotes.');
  }
  if (!parsed?.apiKey || !parsed?.projectId) {
    refuse('EARB_FIREBASE needs both apiKey and projectId. With one of them missing there is no store to reach.');
  }
}

/**
 * How a person gets at an assessment: with an account, or with a code.
 *
 * Dan asked on 8 September whether the tool needs accounts at all. The answer turned out to be
 * split, so this is a switch and not a deletion. `accounts` is what exists: Google sign-in, and
 * roles an admin grants. `code` is the lighter route: an assessment carries a share code, and
 * whoever holds the code may open it.
 *
 * It is a build input for the same reason the store address is. The rules on Google's side are
 * one global thing, so a per-browser setting could not match them, and a setting inside a
 * question set would let a JSON file somebody loads decide who may read what.
 *
 * Both paths stay compiled, typechecked and tested. Commented-out code stops being either, and
 * code that is not typechecked is abandoned and not kept.
 */
const ACCESS = (process.env.EARB_ACCESS ?? 'accounts').trim() || 'accounts';
if (ACCESS !== 'accounts' && ACCESS !== 'code') {
  console.error(`Build refused: EARB_ACCESS is "${ACCESS}". It takes accounts or code.`);
  process.exit(1);
}

/**
 * Which side this page opens on.
 *
 * The two sides are two published pages now, and a page that opens on the wrong one is a page
 * that looks like the other product. The assessor's address used to open the questionnaire
 * with a button on it marked "open the assessor view", which is a door in a wall that should
 * not have needed one.
 *
 * It is separate from EARB_ACCESS because a build can hold both sides and often should: the
 * default build is what the tests drive and what somebody runs locally, and it opens where it
 * always has. A bookmarked address still wins over this, and so does the side somebody was
 * last on.
 */
const SIDE = (process.env.EARB_SIDE ?? 'submit').trim() || 'submit';
if (SIDE !== 'submit' && SIDE !== 'assess') {
  console.error(`Build refused: EARB_SIDE is "${SIDE}". It takes submit or assess.`);
  process.exit(1);
}

/**
 * The three hosts a Firestore build talks to. Identity Toolkit signs a person in, Firestore
 * holds the documents, and the token host is the only place a refresh token can be exchanged,
 * so an hour into an assessment nobody is thrown out mid-answer.
 */
const FIREBASE_ORIGINS = FIREBASE
  ? [
      'https://identitytoolkit.googleapis.com',
      'https://securetoken.googleapis.com',
      'https://firestore.googleapis.com',
    ]
  : [];

const CONNECT = [ORIGIN, ...FIREBASE_ORIGINS].filter(Boolean).join(' ') || "'none'";

async function once() {
  const result = await build({
    entryPoints: ['src/main.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    target: ['es2020'],
    minify: !watch,
    loader: { '.json': 'json' },
    define: {
      __EARB_ENDPOINT__: JSON.stringify(ENDPOINT),
      __EARB_FIREBASE__: JSON.stringify(FIREBASE),
      // When this file was made, so a page can say which build it is. Browsers hold a copy of a
      // page far longer than anybody expects, and a whole afternoon has gone into arguing with
      // behaviour that had already been changed in a build the reader did not have.
      __EARB_BUILT__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
      __EARB_ACCESS__: JSON.stringify(ACCESS),
      __EARB_SIDE__: JSON.stringify(SIDE),
    },
    logLevel: 'warning',
  });

  const js = result.outputFiles[0].text;
  const css = await readFile('src/styles.css', 'utf8');
  const template = await readFile('template.html', 'utf8');
  const rubric = JSON.parse(await readFile('rubric/rubric.v1-dan.json', 'utf8'));

  const html = template
    .replace('__TITLE__', rubric.title)
    .replace('__CONNECT__', CONNECT)
    .replace('__CSS__', () => css)
    .replace('__JS__', () => js);

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  // The store is named on the line every build prints, because the way this goes wrong is a
  // build that was meant to have one and does not.
  const store = FIREBASE ? 'Firestore' : ORIGIN ? new URL(ORIGIN).host : 'none';
  console.log(`${OUT_FILE}  ${kb} KB  (rubric ${rubric.version}, ${rubric.status}, store ${store}, access ${ACCESS}, opens on ${SIDE})`);
}

await once();

if (watch) {
  const { watch: fsWatch } = await import('node:fs');
  let timer;
  for (const dir of ['src', 'rubric']) {
    fsWatch(dir, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => once().catch((e) => console.error(e.message)), 120);
    });
  }
  console.log('Watching src/ and rubric/. Reload dist/index.html in the browser to see changes.');
}
