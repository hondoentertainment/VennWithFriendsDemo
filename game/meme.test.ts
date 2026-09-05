import { describe, expect, it } from 'vitest';
import { layoutMemeText, memeFileName, wrapText } from './meme';

// Monospace stand-in: every character is 0.6em wide.
const charWidth = (text: string, fontSize: number) => text.length * fontSize * 0.6;

describe('wrapText', () => {
  const measure = (text: string) => charWidth(text, 10); // 6 units per char

  it('keeps short text on one line', () => {
    expect(wrapText('hello world', 100, measure)).toEqual(['hello world']);
  });

  it('wraps at word boundaries', () => {
    // 60 units = 10 chars per line
    expect(wrapText('the quick brown fox jumps', 60, measure)).toEqual(['the quick', 'brown fox', 'jumps']);
  });

  it('breaks a single word that is wider than the box', () => {
    expect(wrapText('supercalifragilistic', 60, measure)).toEqual(['supercalif', 'ragilistic']);
  });

  it('collapses whitespace and ignores empty input', () => {
    expect(wrapText('  a   b  ', 100, measure)).toEqual(['a b']);
    expect(wrapText('   ', 100, measure)).toEqual([]);
  });
});

describe('layoutMemeText', () => {
  const base = { maxWidth: 300, maxLines: 2, maxFontSize: 40, minFontSize: 16, measure: charWidth };

  it('uses the largest size when the text already fits', () => {
    const layout = layoutMemeText('short', base);
    expect(layout.fontSize).toBe(40);
    expect(layout.lines).toEqual(['short']);
  });

  it('shrinks the font until the text fits the line budget', () => {
    // 36 chars: at 40px that is 864 units wide (3 lines); at 20px, 432 (2 lines).
    const layout = layoutMemeText('twelve chars twelve chars twelve ch', base);
    expect(layout.fontSize).toBeLessThan(40);
    expect(layout.fontSize).toBeGreaterThanOrEqual(16);
    expect(layout.lines.length).toBeLessThanOrEqual(2);
    expect(layout.lines.join(' ')).toBe('twelve chars twelve chars twelve ch');
  });

  it('truncates with an ellipsis when even the smallest size overflows', () => {
    const text = 'word '.repeat(60).trim();
    const layout = layoutMemeText(text, base);
    expect(layout.fontSize).toBe(16);
    expect(layout.lines).toHaveLength(2);
    expect(layout.lines[1].endsWith('…')).toBe(true);
    expect(charWidth(layout.lines[1], 16)).toBeLessThanOrEqual(300);
  });

  it('returns no lines for blank text', () => {
    expect(layoutMemeText('   ', base).lines).toEqual([]);
  });
});

describe('memeFileName', () => {
  it('slugs the label', () => {
    expect(memeFileName('Neon Snow: Cyber Blizzard!')).toBe('neon-snow-cyber-blizzard.png');
  });

  it('falls back when the label is empty or unusable', () => {
    expect(memeFileName(undefined)).toBe('venn-fusion.png');
    expect(memeFileName('!!!')).toBe('venn-fusion.png');
  });
});
