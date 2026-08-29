import { describe, expect, it } from 'vitest';
import {
  HttpError,
  clientIp,
  createConcurrencyGate,
  createRateLimiter,
  guardConfigFromEnv,
  isOriginAllowed,
  parseOrigins,
} from './guard.mjs';

describe('createRateLimiter', () => {
  it('allows a burst up to capacity and then blocks', () => {
    const limiter = createRateLimiter({ capacity: 3, windowMs: 1000, now: () => 0 });
    expect(limiter.take('ip').ok).toBe(true);
    expect(limiter.take('ip').ok).toBe(true);
    expect(limiter.take('ip').ok).toBe(true);
    expect(limiter.take('ip').ok).toBe(false);
  });

  it('tracks callers independently', () => {
    const limiter = createRateLimiter({ capacity: 1, windowMs: 1000, now: () => 0 });
    expect(limiter.take('a').ok).toBe(true);
    expect(limiter.take('a').ok).toBe(false);
    expect(limiter.take('b').ok).toBe(true);
  });

  it('charges the caller the route cost', () => {
    const limiter = createRateLimiter({ capacity: 10, windowMs: 1000, now: () => 0 });
    expect(limiter.take('ip', 8).ok).toBe(true);
    // Only 2 credits left, so an 8-credit call cannot go through.
    expect(limiter.take('ip', 8).ok).toBe(false);
    expect(limiter.take('ip', 2).ok).toBe(true);
  });

  it('refills continuously as time passes', () => {
    let now = 0;
    const limiter = createRateLimiter({ capacity: 10, windowMs: 1000, now: () => now });
    expect(limiter.take('ip', 10).ok).toBe(true);
    expect(limiter.take('ip', 1).ok).toBe(false);

    now = 500; // half a window => 5 credits back
    expect(limiter.take('ip', 5).ok).toBe(true);
    expect(limiter.take('ip', 1).ok).toBe(false);
  });

  it('never refills beyond capacity', () => {
    let now = 0;
    const limiter = createRateLimiter({ capacity: 5, windowMs: 1000, now: () => now });
    limiter.take('ip', 5);
    now = 100_000; // idle far longer than a window
    expect(limiter.take('ip', 5).ok).toBe(true);
    expect(limiter.take('ip', 1).ok).toBe(false);
  });

  it('reports a retry-after that is long enough to succeed', () => {
    let now = 0;
    const limiter = createRateLimiter({ capacity: 10, windowMs: 10_000, now: () => now });
    limiter.take('ip', 10);
    const denied = limiter.take('ip', 5);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);

    now = denied.retryAfterSeconds * 1000;
    expect(limiter.take('ip', 5).ok).toBe(true);
  });

  it('evicts idle buckets instead of growing without bound', () => {
    let now = 0;
    const limiter = createRateLimiter({ capacity: 2, windowMs: 1000, maxKeys: 5, now: () => now });
    for (let i = 0; i < 5; i++) limiter.take(`ip-${i}`, 1);
    expect(limiter.size).toBe(5);

    now = 5000; // every existing bucket has refilled to capacity
    limiter.take('ip-new', 1);
    expect(limiter.size).toBeLessThan(6);
  });

  it('keeps buckets that are still drawn down', () => {
    const limiter = createRateLimiter({ capacity: 4, windowMs: 1000, maxKeys: 2, now: () => 0 });
    limiter.take('spender', 4);
    limiter.take('other', 4);
    limiter.take('third', 1);
    // A sweep at t=0 refills nothing, so the drawn-down bucket must survive
    // and still be rate limited.
    expect(limiter.take('spender', 1).ok).toBe(false);
  });
});

describe('clientIp', () => {
  const req = (headers, remoteAddress = '10.0.0.1') => ({ headers, socket: { remoteAddress } });

  it('uses the socket address when no proxy is trusted', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4' }), 0)).toBe('10.0.0.1');
  });

  it('ignores a spoofed forwarded header when no proxy is trusted', () => {
    // The header is caller-controlled; trusting it would let anyone reset
    // their own rate-limit bucket at will.
    expect(clientIp(req({ 'x-forwarded-for': 'evil' }), 0)).not.toBe('evil');
  });

  it('reads the address the trusted proxy observed', () => {
    expect(clientIp(req({ 'x-forwarded-for': 'spoofed, 203.0.113.7' }), 1)).toBe('203.0.113.7');
  });

  it('skips the declared number of hops', () => {
    expect(clientIp(req({ 'x-forwarded-for': 'spoofed, 203.0.113.7, 10.1.1.1' }), 2)).toBe('203.0.113.7');
  });

  it('falls back to the socket address when the header is absent', () => {
    expect(clientIp(req({}), 1)).toBe('10.0.0.1');
  });
});

