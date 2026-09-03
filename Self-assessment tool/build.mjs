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
 * Where submissions go, if anywhere.
 *
 *   EARB_ENDPOINT=https://earb-store.example.workers.dev npm run build
 *
 * With no endpoint the page keeps its `connect-src 'none'`, which means it cannot make a
 * request at all. With one, exactly that origin is allowed and nothing else: the security
 * story stays a story about one host rather than a story about the internet.
 */
const ENDPOINT = (process.env.EARB_ENDPOINT ?? '').trim().replace(/\/$/, '');
const ORIGIN = ENDPOINT ? new URL(ENDPOINT).origin : '';

async function once() {
  const result = await build({
    entryPoints: ['src/main.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    target: ['es2020'],
    minify: !watch,
    loader: { '.json': 'json' },
    define: { __EARB_ENDPOINT__: JSON.stringify(ENDPOINT) },
    logLevel: 'warning',
  });

  const js = result.outputFiles[0].text;
  const css = await readFile('src/styles.css', 'utf8');
  const template = await readFile('template.html', 'utf8');
  const rubric = JSON.parse(await readFile('rubric/rubric.v1-dan.json', 'utf8'));

  const html = template
    .replace('__TITLE__', rubric.title)
    .replace('__CONNECT__', ORIGIN || "'none'")
    .replace('__CSS__', () => css)
    .replace('__JS__', () => js);

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`${OUT_FILE}  ${kb} KB  (rubric ${rubric.version}, ${rubric.status})`);
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
