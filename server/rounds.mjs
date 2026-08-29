/**
 * Storage for shared rounds.
 *
 * A shared round is the permalink behind the results screen's share button:
 * the two source images, every submission with its score, the verdict, and the
 * AI-generated fusion image. It exists so a link can render an Open Graph card
 * with the generated image on it.
 *
 * Design notes:
 *   - Ids are unguessable, because the link *is* the access control. There is
 *     no listing endpoint and no way to enumerate rounds.
 *   - Records expire (default 30 days). They contain player-chosen names and
 *     free text, so keeping them forever is a choice nobody made deliberately;
 *     expiry is the conservative default and TTL is configurable.
 *   - Storage is the filesystem rather than a database: one JSON file and one
 *     PNG per round. That keeps `npm start` / Render a single Node process.
 *     Hosts with an ephemeral disk (Vercel) use the Blob store in
 *     blob-store.mjs instead — see createStoreFromEnv.
 */

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HttpError } from './guard.mjs';

// No look-alikes (l/1, o/0). Exactly 32 symbols, so the byte-to-symbol
// mapping below is uniform rather than slightly biased toward the first few.
const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** ~50 bits of entropy — far past guessable, still short enough to paste. */
export function generateId(bytes = randomBytes(10)) {
  let id = '';
  for (const byte of bytes) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

// Ids come back from URLs, so they are validated before ever touching a path.
// Anything outside the alphabet is rejected rather than sanitised.
const ID_PATTERN = /^[a-z2-9]{6,32}$/;

export function isValidId(id) {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

export function createRoundStore({
  dir = '.data/rounds',
  ttlMs = 30 * 24 * 60 * 60 * 1000,
  maxRounds = 5000,
  now = () => Date.now(),
} = {}) {
  let ready = null;

  function ensureDir() {
    ready ??= mkdir(dir, { recursive: true });
    return ready;
  }

  const jsonPath = (id) => join(dir, `${id}.json`);
  const imagePath = (id) => join(dir, `${id}.png`);

  async function remove(id) {
    await Promise.all([
      rm(jsonPath(id), { force: true }),
      rm(imagePath(id), { force: true }),
    ]);
  }

  /**
   * Age is taken from the record's own `createdAt`, not the file's mtime:
   * mtime changes on copy, restore, or rsync, which would silently resurrect
   * expired rounds. mtime is only the fallback for a record too damaged to
   * parse — and such a record is expired on its next read anyway.
   */
  async function ageOf(id) {
    try {
      const record = JSON.parse(await readFile(jsonPath(id), 'utf8'));
      if (Number.isFinite(record?.createdAt)) return now() - record.createdAt;
    } catch {
      // Fall through to the filesystem.
    }
    try {
      return now() - (await stat(jsonPath(id))).mtimeMs;
    } catch {
      return null;
    }
  }

  /**
   * Drops expired rounds, then the oldest survivors if the store is over its
   * cap. Without the cap, a public instance grows until the disk fills.
   */
  async function prune() {
    await ensureDir();
    let entries;
    try {
      entries = (await readdir(dir)).filter((name) => name.endsWith('.json'));
    } catch {
      return;
    }

    const alive = [];
    for (const name of entries) {
      const id = name.slice(0, -5);
      const age = await ageOf(id);
      if (age === null) continue; // Raced with another prune or a manual delete.
      if (age > ttlMs) await remove(id);
      else alive.push({ id, age });
    }

    if (alive.length > maxRounds) {
      alive.sort((a, b) => b.age - a.age);
      for (const { id } of alive.slice(0, alive.length - maxRounds)) await remove(id);
    }
  }

  return {
    async save(record, imageBuffer) {
      await ensureDir();
      const id = generateId();
      await writeFile(jsonPath(id), JSON.stringify({ ...record, id, createdAt: now() }));
      if (imageBuffer) await writeFile(imagePath(id), imageBuffer);
      // Pruning after the write keeps the request off the critical path of a
      // directory scan while still bounding growth.
      void prune().catch(() => {});
      return id;
    },

    async get(id) {
      if (!isValidId(id)) return null;
      await ensureDir();
      try {
        const record = JSON.parse(await readFile(jsonPath(id), 'utf8'));
        const age = Number.isFinite(record?.createdAt)
          ? now() - record.createdAt
          : now() - (await stat(jsonPath(id))).mtimeMs;
        if (age > ttlMs) {
          await remove(id);
          return null;
        }
        return record;
      } catch {
        return null;
      }
    },

    async image(id) {
      if (!isValidId(id)) return null;
      try {
        return await readFile(imagePath(id));
      } catch {
        return null;
      }
    },

    prune,
  };
}

const LIMITS = {
  title: 200,
  label: 120,
  reasoning: 600,
  content: 500,
  name: 40,
  avatar: 8,
  color: 60,
  submissions: 32,
  imageBytes: 4_000_000,
};

function text(value, max, field, { required = true } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, `${field} is required`);
    return '';
  }
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be a string`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new HttpError(400, `${field} must not be empty`);
  if (trimmed.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return trimmed;
}

function sharedImage(value, field) {
  if (!value || typeof value !== 'object') throw new HttpError(400, `${field} must be an object`);
  const mediaType = value.mediaType === 'video' ? 'video' : 'image';
  const url = text(value.url, 500, `${field}.url`);
  // Only http(s) media is stored: a data: or javascript: URL here would be
  // echoed straight back into the shared page's markup.
  if (!/^https?:\/\//i.test(url)) throw new HttpError(400, `${field}.url must be an http(s) URL`);
  return { title: text(value.title, LIMITS.title, `${field}.title`), url, mediaType };
}

/**
 * Validates a share request and returns the record to persist plus the decoded
 * fusion image. As with the /api routes, the stored shape is built field by
 * field so nothing extra from the request survives into the shared page.
 */
export function parseSharePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object');
  }

  if (!Array.isArray(body.submissions)) throw new HttpError(400, 'submissions must be an array');
  if (body.submissions.length === 0) throw new HttpError(400, 'submissions must not be empty');
  if (body.submissions.length > LIMITS.submissions) {
    throw new HttpError(400, `submissions must contain at most ${LIMITS.submissions} entries`);
  }

  const submissions = body.submissions.map((entry, i) => {
    if (!entry || typeof entry !== 'object') throw new HttpError(400, `submissions[${i}] must be an object`);
    const score = Number(entry.score);
    return {
      name: text(entry.name, LIMITS.name, `submissions[${i}].name`),
      avatar: text(entry.avatar, LIMITS.avatar, `submissions[${i}].avatar`, { required: false }),
      color: text(entry.color, LIMITS.color, `submissions[${i}].color`, { required: false }),
      content: text(entry.content, LIMITS.content, `submissions[${i}].content`),
      score: Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0,
      isWinner: entry.isWinner === true,
    };
  });

  let image = null;
  if (body.image) {
    if (typeof body.image !== 'string') throw new HttpError(400, 'image must be a data URL string');
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(body.image);
    if (!match) throw new HttpError(400, 'image must be a base64 PNG data URL');
    image = Buffer.from(match[1], 'base64');
    if (image.length > LIMITS.imageBytes) throw new HttpError(413, 'image is too large');
  }

  return {
    record: {
      imageA: sharedImage(body.imageA, 'imageA'),
      imageB: sharedImage(body.imageB, 'imageB'),
      label: text(body.label, LIMITS.label, 'label', { required: false }),
      reasoning: text(body.reasoning, LIMITS.reasoning, 'reasoning', { required: false }),
      submissions,
      hasImage: Boolean(image),
    },
    image,
  };
}
