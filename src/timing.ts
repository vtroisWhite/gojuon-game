import type { Answer, ResponseTiming } from './types';

export function summarizeResponseTimes(
  answers: readonly Pick<Answer, 'responseMs'>[],
): ResponseTiming {
  return {
    timedAnswers: answers.length,
    totalResponseMs: answers.reduce((total, answer) => total + answer.responseMs, 0),
  };
}
export function formatAverageMs(timing: ResponseTiming): string {
  return timing.timedAnswers
    ? Math.round(timing.totalResponseMs / timing.timedAnswers) + ' ms'
    : '—';
}
export function meanMs(timing: ResponseTiming): number | null {
  return timing.timedAnswers ? timing.totalResponseMs / timing.timedAnswers : null;
}
