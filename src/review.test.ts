import { describe, expect, it } from 'vitest';
import { isDue, localDay, updateReview } from './review';
import { createPerformance } from './statistics';

const day = (date: number) => new Date(2026, 10, date, 12).toISOString();
describe('跨日复习', () => {
  it('首次正确安排明日，提前答对不推迟到期或升级', () => {
    const first = updateReview(undefined, 'correct', day(7), 'primary', 'free');
    expect(localDay(first.dueAt)).toBe('2026-11-08');
    expect(first.successfulDays).toBe(0);
    const again = updateReview(first, 'correct', day(7), 'primary', 'free');
    expect(again.stage).toBe(0);
    expect(again.dueAt).toBe(first.dueAt);
  });
  it('到期跨日正确后按阶段延长，同日重刷不升级', () => {
    let review = updateReview(undefined, 'correct', day(7), 'primary', 'free');
    review = updateReview(review, 'correct', day(8), 'primary', 'review');
    expect(review.stage).toBe(1);
    expect(localDay(review.dueAt)).toBe('2026-11-11');
    expect(updateReview(review, 'correct', day(8), 'primary', 'review').successfulDays).toBe(1);
    review = updateReview(review, 'correct', day(11), 'primary', 'review');
    review = updateReview(review, 'correct', day(18), 'primary', 'review');
    expect(review.successfulDays).toBe(3);
    expect(localDay(review.dueAt)).toBe('2026-12-02');
  });
  it('错误和不会都回退，立即纠正只安排明日', () => {
    for (const outcome of ['incorrect', 'unknown'] as const) {
      const wrong = updateReview(undefined, outcome, day(7), 'primary', 'free');
      expect(isDue(wrong, day(7))).toBe(true);
      expect(wrong.needsCorrection).toBe(true);
      const fixed = updateReview(wrong, 'correct', day(7), 'reinforcement', 'review');
      expect(fixed.successfulDays).toBe(0);
      expect(fixed.needsCorrection).toBe(false);
      expect(localDay(fixed.dueAt)).toBe('2026-11-08');
      expect(updateReview(fixed, 'correct', day(8), 'primary', 'review').successfulDays).toBe(1);
    }
  });
  it('学习卡暴露答案后不提升长期等级，浏览对象首次作答仍安排明日', () => {
    const viewed = createPerformance('hiragana-あ', 'kana-romaji', day(7)).review;
    viewed.lastExposedDay = localDay(day(7));
    const answer = updateReview(viewed, 'correct', day(7), 'primary', 'learn');
    expect(answer.successfulDays).toBe(0);
    expect(localDay(answer.dueAt)).toBe('2026-11-08');
    const due = { ...answer, dueAt: day(8), lastExposedDay: localDay(day(8)) };
    const answeredAfterExposure = updateReview(due, 'correct', day(8), 'primary', 'free');
    expect(answeredAfterExposure.successfulDays).toBe(0);
    expect(localDay(answeredAfterExposure.dueAt)).toBe('2026-11-09');
  });
  it('按本地自然日而非固定24小时安排复习', () => {
    const late = new Date(2026, 10, 7, 23, 59, 59).toISOString();
    const review = updateReview(undefined, 'correct', late, 'primary', 'free');
    expect(localDay(review.dueAt)).toBe('2026-11-08');
    expect(new Date(review.dueAt).getHours()).toBe(0);
  });
  it('学习与巩固提前答对保持现有到期安排', () => {
    const review = {
      ...updateReview(undefined, 'correct', day(7), 'primary', 'free'),
      stage: 3,
      successfulDays: 3,
      dueAt: day(30),
    };
    for (const [role, kind] of [
      ['primary', 'learn'],
      ['reinforcement', 'review'],
    ] as const) {
      const next = updateReview(review, 'correct', day(8), role, kind);
      expect(next.dueAt).toBe(review.dueAt);
      expect(next.stage).toBe(3);
      expect(next.successfulDays).toBe(3);
    }
  });
  it('已到期的学习或巩固正确不升级，安排明日避免无限重刷', () => {
    const review = {
      ...updateReview(undefined, 'correct', day(7), 'primary', 'free'),
      stage: 3,
      successfulDays: 3,
      dueAt: day(8),
    };
    for (const [role, kind] of [
      ['primary', 'learn'],
      ['reinforcement', 'review'],
    ] as const) {
      const next = updateReview(review, 'correct', day(8), role, kind);
      expect(next.stage).toBe(3);
      expect(next.successfulDays).toBe(3);
      expect(localDay(next.dueAt)).toBe('2026-11-09');
      expect(isDue(next, day(8))).toBe(false);
    }
  });
});
