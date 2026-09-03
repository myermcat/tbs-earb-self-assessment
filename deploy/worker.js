/**
 * The store, as a Cloudflare Worker.
 *
 * This is the other half of the tool: the page is static and cannot accept a write, so
 * something has to. It is about forty lines, it costs nothing on the free plan, and it can be
 * created entirely in a browser.
 *
 * WHAT TO DO WITH THIS FILE
 *
 *  1. Sign in at dash.cloudflare.com. No card is asked for.
 *  2. Compute > Workers & Pages > Create > Start with Hello World > Deploy.
 *  3. Edit code, paste this file over what is there, Deploy.
 *  4. Storage & Databases > KV > Create a namespace called earb-store.
 *  5. Back on the Worker: Settings > Bindings > Add > KV namespace.
 *     Variable name STORE, namespace earb-store.
 *  6. Copy the worker's address, which looks like
 *     https://<name>.<your-subdomain>.workers.dev
 *  7. Build the tool against it:
 *       EARB_ENDPOINT=https://<name>.<your-subdomain>.workers.dev npm run build
 *     That address goes into the page's Content-Security-Policy as the one host it may
 *     reach, so a build with no endpoint still cannot make a request at all.
 *
 * WHAT IT IS NOT
 *
 * There is no authentication. Anybody who reads the page source can find this address and
 * write to it. ORIGIN below keeps a browser on another site from calling it, which is a
 * different thing from keeping a person from calling it with curl. That is acceptable for a
 * prototype holding unclassified drafts, and it is not acceptable for the real thing: the
 * real thing wants the departmental sign-in that Settings already describes as unbuilt.
 *
 * The free plan allows 100,000 reads and 1,000 writes a day. One submit is one write, so the
 * ceiling is not the writes; it is autosaving on every keystroke, which this deliberately
 * does not do.
 */

const ORIGIN = 'https://myermcat.github.io';

const cors = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'access-control-allow-headers': 'content-type, accept',
  'access-control-max-age': '86400',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // The preflight. Writing this by hand is the reason to prefer a Worker over a Google
    // Apps Script web app, which cannot answer one and so cannot accept a JSON content type.
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    if (url.pathname !== '/assessments') return json({ error: 'not found' }, 404);

    if (request.method === 'GET') {
      const list = await env.STORE.list({ prefix: 'assessment:' });
      const rows = await Promise.all(list.keys.map((k) => env.STORE.get(k.name, 'json')));
      return json(rows.filter(Boolean));
    }

    if (request.method === 'PUT') {
      let doc;
      try {
        doc = await request.json();
      } catch {
        return json({ error: 'that body is not JSON' }, 400);
      }
      if (doc?.fileType !== 'gc-arch-assessment') {
        return json({ error: 'that is not a self-assessment file' }, 422);
      }
      // 40 KB is a full assessment. A megabyte is somebody testing the limits.
      const body = JSON.stringify(doc);
      if (body.length > 1_000_000) return json({ error: 'too big' }, 413);

      const id = doc.id || crypto.randomUUID();
      doc.id = id;
      await env.STORE.put(`assessment:${id}`, JSON.stringify(doc));
      return json({ ok: true, id });
    }

    return json({ error: 'use GET or PUT' }, 405);
  },
};
