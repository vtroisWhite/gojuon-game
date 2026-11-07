import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, KANA } from './kana';
import { LESSONS } from './lessons';
import { FEEDBACK_DELAYS } from './config';
import { createInitialRecord, gameReducer } from './state';
import { initializeStorage, loadRecord, saveRecord, STORAGE_KEY } from './storage';
import type { LearningRecord, PracticeSettings, SessionSnapshot } from './types';

const now = '2026-11-07T12:00:00.000Z';
function activeRecord(
  settings: Partial<PracticeSettings> = {},
  count = 1,
  kind: SessionSnapshot['kind'] = 'free',
): LearningRecord {
  const selected = { ...DEFAULT_SETTINGS, ...settings };
  const session: SessionSnapshot = {
    id: 'saved-session',
    kind,
    settings: selected,
    questions: KANA.slice(0, count).map((entry, index) => ({
      id: `q-${index}`,
      kanaId: entry.id,
      direction: 'kana-romaji',
      role: 'primary',
      options: [
        entry.romaji,
        ...KANA.filter((candidate) => candidate.pronunciation !== entry.pronunciation)
          .slice(0, 2)
          .map((candidate) => candidate.romaji),
      ],
      correctAnswer: entry.romaji,
    })),
    primaryCount: count,
    index: 0,
    answers: [],
    phase: selected.presentation === 'recall' ? 'recall' : 'choice',
    stage: 'primary',
    paused: false,
    status: 'active',
    streak: 0,
    maxStreak: 0,
    elapsedMs: 0,
    questionElapsedMs: 0,
    feedbackDelayMs: FEEDBACK_DELAYS[selected.feedbackSpeed],
    feedbackRemainingMs: 0,
    startedAt: now,
  };
  return gameReducer(createInitialRecord('en'), { type: 'START', session, now });
}
const roundtrip = (record: unknown) =>
  loadRecord({ getItem: () => JSON.stringify(record) }, 'zh-CN');
function answer(
  record: LearningRecord,
  choice: string | null = record.session!.questions[record.session!.index].correctAnswer,
) {
  return gameReducer(record, { type: 'ANSWER', choice, inputMethod: 'keyboard', now });
}

