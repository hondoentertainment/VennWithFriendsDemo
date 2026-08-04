import { ImageItem } from '../types';

/**
 * Picks the two images for a round.
 *
 * The game is only interesting when the two images are far apart but still
 * bridgeable — "Alpine Peak" against "Crystal Blizzard" is a dud, because the
 * answer is just "snow". So pairs are ranked by how many tags they share and
 * drawn from the least-overlapping tier, rather than picked at random.
 *
 * Recently used images are avoided where the deck is big enough to allow it,
 * which matters a lot at the current deck size.
 */
export function tagOverlap(a: ImageItem, b: ImageItem): number {
  const seen = new Set(a.tags);
  return b.tags.reduce((count, tag) => count + (seen.has(tag) ? 1 : 0), 0);
}

export function pickPair(
  deck: ImageItem[],
  { exclude = [], random = Math.random }: { exclude?: string[]; random?: () => number } = {}
): [ImageItem, ImageItem] {
  if (deck.length < 2) throw new Error('pickPair needs at least two images');

  const excluded = new Set(exclude);
  // Fall back to the full deck when avoiding recent images would leave too
  // little to choose from — a stale pair beats no pair.
  const pool = deck.filter(item => !excluded.has(item.id));
  const candidates = pool.length >= 2 ? pool : deck;

  const pairs: Array<{ pair: [ImageItem, ImageItem]; overlap: number }> = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      pairs.push({ pair: [candidates[i], candidates[j]], overlap: tagOverlap(candidates[i], candidates[j]) });
    }
  }

  const best = Math.min(...pairs.map(p => p.overlap));
  const tier = pairs.filter(p => p.overlap === best);
  const chosen = tier[Math.floor(random() * tier.length) % tier.length];

  // Order is cosmetic, but fixing it would always show the same image on the
  // left for a given pair.
  return random() < 0.5 ? chosen.pair : [chosen.pair[1], chosen.pair[0]];
}
