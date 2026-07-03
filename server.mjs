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
  let filePath = join(DIST, safePath === '/' ? 'index.html' : safePath);

  try {
    let content = await readFile(filePath);
    res.setHeader('Content-Type', MIME_TYPES[extname(filePath)] || 'application/octet-stream');
    res.end(content);
  } catch {
    // SPA fallback: unknown paths get the app shell.
    const content = await readFile(join(DIST, 'index.html'));
    res.setHeader('Content-Type', 'text/html');
    res.end(content);
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
