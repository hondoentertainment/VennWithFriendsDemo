import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoundStore, generateId, isValidId, parseSharePayload } from './rounds.mjs';

const dirs = [];
async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'venn-rounds-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  dirs.length = 0;
});

const validPayload = () => ({
  imageA: { title: 'Forest', url: 'https://cdn.example/a.jpg', mediaType: 'image' },
  imageB: { title: 'Circuit', url: 'https://cdn.example/b.mp4', mediaType: 'video' },
  label: 'Fusion Point',
  reasoning: 'It bridges both.',
  submissions: [
    { name: 'Ada', avatar: '🦊', color: 'from-a to-b', content: 'Branching paths', score: 9, isWinner: true },
    { name: 'Circuit', avatar: '🤖', color: 'from-c to-d', content: 'Silicon roots', score: 6, isWinner: false },
  ],
  image: null,
});

function expectStatus(fn, status) {
  try {
    fn();
  } catch (error) {
    expect(error.status).toBe(status);
    return error;
  }
  throw new Error('expected a throw');
}

describe('generateId / isValidId', () => {
  it('produces ids that validate', () => {
    for (let i = 0; i < 20; i++) expect(isValidId(generateId())).toBe(true);
  });

  it('produces distinct ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateId()));
    expect(ids.size).toBe(200);
  });

  it('omits look-alike characters', () => {
    const id = generateId(Buffer.from(Array.from({ length: 64 }, (_, i) => i)));
    expect(id).not.toMatch(/[l1o0]/);
  });

  it('rejects ids that could escape the storage directory', () => {
    // Ids arrive from URLs and are used to build file paths.
    expect(isValidId('../../etc/passwd')).toBe(false);
    expect(isValidId('abc/def')).toBe(false);
    expect(isValidId('ABCDEF')).toBe(false);
    expect(isValidId('short')).toBe(false);
    expect(isValidId('')).toBe(false);
    expect(isValidId(null)).toBe(false);
  });
});

describe('parseSharePayload', () => {
  it('accepts a well-formed payload', () => {
    const { record, image } = parseSharePayload(validPayload());
    expect(image).toBeNull();
    expect(record.label).toBe('Fusion Point');
    expect(record.submissions).toHaveLength(2);
    expect(record.hasImage).toBe(false);
  });

  it('keeps only the fields the shared page renders', () => {
    const payload = validPayload();
    payload.imageA.description = 'secret';
    payload.imageA.tags = ['x'];
    const { record } = parseSharePayload(payload);
    expect(Object.keys(record.imageA).sort()).toEqual(['mediaType', 'title', 'url']);
  });

  it('decodes a PNG data URL', () => {
    const payload = { ...validPayload(), image: `data:image/png;base64,${Buffer.from('fake').toString('base64')}` };
    const { record, image } = parseSharePayload(payload);
    expect(image).toBeInstanceOf(Buffer);
    expect(image.toString()).toBe('fake');
    expect(record.hasImage).toBe(true);
  });

  it('rejects a non-PNG or non-data image', () => {
    expectStatus(() => parseSharePayload({ ...validPayload(), image: 'https://evil.example/x.png' }), 400);
    expectStatus(() => parseSharePayload({ ...validPayload(), image: 'data:text/html;base64,aGk=' }), 400);
  });

  it('rejects a media URL that is not http(s)', () => {
    // A javascript: or data: URL here would be rendered by the shared page.
    const payload = validPayload();
    payload.imageA.url = 'javascript:alert(1)';
    expectStatus(() => parseSharePayload(payload), 400);
  });

  it('clamps scores into range', () => {
    const payload = validPayload();
    payload.submissions[0].score = 99;
    payload.submissions[1].score = -4;
    const { record } = parseSharePayload(payload);
    expect(record.submissions.map(s => s.score)).toEqual([10, 0]);
  });

  it('treats a non-numeric score as zero', () => {
    const payload = validPayload();
    payload.submissions[0].score = 'lots';
    expect(parseSharePayload(payload).record.submissions[0].score).toBe(0);
  });

  it('coerces isWinner to a real boolean', () => {
    const payload = validPayload();
    payload.submissions[0].isWinner = 'yes';
    expect(parseSharePayload(payload).record.submissions[0].isWinner).toBe(false);
  });

  it('rejects an empty or oversized submission list', () => {
    expectStatus(() => parseSharePayload({ ...validPayload(), submissions: [] }), 400);
    const many = Array.from({ length: 33 }, () => validPayload().submissions[0]);
    expectStatus(() => parseSharePayload({ ...validPayload(), submissions: many }), 400);
  });

  it('rejects an over-long name or answer', () => {
    const payload = validPayload();
    payload.submissions[0].name = 'x'.repeat(41);
    expectStatus(() => parseSharePayload(payload), 400);

    const other = validPayload();
    other.submissions[0].content = 'x'.repeat(501);
    expectStatus(() => parseSharePayload(other), 400);
  });

  it('allows an empty label and reasoning', () => {
    const { record } = parseSharePayload({ ...validPayload(), label: '', reasoning: undefined });
    expect(record.label).toBe('');
    expect(record.reasoning).toBe('');
  });

  it('rejects a non-object body', () => {
    expectStatus(() => parseSharePayload(null), 400);
    expectStatus(() => parseSharePayload([]), 400);
  });
});

