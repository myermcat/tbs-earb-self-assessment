/**
 * Builds one self-contained HTML file. No runtime dependencies, no network, no server.
 * The output can be emailed, dropped on a share, opened from a USB stick, or served
 * from GitHub Pages - the same file works in all four cases.
 */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const OUT_DIR = 'dist';
const OUT_FILE = `${OUT_DIR}/index.html`;
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
  console.log(`${OUT_FILE}  ${kb} KB  (rubric ${rubric.version}, ${rubric.status}, store ${store})`);
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
