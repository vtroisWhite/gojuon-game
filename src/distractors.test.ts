import { describe, expect, it } from 'vitest';
import { CATEGORIES, DEFAULT_SETTINGS, KANA, KANA_BY_ID } from './kana';
import { createSession, makeQuestion } from './engine';
import { hasRelatedDistractors, selectDistractors } from './distractors';
import { getConfusionFeedback } from './confusions';
import { createPerformance } from './statistics';
import phonetics from './data/phonetic-neighbors.json';
import type { Direction, KanaEntry } from './types';

function random(seed: number) {
  let value = seed;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}
function entry(glyph: string) {
  return KANA.find((item) => item.glyph === glyph)!;
}
function question(target: KanaEntry, direction: Direction = 'kana-romaji', seed = 1) {
  return makeQuestion({ entry: target, direction }, KANA, 'q', random(seed));
}
function match(option: string, target: KanaEntry, direction: Direction) {
  return KANA.filter(
    (item) =>
      item.script === target.script &&
      (direction === 'kana-romaji' ? item.romaji === option : item.glyph === option),
  );
}

describe('kana relationship metadata', () => {
  it('models the h/b/p family without guessing from the romanized initial', () => {
    expect(entry('ふ')).toMatchObject({
      series: 'h',
      vowel: 'u',
      voicing: 'plain',
      baseGlyph: 'ふ',
    });
    expect(entry('ぶ')).toMatchObject({
      series: 'b',
      vowel: 'u',
      voicing: 'voiced',
      baseGlyph: 'ふ',
    });
    expect(entry('ぷ')).toMatchObject({
      series: 'p',
      vowel: 'u',
      voicing: 'semi-voiced',
      baseGlyph: 'ふ',
    });
    expect(entry('プ').baseGlyph).toBe('ふ');
    expect(entry('ん')).toMatchObject({ series: 'nasal', vowel: 'n' });
    for (const item of KANA) {
      expect(item.series).toBeTruthy();
      expect(['a', 'i', 'u', 'e', 'o', 'n']).toContain(item.vowel);
      expect(item.structure === 'yoon').toBe(item.group === 'yoon');
    }
  });

  it('bundles a bounded phonetic supplement covering only supported distinct readings', () => {
    const data: Record<string, string[]> = phonetics.neighbors;
    const readings = new Set(KANA.map((item) => item.pronunciation));
    expect(Object.keys(data).sort()).toEqual([...readings].sort());
    for (const [reading, values] of Object.entries(data)) {
      expect(values).toHaveLength(8);
      expect(new Set(values).size).toBe(8);
      expect(values).not.toContain(reading);
      const target = KANA.find((item) => item.pronunciation === reading)!;
      for (const candidate of values) {
        expect(KANA.find((item) => item.pronunciation === candidate)?.structure).toBe(
          target.structure,
        );
      }
    }
  });
});

