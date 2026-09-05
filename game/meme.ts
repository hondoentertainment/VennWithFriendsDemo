/**
 * Text layout for the fusion meme.
 *
 * Pure on purpose: the caller supplies the measuring function (canvas
 * measureText in the browser, a stub in tests) so the wrapping and
 * shrink-to-fit rules are unit-testable without a DOM.
 */

/** Width of `text` when drawn at `fontSize`, in the same units as maxWidth. */
export type Measure = (text: string, fontSize: number) => number;

export interface MemeTextLayout {
  fontSize: number;
  lines: string[];
}

export interface LayoutOptions {
  maxWidth: number;
  maxLines: number;
  maxFontSize: number;
  minFontSize: number;
  measure: Measure;
}

const ELLIPSIS = '…';

/**
 * Greedy word wrap. A single word wider than the box is broken by character
 * rather than overflowing — meme captions are user text and can be anything.
 */
export function wrapText(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (measure(word) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = '';
    for (const ch of word) {
      if (chunk && measure(chunk + ch) > maxWidth) {
        lines.push(chunk);
        chunk = '';
      }
      chunk += ch;
    }
    current = chunk;
  }

  if (current) lines.push(current);
  return lines;
}

/**
 * Finds the largest font size (stepping down from maxFontSize) at which the
 * text wraps into at most maxLines. If even minFontSize is not enough, the
 * text is cut at the last line with an ellipsis — a caption that spills off
 * the image is worse than one that is trimmed.
 */
export function layoutMemeText(text: string, options: LayoutOptions): MemeTextLayout {
  const { maxWidth, maxLines, maxFontSize, minFontSize, measure } = options;
  const clean = text.trim();
  if (!clean || maxLines < 1) return { fontSize: maxFontSize, lines: [] };

  const step = Math.max(1, maxFontSize / 16);
  const sizes: number[] = [];
  for (let size = maxFontSize; size > minFontSize; size -= step) sizes.push(size);
  sizes.push(minFontSize);

  for (const size of sizes) {
    const lines = wrapText(clean, maxWidth, (s) => measure(s, size));
    if (lines.length <= maxLines) return { fontSize: size, lines };
  }

  const lines = wrapText(clean, maxWidth, (s) => measure(s, minFontSize)).slice(0, maxLines);
  let last = lines[maxLines - 1];
  while (last && measure(last + ELLIPSIS, minFontSize) > maxWidth) last = last.slice(0, -1);
  lines[maxLines - 1] = last.trimEnd() + ELLIPSIS;
  return { fontSize: minFontSize, lines };
}

/** A filesystem-safe name for a downloaded meme, derived from its label. */
export function memeFileName(label: string | undefined, fallback = 'venn-fusion'): string {
  const slug = (label ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${slug || fallback}.png`;
}
