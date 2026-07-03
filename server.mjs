import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createApiHandler } from './server/genai.mjs';

try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local — rely on the process environment.
}

const PORT = Number(process.env.PORT) || 3000;
const DIST = join(import.meta.dirname, 'dist');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const handleApi = createApiHandler(() => process.env.GEMINI_API_KEY);

async function serveStatic(req, res) {
  const url = (req.url || '/').split('?')[0];
  const safePath = normalize(url).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(DIST, safePath === '/' ? 'index.html' : safePath);

  try {
    const content = await readFile(filePath);
    res.setHeader('Content-Type', MIME_TYPES[extname(filePath)] || 'application/octet-stream');
    res.end(content);
    return;
  } catch {
    // Missing assets must 404 — serving index.html to a script/css request
    // causes a MIME mismatch that breaks the app with no useful signal.
    const isNavigation = extname(safePath) === '' && (req.headers.accept || '').includes('text/html');
    if (!isNavigation) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
  }

  // SPA fallback: unknown navigation routes get the app shell.
  try {
    const content = await readFile(join(DIST, 'index.html'));
    res.setHeader('Content-Type', 'text/html');
    res.end(content);
  } catch {
    res.statusCode = 500;
    res.end('dist/index.html not found — run `npm run build` first');
  }
}

createServer((req, res) => {
  if ((req.url || '').startsWith('/api/')) {
    handleApi(req, res);
  } else {
    serveStatic(req, res);
  }
}).listen(PORT, () => {
  console.log(`Venn with Friends running at http://localhost:${PORT}`);
});
