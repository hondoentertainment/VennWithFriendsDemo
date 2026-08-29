import { Readable } from 'node:stream';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createRoundStore } from './rounds.mjs';
import { createShareHandler } from './share.mjs';
import { adaptRequest, createVercelHandler, normalizeFunctionUrl, originalPath } from './vercel-handler.mjs';

describe('normalizeFunctionUrl', () => {
  it('leaves Gemini and rounds API paths alone', () => {
    expect(normalizeFunctionUrl('/api/submission')).toBe('/api/submission');
    expect(normalizeFunctionUrl('/api/rounds')).toBe('/api/rounds');
    expect(normalizeFunctionUrl('/api/rounds/abcdef1234')).toBe('/api/rounds/abcdef1234');
  });

  it('restores rewritten share permalinks', () => {
    expect(normalizeFunctionUrl('/api/r/abcdef1234')).toBe('/r/abcdef1234');
    expect(normalizeFunctionUrl('/api/r/abcdef1234/image.png')).toBe('/r/abcdef1234/image.png');
  });

  it('does not treat /api/rounds as a rewritten /r path', () => {
    expect(normalizeFunctionUrl('/api/rounds')).toBe('/api/rounds');
  });

  it('re-prefixes a stripped catch-all suffix', () => {
    expect(normalizeFunctionUrl('/submission')).toBe('/api/submission');
    expect(normalizeFunctionUrl('visualize')).toBe('/api/visualize');
  });

  it('does not turn a bare /api into /api/api', () => {
    expect(normalizeFunctionUrl('/api')).toBe('/api');
  });

  it('keeps an already-public /r path', () => {
    expect(normalizeFunctionUrl('/r/abcdef1234?x=1')).toBe('/r/abcdef1234?x=1');
  });
});

describe('originalPath', () => {
  it('prefers the __path rewrite query over req.url', () => {
    expect(originalPath({ url: '/api?__path=/r/abcdef1234/image.png' })).toBe('/r/abcdef1234/image.png');
    expect(originalPath({ url: '/api', query: { __path: '/api/rounds/abcdef1234' } })).toBe(
      '/api/rounds/abcdef1234'
    );
  });
});

describe('adaptRequest', () => {
  it('rebuilds a readable stream from a parsed JSON body', async () => {
    const req = {
      url: '/api/rounds',
      method: 'POST',
      headers: { host: 'venn.example' },
      body: { hello: 'world' },
      readableEnded: true,
    };
    const adapted = adaptRequest(req);
    const chunks = [];
    for await (const chunk of adapted) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe(JSON.stringify({ hello: 'world' }));
    expect(adapted.url).toBe('/api/rounds');
  });

  it('passes a raw stream through and rewrites /api/r/*', () => {
    const req = Readable.from([Buffer.from('{}')]);
    req.url = '/api/r/abcdef1234';
    req.method = 'GET';
    req.headers = { host: 'venn.example' };
    const adapted = adaptRequest(req);
    expect(adapted).toBe(req);
    expect(adapted.url).toBe('/r/abcdef1234');
  });
});

function makeRes() {
  const headers = {};
  return {
    statusCode: 200,
    headers,
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    end(payload) {
      this.raw = payload;
      this.ended = true;
    },
  };
}

describe('createVercelHandler', () => {
  it('dispatches Gemini routes to handleApi', async () => {
    const handleApi = vi.fn(async (_req, res) => { res.end('ok'); });
    const handleShare = vi.fn();
    const handler = createVercelHandler({ handleApi, handleShare });
    const req = Readable.from([Buffer.from('{}')]);
    req.url = '/api/submission';
    req.method = 'POST';
    req.headers = {};
    const res = makeRes();
    await handler(req, res);
    expect(handleApi).toHaveBeenCalledOnce();
    expect(handleShare).not.toHaveBeenCalled();
  });

  it('dispatches rewritten permalinks to handleShare', async () => {
    const handleApi = vi.fn();
    const handleShare = vi.fn(async (req, res) => {
      expect(req.url).toBe('/r/abcdef1234');
      res.end('round');
    });
    const handler = createVercelHandler({ handleApi, handleShare });
    const req = {
      url: '/api?__path=/r/abcdef1234',
      method: 'GET',
      headers: {},
      query: { __path: '/r/abcdef1234' },
      body: '',
      readableEnded: true,
    };
    await handler(req, makeRes());
    expect(handleShare).toHaveBeenCalledOnce();
    expect(handleApi).not.toHaveBeenCalled();
  });

  it('wraps the real share handler so a parsed body still creates a round', async () => {
    const store = createRoundStore({ dir: await mkdtemp(join(tmpdir(), 'venn-vercel-')) });
    const handler = createVercelHandler({
      store,
      handleApi: async (_req, res) => { res.statusCode = 599; res.end('api'); },
      publicUrl: 'https://venn.app',
    });

    const payload = {
      imageA: { title: 'Forest', url: 'https://cdn.example/a.jpg', mediaType: 'image' },
      imageB: { title: 'Circuit', url: 'https://cdn.example/b.jpg', mediaType: 'image' },
      label: 'Fusion Point',
      submissions: [{ name: 'Ada', content: 'Branching paths', score: 9, isWinner: true }],
    };
    const req = {
      url: '/api/rounds',
      method: 'POST',
      headers: { host: 'venn.example' },
      body: payload,
      readableEnded: true,
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.raw);
    expect(body.url).toMatch(/^https:\/\/venn\.app\/r\/[a-z2-9]+$/);
    expect(await store.get(body.id)).not.toBeNull();
  });

  it('falls through to the app shell for an unknown permalink', async () => {
    const store = createRoundStore({ dir: await mkdtemp(join(tmpdir(), 'venn-vercel-')) });
    const handler = createVercelHandler({
      store,
      getIndexHtml: async () => '<html><head></head><body>shell</body></html>',
      handleShare: createShareHandler({
        store,
        getIndexHtml: async () => '<html><head></head><body>shell</body></html>',
      }),
    });
    const req = {
      url: '/api?__path=/r/aaaaaaaaaa',
      method: 'GET',
      headers: {},
      query: { __path: '/r/aaaaaaaaaa' },
      body: undefined,
      readableEnded: true,
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.raw).toContain('shell');
  });
});
