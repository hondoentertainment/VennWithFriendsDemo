/**
 * Adapts the existing Node http handlers for a Vercel serverless function.
 *
 * Vercel will not run `npm start`, and a Vite-only upload would drop every
 * /api and /r route. This module wraps handleApi / handleShare so the Gemini
 * proxy and share permalinks keep the same gauntlet they have on Render.
 *
 * Incoming requests may already have a parsed `req.body` (Node helpers) or
 * still be a raw stream (bodyParser: false). Either shape is turned back into
 * the IncomingMessage the handlers already know how to read.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createApiHandler } from './genai.mjs';
import { guardConfigFromEnv } from './guard.mjs';
import { resolvePublicUrl } from './public-url.mjs';
import { createShareHandler } from './share.mjs';
import { createStoreFromEnv } from './store.mjs';

/**
 * vercel.json rewrites `/api/:path+` and `/r/:path+` onto `/api` (this
 * function) and stashes the public path in `__path`. Vite on Vercel does not
 * treat `api/[...path].mjs` as a multi-segment catch-all, so the query is
 * how the original route survives.
 *
 * Some Node runtimes also strip the `/api` prefix. Put it back so ROUTES
 * in genai.mjs still match.
 */
export function queryParam(req, name) {
  const fromHelpers = req.query?.[name];
  if (Array.isArray(fromHelpers)) return fromHelpers[0] || '';
  if (typeof fromHelpers === 'string' && fromHelpers) return fromHelpers;

  const url = req.url || '';
  const idx = url.indexOf('?');
  if (idx === -1) return '';
  return new URLSearchParams(url.slice(idx + 1)).get(name) || '';
}

export function normalizeFunctionUrl(url) {
  const [path, query] = String(url || '/').split('?');
  let next = path || '/';

  if (next === '/api/r' || next.startsWith('/api/r/')) {
    next = next.slice('/api'.length);
  } else if (!next.startsWith('/api/') && !next.startsWith('/r/')) {
    next = next.startsWith('/') ? `/api${next}` : `/api/${next}`;
  }

  return query ? `${next}?${query}` : next;
}

export function originalPath(req) {
  const rewritten = queryParam(req, '__path');
  if (rewritten) return rewritten;
  return normalizeFunctionUrl(req.url || '/');
}

function canUseRawStream(req) {
  return (
    typeof req.on === 'function' &&
    req.readable !== false &&
    !req.readableEnded &&
    req.body === undefined
  );
}

function bodyChunks(req) {
  if (Buffer.isBuffer(req.body)) return [req.body];
  if (typeof req.body === 'string') return req.body ? [Buffer.from(req.body)] : [];
  if (req.body == null) return [];
  return [Buffer.from(JSON.stringify(req.body))];
}

export function adaptRequest(req) {
  const url = originalPath(req);
  if (canUseRawStream(req)) {
    req.url = url;
    return req;
  }

  const stream = Readable.from(bodyChunks(req));
  stream.url = url;
  stream.method = req.method;
  stream.headers = req.headers || {};
  stream.socket = req.socket ?? { remoteAddress: 'unknown' };
  return stream;
}

export async function loadIndexHtml() {
  try {
    return await readFile(join(process.cwd(), 'dist', 'index.html'), 'utf8');
  } catch {
    return null;
  }
}

async function serveShell(res, getIndexHtml) {
  const html = await getIndexHtml();
  if (!html) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.end(html);
}

/**
 * Builds a Vercel `(req, res)` handler that dispatches to the same
 * createApiHandler / createShareHandler used by server.mjs.
 *
 * Constructed once at module load so the in-process rate limiter and
 * concurrency gate survive across invocations on a warm isolate. That is
 * still only a best-effort bound — each isolate has its own buckets.
 */
export function createVercelHandler(options = {}) {
  const env = options.env ?? process.env;
  const config = { ...guardConfigFromEnv(env), ...options.config };
  const getIndexHtml = options.getIndexHtml ?? loadIndexHtml;

  const handleApi =
    options.handleApi ?? createApiHandler(() => env.GEMINI_API_KEY, config);

  const handleShare =
    options.handleShare ??
    createShareHandler({
      store: options.store ?? createStoreFromEnv(env),
      publicUrl: options.publicUrl ?? resolvePublicUrl(env),
      config,
      getIndexHtml,
    });

  return async function vercelHandler(req, res) {
    const nodeReq = adaptRequest(req);
    const path = (nodeReq.url || '').split('?')[0];

    if (path.startsWith('/api/rounds') || path.startsWith('/r/')) {
      return handleShare(nodeReq, res, () => serveShell(res, getIndexHtml));
    }
    return handleApi(nodeReq, res);
  };
}
