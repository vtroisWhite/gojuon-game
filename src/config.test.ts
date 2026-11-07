import { describe, expect, it, vi } from 'vitest';
import { createSession } from './engine';
import { DEFAULT_SETTINGS } from './kana';
import { createInitialRecord, gameReducer } from './state';

vi.mock('./config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config')>();
  return { ...actual, FEEDBACK_DELAYS: { ...actual.FEEDBACK_DELAYS, auto: 1500 } };
});

describe('统一反馈配置', () => {
  it('建局采用自定义预设，计时只按本局快照推进', () => {
    const now = '2026-11-07T12:00:00Z';
    const session = createSession(
      { ...DEFAULT_SETTINGS, feedbackSpeed: 'auto' },
      {},
      'free',
      Math.random,
      now,
    );
    let record = gameReducer(createInitialRecord(), { type: 'START', session, now });
    record = gameReducer(record, {
      type: 'ANSWER',
      choice: session.questions[0].correctAnswer,
      inputMethod: 'keyboard',
      now,
    });
    expect(record.session?.feedbackRemainingMs).toBe(1500);
    record = gameReducer(record, {
      type: 'SETTINGS',
      settings: { ...DEFAULT_SETTINGS, feedbackSpeed: 'manual' },
    });
    record = gameReducer(record, { type: 'TICK', deltaMs: 1499, now });
    expect(record.session).toMatchObject({ index: 0, feedbackRemainingMs: 1 });
    record = gameReducer(record, { type: 'TICK', deltaMs: 1, now });
    expect(record.session).toMatchObject({ index: 1, phase: 'choice' });
  });
  it('手动反馈不会因计时自动结束，正确题可主动继续', () => {
    const now = '2026-11-07T12:00:00Z';
    const session = createSession(
      { ...DEFAULT_SETTINGS, feedbackSpeed: 'manual' },
      {},
      'free',
      Math.random,
      now,
    );
    let record = gameReducer(createInitialRecord(), { type: 'START', session, now });
    record = gameReducer(record, {
      type: 'ANSWER',
      choice: session.questions[0].correctAnswer,
      inputMethod: 'pointer',
      now,
    });
    record = gameReducer(record, { type: 'TICK', deltaMs: 100000, now });
    expect(record.session).toMatchObject({ index: 0, phase: 'feedback', feedbackDelayMs: null });
    record = gameReducer(record, { type: 'ADVANCE', now });
    expect(record.session).toMatchObject({ index: 1, phase: 'choice' });
  });
});
