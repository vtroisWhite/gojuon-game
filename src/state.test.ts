import { describe, expect, it } from 'vitest';
import { createSession } from './engine';
import { DEFAULT_SETTINGS } from './kana';
import { LESSONS } from './lessons';
import { localDay } from './review';
import { createInitialRecord, gameReducer } from './state';
import { FEEDBACK_DELAYS, HISTORY_LIMIT, RECENT_LIMIT } from './config';
import type { FeedbackSpeed, LearningRecord, PracticeKind, Presentation } from './types';

const now = '2026-11-07T04:00:00.000Z';
function start(
  kind: PracticeKind = 'free',
  n = 5,
  presentation: Presentation = 'direct',
  feedbackSpeed: FeedbackSpeed = 'manual',
  record = createInitialRecord(),
  id = 'test',
) {
  const session = createSession(
    { ...DEFAULT_SETTINGS, presentation, feedbackSpeed },
    {},
    'free',
    () => 0.37,
    now,
  );
  session.kind = kind;
  session.id = id;
  session.questions = session.questions.slice(0, n).map((q, i) => ({ ...q, id: id + ':' + i }));
  session.primaryCount = n;
  return gameReducer(record, { type: 'START', session, now });
}
function answer(record: LearningRecord, result: 'correct' | 'incorrect' | 'unknown' = 'correct') {
  const q = record.session!.questions[record.session!.index];
  const choice =
    result === 'unknown'
      ? null
      : result === 'correct'
        ? q.correctAnswer
        : q.options.find((o) => o !== q.correctAnswer)!;
  return gameReducer(record, { type: 'ANSWER', choice, inputMethod: 'keyboard', now });
}
const next = (r: LearningRecord) => gameReducer(r, { type: 'ADVANCE', now });
const tick = (r: LearningRecord, deltaMs: number) => gameReducer(r, { type: 'TICK', deltaMs, now });

