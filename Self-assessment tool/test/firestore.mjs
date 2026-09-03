/**
 * Bundles test/firestore.ts against a placeholder Firebase project and runs it.
 *
 * The defines are set here because a shell cannot pass a JSON string through
 * `esbuild --define` without the quoting turning into a guessing game. The values are
 * placeholders and reach nothing: every request in that file is answered by a stub.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '.firestore.mjs');

await build({
  entryPoints: [join(here, 'firestore.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  loader: { '.json': 'json' },
  logLevel: 'warning',
  define: {
    __EARB_ENDPOINT__: JSON.stringify(''),
    __EARB_FIREBASE__: JSON.stringify(JSON.stringify({
      apiKey: 'PLACEHOLDER-NOT-A-KEY',
      projectId: 'placeholder-project',
    })),
  },
});

await import(out);
