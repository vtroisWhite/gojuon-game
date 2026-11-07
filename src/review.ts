import { REVIEW_INTERVAL_DAYS } from './config';
import type { AnswerOutcome, PracticeKind, QuestionRole, ReviewProgress } from './types';

export function localDay(now: string): string {
  const date = new Date(now);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
function afterDays(now: string, days: number): string {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}
export function isDue(review: ReviewProgress, now: string = new Date().toISOString()): boolean {
  return review.needsCorrection || Date.parse(review.dueAt) <= Date.parse(now);
}
export function updateReview(
  prior: ReviewProgress | undefined,
  outcome: AnswerOutcome,
  now: string,
  role: QuestionRole,
  kind: PracticeKind,
): ReviewProgress {
  const day = localDay(now);
  if (outcome !== 'correct')
    return {
      stage: 0,
      dueAt: now,
      needsCorrection: true,
      lastPromotedDay: prior?.lastPromotedDay ?? null,
      lastExposedDay: day,
      successfulDays: 0,
    };
  if (
    !prior ||
    (prior.lastPromotedDay === null && prior.successfulDays === 0 && !prior.needsCorrection) ||
    prior.needsCorrection
  )
    return {
      stage: prior && !prior.needsCorrection ? prior.stage : 0,
      dueAt: afterDays(now, REVIEW_INTERVAL_DAYS[0]),
      needsCorrection: false,
      lastPromotedDay: prior?.lastPromotedDay ?? day,
      lastExposedDay: day,
      successfulDays: prior && !prior.needsCorrection ? prior.successfulDays : 0,
    };
  const due = isDue(prior, now);
  const withoutPromotion = {
    ...prior,
    dueAt: due ? afterDays(now, REVIEW_INTERVAL_DAYS[0]) : prior.dueAt,
    lastExposedDay: day,
  };
  if (role === 'reinforcement' || kind === 'learn') return withoutPromotion;
  const eligible = due && prior.lastPromotedDay !== day && prior.lastExposedDay !== day;
  if (!eligible) return withoutPromotion;
  const stage = Math.min(prior.stage + 1, REVIEW_INTERVAL_DAYS.length - 1);
  return {
    stage,
    dueAt: afterDays(now, REVIEW_INTERVAL_DAYS[stage]),
    needsCorrection: false,
    lastPromotedDay: day,
    lastExposedDay: day,
    successfulDays: prior.successfulDays + 1,
  };
}