describe('v1 game state', () => {
  it('rejects repeated, invalid and hidden input without changing any counters', () => {
    let r = start('free', 1, 'recall');
    expect(answer(r)).toBe(r);
    expect(next(r)).toBe(r);
    r = tick(r, 65);
    r = gameReducer(r, { type: 'REVEAL' });
    expect(r.session?.questionElapsedMs).toBe(65);
    expect(gameReducer(r, { type: 'ANSWER', choice: 'invalid', inputMethod: 'pointer', now })).toBe(
      r,
    );
    r = answer(tick(r, 35));
    expect(r.session?.answers[0].responseMs).toBe(100);
    expect(answer(r)).toBe(r);
    expect(r.stats.answered).toBe(1);
  });

  it('records unknown separately, without a confusion or correct-time sample', () => {
    let r = answer(tick(start('free', 1), 1234.4), 'unknown');
    const p = Object.values(r.kanaStats)[0];
    expect(p).toMatchObject({
      attempts: 1,
      correct: 0,
      errors: 0,
      unknown: 1,
      primaryAttempts: 1,
      primaryCorrect: 0,
      confusions: {},
      timedAnswers: 1,
      totalResponseMs: 1234,
    });
    expect(p.correctTiming.timedAnswers).toBe(0);
    expect(p.review.needsCorrection).toBe(true);
    expect(r.session?.answers[0]).toMatchObject({ choice: null, outcome: 'unknown' });
    r = next(r);
    expect(r.history[0].primaryCorrect).toBe(0);
  });

  it('keeps primary grades and streaks independent of a bounded correction phase', () => {
    let r = start('learn');
    r = next(answer(r, 'incorrect'));
    for (let i = 1; i < 5; i++) r = next(answer(r));
    expect(r.session).toMatchObject({ primaryCount: 5, index: 5, stage: 'reinforcement' });
    expect(r.session?.questions).toHaveLength(6);
    const repeated = r.session!.questions[5];
    expect(repeated.sourceQuestionId).toBe(r.session!.questions[0].id);
    expect(repeated.options).not.toEqual(r.session!.questions[0].options);
    r = next(answer(r));
    expect(r.session?.status).toBe('completed');
    expect(r.stats).toMatchObject({
      answered: 6,
      correct: 5,
      primaryAnswered: 5,
      primaryCorrect: 4,
      maxStreak: 4,
    });
    expect(r.history[0]).toMatchObject({
      primaryTotal: 5,
      primaryAnswered: 5,
      primaryCorrect: 4,
      corrected: 1,
    });
    const p = r.kanaStats[repeated.kanaId + ':' + repeated.direction];
    expect(p.primaryAttempts).toBe(1);
    expect(p.recent).toHaveLength(1);
    expect(p.review.successfulDays).toBe(0);
    expect(new Date(p.review.dueAt).getTime()).toBeGreaterThan(new Date(now).getTime());
  });

  it('does not append another retry after an unsuccessful correction', () => {
    let r = next(answer(start('contrast'), 'incorrect'));
    for (let i = 1; i < 5; i++) r = next(answer(r));
    r = next(answer(r, 'unknown'));
    expect(r.session?.status).toBe('completed');
    expect(r.session?.questions).toHaveLength(6);
    expect(r.history[0].corrected).toBe(0);
  });

  it('defers recent mistakes when the session cannot provide the spacing gap', () => {
    let r = start('learn');
    for (let i = 0; i < 4; i++) r = next(answer(r));
    r = next(answer(r, 'incorrect'));
    expect(r.session?.status).toBe('completed');
    expect(r.session?.questions).toHaveLength(5);
    expect(Object.values(r.kanaStats).filter((p) => p.review.needsCorrection)).toHaveLength(1);
  });

  it('never repeats a target during free practice, including errors', () => {
    let r = start();
    for (let i = 0; i < 5; i++) r = next(answer(r, 'incorrect'));
    expect(r.session?.questions).toHaveLength(5);
    expect(r.session?.status).toBe('completed');
  });

  it('freezes recall, feedback and elapsed time while paused', () => {
    let r = gameReducer(start('free', 1, 'recall'), { type: 'PAUSE', paused: true });
    expect(tick(r, 9999)).toBe(r);
    expect(gameReducer(r, { type: 'REVEAL' })).toBe(r);
    r = gameReducer(r, { type: 'PAUSE', paused: false });
    r = gameReducer(r, { type: 'REVEAL' });
    r = answer(r);
    const paused = gameReducer(r, { type: 'PAUSE', paused: true });
    expect(tick(paused, 9999)).toBe(paused);
    expect(next(paused)).toBe(paused);
  });

  it.each(['standard', 'fast'] as const)('uses the session %s feedback snapshot', (speed) => {
    let r = answer(start('free', 1, 'direct', speed));
    const delay = FEEDBACK_DELAYS[speed]!;
    expect(next(r)).toBe(r);
    r = tick(r, delay - 1);
    expect(r.session?.status).toBe('active');
    r = tick(r, 5000);
    expect(r.session?.status).toBe('completed');
    expect(r.stats.elapsedMs).toBe(delay);
    expect(tick(r, 99)).toBe(r);
    expect(gameReducer(r, { type: 'ABANDON', now })).toBe(r);
    expect(r.history).toHaveLength(1);
  });

  it('manual feedback never auto advances and excludes waiting from response time', () => {
    let r = answer(tick(start('free', 1), 120));
    r = tick(r, 60000);
    expect(r.session?.status).toBe('active');
    expect(r.session?.answers[0].responseMs).toBe(120);
    expect(next(r).session?.status).toBe('completed');
  });

  it('browsing a lesson records exposure but never creates answer statistics', () => {
    const lesson = LESSONS[0];
    let r = gameReducer(createInitialRecord(), {
      type: 'STUDY',
      study: { lessonId: lesson.id, cardIndex: 0, mixLearned: false },
      now,
    });
    r = gameReducer(r, { type: 'LESSON_COMPLETE', lessonId: lesson.id, now });
    expect(r.learnedLessons).toEqual([lesson.id]);
    expect(r.stats.answered).toBe(0);
    expect(Object.values(r.kanaStats)).toHaveLength(lesson.kanaIds.length * 2);
    expect(
      Object.values(r.kanaStats).every((p) => p.attempts === 0 && p.review.lastExposedDay),
    ).toBe(true);
    r = gameReducer(r, { type: 'LESSON_COMPLETE', lessonId: lesson.id, now });
    expect(r.learnedLessons).toHaveLength(1);
  });

  it('caps recent samples and history without reducing cumulative statistics', () => {
    let r = createInitialRecord();
    for (let i = 0; i < HISTORY_LIMIT + 2; i++) {
      r = start('free', 1, 'direct', 'manual', r, 's' + i);
      r = next(answer(r));
    }
    expect(r.history).toHaveLength(HISTORY_LIMIT);
    expect(r.stats.answered).toBe(HISTORY_LIMIT + 2);
    expect(Object.values(r.kanaStats)[0].recent).toHaveLength(RECENT_LIMIT);
    expect(r.history[0].id).toBe('s101');
  });

  it('abandonment and replacement preserve partial answers and settle once', () => {
    let r = answer(start());
    r = start('free', 1, 'direct', 'manual', r, 'replacement');
    expect(r.history[0]).toMatchObject({ status: 'abandoned', answered: 1 });
    r = gameReducer(r, { type: 'ABANDON', now });
    expect(gameReducer(r, { type: 'ABANDON', now })).toBe(r);
    expect(r.history).toHaveLength(2);
  });

  it('clears all learning data but retains language and practice preferences', () => {
    let r = answer(start());
    r = gameReducer(r, { type: 'LANGUAGE', language: 'en' });
    r = gameReducer(r, { type: 'CLEAR' });
    expect(r.language).toBe('en');
    expect(r.settings.feedbackSpeed).toBe('manual');
    expect(r).toMatchObject({
      session: null,
      study: null,
      learnedLessons: [],
      kanaStats: {},
      history: [],
    });
    expect(r.stats.answered).toBe(0);
  });

  it('does not promote a reverse question after its answer was just exposed', () => {
    const kanaId = LESSONS[0].kanaIds[0];
    const yesterday = '2026-11-06T04:00:00.000Z';
    const run = (r: LearningRecord, mode: 'kana-romaji' | 'romaji-kana', time: string) => {
      const s = createSession(
        { ...DEFAULT_SETTINGS, mode, feedbackSpeed: 'manual' },
        r.kanaStats,
        'free',
        () => 0.37,
        time,
        [kanaId],
      );
      s.id += mode;
      r = gameReducer(r, { type: 'START', session: s, now: time });
      r = gameReducer(r, {
        type: 'ANSWER',
        choice: s.questions[0].correctAnswer,
        inputMethod: 'keyboard',
        now: time,
      });
      return gameReducer(r, { type: 'ADVANCE', now: time });
    };
    let r = run(createInitialRecord(), 'kana-romaji', yesterday);
    r = run(r, 'romaji-kana', yesterday);
    const due = r;
    r = run(r, 'kana-romaji', now);
    expect(r.kanaStats[kanaId + ':kana-romaji'].review.successfulDays).toBe(1);
    r = run(r, 'romaji-kana', now);
    expect(r.kanaStats[kanaId + ':romaji-kana'].review.successfulDays).toBe(0);
    expect(localDay(r.kanaStats[kanaId + ':romaji-kana'].review.dueAt)).toBe('2026-11-08');

    let viewed = gameReducer(due, {
      type: 'STUDY',
      study: { lessonId: LESSONS[0].id, cardIndex: 0, mixLearned: false },
      now,
    });
    expect(viewed.learnedLessons).toHaveLength(0);
    viewed = run(viewed, 'kana-romaji', now);
    expect(viewed.kanaStats[kanaId + ':kana-romaji'].review.successfulDays).toBe(0);
  });
});
