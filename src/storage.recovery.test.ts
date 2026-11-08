import { describe, expect, it } from 'vitest';
import { createInitialRecord, gameReducer } from './state';
import { createSession } from './engine';
import { DEFAULT_SETTINGS } from './kana';
import { initializeStorage, loadRecord, STORAGE_KEY, STORAGE_BACKUP_KEY } from './storage';
import type { LearningRecord } from './types';

const now = '2026-11-08T12:00:00Z';
function progress() {
  const session = createSession(
    { ...DEFAULT_SETTINGS, feedbackSpeed: 'manual' },
    {},
    'free',
    () => 0.3,
    now,
    ['hiragana-あ'],
  );
  let record = gameReducer(createInitialRecord('zh-CN'), { type: 'START', session, now });
  record = gameReducer(record, { type: 'TICK', deltaMs: 456, now });
  record = gameReducer(record, { type: 'ANSWER', choice: 'a', inputMethod: 'keyboard', now });
  record = gameReducer(record, { type: 'ADVANCE', now });
  const second = createSession(
    { ...DEFAULT_SETTINGS, feedbackSpeed: 'manual' },
    record.kanaStats,
    'free',
    () => 0.4,
    now,
  );
  return gameReducer(record, { type: 'START', session: second, now });
}
function storageFor(value: unknown) {
  const original = JSON.stringify(value);
  const values = new Map([
    [STORAGE_KEY, original],
    ['other-data', 'preserve'],
  ]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  return { values, storage, original };
}
function expectPreserved(actual: LearningRecord, prior: LearningRecord) {
  expect(actual.stats).toEqual(prior.stats);
  expect(actual.kanaStats).toEqual(prior.kanaStats);
  expect(actual.history.map(({ settings, ...item }) => item)).toEqual(
    prior.history.map(({ settings, ...item }) => item),
  );
}

describe('non-destructive learning record recovery', () => {
  it.each(['standard', 'fast', 'unrecognized'])(
    'repairs %s preferences in every section without losing scores',
    (speed) => {
      const prior = progress();
      const raw = structuredClone(prior) as any;
      raw.settings.feedbackSpeed = speed;
      raw.session.settings.feedbackSpeed = speed;
      raw.session.feedbackDelayMs = 700;
      raw.history[0].settings.feedbackSpeed = speed;
      const { values, storage, original } = storageFor(raw);
      const result = initializeStorage(storage, 'en');
      expect(result.warning).toBeNull();
      expectPreserved(result.data, prior);
      expect(result.data.recoveryNotice?.kind).toBe('settings');
      expect(result.data.settings.feedbackSpeed).toBe('auto');
      expect(result.data.session).toMatchObject({
        id: prior.session!.id,
        paused: true,
        feedbackDelayMs: 700,
      });
      expect(result.data.session?.questions).toEqual(prior.session!.questions);
      expect(result.data.history[0].settings.feedbackSpeed).toBe('auto');
      expect(values.get(STORAGE_BACKUP_KEY)).toBe(original);
      expect(values.get('other-data')).toBe('preserve');
      expect(loadRecord(storage, 'en').warning).toBeNull();
    },
  );

  it('repairs invalid settings individually and preserves valid preferences', () => {
    const prior = progress();
    const raw = structuredClone(prior) as any;
    raw.settings.count = -1;
    raw.settings.categories.push('missing-category');
    raw.settings.mode = 'mixed';
    const { storage } = storageFor(raw);
    const result = initializeStorage(storage, 'en');
    expectPreserved(result.data, prior);
    expect(result.data.settings).toMatchObject({
      count: 20,
      categories: prior.settings.categories,
      mode: 'mixed',
      feedbackSpeed: 'manual',
    });
    expect(result.data.recoveryNotice?.kind).toBe('settings');
  });

  it('discards only an invalid current session while retaining other progress', () => {
    const prior = progress();
    const raw = structuredClone(prior) as any;
    raw.session.questions = 'damaged';
    const { storage } = storageFor(raw);
    const result = initializeStorage(storage, 'en');
    expectPreserved(result.data, prior);
    expect(result.data.session).toBeNull();
    expect(result.data.recoveryNotice?.kind).toBe('partial');
  });

  it('retains valid history entries when one entry is damaged', () => {
    const prior = progress();
    const raw = structuredClone(prior) as any;
    raw.history.push({ id: 'damaged' });
    const { storage } = storageFor(raw);
    const result = initializeStorage(storage, 'en');
    expectPreserved(result.data, prior);
    expect(result.data.recoveryNotice?.kind).toBe('partial');
  });

  it('resets only an invalid review schedule, preserving answer and timing counters', () => {
    const prior = progress();
    const raw = structuredClone(prior) as any;
    const key = 'hiragana-あ:kana-romaji';
    raw.kanaStats[key].review.stage = 999;
    const { storage } = storageFor(raw);
    const result = initializeStorage(storage, 'en');
    expect(result.data.stats).toEqual(prior.stats);
    const { review, ...counts } = result.data.kanaStats[key];
    const { review: oldReview, ...oldCounts } = prior.kanaStats[key];
    expect(counts).toEqual(oldCounts);
    expect(review.stage).toBe(0);
    expect(result.data.recoveryNotice?.kind).toBe('partial');
    expect(loadRecord(storage, 'en').warning).toBeNull();
  });

  it('keeps the notice across reloads until explicitly acknowledged', () => {
    const { storage, values, original } = storageFor({ version: 1 });
    const reset = initializeStorage(storage, 'zh-CN');
    expect(reset.data.recoveryNotice?.kind).toBe('reset');
    expect(initializeStorage(storage, 'zh-CN').data.recoveryNotice?.kind).toBe('reset');
    const acknowledged = gameReducer(reset.data, { type: 'ACK_RECOVERY' });
    storage.setItem(STORAGE_KEY, JSON.stringify(acknowledged));
    expect(initializeStorage(storage, 'zh-CN').data.recoveryNotice).toBeUndefined();
    expect(values.get(STORAGE_BACKUP_KEY)).toBe(original);
  });

  it.each([STORAGE_BACKUP_KEY, STORAGE_KEY])(
    'never reports a successful overwrite when writing %s fails',
    (failedKey) => {
      const prior = progress();
      const raw = structuredClone(prior) as any;
      raw.settings.feedbackSpeed = 'standard';
      const { storage, values, original } = storageFor(raw);
      const result = initializeStorage(
        {
          ...storage,
          setItem: (key, value) => {
            if (key === failedKey) throw new Error('quota');
            storage.setItem(key, value);
          },
        },
        'zh-CN',
      );
      expect(result.warning).toBe('unavailable');
      expect(result.data.stats).toEqual(prior.stats);
      expect(result.data.recoveryNotice).toBeUndefined();
      expect(values.get(STORAGE_KEY)).toBe(original);
    },
  );
});
