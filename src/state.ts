import { DEFAULT_SETTINGS, KANA_BY_ID } from './kana';
import { LESSON_BY_ID } from './lessons';
import { HISTORY_LIMIT, RECENT_LIMIT, REINFORCEMENT_GAP } from './config';
import { summarizeResponseTimes } from './timing';
import { createPerformance } from './statistics';
import { localDay, updateReview } from './review';
import { getConfusionFeedback } from './confusions';
import type {
  AnswerOutcome,
  GameAction,
  KanaPerformance,
  Language,
  LearningRecord,
  PracticeSettings,
  SessionSnapshot,
  SessionSummary,
} from './types';

const copySettings = (settings: PracticeSettings): PracticeSettings => ({
  ...settings,
  categories: [...settings.categories],
  rows: [...settings.rows],
});

function markExposure(record: LearningRecord, kanaIds: string[], now: string): LearningRecord {
  const kanaStats = { ...record.kanaStats };
  for (const kanaId of kanaIds) {
    if (!KANA_BY_ID[kanaId]) continue;
    for (const direction of ['kana-romaji', 'romaji-kana'] as const) {
      const key = kanaId + ':' + direction;
      const prior = kanaStats[key] ?? createPerformance(kanaId, direction, now);
      kanaStats[key] = { ...prior, review: { ...prior.review, lastExposedDay: localDay(now) } };
    }
  }
  return { ...record, kanaStats };
}

export function createInitialRecord(language: Language = 'zh-CN'): LearningRecord {
  return {
    version: 1,
    schema: 'learning-v1',
    language,
    settings: copySettings(DEFAULT_SETTINGS),
    session: null,
    study: null,
    learnedLessons: [],
    history: [],
    kanaStats: {},
    stats: {
      answered: 0,
      correct: 0,
      primaryAnswered: 0,
      primaryCorrect: 0,
      completed: 0,
      maxStreak: 0,
      elapsedMs: 0,
    },
  };
}

function finishSession(
  record: LearningRecord,
  status: 'completed' | 'abandoned',
  now: string,
): LearningRecord {
  const current = record.session;
  if (!current || current.status !== 'active') return record;
  const session: SessionSnapshot = {
    ...current,
    status,
    endedAt: now,
    paused: false,
    feedbackRemainingMs: 0,
  };
  // Answers and time update totals immediately; settlement only adds history.
  if (record.history.some((item) => item.id === session.id)) return { ...record, session };
  const primary = session.answers.slice(0, session.primaryCount);
  const summary: SessionSummary = {
    id: session.id,
    kind: session.kind,
    settings: copySettings(session.settings),
    startedAt: session.startedAt,
    endedAt: now,
    status,
    total: session.questions.length,
    primaryTotal: session.primaryCount,
    answered: session.answers.length,
    correct: session.answers.filter((a) => a.correct).length,
    primaryAnswered: primary.length,
    primaryCorrect: primary.filter((a) => a.correct).length,
    corrected: session.answers.slice(session.primaryCount).filter((a) => a.correct).length,
    correctTiming: summarizeResponseTimes(primary.filter((a) => a.correct)),
    maxStreak: session.maxStreak,
    elapsedMs: session.elapsedMs,
    ...summarizeResponseTimes(session.answers),
  };
  return {
    ...record,
    session,
    history: [summary, ...record.history].slice(0, HISTORY_LIMIT),
    stats: { ...record.stats, completed: record.stats.completed + Number(status === 'completed') },
  };
}

function advance(record: LearningRecord, now: string): LearningRecord {
  const session = record.session!;
  let questions = session.questions;
  if (
    session.index === session.primaryCount - 1 &&
    session.kind !== 'free' &&
    questions.length === session.primaryCount
  ) {
    // Freeze a bounded queue; short sessions defer items that have no spacing opportunity.
    const retries = questions.flatMap((question, index) =>
      session.answers[index]?.outcome !== 'correct' &&
      session.primaryCount - 1 - index >= REINFORCEMENT_GAP
        ? [
            {
              ...question,
              id: question.id + ':retry',
              role: 'reinforcement' as const,
              sourceQuestionId: question.id,
              options: [...question.options.slice(1), question.options[0]],
            },
          ]
        : [],
    );
    questions = [...questions, ...retries];
  }
  if (session.index === questions.length - 1) return finishSession(record, 'completed', now);
  const index = session.index + 1;
  return {
    ...record,
    session: {
      ...session,
      questions,
      index,
      stage: index >= session.primaryCount ? 'reinforcement' : 'primary',
      phase: session.settings.presentation === 'recall' ? 'recall' : 'choice',
      feedbackRemainingMs: 0,
      questionElapsedMs: 0,
    },
  };
}

