import type { FeedbackSpeed } from './types';

// Feedback durations in milliseconds; null means manual continuation.
export const FEEDBACK_DELAYS: Record<FeedbackSpeed, number | null> = {
  manual: null,
  auto: 100,
};
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;
export const REINFORCEMENT_GAP = 3;
export const RECENT_LIMIT = 20;
export const RECENT_DISPLAY = 10;
export const HISTORY_LIMIT = 100;
export const FAMILIAR_MIN_ATTEMPTS = 5;
export const FAMILIAR_REVIEW_DAYS = 3;
export const TREND_MIN_SAMPLES = 5;
export const SNAPSHOT_INTERVAL_MS = 1000;
