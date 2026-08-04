/**
 * Shared-round permalinks.
 *
 *   POST /api/rounds        create a shared round, returns { id, url }
 *   GET  /api/rounds/:id    the round as JSON, for the client to render
 *   GET  /r/:id/image.png   the AI-generated fusion image
 *   GET  /r/:id             the app shell with per-round Open Graph tags
 *
 * The last route is the point of the whole feature: a link posted anywhere
 * unfurls with the image the model generated from the winning answer. That
 * only works if the tags are in the HTML the crawler receives, so they are
 * injected server-side rather than set by React after hydration.
 */

import { HttpError, clientIp, createRateLimiter, isOriginAllowed } from './guard.mjs';
import { isValidId, parseSharePayload } from './rounds.mjs';

const SHARE_COSTS = { create: 5, read: 1 };

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

/** Escapes for an HTML attribute value — these strings are player-supplied. */
function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Absolute base URL for the tags. Crawlers need absolute URLs, and the app
 * doesn't know its own public address, so PUBLIC_URL wins when set and the
 * request's Host is the fallback.
 */
export function baseUrl(req, publicUrl) {
  if (publicUrl) return publicUrl.replace(/\/$/, '');
  const host = req.headers.host || 'localhost';
  const proto = req.headers['x-forwarded-proto'] || (host.startsWith('localhost') ? 'http' : 'https');
  return `${String(proto).split(',')[0]}://${host}`;
}

export function buildMetaTags(round, url, imageUrl) {
  const winner = round.submissions.find((s) => s.isWinner) || round.submissions[0];
  const title = round.label
    ? `${round.label} — ${round.imageA.title} × ${round.imageB.title}`
    : `${round.imageA.title} × ${round.imageB.title}`;
  const description = winner
    ? `"${winner.content}" scored ${winner.score}/10. Think you can bridge these two better?`
    : 'Find the creative intersection between two images.';

  const tags = [
    `<meta property="og:title" content="${escapeAttr(title)}">`,
    `<meta property="og:description" content="${escapeAttr(description)}">`,
    `<meta property="og:url" content="${escapeAttr(url)}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Venn with Friends">',
    `<meta name="description" content="${escapeAttr(description)}">`,
  ];

  // Without a generated image there is nothing worth showing, so the card
  // stays a text summary rather than pointing at a 404.
  if (round.hasImage && imageUrl) {
    tags.push(
      `<meta property="og:image" content="${escapeAttr(imageUrl)}">`,
      '<meta property="og:image:width" content="1024">',
      '<meta property="og:image:height" content="1024">',
      '<meta name="twitter:card" content="summary_large_image">'
    );
  } else {
    tags.push('<meta name="twitter:card" content="summary">');
  }

  return tags.join('\n  ');
}

/**
 * Replaces the shell's default Open Graph block with the round's own tags.
 * The defaults are marked in index.html so this is a single scoped swap rather
 * than a guess at which meta tags to strip.
 */
export function injectMeta(html, tags) {
  const marked = html.replace(
    /<!--\s*og:start\s*-->[\s\S]*?<!--\s*og:end\s*-->/,
    `<!-- og:start -->\n  ${tags}\n  <!-- og:end -->`
  );
  if (marked !== html) return marked;
  return html.replace('</head>', `  ${tags}\n</head>`);
}

/**
 * @param {object} options
 * @param {ReturnType<import('./rounds.mjs').createRoundStore>} options.store
 * @param {() => Promise<string | null>} [options.getIndexHtml] Loads the app
 *   shell. Omit in dev, where Vite serves it and no crawler is watching.
 * @param {string} [options.publicUrl] Absolute base URL for generated links.
 * @param {ReturnType<import('./guard.mjs').createRateLimiter>} [options.limiter]
 * @param {Partial<ReturnType<import('./guard.mjs').guardConfigFromEnv>>} [options.config]
 */
export function createShareHandler({ store, getIndexHtml, publicUrl, limiter, config = {} }) {
  const limit = limiter ?? createRateLimiter({ capacity: config.capacity ?? 60, windowMs: config.windowMs ?? 60_000 });
  const allowedOrigins = config.allowedOrigins ?? [];
  const trustedHops = config.trustedHops ?? 0;
  const maxBodyBytes = config.maxBodyBytes ?? 6_000_000;

  function charge(req, res, cost) {
    const verdict = limit.take(clientIp(req, trustedHops), cost);
    if (verdict.ok) return true;
    res.setHeader('Retry-After', String(verdict.retryAfterSeconds));
    sendJson(res, 429, { error: 'Rate limit exceeded — slow down' });
    return false;
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let total = 0;
      let settled = false;
      req.on('data', (chunk) => {
        if (settled) return;
        total += chunk.length;
        if (total > maxBodyBytes) {
          settled = true;
          req.destroy();
          reject(new HttpError(413, 'Request body too large'));
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (settled) return;
        settled = true;
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
        } catch {
          reject(new HttpError(400, 'Invalid JSON body'));
        }
      });
      req.on('error', (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      });
    });
  }

  return async function handleShare(req, res, next) {
    const path = (req.url || '').split('?')[0];
    const skip = () => (next ? next() : sendJson(res, 404, { error: 'Not found' }));

    try {
      if (path === '/api/rounds' && req.method === 'POST') {
        if (!isOriginAllowed(req, allowedOrigins)) return sendJson(res, 403, { error: 'Origin not allowed' });
        if (!charge(req, res, SHARE_COSTS.create)) return;

        const { record, image } = parseSharePayload(await readBody(req));
        const id = await store.save(record, image);
        return sendJson(res, 201, { id, url: `${baseUrl(req, publicUrl)}/r/${id}` });
      }

      const apiMatch = /^\/api\/rounds\/([^/]+)$/.exec(path);
      if (apiMatch) {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
        if (!charge(req, res, SHARE_COSTS.read)) return;
        const round = await store.get(apiMatch[1]);
        if (!round) return sendJson(res, 404, { error: 'This round has expired or never existed' });
        return sendJson(res, 200, round);
      }

      const imageMatch = /^\/r\/([^/]+)\/image\.png$/.exec(path);
      if (imageMatch) {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
        if (!charge(req, res, SHARE_COSTS.read)) return;
        const buffer = await store.image(imageMatch[1]);
        if (!buffer) {
          res.statusCode = 404;
          return res.end('Not found');
        }
        res.setHeader('Content-Type', 'image/png');
        // Immutable: a round's image never changes once written.
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.end(buffer);
      }

      const pageMatch = /^\/r\/([^/]+)\/?$/.exec(path);
      if (pageMatch && req.method === 'GET') {
        // In dev the shell is served by Vite, so this route only rewrites the
        // shell in production; the SPA still renders the round either way.
        if (!getIndexHtml) return skip();
        if (!isValidId(pageMatch[1])) return skip();
        if (!charge(req, res, SHARE_COSTS.read)) return;

        const round = await store.get(pageMatch[1]);
        if (!round) return skip();

        const html = await getIndexHtml();
        if (!html) return skip();

        const url = `${baseUrl(req, publicUrl)}/r/${pageMatch[1]}`;
        const tags = buildMetaTags(round, url, `${url}/image.png`);
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.end(injectMeta(html, tags));
      }

      return skip();
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status >= 500) console.error(`Share error on ${path}:`, error);
      return sendJson(res, status, {
        error: error instanceof HttpError ? error.message : 'Something went wrong',
      });
    }
  };
}
