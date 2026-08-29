import { describe, expect, it } from 'vitest';
import { createBlobRoundStore } from './blob-store.mjs';
import { createRoundStore } from './rounds.mjs';
import { createStoreFromEnv, usesFilesystemStore } from './store.mjs';

describe('usesFilesystemStore', () => {
  it('uses the disk store off Vercel', () => {
    expect(usesFilesystemStore({})).toBe(true);
    expect(usesFilesystemStore({ VERCEL: '' })).toBe(true);
  });

  it('uses Blob on Vercel unless ROUNDS_DIR is set', () => {
    expect(usesFilesystemStore({ VERCEL: '1' })).toBe(false);
    expect(usesFilesystemStore({ VERCEL: '1', ROUNDS_DIR: '/tmp/rounds' })).toBe(true);
  });
});

describe('createStoreFromEnv', () => {
  it('returns a store with the filesystem contract off Vercel', () => {
    const store = createStoreFromEnv({ ROUNDS_DIR: '/tmp/venn-rounds-factory' });
    expect(store).toMatchObject({
      save: expect.any(Function),
      get: expect.any(Function),
      image: expect.any(Function),
      prune: expect.any(Function),
    });
  });

  it('returns a Blob-backed store when VERCEL is set and ROUNDS_DIR is not', () => {
    const store = createStoreFromEnv({ VERCEL: '1' }, {
      put: async () => ({}),
      get: async () => { throw new Error('unused'); },
      del: async () => {},
      list: async () => ({ blobs: [], hasMore: false }),
    });
    expect(store).toMatchObject({
      save: expect.any(Function),
      get: expect.any(Function),
      image: expect.any(Function),
    });
    expect(store).not.toBe(createRoundStore());
  });
});

function memoryBlob(now = () => Date.now()) {
  const files = new Map();
  return {
    files,
    async put(pathname, body) {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
      files.set(pathname, { body: buf, uploadedAt: new Date(now()) });
      return { pathname };
    },
    async get(pathname) {
      const entry = files.get(pathname);
      if (!entry) throw new Error('not found');
      return {
        statusCode: 200,
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(entry.body);
            controller.close();
          },
        }),
      };
    },
    async del(pathname) {
      for (const p of Array.isArray(pathname) ? pathname : [pathname]) files.delete(p);
    },
    async list({ prefix = '' } = {}) {
      const blobs = [...files.entries()]
        .filter(([path]) => path.startsWith(prefix))
        .map(([pathname, entry]) => ({ pathname, uploadedAt: entry.uploadedAt }));
      return { blobs, hasMore: false };
    },
  };
}

describe('createBlobRoundStore', () => {
  it('round-trips a record', async () => {
    const blob = memoryBlob();
    const store = createBlobRoundStore(blob);
    const id = await store.save({ label: 'Fusion Point' }, null);
    const loaded = await store.get(id);
    expect(loaded.label).toBe('Fusion Point');
    expect(loaded.id).toBe(id);
    expect(loaded.createdAt).toBeGreaterThan(0);
  });

  it('stores and returns the image', async () => {
    const blob = memoryBlob();
    const store = createBlobRoundStore(blob);
    const id = await store.save({ label: 'x' }, Buffer.from('png-bytes'));
    expect((await store.image(id)).toString()).toBe('png-bytes');
  });

  it('returns null for an unknown or traversal id', async () => {
    const store = createBlobRoundStore(memoryBlob());
    expect(await store.get('aaaaaaaaaa')).toBeNull();
    expect(await store.image('aaaaaaaaaa')).toBeNull();
    expect(await store.get('../../../etc/passwd')).toBeNull();
  });

  it('expires a record past its TTL', async () => {
    let t = 1_000_000;
    const blob = memoryBlob(() => t);
    const store = createBlobRoundStore({ ...blob, ttlMs: 1000, now: () => t });
    const id = await store.save({ label: 'x' }, null);
    expect(await store.get(id)).not.toBeNull();
    t += 5000;
    expect(await store.get(id)).toBeNull();
  });

  it('prunes expired records and drops the oldest over the cap', async () => {
    let t = 1_000_000;
    const blob = memoryBlob(() => t);
    const store = createBlobRoundStore({ ...blob, ttlMs: 1000, maxRounds: 2, now: () => t });
    const first = await store.save({ label: 'a' }, Buffer.from('x'));
    t += 10;
    await store.save({ label: 'b' }, null);
    t += 10;
    await store.save({ label: 'c' }, null);

    t += 60_000;
    await store.prune();
    expect(await store.get(first)).toBeNull();
    expect([...blob.files.keys()].filter((k) => k.endsWith('.json')).length).toBeLessThanOrEqual(2);
  });
});