export function gameReducer(record: LearningRecord, action: GameAction): LearningRecord {
  const session = record.session;
  switch (action.type) {
    case 'ACK_RECOVERY': {
      if (!record.recoveryNotice) return record;
      const { recoveryNotice, ...rest } = record;
      return rest;
    }
    case 'START': {
      if (
        !action.session.questions.length ||
        action.session.status !== 'active' ||
        session?.id === action.session.id ||
        record.history.some((item) => item.id === action.session.id)
      )
        return record;
      const previous = finishSession(record, 'abandoned', action.now);
      return {
        ...previous,
        settings: copySettings(action.session.settings),
        session: action.session,
      };
    }
    case 'ANSWER': {
      if (!session || session.status !== 'active' || session.paused || session.phase !== 'choice')
        return record;
      const question = session.questions[session.index];
      if (
        !question ||
        session.answers.some((a) => a.questionId === question.id) ||
        (action.choice !== null && !question.options.includes(action.choice))
      )
        return record;
      const outcome: AnswerOutcome =
        action.choice === null
          ? 'unknown'
          : action.choice === question.correctAnswer
            ? 'correct'
            : 'incorrect';
      const correct = outcome === 'correct';
      const primary = question.role === 'primary';
      const streak = primary ? (correct ? session.streak + 1 : 0) : session.streak;
      const responseMs = Math.round(session.questionElapsedMs);
      const key = question.kanaId + ':' + question.direction;
      const prior =
        record.kanaStats[key] ?? createPerformance(question.kanaId, question.direction, action.now);
      const performance: KanaPerformance = {
        ...prior,
        attempts: prior.attempts + 1,
        correct: prior.correct + Number(correct),
        errors: prior.errors + Number(outcome === 'incorrect'),
        unknown: prior.unknown + Number(outcome === 'unknown'),
        primaryAttempts: prior.primaryAttempts + Number(primary),
        primaryCorrect: prior.primaryCorrect + Number(primary && correct),
        timedAnswers: prior.timedAnswers + 1,
        totalResponseMs: prior.totalResponseMs + responseMs,
        correctTiming: {
          timedAnswers: prior.correctTiming.timedAnswers + Number(primary && correct),
          totalResponseMs:
            prior.correctTiming.totalResponseMs + (primary && correct ? responseMs : 0),
        },
        recent: primary
          ? [
              ...prior.recent,
              {
                answeredAt: action.now,
                outcome,
                responseMs,
                inputMethod: action.inputMethod,
                presentation: session.settings.presentation,
                kind: session.kind,
              },
            ].slice(-RECENT_LIMIT)
          : prior.recent,
        confusions:
          outcome === 'incorrect'
            ? {
                ...prior.confusions,
                [action.choice!]: (prior.confusions[action.choice!] ?? 0) + 1,
              }
            : prior.confusions,
        review: updateReview(prior.review, outcome, action.now, question.role, session.kind),
        lastPracticedAt: action.now,
      };
      const next: LearningRecord = {
        ...record,
        kanaStats: { ...record.kanaStats, [key]: performance },
        session: {
          ...session,
          answers: [
            ...session.answers,
            {
              questionId: question.id,
              choice: action.choice,
              outcome,
              correct,
              answeredAt: action.now,
              responseMs,
              inputMethod: action.inputMethod,
            },
          ],
          phase: 'feedback',
          streak,
          maxStreak: Math.max(session.maxStreak, streak),
          feedbackRemainingMs: correct ? (session.feedbackDelayMs ?? 0) : 0,
        },
        stats: {
          ...record.stats,
          answered: record.stats.answered + 1,
          correct: record.stats.correct + Number(correct),
          primaryAnswered: record.stats.primaryAnswered + Number(primary),
          primaryCorrect: record.stats.primaryCorrect + Number(primary && correct),
          maxStreak: Math.max(record.stats.maxStreak, streak),
        },
      };
      const mistaken = getConfusionFeedback(question, action.choice, record.language)?.mistaken;
      return markExposure(next, [question.kanaId, ...(mistaken ? [mistaken.id] : [])], action.now);
    }
    case 'REVEAL':
      return session?.status === 'active' && !session.paused && session.phase === 'recall'
        ? { ...record, session: { ...session, phase: 'choice', questionElapsedMs: 0 } }
        : record;
    case 'TICK': {
      if (
        !session ||
        session.status !== 'active' ||
        session.paused ||
        !Number.isFinite(action.deltaMs) ||
        action.deltaMs <= 0
      )
        return record;
      const current = session.answers[session.index];
      const auto =
        session.phase === 'feedback' && current?.correct && session.feedbackDelayMs !== null;
      const elapsed = session.phase === 'choice' ? action.deltaMs : 0;
      const remaining = auto
        ? Math.max(0, session.feedbackRemainingMs - action.deltaMs)
        : session.feedbackRemainingMs;
      const next: LearningRecord = {
        ...record,
        session: {
          ...session,
          elapsedMs: session.elapsedMs + elapsed,
          questionElapsedMs: session.questionElapsedMs + elapsed,
          feedbackRemainingMs: remaining,
        },
        stats: { ...record.stats, elapsedMs: record.stats.elapsedMs + elapsed },
      };
      return auto && remaining === 0 ? advance(next, action.now) : next;
    }
    case 'ADVANCE':
      return session?.status === 'active' &&
        !session.paused &&
        session.phase === 'feedback' &&
        (!session.answers[session.index]?.correct || session.feedbackDelayMs === null)
        ? advance(record, action.now)
        : record;
    case 'PAUSE':
      return session?.status === 'active' && session.paused !== action.paused
        ? { ...record, session: { ...session, paused: action.paused } }
        : record;
    case 'ABANDON':
      return finishSession(record, 'abandoned', action.now);
    case 'STUDY': {
      const lesson = LESSON_BY_ID[action.study.lessonId];
      const kanaId = lesson?.kanaIds[action.study.cardIndex];
      return kanaId
        ? markExposure({ ...record, study: { ...action.study } }, [kanaId], action.now)
        : record;
    }
    case 'LESSON_COMPLETE': {
      const lesson = LESSON_BY_ID[action.lessonId];
      if (!lesson) return record;
      return markExposure(
        { ...record, learnedLessons: [...new Set([...record.learnedLessons, action.lessonId])] },
        lesson.kanaIds,
        action.now,
      );
    }
    case 'SETTINGS':
      return { ...record, settings: copySettings(action.settings) };
    case 'LANGUAGE':
      return { ...record, language: action.language };
    case 'CLEAR':
      return { ...createInitialRecord(record.language), settings: copySettings(record.settings) };
  }
}