describe('learning-v1 storage', () => {
  it.each(['{broken json', '{"version":1}', 'null'])(
    'automatically replaces invalid storage: %s',
    (serialized) => {
      let persisted = serialized;
      const setItem = vi.fn((key: string, value: string) => {
        expect(key).toBe(STORAGE_KEY);
        persisted = value;
      });
      const result = initializeStorage({ getItem: () => persisted, setItem }, 'en');
      expect(result).toEqual({ data: createInitialRecord('en'), warning: null });
      expect(JSON.parse(persisted)).toEqual(result.data);
      expect(initializeStorage({ getItem: () => persisted, setItem }, 'en').warning).toBeNull();
      expect(setItem).toHaveBeenCalledTimes(1);
    },
  );

  it('does not reset valid data or storage that cannot be read', () => {
    const record = activeRecord();
    const setItem = vi.fn();
    const restored = initializeStorage({ getItem: () => JSON.stringify(record), setItem }, 'en');
    expect(restored.data.stats).toEqual(record.stats);
    expect(restored.data.session?.id).toBe(record.session?.id);
    expect(setItem).not.toHaveBeenCalled();
    const blocked = initializeStorage(
      {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem,
      },
      'en',
    );
    expect(blocked.warning).toBe('unavailable');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('reports a failed automatic reset without deleting other data or retrying', () => {
    const persisted = '{"version":1}';
    const setItem = vi.fn(() => {
      throw new Error('quota');
    });
    const result = initializeStorage({ getItem: () => persisted, setItem }, 'zh-CN');
    expect(result.warning).toBe('unavailable');
    expect(result.data.stats.answered).toBe(0);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(persisted).toBe('{"version":1}');
  });
  it('uses one namespaced key and preserves the complete new schema', () => {
    const getItem = vi.fn(() => null);
    const initial = loadRecord({ getItem }, 'en');
    expect(getItem).toHaveBeenCalledExactlyOnceWith(STORAGE_KEY);
    expect(initial).toEqual({ data: createInitialRecord('en'), warning: null });
    const setItem = vi.fn();
    expect(saveRecord({ setItem }, initial.data)).toBeNull();
    expect(setItem).toHaveBeenCalledExactlyOnceWith('gojuon-game:v1', JSON.stringify(initial.data));
    expect(roundtrip(initial.data).warning).toBeNull();
  });

  it('restores partial response time paused without counting time spent away', () => {
    const record = gameReducer(activeRecord(), { type: 'TICK', deltaMs: 1234.4, now });
    const restored = roundtrip(record);
    expect(restored.warning).toBeNull();
    expect(restored.data.session).toMatchObject({
      paused: true,
      questionElapsedMs: 1234.4,
      elapsedMs: 1234.4,
    });
    expect(gameReducer(restored.data, { type: 'TICK', deltaMs: 90000, now })).toBe(restored.data);
    let resumed = gameReducer(restored.data, { type: 'PAUSE', paused: false });
    resumed = gameReducer(resumed, { type: 'TICK', deltaMs: 65.6, now });
    resumed = answer(resumed);
    expect(resumed.session?.answers[0]).toMatchObject({
      outcome: 'correct',
      responseMs: 1300,
      inputMethod: 'keyboard',
    });
    expect(roundtrip(resumed).warning).toBeNull();
  });

  it('starts the response clock only after revealing choices and restores its progress', () => {
    let record = gameReducer(activeRecord({ presentation: 'recall' }), {
      type: 'TICK',
      deltaMs: 200,
      now,
    });
    expect(roundtrip(record).data.session).toMatchObject({
      phase: 'recall',
      questionElapsedMs: 0,
    });
    record = gameReducer(record, { type: 'REVEAL' });
    record = gameReducer(record, { type: 'TICK', deltaMs: 150, now });
    expect(roundtrip(record).data.session).toMatchObject({
      phase: 'choice',
      questionElapsedMs: 150,
    });
    record = answer(record, null);
    const restored = roundtrip(record);
    expect(restored.warning).toBeNull();
    expect(restored.data.session?.answers[0]).toMatchObject({
      choice: null,
      outcome: 'unknown',
      correct: false,
      responseMs: 150,
    });
    expect(restored.data.session).toMatchObject({ phase: 'feedback', feedbackRemainingMs: 0 });
  });

  it('preserves a manual feedback snapshot and requires explicit continuation after recovery', () => {
    const record = answer(activeRecord({ feedbackSpeed: 'manual' }));
    const restored = roundtrip(record);
    expect(restored.warning).toBeNull();
    expect(restored.data.session).toMatchObject({
      phase: 'feedback',
      feedbackDelayMs: null,
      feedbackRemainingMs: 0,
    });
    let resumed = gameReducer(restored.data, { type: 'PAUSE', paused: false });
    resumed = gameReducer(resumed, { type: 'TICK', deltaMs: 5000, now });
    expect(resumed.session?.status).toBe('active');
    resumed = gameReducer(resumed, { type: 'ADVANCE', now });
    expect(roundtrip(resumed).warning).toBeNull();
    expect(resumed.history[0]).toMatchObject({
      primaryTotal: 1,
      primaryAnswered: 1,
      primaryCorrect: 1,
      corrected: 0,
    });
  });

  it.each(['auto'] as const)(
    'preserves partially elapsed %s feedback and completes exactly once',
    (feedbackSpeed) => {
      const elapsed = FEEDBACK_DELAYS[feedbackSpeed]! / 2;
      let record = answer(activeRecord({ feedbackSpeed }));
      record = gameReducer(record, { type: 'TICK', deltaMs: elapsed, now });
      const restored = roundtrip(record);
      expect(restored.warning).toBeNull();
      expect(restored.data.session).toMatchObject({ paused: true, feedbackRemainingMs: elapsed });
      record = gameReducer(restored.data, { type: 'PAUSE', paused: false });
      record = gameReducer(record, { type: 'TICK', deltaMs: elapsed, now });
      expect(record.stats).toMatchObject({ answered: 1, correct: 1, completed: 1 });
      expect(roundtrip(record).warning).toBeNull();
      expect(gameReducer(record, { type: 'TICK', deltaMs: 1000, now })).toBe(record);
      expect(record.history).toHaveLength(1);
    },
  );

  it('keeps the stored feedback duration if presets change between visits', () => {
    let record = activeRecord();
    record.session!.feedbackDelayMs = 550;
    record = answer(record);
    record = gameReducer(record, { type: 'TICK', deltaMs: 125, now });
    const restored = roundtrip(record);
    expect(restored.warning).toBeNull();
    expect(restored.data.session).toMatchObject({ feedbackDelayMs: 550, feedbackRemainingMs: 425 });
  });

  it('preserves lesson cards, completed lessons and zero-attempt exposed items', () => {
    const lesson = LESSONS[0];
    let record = gameReducer(createInitialRecord(), {
      type: 'STUDY',
      study: { lessonId: lesson.id, cardIndex: 1, mixLearned: true },
      now,
    });
    record = gameReducer(record, { type: 'LESSON_COMPLETE', lessonId: lesson.id, now });
    const restored = roundtrip(record);
    expect(restored.warning).toBeNull();
    expect(restored.data.study).toEqual(record.study);
    expect(restored.data.learnedLessons).toEqual([lesson.id]);
    expect(Object.values(restored.data.kanaStats).every((item) => item.attempts === 0)).toBe(true);
    expect(restored.data.stats.answered).toBe(0);
  });

  it('restores the frozen reinforcement queue without rebuilding or duplicating it', () => {
    let record = activeRecord({ feedbackSpeed: 'manual' }, 4, 'learn');
    record = answer(record, null);
    record = gameReducer(record, { type: 'ADVANCE', now });
    for (let i = 1; i < 4; i += 1) {
      record = answer(record);
      record = gameReducer(record, { type: 'ADVANCE', now });
    }
    expect(record.session?.questions).toHaveLength(5);
    expect(record.session).toMatchObject({ primaryCount: 4, index: 4, stage: 'reinforcement' });
    const restored = roundtrip(record);
    expect(restored.warning).toBeNull();
    expect(restored.data.session?.questions).toEqual(record.session?.questions);
    let resumed = gameReducer(restored.data, { type: 'PAUSE', paused: false });
    resumed = answer(resumed);
    resumed = gameReducer(resumed, { type: 'ADVANCE', now });
    expect(roundtrip(resumed).warning).toBeNull();
    expect(resumed.history[0]).toMatchObject({
      total: 5,
      primaryTotal: 4,
      primaryCorrect: 3,
      corrected: 1,
      correct: 4,
    });
  });

  it('rejects old records without trying to migrate optional timing fields', () => {
    const raw = JSON.parse(JSON.stringify(activeRecord()));
    delete raw.schema;
    expect(roundtrip(raw).warning).toBe('corrupt');
    raw.schema = 'learning-v1';
    delete raw.session.questionElapsedMs;
    expect(roundtrip(raw).warning).toBe('corrupt');
  });

  it.each(['not json', 'null', '{}', '{"version":2}', '[]'])(
    'safely rejects invalid serialized data %s',
    (serialized) => {
      expect(loadRecord({ getItem: () => serialized }, 'en')).toEqual({
        data: createInitialRecord('en'),
        warning: 'corrupt',
      });
    },
  );

  it.each([
    (value: any) => {
      value.settings.rows = ['missing-row'];
    },
    (value: any) => {
      delete value.settings.presentation;
    },
    (value: any) => {
      value.settings.feedbackSpeed = 'instant';
    },
    (value: any) => {
      value.session.primaryCount = 0;
    },
    (value: any) => {
      value.session.phase = 'feedback';
    },
    (value: any) => {
      value.session.stage = 'reinforcement';
    },
    (value: any) => {
      value.session.questionElapsedMs = -1;
    },
    (value: any) => {
      value.session.feedbackDelayMs = -500;
    },
    (value: any) => {
      value.session.questions[0].kanaId = 'missing-kana';
    },
    (value: any) => {
      value.session.questions[0].options = ['a', 'a', 'a'];
    },
    (value: any) => {
      value.session.questions[0].sourceQuestionId = 'nonexistent';
    },
    (value: any) => {
      value.stats.primaryAnswered = 1;
    },
    (value: any) => {
      value.stats.elapsedMs = Infinity;
    },
    (value: any) => {
      value.study = { lessonId: LESSONS[0].id, cardIndex: 100, mixLearned: false };
    },
    (value: any) => {
      value.learnedLessons = ['missing-lesson'];
    },
  ])('rejects a malformed new field or queue invariant %#', (mutate) => {
    const record = structuredClone(activeRecord());
    mutate(record);
    expect(roundtrip(record).warning).toBe('corrupt');
  });

  it('rejects inconsistent outcomes, review state, response totals and recent attempts', () => {
    const record = answer(activeRecord());
    const key = KANA[0].id + ':kana-romaji';
    const mutations = [
      (value: any) => {
        value.session.answers[0].outcome = 'unknown';
      },
      (value: any) => {
        value.session.answers[0].inputMethod = 'mouse';
      },
      (value: any) => {
        value.kanaStats[key].review.stage = 99;
      },
      (value: any) => {
        value.kanaStats[key].review.stage = 5;
      },
      (value: any) => {
        value.kanaStats[key].correctTiming.timedAnswers = 0;
      },
      (value: any) => {
        value.kanaStats[key].recent = [];
      },
      (value: any) => {
        value.kanaStats[key].confusions = { ka: 1 };
      },
      (value: any) => {
        value.kanaStats[key].unknown = 1;
      },
    ];
    for (const mutate of mutations) {
      const copy = structuredClone(record);
      mutate(copy);
      expect(roundtrip(copy).warning).toBe('corrupt');
    }
  });

  it('rejects arbitrary and same-pronunciation confusion strings', () => {
    const base = answer(activeRecord(), 'i');
    const key = KANA[0].id + ':kana-romaji';
    for (const choice of ['not-a-reading', 'a']) {
      const record = structuredClone(base);
      record.kanaStats[key].confusions = { [choice]: 1 };
      expect(roundtrip(record).warning).toBe('corrupt');
    }
  });

  it('allows empty home selections, but requires a valid saved session range', () => {
    const record = activeRecord();
    record.settings = { ...record.settings, categories: [] };
    expect(roundtrip(record).warning).toBeNull();
    record.session!.settings = { ...record.session!.settings, categories: [] };
    expect(roundtrip(record).warning).toBe('corrupt');
  });

  it('reports unavailable storage and leaves the prior saved value intact after a failed set', () => {
    const getItem = () => {
      throw new Error('blocked');
    };
    expect(loadRecord({ getItem }, 'en')).toEqual({
      data: createInitialRecord('en'),
      warning: 'unavailable',
    });
    const prior = JSON.stringify(createInitialRecord());
    let persisted = prior;
    const setItem = vi.fn(() => {
      throw new Error('quota exceeded');
    });
    expect(saveRecord({ setItem }, answer(activeRecord()))).toBe('unavailable');
    expect(persisted).toBe(prior);
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});
