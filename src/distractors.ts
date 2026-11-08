import { relatedGlyphs } from './confusions';
import phoneticData from './data/phonetic-neighbors.json';
import { KANA } from './kana';
import type { Direction, KanaEntry, KanaPerformance } from './types';

type Reason = 'family' | 'shape' | 'series' | 'vowel' | 'phonetic' | 'fallback';
const neighbors: Record<string, string[]> = phoneticData.neighbors;

export function isLegalDistractor(target: KanaEntry, candidate: KanaEntry): boolean {
  return (
    target.script === candidate.script &&
    target.structure === candidate.structure &&
    target.pronunciation !== candidate.pronunciation
  );
}

function relation(
  target: KanaEntry,
  candidate: KanaEntry,
  direction: Direction,
  vowelAxis: boolean,
) {
  if (target.baseGlyph === candidate.baseGlyph) return { tier: 0, reason: 'family' as Reason };
  const relations: { tier: number; reason: Reason }[] = [];
  if (relatedGlyphs(target).includes(candidate.glyph)) {
    relations.push({ tier: direction === 'romaji-kana' ? 1 : 2, reason: 'shape' });
  }
  if (target.series === candidate.series) {
    relations.push({
      tier: target.structure === 'yoon' ? (vowelAxis ? 2 : 1) : direction === 'kana-romaji' ? 1 : 2,
      reason: 'series',
    });
  }
  if (target.vowel === candidate.vowel) {
    relations.push({
      tier: target.structure === 'yoon' ? (vowelAxis ? 1 : 2) : 3,
      reason: 'vowel',
    });
  }
  if (neighbors[target.pronunciation]?.includes(candidate.pronunciation)) {
    relations.push({ tier: 4, reason: 'phonetic' });
  }
  return relations.sort((a, b) => a.tier - b.tier)[0] ?? { tier: 5, reason: 'fallback' as Reason };
}

export function hasRelatedDistractors(target: KanaEntry, pool: readonly KanaEntry[]): boolean {
  return pool.some(
    (candidate) =>
      isLegalDistractor(target, candidate) &&
      relation(target, candidate, 'kana-romaji', false).reason !== 'fallback',
  );
}

export function selectDistractors(
  target: KanaEntry,
  direction: Direction,
  pool: readonly KanaEntry[],
  kanaStats: Record<string, KanaPerformance> = {},
  random: () => number = Math.random,
  focusIds: readonly string[] = [],
): string[] {
  const value = (entry: KanaEntry) => (direction === 'kana-romaji' ? entry.romaji : entry.glyph);
  let candidates = pool.filter((candidate) => isLegalDistractor(target, candidate));
  if (new Set(candidates.map((candidate) => candidate.pronunciation)).size < 2) {
    // Borrow across rows only within selected categories and the same structure.
    const categories = new Set([...pool.map((entry) => entry.category), target.category]);
    candidates = KANA.filter(
      (candidate) => categories.has(candidate.category) && isLegalDistractor(target, candidate),
    );
  }
  const personal = kanaStats[target.id + ':' + direction]?.confusions ?? {};
  const acoustic = neighbors[target.pronunciation] ?? [];
  const vowelAxis = target.structure === 'yoon' && random() < 0.5;
  const ranked = candidates
    .map((candidate) => {
      const index = acoustic.indexOf(candidate.pronunciation);
      return {
        candidate,
        ...relation(target, candidate, direction, vowelAxis),
        // Explicit pair drills take priority after the legality checks above.
        ...(focusIds.includes(candidate.id) ? { tier: -1 } : {}),
        // Personal history breaks ties inside a relation tier, never across tiers.
        weight:
          Math.min(3, personal[value(candidate)] ?? 0) * 0.3 +
          (index < 0 ? 0 : (acoustic.length - index) / acoustic.length) +
          random(),
      };
    })
    .sort((a, b) => a.tier - b.tier || b.weight - a.weight);
  const seen = new Set<string>();
  const selected: string[] = [];
  for (const { candidate } of ranked) {
    if (seen.has(candidate.pronunciation)) continue;
    seen.add(candidate.pronunciation);
    selected.push(value(candidate));
    if (selected.length === 2) return selected;
  }
  throw new Error('Not enough distinct answers.');
}