describe('isOriginAllowed', () => {
  const req = (origin, host = 'venn.example') => ({ headers: { origin, host } });

  it('allows requests with no Origin header', () => {
    expect(isOriginAllowed({ headers: { host: 'venn.example' } }, [])).toBe(true);
  });

  it('allows same-origin requests with no configuration', () => {
    expect(isOriginAllowed(req('https://venn.example'), [])).toBe(true);
  });

  it('rejects cross-origin requests that are not allowlisted', () => {
    expect(isOriginAllowed(req('https://evil.example'), [])).toBe(false);
  });

  it('allows an explicitly allowlisted cross-origin caller', () => {
    expect(isOriginAllowed(req('https://staging.example'), ['https://staging.example'])).toBe(true);
  });

  it('ignores a trailing slash when matching', () => {
    expect(isOriginAllowed(req('https://staging.example/'), ['https://staging.example'])).toBe(true);
  });

  it('does not treat a lookalike host as same-origin', () => {
    expect(isOriginAllowed(req('https://venn.example.evil.com'), [])).toBe(false);
  });

  it('rejects a malformed Origin', () => {
    expect(isOriginAllowed(req('not a url'), [])).toBe(false);
  });
});

describe('parseOrigins', () => {
  it('splits, trims, and drops empties', () => {
    expect(parseOrigins(' https://a.example , ,https://b.example/ ')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  it('returns an empty list when unset', () => {
    expect(parseOrigins(undefined)).toEqual([]);
  });
});

describe('createConcurrencyGate', () => {
  it('runs work under the limit and returns its value', async () => {
    const gate = createConcurrencyGate(2);
    await expect(gate.run(async () => 'done')).resolves.toBe('done');
    expect(gate.active).toBe(0);
  });

  it('sheds load beyond the limit', async () => {
    const gate = createConcurrencyGate(1);
    let release;
    const inflight = gate.run(() => new Promise((resolve) => { release = resolve; }));

    await expect(gate.run(async () => 'second')).rejects.toBeInstanceOf(HttpError);

    release('first');
    await inflight;
    // The slot frees again once the in-flight call settles.
    await expect(gate.run(async () => 'later')).resolves.toBe('later');
  });

  it('frees the slot when the work throws', async () => {
    const gate = createConcurrencyGate(1);
    await expect(gate.run(async () => { throw new Error('upstream'); })).rejects.toThrow('upstream');
    expect(gate.active).toBe(0);
  });
});

describe('guardConfigFromEnv', () => {
  it('applies defaults when nothing is configured', () => {
    const config = guardConfigFromEnv({});
    expect(config.allowedOrigins).toEqual([]);
    expect(config.trustedHops).toBe(0);
    expect(config.capacity).toBeGreaterThan(0);
    expect(config.maxConcurrent).toBeGreaterThan(0);
  });

  it('trusts one proxy hop on Vercel unless overridden', () => {
    expect(guardConfigFromEnv({ VERCEL: '1' }).trustedHops).toBe(1);
    expect(guardConfigFromEnv({ VERCEL: '1', TRUST_PROXY_HOPS: '0' }).trustedHops).toBe(0);
    expect(guardConfigFromEnv({ VERCEL: '1', TRUST_PROXY_HOPS: '2' }).trustedHops).toBe(2);
  });

  it('reads overrides from the environment', () => {
    const config = guardConfigFromEnv({
      ALLOWED_ORIGINS: 'https://a.example',
      TRUST_PROXY_HOPS: '1',
      RATE_LIMIT_CREDITS: '5',
      MAX_CONCURRENT_UPSTREAM: '2',
    });
    expect(config).toMatchObject({
      allowedOrigins: ['https://a.example'],
      trustedHops: 1,
      capacity: 5,
      maxConcurrent: 2,
    });
  });
});