describe('createRoundStore', () => {
  it('round-trips a record', async () => {
    const store = createRoundStore({ dir: await tempDir() });
    const { record } = parseSharePayload(validPayload());
    const id = await store.save(record, null);

    const loaded = await store.get(id);
    expect(loaded.label).toBe('Fusion Point');
    expect(loaded.id).toBe(id);
    expect(loaded.createdAt).toBeGreaterThan(0);
  });

  it('stores and returns the image', async () => {
    const store = createRoundStore({ dir: await tempDir() });
    const id = await store.save({ label: 'x' }, Buffer.from('png-bytes'));
    expect((await store.image(id)).toString()).toBe('png-bytes');
  });

  it('returns null for an unknown id', async () => {
    const store = createRoundStore({ dir: await tempDir() });
    expect(await store.get('aaaaaaaaaa')).toBeNull();
    expect(await store.image('aaaaaaaaaa')).toBeNull();
  });

  it('refuses a traversal id without touching the filesystem', async () => {
    const store = createRoundStore({ dir: await tempDir() });
    expect(await store.get('../../../etc/passwd')).toBeNull();
    expect(await store.image('../../../etc/passwd')).toBeNull();
  });

  it('expires a record past its TTL', async () => {
    let now = 1_000_000;
    const store = createRoundStore({ dir: await tempDir(), ttlMs: 1000, now: () => now });
    const id = await store.save({ label: 'x' }, null);
    expect(await store.get(id)).not.toBeNull();

    now += 5000;
    expect(await store.get(id)).toBeNull();
  });

  it('prunes expired records from disk', async () => {
    const dir = await tempDir();
    let now = 1_000_000;
    const store = createRoundStore({ dir, ttlMs: 1000, now: () => now });
    await store.save({ label: 'a' }, Buffer.from('x'));

    now += 60_000;
    await store.prune();
    expect(await readdir(dir)).toHaveLength(0);
  });

  it('drops the oldest records once over the cap', async () => {
    const dir = await tempDir();
    const store = createRoundStore({ dir, maxRounds: 2 });
    await store.save({ label: 'a' }, null);
    await store.save({ label: 'b' }, null);
    await store.save({ label: 'c' }, null);

    await store.prune();
    expect((await readdir(dir)).filter(f => f.endsWith('.json')).length).toBeLessThanOrEqual(2);
  });

  it('ignores unreadable files rather than failing the request', async () => {
    const dir = await tempDir();
    const store = createRoundStore({ dir });
    await writeFile(join(dir, 'notjson.json'), 'this is not json');
    expect(await store.get('notjson')).toBeNull();
    await expect(store.prune()).resolves.not.toThrow();
  });
});
