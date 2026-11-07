import { describe, expect, it } from 'vitest';
import {
  coverage,
  createPerformance,
  getFamiliarity,
  getRecommendations,
  getTrend,
} from './statistics';
import { getConfusionFeedback } from './confusions';
import { KANA_BY_ID } from './kana';
import { makeQuestion } from './engine';
import type { RecentAttempt } from './types';
const NOW = '2026-11-07T04:00:00Z';
const sample = (
  responseMs: number,
  outcome: RecentAttempt['outcome'] = 'correct',
): RecentAttempt => ({
  answeredAt: NOW,
  outcome,
  responseMs,
  presentation: 'direct',
  kind: 'free',
  inputMethod: 'keyboard',
});
describe('教学统计', () => {
  it('1/1不能显示较熟悉，足够样本还需跨日证据', () => {
    const perf = createPerformance('hiragana-あ', 'kana-romaji', NOW);
    expect(getFamiliarity(perf)).toBe('unpracticed');
    perf.primaryAttempts = 1;
    perf.primaryCorrect = 1;
    expect(getFamiliarity(perf)).toBe('insufficient');
    perf.primaryAttempts = 5;
    expect(getFamiliarity(perf)).toBe('learning');
    perf.review.successfulDays = 3;
    expect(getFamiliarity(perf)).toBe('familiar');
    perf.review.needsCorrection = true;
    expect(getFamiliarity(perf)).toBe('learning');
  });
  it('覆盖率不重复累计两个方向，学习卡浏览不计覆盖', () => {
    const perf = { ...createPerformance('hiragana-あ', 'kana-romaji', NOW), primaryAttempts: 1 };
    const reverse = { ...perf, direction: 'romaji-kana' as const };
    const stats = {
      a: perf,
      ar: reverse,
      viewed: createPerformance('hiragana-い', 'kana-romaji', NOW),
    };
    expect(coverage('hiragana-seion', stats)).toEqual({ practiced: 1, total: 46 });
    expect(coverage('hiragana-seion', stats, 'romaji-kana').practiced).toBe(1);
  });
  it('只比较同一条件的两组样本，错误使正确速度趋势无有效样本', () => {
    const perf = createPerformance('hiragana-あ', 'kana-romaji', NOW);
    perf.recent = [
      ...Array.from({ length: 5 }, () => sample(1000)),
      ...Array.from({ length: 5 }, () => sample(500)),
    ];
    expect(getTrend(perf)).toEqual({ accuracyDelta: 0, responseDeltaMs: -500, samples: 5 });
    perf.recent[9].outcome = 'incorrect';
    expect(getTrend(perf)).toEqual({ accuracyDelta: -20, responseDeltaMs: null, samples: 5 });
    perf.recent[9].presentation = 'recall';
    expect(getTrend(perf)).toBeNull();
  });
  it('推荐到期内容，待纠正优先，排除仅浏览和未到期', () => {
    const perf = {
      ...createPerformance('hiragana-あ', 'kana-romaji', NOW),
      primaryAttempts: 1,
      attempts: 1,
    };
    const wrong = {
      ...perf,
      kanaId: 'hiragana-い',
      review: { ...perf.review, needsCorrection: true },
    };
    const future = {
      ...perf,
      kanaId: 'hiragana-え',
      review: { ...perf.review, dueAt: '2027-01-01T00:00:00Z' },
    };
    expect(
      getRecommendations(
        { perf, wrong, future, viewed: createPerformance('hiragana-う', 'kana-romaji', NOW) },
        NOW,
      ).map((item) => item.kanaId),
    ).toEqual(['hiragana-い', 'hiragana-あ']);
  });
  it('只在误选可唯一映射时显示另一个假名，同音ji不臆测字形', () => {
    const shi = makeQuestion(
      { entry: KANA_BY_ID['katakana-シ'], direction: 'kana-romaji' },
      Object.values(KANA_BY_ID),
      'q',
    );
    expect(getConfusionFeedback(shi, 'tsu', 'zh-CN')?.mistaken?.glyph).toBe('ツ');
    expect(getConfusionFeedback(shi, 'ji', 'zh-CN')?.mistaken).toBeNull();
    expect(getConfusionFeedback(shi, null, 'en')).toBeNull();
  });
});