describe('targeted three-choice generation', () => {
  it.each(['ぶ', 'ブ', 'ぼ', 'ボ', 'ひゃ', 'ヒャ'])(
    'always includes both family contrasts for %s when the full family is available',
    (glyph) => {
      const target = entry(glyph);
      const family = KANA.filter(
        (item) => item.script === target.script && item.baseGlyph === target.baseGlyph,
      );
      expect(family).toHaveLength(3);
      for (const direction of ['kana-romaji', 'romaji-kana'] as const) {
        for (let seed = 1; seed <= 25; seed++) {
          expect(question(target, direction, seed).options.sort()).toEqual(
            family.map((item) => (direction === 'kana-romaji' ? item.romaji : item.glyph)).sort(),
          );
        }
      }
    },
  );

  it('replaces both unrelated distractors in the four reported cases', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const mya = question(entry('みゃ'), 'kana-romaji', seed);
      expect(mya.options).toContain('mya');
      expect(mya.options).not.toContain('pe');
      expect(
        mya.options.every((value) =>
          match(value, entry('みゃ'), 'kana-romaji').every(
            (item) => item.structure === 'yoon' && (item.series === 'm' || item.vowel === 'a'),
          ),
        ),
      ).toBe(true);
      const gu = question(entry('ぐ'), 'kana-romaji', seed);
      expect(gu.options).toEqual(expect.arrayContaining(['gu', 'ku']));
      expect(gu.options).not.toContain('gya');
      expect(
        gu.options
          .filter((value) => value !== 'ku')
          .every((value) =>
            match(value, entry('ぐ'), 'kana-romaji').every((item) => item.series === 'g'),
          ),
      ).toBe(true);
      expect(question(entry('ぶ'), 'kana-romaji', seed).options.sort()).toEqual(['bu', 'fu', 'pu']);
      expect(question(entry('ぼ'), 'kana-romaji', seed).options.sort()).toEqual(['bo', 'ho', 'po']);
    }
  });

  it('prioritizes actual shape neighbors in the reverse direction', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(question(entry('シ'), 'romaji-kana', seed).options).toContain('ツ');
      expect(question(entry('ソ'), 'romaji-kana', seed).options).toContain('ン');
      expect(question(entry('ぬ'), 'romaji-kana', seed).options).toContain('め');
    }
  });

  it("keeps explicitly selected contrast pairs in each other's choices", () => {
    for (const [glyphs, categories] of [
      [['シ', 'ツ'], ['katakana-seion']],
      [
        ['ぶ', 'ぼ'],
        ['hiragana-seion', 'hiragana-dakuten'],
      ],
    ] as const) {
      for (const mode of ['kana-romaji', 'romaji-kana'] as const) {
        const session = createSession(
          { ...DEFAULT_SETTINGS, categories: [...categories], mode },
          {},
          'contrast',
          random(8),
          undefined,
          glyphs.map((glyph) => entry(glyph).id),
        );
        for (const q of session.questions) {
          expect(q.options).toEqual(
            expect.arrayContaining(
              glyphs.map((glyph) => (mode === 'kana-romaji' ? entry(glyph).romaji : glyph)),
            ),
          );
        }
      }
    }
  });

  it('does not let personal mistakes override structure, family or selected categories', () => {
    const target = entry('ぶ');
    const performance = {
      ...createPerformance(target.id, 'kana-romaji', new Date().toISOString()),
      confusions: { e: 100000, mya: 100000 },
    };
    const stats = { [target.id + ':kana-romaji']: performance };
    expect(selectDistractors(target, 'kana-romaji', KANA, stats, random(1)).sort()).toEqual([
      'fu',
      'pu',
    ]);
    const dakuten = KANA.filter((item) => item.category === 'hiragana-dakuten');
    const options = selectDistractors(target, 'kana-romaji', dakuten, stats, random(1));
    expect(options).toContain('pu');
    expect(options).not.toContain('fu');
    expect(options.every((value) => dakuten.some((item) => item.romaji === value))).toBe(true);
    const mya = entry('みゃ');
    const mistaken = {
      ...createPerformance(mya.id, 'kana-romaji', new Date().toISOString()),
      confusions: { pe: 100000 },
    };
    expect(
      selectDistractors(
        mya,
        'kana-romaji',
        KANA,
        { [mya.id + ':kana-romaji']: mistaken },
        random(2),
      ),
    ).not.toContain('pe');
  });

  it('caps personal-history weight and rotates nearby groups and answer positions', () => {
    const target = entry('みゃ');
    const groups = new Set<string>();
    const positions = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      const q = question(target, 'kana-romaji', seed);
      groups.add([...q.options].sort().join(','));
      positions.add(q.options.indexOf('mya'));
    }
    expect(groups.size).toBeGreaterThan(1);
    expect(positions.size).toBe(3);
    const makeStats = (count: number) => ({
      [target.id + ':kana-romaji']: {
        ...createPerformance(target.id, 'kana-romaji', new Date().toISOString()),
        confusions: { myu: count },
      },
    });
    expect(selectDistractors(target, 'kana-romaji', KANA, makeStats(3), random(10))).toEqual(
      selectDistractors(target, 'kana-romaji', KANA, makeStats(100000), random(10)),
    );
  });

  it('borrows same-structure distractors without changing the target or script', () => {
    for (const target of [entry('みゃ'), entry('ぶ'), entry('ヲ')]) {
      const q = makeQuestion(
        { entry: target, direction: 'romaji-kana' },
        [target],
        'tiny',
        random(1),
      );
      expect(q.kanaId).toBe(target.id);
      expect(q.options).toHaveLength(3);
      expect(
        q.options.every((value) =>
          KANA.some(
            (item) =>
              item.glyph === value &&
              item.script === target.script &&
              item.structure === target.structure,
          ),
        ),
      ).toBe(true);
    }
  });

  it('keeps lesson distractors inside the current row and previously seen content', () => {
    const target = entry('ぶ');
    const settings = {
      ...DEFAULT_SETTINGS,
      categories: [target.category],
      rows: [target.rowId],
      count: 'all' as const,
    };
    const before = createSession(settings, {}, 'learn', random(7));
    expect(
      before.questions.every((q) =>
        q.options.every((option) =>
          KANA.some(
            (item) =>
              item.script === target.script &&
              item.romaji === option &&
              item.rowId === target.rowId,
          ),
        ),
      ),
    ).toBe(true);
    const seen = createPerformance(entry('ぷ').id, 'kana-romaji', new Date().toISOString());
    seen.review.lastExposedDay = '2026-11-08';
    const after = createSession(
      settings,
      { [seen.kanaId + ':' + seen.direction]: seen },
      'learn',
      random(7),
    );
    expect(after.questions.find((q) => q.kanaId === target.id)?.options).toContain('pu');
    expect(new Set(after.questions.map((q) => q.kanaId))).toEqual(
      new Set(before.questions.map((q) => q.kanaId)),
    );
    expect(after.questions.find((q) => q.kanaId === target.id)?.options).not.toContain('fu');
  });

  it('keeps all 208 targets unambiguous under multiple seeds and both directions', () => {
    for (const seed of [1, 9, 97]) {
      for (const mode of ['kana-romaji', 'romaji-kana'] as const) {
        const session = createSession(
          { ...DEFAULT_SETTINGS, categories: [...CATEGORIES], count: 'all', mode },
          {},
          'free',
          random(seed),
        );
        expect(new Set(session.questions.map((q) => q.kanaId)).size).toBe(208);
        for (const q of session.questions) {
          const target = KANA_BY_ID[q.kanaId];
          expect(q.options).toHaveLength(3);
          expect(new Set(q.options).size).toBe(3);
          const pronunciations = q.options.map((value) => {
            const matches = match(value, target, mode);
            expect(matches.length).toBeGreaterThan(0);
            expect(matches.every((item) => item.structure === target.structure)).toBe(true);
            return matches[0].pronunciation;
          });
          expect(new Set(pronunciations).size).toBe(3);
          expect(q.options).toContain(q.correctAnswer);
        }
      }
    }
  });

  it('explains family and yoon-series mistakes, without inventing homophone glyphs', () => {
    expect(getConfusionFeedback(question(entry('ぶ')), 'pu', 'zh-CN')?.hint).toContain('半浊点');
    expect(getConfusionFeedback(question(entry('みゃ')), 'myu', 'en')?.hint).toContain(
      'ゃ / ゅ / ょ',
    );
    expect(getConfusionFeedback(question(entry('ぐ')), 'ji', 'zh-CN')?.mistaken).toBeNull();
    expect(hasRelatedDistractors(entry('みゃ'), KANA)).toBe(true);
    expect(hasRelatedDistractors(entry('みゃ'), [entry('あ'), entry('い')])).toBe(false);
  });
});
