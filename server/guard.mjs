/**
 * Abuse controls for the /api/* Gemini proxy.
 *
 * Threat model: the API key no longer ships to the browser, but a deployed
 * proxy is still an open, billable Gemini endpoint. These controls bound the
 * damage:
 *   - origin checks stop other websites from spending the key via visitors'
 *     browsers,
 *   - the per-IP token bucket bounds bulk abuse from any single caller,
 *   - the concurrency cap bounds a cost spike from many callers at once,
 *   - payload validation (see validate.mjs) bounds prompt size per call.
 *
 * None of this authenticates callers — a determined direct client can still
 * spend against the key at the rate limit. A public deployment that matters
 * needs real user auth in front of this.
 */

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Per-route upstream cost, in rate-limiter credits. Image generation and TTS
 * are far more expensive than a text completion, so they draw down faster.
 */
export const ROUTE_COSTS = {
  '/api/commentary': 1,
  '/api/label': 1,
  '/api/submission': 1,
  '/api/moderate': 2,
  '/api/announce': 4,
  '/api/visualize': 8,
};

/**
 * Client address for rate limiting.
 *
 * X-Forwarded-For is attacker-controlled unless a trusted proxy rewrites it,
 * so it is only consulted when the deployment declares how many proxies sit
 * in front (TRUST_PROXY_HOPS). Counting from the right skips the hops we
 * trust and lands on the address they observed; anything further left was
 * supplied by the caller and must not be trusted.
 */
export function clientIp(req, trustedHops = 0) {
  if (trustedHops > 0) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const entries = String(forwarded)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const candidate = entries[entries.length - trustedHops];
      if (candidate) return candidate;
    }
  }
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Token bucket keyed by client address. Tokens refill continuously, so a
 * caller that stays under the sustained rate is never blocked while a burst
 * is still capped at `capacity`.
 *
 * `now` is injectable so the refill behaviour can be tested without timers.
 */
export function createRateLimiter({ capacity = 60, windowMs = 60_000, maxKeys = 10_000, now = () => Date.now() } = {}) {
  const buckets = new Map();
  const refillPerMs = capacity / windowMs;

  // Idle buckets are indistinguishable from absent ones once they refill to
  // capacity, so dropping them is free and keeps the map from growing without
  // bound under a spray of distinct addresses.
  function sweep(t) {
    for (const [key, bucket] of buckets) {
      if (bucket.tokens + (t - bucket.last) * refillPerMs >= capacity) buckets.delete(key);
    }
  }

  return {
    take(key, cost = 1) {
      const t = now();
      if (buckets.size >= maxKeys) sweep(t);

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { tokens: capacity, last: t };
        buckets.set(key, bucket);
      }

      bucket.tokens = Math.min(capacity, bucket.tokens + (t - bucket.last) * refillPerMs);
      bucket.last = t;

      if (bucket.tokens < cost) {
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((cost - bucket.tokens) / refillPerMs / 1000)) };
      }
      bucket.tokens -= cost;
      return { ok: true, retryAfterSeconds: 0 };
    },
    get size() {
      return buckets.size;
    },
  };
}

export function parseOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

/**
 * Same-origin requests are always allowed (browsers send Origin on same-origin
 * POSTs, so comparing against Host is what keeps the app working with no
 * configuration). Cross-origin callers must be explicitly allowlisted via
 * ALLOWED_ORIGINS — the default is deny, not allow.
 *
 * A missing Origin means a non-browser client; CORS was never a defence
 * against those, and the rate limiter is what bounds them.
 */
export function isOriginAllowed(req, allowedOrigins = []) {
  const origin = req.headers?.origin;
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, '');
  if (allowedOrigins.includes(normalized)) return true;
  try {
    return Boolean(req.headers.host) && new URL(normalized).host === req.headers.host;
  } catch {
    return false;
  }
}

/**
 * Caps simultaneous upstream calls. Without this, a burst from many distinct
 * addresses each passes its own rate-limit check and they all reach Gemini
 * together.
 */
export function createConcurrencyGate(limit = 8) {
  let active = 0;
  return {
    async run(fn) {
      if (active >= limit) throw new HttpError(503, 'Server busy — try again in a moment');
      active += 1;
      try {
        return await fn();
      } finally {
        active -= 1;
      }
    },
    get active() {
      return active;
    },
  };
}

/**
 * Reads guard configuration from the environment, with defaults that are safe
 * for a single-instance deployment.
 */
export function guardConfigFromEnv(env = process.env) {
  return {
    allowedOrigins: parseOrigins(env.ALLOWED_ORIGINS),
    // Vercel always sits behind its edge proxy. Without a hop, rate limiting
    // keys on the isolate rather than the client. An explicit TRUST_PROXY_HOPS
    // still wins, including `0` to turn this off.
    trustedHops:
      env.TRUST_PROXY_HOPS != null && env.TRUST_PROXY_HOPS !== ''
        ? Number(env.TRUST_PROXY_HOPS) || 0
        : env.VERCEL
          ? 1
          : 0,
    capacity: Number(env.RATE_LIMIT_CREDITS) || 60,
    windowMs: Number(env.RATE_LIMIT_WINDOW_MS) || 60_000,
    maxConcurrent: Number(env.MAX_CONCURRENT_UPSTREAM) || 8,
    maxBodyBytes: Number(env.MAX_BODY_BYTES) || 256_000,
  };
}
