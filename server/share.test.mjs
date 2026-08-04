import { Readable } from 'node:stream';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createRoundStore } from './rounds.mjs';
import { baseUrl, buildMetaTags, createShareHandler, injectMeta } from './share.mjs';

const SHELL = `<!DOCTYPE html><html><head><title>Venn with Friends</title>
  <!-- og:start -->
  <meta property="og:title" content="Venn with Friends - Battle the AI!">
  <!-- og:end -->
</head><body></body></html>`;

async function tempStore(options = {}) {
  return createRoundStore({ dir: await mkdtemp(join(tmpdir(), 'venn-share-')), ...options });
}

function makeReq(url, body, { method = 'POST', headers = {} } = {}) {
  const req = Readable.from([Buffer.from(typeof body === 'string' ? body : JSON.stringify(body ?? {}))]);
  req.url = url;
  req.method = method;
  req.headers = { host: 'venn.example', ...headers };
  req.socket = { remoteAddress: '10.0.0.1' };
  return req;
}

function makeRes() {
  const headers = {};
  return {
    statusCode: 200,
    headers,
    chunks: [],
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    end(payload) {
      this.raw = payload;
      this.ended = true;
    },
  };
}

async function call(handler, req, next) {
  const res = makeRes();
  await handler(req, res, next);
  try {
    res.body = res.raw ? JSON.parse(res.raw) : undefined;
  } catch {
    res.body = undefined;
  }
  return res;
}

const payload = {
  imageA: { title: 'Forest', url: 'https://cdn.example/a.jpg', mediaType: 'image' },
  imageB: { title: 'Circuit', url: 'https://cdn.example/b.jpg', mediaType: 'image' },
  label: 'Fusion Point',
  reasoning: 'It bridges both.',
  submissions: [{ name: 'Ada', avatar: '🦊', color: 'c', content: 'Branching paths', score: 9, isWinner: true }],
  image: null,
};

describe('baseUrl', () => {
  it('prefers an explicit public URL', () => {
    expect(baseUrl(makeReq('/r/x'), 'https://venn.app/')).toBe('https://venn.app');
  });

  it('falls back to the request host', () => {
    expect(baseUrl(makeReq('/r/x'))).toBe('https://venn.example');
  });

  it('uses http for localhost', () => {
    expect(baseUrl(makeReq('/r/x', {}, { headers: { host: 'localhost:3000' } }))).toBe('http://localhost:3000');
  });

  it('honours a forwarded protocol', () => {
    expect(baseUrl(makeReq('/r/x', {}, { headers: { 'x-forwarded-proto': 'http' } }))).toBe('http://venn.example');
  });
});

describe('buildMetaTags', () => {
  const round = { ...payload, id: 'abcdef', hasImage: true };

  it('titles the card with the label and both images', () => {
    const tags = buildMetaTags(round, 'https://venn.example/r/abcdef', 'https://venn.example/r/abcdef/image.png');
    expect(tags).toContain('Fusion Point — Forest × Circuit');
  });

  it('quotes the winning answer in the description', () => {
    const tags = buildMetaTags(round, 'u', 'i');
    expect(tags).toContain('Branching paths');
    expect(tags).toContain('9/10');
  });

  it('uses a large image card when an image exists', () => {
    const tags = buildMetaTags(round, 'u', 'https://venn.example/img.png');
    expect(tags).toContain('og:image');
    expect(tags).toContain('summary_large_image');
  });

  it('omits og:image when the round has none', () => {
    // Pointing a card at a 404 is worse than having no image.
    const tags = buildMetaTags({ ...round, hasImage: false }, 'u', 'i');
    expect(tags).not.toContain('og:image');
    expect(tags).toContain('name="twitter:card" content="summary"');
  });

  it('escapes player-supplied text', () => {
    const hostile = {
      ...round,
      label: '"><script>alert(1)</script>',
      submissions: [{ ...round.submissions[0], content: '"><img src=x onerror=alert(1)>' }],
    };
    const tags = buildMetaTags(hostile, 'u', 'i');
    // The payload's own angle brackets and quotes must not survive raw — the
    // words inside stay as inert text, which is the point of escaping.
    expect(tags).not.toContain('<script>');
    expect(tags).not.toContain('<img');
    expect(tags).not.toContain('="">');
    expect(tags).toContain('&quot;');
    expect(tags).toContain('&lt;script&gt;');
  });
});

describe('injectMeta', () => {
  it('replaces the marked default block', () => {
    const out = injectMeta(SHELL, '<meta property="og:title" content="Round">');
    expect(out).toContain('content="Round"');
    expect(out).not.toContain('Battle the AI!');
  });

  it('falls back to appending before </head> when markers are absent', () => {
    const out = injectMeta('<html><head><title>x</title></head><body></body></html>', '<meta name="t">');
    expect(out).toContain('<meta name="t">');
    expect(out.indexOf('<meta name="t">')).toBeLessThan(out.indexOf('</head>'));
  });
});

