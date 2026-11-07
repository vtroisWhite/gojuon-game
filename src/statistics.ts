import {
  FAMILIAR_MIN_ATTEMPTS,
  FAMILIAR_REVIEW_DAYS,
  RECENT_DISPLAY,
  TREND_MIN_SAMPLES,
} from './config';
import { KANA } from './kana';
import { isDue } from './review';
import type { Category, Direction, KanaPerformance, RecentAttempt } from './types';

export function createPerformance(
  kanaId: string,
  direction: Direction,
  now: string,
): KanaPerformance {
  return {
    kanaId,
    direction,
    attempts: 0,
    correct: 0,
    errors: 0,
    unknown: 0,
    primaryAttempts: 0,
    primaryCorrect: 0,
    timedAnswers: 0,
    totalResponseMs: 0,
    correctTiming: { timedAnswers: 0, totalResponseMs: 0 },
    recent: [],
    confusions: {},
    lastPracticedAt: now,
    review: {
      stage: 0,
      dueAt: now,
      needsCorrection: false,
      lastPromotedDay: null,
      lastExposedDay: null,
      successfulDays: 0,
    },
  };
}
export function getFamiliarity(
  performance?: KanaPerformance,
): 'unpracticed' | 'insufficient' | 'learning' | 'familiar' {
  if (!performance?.primaryAttempts) return 'unpracticed';
  if (performance.primaryAttempts < FAMILIAR_MIN_ATTEMPTS) return 'insufficient';
  return performance.review.successfulDays >= FAMILIAR_REVIEW_DAYS &&
    !performance.review.needsCorrection
    ? 'familiar'
    : 'learning';
}
export function coverage(
  category: Category,
  stats: Record<string, KanaPerformance>,
  direction?: Direction,
): { practiced: number; total: number } {
  const entries = KANA.filter((entry) => entry.category === category);
  return {
    total: entries.length,
    practiced: entries.filter((entry) =>
      Object.values(stats).some(
        (item) =>
          item.kanaId === entry.id &&
          (!direction || item.direction === direction) &&
          item.primaryAttempts > 0,
      ),
    ).length,
  };
}
export function recentAccuracy(
  performance: KanaPerformance,
  count = RECENT_DISPLAY,
): { correct: number; answered: number } {
  const recent = performance.recent.slice(-count);
  return {
    correct: recent.filter((item) => item.outcome === 'correct').length,
    answered: recent.length,
  };
}
export function getTrend(
  performance: KanaPerformance,
): { accuracyDelta: number; responseDeltaMs: number | null; samples: number } | null {
  const last = performance.recent.at(-1);
  if (!last) return null;
  const same = performance.recent.filter(
    (item) =>
      item.kind === last.kind &&
      item.presentation === last.presentation &&
      item.inputMethod === last.inputMethod,
  );
  const count = TREND_MIN_SAMPLES;
  if (same.length < count * 2) return null;
  const prior = same.slice(-count * 2, -count);
  const latest = same.slice(-count);
  const rate = (samples: RecentAttempt[]) =>
    samples.filter((item) => item.outcome === 'correct').length / samples.length;
  const correctPrior = prior.filter((item) => item.outcome === 'correct');
  const correctLatest = latest.filter((item) => item.outcome === 'correct');
  const average = (samples: RecentAttempt[]) =>
    samples.reduce((total, sample) => total + sample.responseMs, 0) / samples.length;
  return {
    accuracyDelta: Math.round((rate(latest) - rate(prior)) * 100),
    responseDeltaMs:
      correctPrior.length >= count && correctLatest.length >= count
        ? Math.round(average(correctLatest) - average(correctPrior))
        : null,
    samples: count,
  };
}
export function getRecommendations(
  stats: Record<string, KanaPerformance>,
  now: string,
  limit = 3,
): KanaPerformance[] {
  return Object.values(stats)
    .filter((item) => item.primaryAttempts > 0 && isDue(item.review, now))
    .sort(
      (a, b) =>
        Number(b.review.needsCorrection) - Number(a.review.needsCorrection) ||
        Date.parse(a.review.dueAt) - Date.parse(b.review.dueAt) ||
        (b.errors + b.unknown) / b.attempts - (a.errors + a.unknown) / a.attempts,
    )
    .slice(0, limit);
}
