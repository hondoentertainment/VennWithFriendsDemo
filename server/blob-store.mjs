/**
 * Shared-round store backed by Vercel Blob.
 *
 * Same shape as createRoundStore (save / get / image / prune) so the share
 * handler does not care which one it is talking to. Pathnames are
 * `rounds/{id}.json` and `rounds/{id}.png` — no random suffix, so a later
 * isolate can find them by id.
 *
 * Blob methods are injectable so tests do not need a real store.
 */

import { buffer } from 'node:stream/consumers';
import { del as blobDel, get as blobGet, list as blobList, put as blobPut } from '@vercel/blob';
import { HttpError } from './guard.mjs';
import { generateId, isValidId } from './rounds.mjs';

export function blobConfigured(env = process.env) {
  return Boolean(env.BLOB_READ_WRITE_TOKEN || (env.BLOB_STORE_ID && env.VERCEL_OIDC_TOKEN));
}

const PREFIX = 'rounds/';
const ACCESS = 'private';

export function createBlobRoundStore({
  ttlMs = 30 * 24 * 60 * 60 * 1000,
  maxRounds = 5000,
  now = () => Date.now(),
  put = blobPut,
  get = blobGet,
  del = blobDel,
  list = blobList,
  configured = blobConfigured,
} = {}) {
  const jsonPath = (id) => `${PREFIX}${id}.json`;
  const imagePath = (id) => `${PREFIX}${id}.png`;

  async function remove(id) {
    await del([jsonPath(id), imagePath(id)]);
  }

  async function readBuffer(pathname) {
    try {
      const result = await get(pathname, { access: ACCESS });
      if (result.statusCode !== 200 || !result.stream) return null;
      return Buffer.from(await buffer(result.stream));
    } catch {
      return null;
    }
  }

  async function listJson() {
    const out = [];
    let cursor;
    do {
      const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
      for (const blob of page.blobs ?? []) {
        if (blob.pathname?.endsWith('.json')) out.push(blob);
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out;
  }

  /**
   * Age prefers the record's createdAt (same rule as the filesystem store).
   * uploadedAt from list() is the fallback so a prune pass can still bound
   * the store if a record is unreadable.
   */
  async function ageOf(id, uploadedAt) {
    const raw = await readBuffer(jsonPath(id));
    if (raw) {
      try {
        const record = JSON.parse(raw.toString('utf8'));
        if (Number.isFinite(record?.createdAt)) return now() - record.createdAt;
      } catch {
        // Fall through to upload time.
      }
    }
    if (uploadedAt) {
      const t = uploadedAt instanceof Date ? uploadedAt.getTime() : Date.parse(uploadedAt);
      if (Number.isFinite(t)) return now() - t;
    }
    return null;
  }

  async function prune() {
    const entries = await listJson();
    const alive = [];
    for (const blob of entries) {
      const id = blob.pathname.slice(PREFIX.length, -'.json'.length);
      if (!isValidId(id)) continue;
      const age = await ageOf(id, blob.uploadedAt);
      if (age === null) continue;
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
      if (!configured()) {
        throw new HttpError(
          503,
          'Shared rounds need Vercel Blob — connect a Blob store or set BLOB_READ_WRITE_TOKEN'
        );
      }
      const id = generateId();
      await put(jsonPath(id), JSON.stringify({ ...record, id, createdAt: now() }), {
        access: ACCESS,
        addRandomSuffix: false,
        contentType: 'application/json',
      });
      if (imageBuffer) {
        await put(imagePath(id), imageBuffer, {
          access: ACCESS,
          addRandomSuffix: false,
          contentType: 'image/png',
        });
      }
      void prune().catch(() => {});
      return id;
    },

    async get(id) {
      if (!isValidId(id)) return null;
      const raw = await readBuffer(jsonPath(id));
      if (!raw) return null;
      try {
        const record = JSON.parse(raw.toString('utf8'));
        const age = Number.isFinite(record?.createdAt) ? now() - record.createdAt : null;
        if (age !== null && age > ttlMs) {
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
      return readBuffer(imagePath(id));
    },

    prune,
  };
}
