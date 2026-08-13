import { describe, expect, it } from 'vitest';
import { ImageItem } from '../types';
import { pickPair, tagOverlap } from './pairing';

const item = (id: string, tags: string[]): ImageItem => ({
  id,
  url: `https://example.com/${id}.jpg`,
  title: id,
  description: '',
  tags,
  mediaType: 'image',
});

// Deterministic "random" so pair selection can be asserted exactly.
const fixed = (value: number) => () => value;

describe('tagOverlap', () => {
  it('counts shared tags', () => {
    expect(tagOverlap(item('a', ['x', 'y', 'z']), item('b', ['y', 'z', 'w']))).toBe(2);
  });

  it('is zero for disjoint tags', () => {
    expect(tagOverlap(item('a', ['x']), item('b', ['y']))).toBe(0);
  });

  it('handles an image with no tags', () => {
    expect(tagOverlap(item('a', []), item('b', ['y']))).toBe(0);
  });
});

describe('pickPair', () => {
  it('throws on a deck too small to pair', () => {
    expect(() => pickPair([item('a', [])])).toThrow();
  });

  it('returns two distinct images', () => {
    const deck = [item('a', ['x']), item('b', ['y']), item('c', ['z'])];
    const [first, second] = pickPair(deck, { random: fixed(0) });
    expect(first.id).not.toBe(second.id);
  });

  it('prefers the least-overlapping pair', () => {
    // a/b share two tags; c shares nothing with either, so a-c or b-c wins.
    const deck = [item('a', ['snow', 'cold']), item('b', ['snow', 'cold']), item('c', ['neon', 'city'])];
    const ids = pickPair(deck, { random: fixed(0) }).map(i => i.id).sort();
    expect(ids).not.toEqual(['a', 'b']);
    expect(ids).toContain('c');
  });

  it('never returns a duplicated pair from the worst tier', () => {
    const deck = [item('a', ['t']), item('b', ['t']), item('c', ['t']), item('d', [])];
    // Everything except d shares a tag, so d must be in the chosen pair.
    for (const r of [0, 0.25, 0.5, 0.99]) {
      expect(pickPair(deck, { random: fixed(r) }).map(i => i.id)).toContain('d');
    }
  });

  it('avoids recently used images when the deck allows', () => {
    const deck = [item('a', ['x']), item('b', ['y']), item('c', ['z']), item('d', ['w'])];
    const ids = pickPair(deck, { exclude: ['a', 'b'], random: fixed(0) }).map(i => i.id).sort();
    expect(ids).toEqual(['c', 'd']);
  });

  it('falls back to the full deck when exclusion leaves too few', () => {
    // Excluding everything but one image must not deadlock the round.
    const deck = [item('a', ['x']), item('b', ['y']), item('c', ['z'])];
    const pair = pickPair(deck, { exclude: ['a', 'b'], random: fixed(0) });
    expect(pair).toHaveLength(2);
    expect(pair[0].id).not.toBe(pair[1].id);
  });

  it('varies which image is shown on the left', () => {
    const deck = [item('a', ['x']), item('b', ['y'])];
    const left = pickPair(deck, { random: fixed(0.1) })[0].id;
    const right = pickPair(deck, { random: fixed(0.9) })[0].id;
    expect(left).not.toBe(right);
  });

  it('always returns a real pair across many random draws', () => {
    const deck = Array.from({ length: 8 }, (_, i) => item(`i${i}`, [`t${i % 3}`]));
    for (let i = 0; i < 50; i++) {
      const [a, b] = pickPair(deck, { random: () => i / 50 });
      expect(deck).toContain(a);
      expect(deck).toContain(b);
      expect(a.id).not.toBe(b.id);
    }
  });
});
