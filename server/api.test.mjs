import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stand in for the Gemini SDK so the guards can be exercised without ever
// making — or paying for — a real upstream call.
const generateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {
      this.models = { generateContent };
    }
  },
  Type: new Proxy({}, { get: (_, key) => String(key) }),
  Modality: { AUDIO: 'AUDIO' },
}));

const { createApiHandler } = await import('./genai.mjs');

function makeReq(url, body, { method = 'POST', headers = {} } = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body ?? {});
  const req = Readable.from([Buffer.from(payload)]);
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
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    end(payload) {
      this.body = payload ? JSON.parse(payload) : undefined;
      this.ended = true;
    },
  };
}

async function call(handler, req) {
  const res = makeRes();
  await handler(req, res);
  return res;
}

const validBody = {
  imageA: { title: 'Forest', description: 'trees' },
  imageB: { title: 'Circuit', description: 'silicon' },
};

describe('createApiHandler', () => {
  beforeEach(() => {
    generateContent.mockReset();
    generateContent.mockResolvedValue({ text: 'A quiet fusion' });
  });

  it('serves a valid request', async () => {
    const handler = createApiHandler(() => 'key');
    const res = await call(handler, makeReq('/api/submission', validBody));
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ text: 'A quiet fusion' });
  });

  it('passes unknown paths to the next middleware', async () => {
    const handler = createApiHandler(() => 'key');
    const next = vi.fn();
    await handler(makeReq('/not-api', {}), makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects a non-POST method', async () => {
    const handler = createApiHandler(() => 'key');
    const res = await call(handler, makeReq('/api/submission', {}, { method: 'GET' }));
    expect(res.statusCode).toBe(405);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('blocks a cross-origin caller before spending anything', async () => {
    const handler = createApiHandler(() => 'key');
    const res = await call(
      handler,
      makeReq('/api/submission', validBody, { headers: { origin: 'https://evil.example' } })
    );
    expect(res.statusCode).toBe(403);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('answers a preflight from an allowlisted origin', async () => {
    const handler = createApiHandler(() => 'key', { allowedOrigins: ['https://app.example'] });
    const res = await call(
      handler,
      makeReq('/api/submission', {}, { method: 'OPTIONS', headers: { origin: 'https://app.example' } })
    );
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://app.example');
  });

  it('rate limits before reaching the model', async () => {
    // One credit of capacity: the second call must be refused, and the model
    // must not be called a second time.
    const handler = createApiHandler(() => 'key', { capacity: 1, windowMs: 60_000 });
    const first = await call(handler, makeReq('/api/submission', validBody));
    const second = await call(handler, makeReq('/api/submission', validBody));

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.headers['retry-after']).toBeDefined();
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('charges expensive routes more of the budget', async () => {
    generateContent.mockResolvedValue({ candidates: [{ content: { parts: [] } }] });
    // 8 credits buys exactly one image generation and no more.
    const handler = createApiHandler(() => 'key', { capacity: 8, windowMs: 60_000 });
    const body = { ...validBody, winningText: 'Branching paths' };
    expect((await call(handler, makeReq('/api/visualize', body))).statusCode).toBe(200);
    expect((await call(handler, makeReq('/api/visualize', body))).statusCode).toBe(429);
  });

  it('rejects an invalid payload without calling the model', async () => {
    const handler = createApiHandler(() => 'key');
    const res = await call(handler, makeReq('/api/submission', { imageA: { title: '' } }));
    expect(res.statusCode).toBe(400);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON', async () => {
    const handler = createApiHandler(() => 'key');
    const res = await call(handler, makeReq('/api/submission', '{not json'));
    expect(res.statusCode).toBe(400);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('rejects an oversized body', async () => {
    const handler = createApiHandler(() => 'key', { maxBodyBytes: 100 });
    const big = { ...validBody, imageA: { title: 'x'.repeat(500), description: 'y' } };
    const res = await call(handler, makeReq('/api/submission', big));
    expect(res.statusCode).toBe(413);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('reports a missing API key as a server misconfiguration', async () => {
    const handler = createApiHandler(() => undefined);
    const res = await call(handler, makeReq('/api/submission', validBody));
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/GEMINI_API_KEY/);
  });

  it('does not leak upstream error detail to the caller', async () => {
    generateContent.mockRejectedValue(new Error('quota exceeded for project acme-1234 key AIzaSy...'));
    const handler = createApiHandler(() => 'key');
    const res = await call(handler, makeReq('/api/submission', validBody));
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toBe('Upstream error');
  });

  it('sheds load when too many calls are already in flight', async () => {
    let release;
    generateContent.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ text: 'ok' }); }));

    const handler = createApiHandler(() => 'key', { maxConcurrent: 1, capacity: 100 });
    const inflight = call(handler, makeReq('/api/submission', validBody));
    // Let the first request reach the gate before the second arrives.
    await new Promise((resolve) => setImmediate(resolve));
    const shed = await call(handler, makeReq('/api/submission', validBody));

    expect(shed.statusCode).toBe(503);
    release();
    expect((await inflight).statusCode).toBe(200);
  });
});