describe('createShareHandler', () => {
  it('creates a round and returns its permalink', async () => {
    const handler = createShareHandler({ store: await tempStore() });
    const res = await call(handler, makeReq('/api/rounds', payload));
    expect(res.statusCode).toBe(201);
    expect(res.body.url).toMatch(/^https:\/\/venn\.example\/r\/[a-z2-9]+$/);
  });

  it('serves the created round as JSON', async () => {
    const handler = createShareHandler({ store: await tempStore() });
    const created = await call(handler, makeReq('/api/rounds', payload));
    const fetched = await call(handler, makeReq(`/api/rounds/${created.body.id}`, null, { method: 'GET' }));
    expect(fetched.statusCode).toBe(200);
    expect(fetched.body.label).toBe('Fusion Point');
  });

  it('404s an unknown round', async () => {
    const handler = createShareHandler({ store: await tempStore() });
    const res = await call(handler, makeReq('/api/rounds/aaaaaaaaaa', null, { method: 'GET' }));
    expect(res.statusCode).toBe(404);
  });

  it('rejects an invalid payload', async () => {
    const handler = createShareHandler({ store: await tempStore() });
    const res = await call(handler, makeReq('/api/rounds', { ...payload, submissions: [] }));
    expect(res.statusCode).toBe(400);
  });

  it('blocks a cross-origin create', async () => {
    const handler = createShareHandler({ store: await tempStore() });
    const res = await call(handler, makeReq('/api/rounds', payload, { headers: { origin: 'https://evil.example' } }));
    expect(res.statusCode).toBe(403);
  });

  it('rate limits creation', async () => {
    const handler = createShareHandler({ store: await tempStore(), config: { capacity: 5, windowMs: 60_000 } });
    expect((await call(handler, makeReq('/api/rounds', payload))).statusCode).toBe(201);
    // Creation costs 5 credits, so a second one in the same window is refused.
    expect((await call(handler, makeReq('/api/rounds', payload))).statusCode).toBe(429);
  });

  it('serves the stored image with an immutable cache header', async () => {
    const handler = createShareHandler({ store: await tempStore() });
    const withImage = { ...payload, image: `data:image/png;base64,${Buffer.from('png').toString('base64')}` };
    const created = await call(handler, makeReq('/api/rounds', withImage));

    const res = await call(handler, makeReq(`/r/${created.body.id}/image.png`, null, { method: 'GET' }));
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('404s an image the round never had', async () => {
    const handler = createShareHandler({ store: await tempStore() });
    const created = await call(handler, makeReq('/api/rounds', payload));
    const res = await call(handler, makeReq(`/r/${created.body.id}/image.png`, null, { method: 'GET' }));
    expect(res.statusCode).toBe(404);
  });

  it('serves the page with the round Open Graph tags injected', async () => {
    const handler = createShareHandler({
      store: await tempStore(),
      getIndexHtml: async () => SHELL,
      publicUrl: 'https://venn.app',
    });
    const created = await call(handler, makeReq('/api/rounds', payload));
    const res = await call(handler, makeReq(`/r/${created.body.id}`, null, { method: 'GET' }));

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/html');
    expect(res.raw).toContain('Fusion Point — Forest × Circuit');
    expect(res.raw).toContain(`https://venn.app/r/${created.body.id}`);
    expect(res.raw).not.toContain('Battle the AI!');
  });

  it('falls through to the SPA for an unknown round page', async () => {
    const next = vi.fn();
    const handler = createShareHandler({ store: await tempStore(), getIndexHtml: async () => SHELL });
    await call(handler, makeReq('/r/aaaaaaaaaa', null, { method: 'GET' }), next);
    expect(next).toHaveBeenCalled();
  });

  it('falls through for a malformed round id', async () => {
    const next = vi.fn();
    const handler = createShareHandler({ store: await tempStore(), getIndexHtml: async () => SHELL });
    await call(handler, makeReq('/r/NOT-AN-ID', null, { method: 'GET' }), next);
    expect(next).toHaveBeenCalled();
  });

  it('ignores unrelated paths', async () => {
    const next = vi.fn();
    const handler = createShareHandler({ store: await tempStore() });
    await call(handler, makeReq('/api/moderate', {}, { method: 'POST' }), next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects a non-GET on a round resource', async () => {
    const handler = createShareHandler({ store: await tempStore() });
    const res = await call(handler, makeReq('/api/rounds/aaaaaaaaaa', {}, { method: 'DELETE' }));
    expect(res.statusCode).toBe(405);
  });

  it('rejects an oversized body', async () => {
    const handler = createShareHandler({ store: await tempStore(), config: { maxBodyBytes: 50 } });
    const res = await call(handler, makeReq('/api/rounds', payload));
    expect(res.statusCode).toBe(413);
  });
});
