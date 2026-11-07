import { CATEGORIES, KANA, KANA_BY_ID } from './kana';
import { LESSON_BY_ID } from './lessons';
import {
  FEEDBACK_DELAYS,
  HISTORY_LIMIT,
  RECENT_LIMIT,
  REINFORCEMENT_GAP,
  REVIEW_INTERVAL_DAYS,
} from './config';
import { createInitialRecord } from './state';
import type {
  Direction,
  Language,
  LearningRecord,
  PracticeSettings,
  Question,
  SessionSnapshot,
  SessionSummary,
} from './types';

export const STORAGE_KEY = 'gojuon-game:v1';
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const nonnegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const integer = (value: unknown): value is number =>
  nonnegative(value) && Number.isSafeInteger(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const date = (value: unknown): value is string => text(value) && Number.isFinite(Date.parse(value));
const day = (value: unknown): boolean =>
  value === null || (text(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) && date(value));
const direction = (value: unknown): value is Direction =>
  value === 'kana-romaji' || value === 'romaji-kana';
const presentation = (value: unknown): boolean => value === 'direct' || value === 'recall';
const kind = (value: unknown): boolean =>
  ['learn', 'free', 'review', 'contrast'].includes(value as string);
const inputMethod = (value: unknown): boolean =>
  ['keyboard', 'pointer', 'touch'].includes(value as string);
const outcome = (value: unknown): boolean =>
  ['correct', 'incorrect', 'unknown'].includes(value as string);
const uniqueStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(text) && new Set(value).size === value.length;
const hasKana = (id: unknown): id is string => text(id) && Object.hasOwn(KANA_BY_ID, id);
const hasLesson = (id: unknown): id is string => text(id) && Object.hasOwn(LESSON_BY_ID, id);

function validTiming(value: unknown, expectedCount: number): boolean {
  return (
    object(value) &&
    integer(value.timedAnswers) &&
    value.timedAnswers === expectedCount &&
    integer(value.totalResponseMs) &&
    (value.timedAnswers > 0 || value.totalResponseMs === 0)
  );
}

function validSettings(value: unknown, allowEmpty = false): value is PracticeSettings {
  return (
    object(value) &&
    uniqueStrings(value.categories) &&
    (allowEmpty || value.categories.length > 0) &&
    value.categories.every((category) => CATEGORIES.includes(category as never)) &&
    uniqueStrings(value.rows) &&
    value.rows.every(hasLesson) &&
    [10, 20, 40, 'all'].includes(value.count as number | string) &&
    (direction(value.mode) || value.mode === 'mixed') &&
    presentation(value.presentation) &&
    typeof value.feedbackSpeed === 'string' &&
    Object.hasOwn(FEEDBACK_DELAYS, value.feedbackSpeed)
  );
}

function validQuestion(value: unknown): value is Question {
  if (
    !object(value) ||
    !text(value.id) ||
    !hasKana(value.kanaId) ||
    !direction(value.direction) ||
    !uniqueStrings(value.options) ||
    value.options.length !== 3 ||
    (value.role !== 'primary' && value.role !== 'reinforcement')
  )
    return false;
  const entry = KANA_BY_ID[value.kanaId];
  const forward = value.direction === 'kana-romaji';
  const expected = forward ? entry.romaji : entry.glyph;
  if (value.correctAnswer !== expected || !value.options.includes(expected)) return false;
  if (
    value.role === 'primary' ? value.sourceQuestionId !== undefined : !text(value.sourceQuestionId)
  )
    return false;
  return value.options.every(
    (option) =>
      option === expected ||
      KANA.some(
        (candidate) =>
          (forward || candidate.script === entry.script) &&
          candidate.pronunciation !== entry.pronunciation &&
          (forward ? candidate.romaji : candidate.glyph) === option,
      ),
  );
}

function validSession(value: unknown): value is SessionSnapshot {
  if (
    !object(value) ||
    !text(value.id) ||
    !kind(value.kind) ||
    !validSettings(value.settings) ||
    !Array.isArray(value.questions) ||
    !value.questions.length ||
    !value.questions.every(validQuestion) ||
    new Set(value.questions.map((question) => question.id)).size !== value.questions.length ||
    !integer(value.primaryCount) ||
    value.primaryCount < 1 ||
    value.primaryCount > value.questions.length ||
    value.questions.length > value.primaryCount * 2 ||
    !integer(value.index) ||
    value.index >= value.questions.length ||
    !Array.isArray(value.answers) ||
    typeof value.paused !== 'boolean' ||
    !['active', 'completed', 'abandoned'].includes(value.status as string) ||
    !['recall', 'choice', 'feedback'].includes(value.phase as string) ||
    value.stage !== (value.index < value.primaryCount ? 'primary' : 'reinforcement') ||
    !integer(value.streak) ||
    !integer(value.maxStreak) ||
    value.streak > value.maxStreak ||
    !nonnegative(value.elapsedMs) ||
    !nonnegative(value.questionElapsedMs) ||
    value.questionElapsedMs > value.elapsedMs ||
    !nonnegative(value.feedbackRemainingMs) ||
    !date(value.startedAt)
  )
    return false;
  const settings = value.settings;
  // This is a session snapshot, not a reference to a mutable preset duration.
  if (
    settings.feedbackSpeed === 'manual'
      ? value.feedbackDelayMs !== null
      : !nonnegative(value.feedbackDelayMs) || value.feedbackDelayMs === 0
  )
    return false;
  if (value.feedbackRemainingMs > ((value.feedbackDelayMs as number | null) ?? 0)) return false;
  const questions = value.questions as Question[];
  if (value.answers.length < value.index || value.answers.length > value.index + 1) return false;
  const reinforcementSources = new Set<string>();
  for (const [index, question] of questions.entries()) {
    if (index < value.primaryCount) {
      if (question.role !== 'primary') return false;
    } else {
      if (
        value.kind === 'free' ||
        question.role !== 'reinforcement' ||
        !question.sourceQuestionId ||
        reinforcementSources.has(question.sourceQuestionId)
      )
        return false;
      reinforcementSources.add(question.sourceQuestionId);
      const sourceIndex = questions.findIndex(
        (candidate) => candidate.id === question.sourceQuestionId,
      );
      const source = questions[sourceIndex];
      if (
        sourceIndex < 0 ||
        sourceIndex >= value.primaryCount ||
        value.primaryCount - 1 - sourceIndex < REINFORCEMENT_GAP ||
        !object(value.answers[sourceIndex]) ||
        value.answers[sourceIndex].outcome === 'correct' ||
        source.kanaId !== question.kanaId ||
        source.direction !== question.direction
      )
        return false;
    }
  }
  if (questions.length > value.primaryCount && value.index < value.primaryCount) return false;
  let streak = 0;
  let maxStreak = 0;
  for (const [index, answer] of value.answers.entries()) {
    const question = questions[index];
    if (
      !object(answer) ||
      answer.questionId !== question.id ||
      (answer.choice !== null &&
        (!text(answer.choice) || !question.options.includes(answer.choice))) ||
      !outcome(answer.outcome) ||
      typeof answer.correct !== 'boolean' ||
      answer.outcome !==
        (answer.choice === null
          ? 'unknown'
          : answer.choice === question.correctAnswer
            ? 'correct'
            : 'incorrect') ||
      answer.correct !== (answer.outcome === 'correct') ||
      !date(answer.answeredAt) ||
      !integer(answer.responseMs) ||
      !inputMethod(answer.inputMethod)
    )
      return false;
    if (question.role === 'primary') {
      streak = answer.correct ? streak + 1 : 0;
      maxStreak = Math.max(maxStreak, streak);
    }
  }
  if (streak !== value.streak || maxStreak !== value.maxStreak) return false;
  const currentAnswer = value.answers[value.index];
  if ((value.phase === 'feedback') !== Boolean(currentAnswer)) return false;
  if (value.phase === 'recall' && settings.presentation !== 'recall') return false;
  if (value.status === 'active') {
    if (value.endedAt !== undefined) return false;
    const autoFeedback = currentAnswer?.correct === true && value.feedbackDelayMs !== null;
    if (autoFeedback ? value.feedbackRemainingMs <= 0 : value.feedbackRemainingMs !== 0)
      return false;
  } else {
    if (!date(value.endedAt) || value.feedbackRemainingMs !== 0) return false;
    if (
      value.status === 'completed' &&
      (value.answers.length !== questions.length || value.index !== questions.length - 1)
    )
      return false;
  }
  return true;
}

function validSummary(value: unknown): value is SessionSummary {
  return (
    object(value) &&
    text(value.id) &&
    kind(value.kind) &&
    validSettings(value.settings) &&
    date(value.startedAt) &&
    date(value.endedAt) &&
    (value.status === 'completed' || value.status === 'abandoned') &&
    integer(value.total) &&
    value.total > 0 &&
    integer(value.primaryTotal) &&
    value.primaryTotal > 0 &&
    value.primaryTotal <= value.total &&
    integer(value.answered) &&
    value.answered <= value.total &&
    integer(value.correct) &&
    value.correct <= value.answered &&
    integer(value.primaryAnswered) &&
    value.primaryAnswered === Math.min(value.answered, value.primaryTotal) &&
    integer(value.primaryCorrect) &&
    value.primaryCorrect <= value.primaryAnswered &&
    value.primaryCorrect <= value.correct &&
    integer(value.corrected) &&
    value.corrected === value.correct - value.primaryCorrect &&
    value.corrected <= value.answered - value.primaryAnswered &&
    integer(value.maxStreak) &&
    value.maxStreak <= value.primaryCorrect &&
    nonnegative(value.elapsedMs) &&
    validTiming(value, value.answered) &&
    validTiming(value.correctTiming, value.primaryCorrect) &&
    (value.status !== 'completed' || value.answered === value.total)
  );
}

function validPerformance(value: unknown, key: string): boolean {
  if (
    !object(value) ||
    !hasKana(value.kanaId) ||
    !direction(value.direction) ||
    key !== `${value.kanaId}:${value.direction}` ||
    !integer(value.attempts) ||
    !integer(value.correct) ||
    !integer(value.errors) ||
    !integer(value.unknown) ||
    value.attempts !== value.correct + value.errors + value.unknown ||
    !integer(value.primaryAttempts) ||
    value.primaryAttempts > value.attempts ||
    !integer(value.primaryCorrect) ||
    value.primaryCorrect > value.primaryAttempts ||
    value.primaryCorrect > value.correct ||
    !date(value.lastPracticedAt) ||
    !validTiming(value, value.attempts) ||
    !validTiming(value.correctTiming, value.primaryCorrect) ||
    !Array.isArray(value.recent) ||
    value.recent.length !== Math.min(value.primaryAttempts, RECENT_LIMIT) ||
    !object(value.confusions) ||
    !object(value.review)
  )
    return false;
  if (
    !value.recent.every(
      (attempt) =>
        object(attempt) &&
        date(attempt.answeredAt) &&
        outcome(attempt.outcome) &&
        integer(attempt.responseMs) &&
        presentation(attempt.presentation) &&
        kind(attempt.kind) &&
        inputMethod(attempt.inputMethod),
    )
  )
    return false;
  let errors = 0;
  const entry = KANA_BY_ID[value.kanaId];
  const forward = value.direction === 'kana-romaji';
  for (const [choice, count] of Object.entries(value.confusions)) {
    if (
      !text(choice) ||
      !integer(count) ||
      count === 0 ||
      !KANA.some(
        (candidate) =>
          (forward || candidate.script === entry.script) &&
          candidate.pronunciation !== entry.pronunciation &&
          (forward ? candidate.romaji : candidate.glyph) === choice,
      )
    )
      return false;
    errors += count;
  }
  if (errors !== value.errors) return false;
  const review = value.review;
  return (
    integer(review.stage) &&
    review.stage < REVIEW_INTERVAL_DAYS.length &&
    date(review.dueAt) &&
    typeof review.needsCorrection === 'boolean' &&
    day(review.lastPromotedDay) &&
    day(review.lastExposedDay) &&
    integer(review.successfulDays)
  );
}

function validRecord(value: unknown): value is LearningRecord {
  if (
    !object(value) ||
    value.version !== 1 ||
    value.schema !== 'learning-v1' ||
    (value.language !== 'zh-CN' && value.language !== 'en') ||
    !validSettings(value.settings, true) ||
    (value.session !== null && !validSession(value.session)) ||
    !uniqueStrings(value.learnedLessons) ||
    !value.learnedLessons.every(hasLesson) ||
    !Array.isArray(value.history) ||
    value.history.length > HISTORY_LIMIT ||
    !value.history.every(validSummary) ||
    new Set(value.history.map((summary) => summary.id)).size !== value.history.length ||
    !object(value.kanaStats) ||
    !object(value.stats)
  )
    return false;
  if (value.study !== null) {
    if (
      !object(value.study) ||
      !hasLesson(value.study.lessonId) ||
      !integer(value.study.cardIndex) ||
      value.study.cardIndex >= LESSON_BY_ID[value.study.lessonId].kanaIds.length ||
      typeof value.study.mixLearned !== 'boolean'
    )
      return false;
  }
  const stats = value.stats;
  if (
    !integer(stats.answered) ||
    !integer(stats.correct) ||
    stats.correct > stats.answered ||
    !integer(stats.primaryAnswered) ||
    stats.primaryAnswered > stats.answered ||
    !integer(stats.primaryCorrect) ||
    stats.primaryCorrect > stats.primaryAnswered ||
    stats.primaryCorrect > stats.correct ||
    !integer(stats.completed) ||
    !integer(stats.maxStreak) ||
    stats.maxStreak > stats.primaryCorrect ||
    !nonnegative(stats.elapsedMs)
  )
    return false;
  const session = value.session;
  if (session?.status === 'active' && value.history.some((summary) => summary.id === session.id))
    return false;
  let attempts = 0;
  let correct = 0;
  let primaryAttempts = 0;
  let primaryCorrect = 0;
  for (const [key, performance] of Object.entries(value.kanaStats)) {
    if (!validPerformance(performance, key)) return false;
    const item = performance as Record<string, number>;
    attempts += item.attempts;
    correct += item.correct;
    primaryAttempts += item.primaryAttempts;
    primaryCorrect += item.primaryCorrect;
  }
  return (
    attempts === stats.answered &&
    correct === stats.correct &&
    primaryAttempts === stats.primaryAnswered &&
    primaryCorrect === stats.primaryCorrect
  );
}

export function loadRecord(
  storage: Pick<Storage, 'getItem'>,
  language: Language,
): { data: LearningRecord; warning: string | null } {
  let serialized: string | null;
  try {
    serialized = storage.getItem(STORAGE_KEY);
  } catch {
    return { data: createInitialRecord(language), warning: 'unavailable' };
  }
  if (serialized === null) return { data: createInitialRecord(language), warning: null };
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!validRecord(parsed)) return { data: createInitialRecord(language), warning: 'corrupt' };
    return {
      data: {
        ...parsed,
        session: parsed.session
          ? {
              ...parsed.session,
              paused: parsed.session.status === 'active' || parsed.session.paused,
            }
          : null,
      },
      warning: null,
    };
  } catch {
    return { data: createInitialRecord(language), warning: 'corrupt' };
  }
}

export function saveRecord(storage: Pick<Storage, 'setItem'>, data: LearningRecord): string | null {
  try {
    // A single setItem is atomic: quota failures leave the previously saved record intact.
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return null;
  } catch {
    return 'unavailable';
  }
}
