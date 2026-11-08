// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, KANA } from './kana';
import { LESSONS } from './lessons';
import { FEEDBACK_DELAYS, SNAPSHOT_INTERVAL_MS } from './config';
import { STORAGE_KEY } from './storage';
import { useGame } from './useGame';
import type { PracticeSettings, SessionSnapshot } from './types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let current: ReturnType<typeof useGame>;
let container: HTMLDivElement;
let sequence = 0;
const now = () => new Date().toISOString();
function Harness({ enabled }: { enabled: boolean }) {
  current = useGame(enabled);
  return null;
}
function press(
  key: string,
  code = key,
  target: HTMLElement = document.body,
  options: KeyboardEventInit = {},
) {
  act(() =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true, ...options }),
    ),
  );
}
function wait(ms: number) {
  act(() => vi.advanceTimersByTime(ms));
}
function start(settings: Partial<PracticeSettings> = {}, count = 3) {
  const selected = { ...DEFAULT_SETTINGS, ...settings };
  const session: SessionSnapshot = {
    id: `test-session-${sequence++}`,
    kind: 'free',
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
    startedAt: now(),
  };
  act(() => current.dispatch({ type: 'START', session, now: now() }));
}
function remount(enabled = true) {
  act(() => root.unmount());
  root = createRoot(container);
  act(() => root.render(createElement(Harness, { enabled })));
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(Harness, { enabled: true })));
  start();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('learning game browser lifecycle', () => {
  it('counts only visible-choice time in individual and cumulative durations', () => {
    start({ presentation: 'recall', feedbackSpeed: 'auto' }, 2);
    wait(2000);
    expect(current.data.stats.elapsedMs).toBe(0);
    act(() => current.dispatch({ type: 'REVEAL' }));
    wait(45);
    press(' ', 'Space');
    wait(5000);
    press(' ', 'Space');
    wait(35);
    press('1');
    expect(current.data.session?.answers[0].responseMs).toBe(80);
    expect(current.data.stats.elapsedMs).toBe(80);
    wait(1000);
    expect(current.data.session?.phase).toBe('recall');
    expect(current.data.stats.elapsedMs).toBe(80);
    act(() => current.dispatch({ type: 'REVEAL' }));
    wait(25);
    press('0');
    wait(3000);
    press('Enter');
    expect(current.data.history[0].elapsedMs).toBe(105);
    expect(current.data.stats.elapsedMs).toBe(105);
    expect(current.data.session?.answers.map((a) => a.responseMs)).toEqual([80, 25]);
  });

  it('handles a shortcut event whose target is the window', () => {
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', code: 'Digit1' })));
    expect(current.data.stats.answered).toBe(1);
    expect(current.data.session?.answers[0].inputMethod).toBe('keyboard');
  });

  it('captures an input between timer ticks with millisecond precision and saves it once', () => {
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    wait(165);
    press('1', 'Digit1');
    expect(current.data.session?.answers[0]).toMatchObject({
      responseMs: 165,
      inputMethod: 'keyboard',
      outcome: 'correct',
    });
    expect(current.data.session?.elapsedMs).toBe(165);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).session.answers[0].responseMs).toBe(165);
    expect(writes).toHaveBeenCalledTimes(1);
    press('2', 'Digit2');
    expect(current.data.stats.answered).toBe(1);
    expect(writes).toHaveBeenCalledTimes(1);
  });

  it('updates the clock every 100 ms but throttles unchanged-phase snapshots to one second', () => {
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    wait(SNAPSHOT_INTERVAL_MS - 100);
    expect(current.data.session?.questionElapsedMs).toBe(SNAPSHOT_INTERVAL_MS - 100);
    expect(writes).not.toHaveBeenCalled();
    wait(100);
    expect(writes).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).session.questionElapsedMs).toBe(
      SNAPSHOT_INTERVAL_MS,
    );
    wait(150);
    press('1');
    expect(writes).toHaveBeenCalledTimes(2);
    expect(current.data.session?.answers[0].responseMs).toBe(1150);
  });

  it('preserves sub-tick time across pauses while excluding paused time', () => {
    wait(75);
    press(' ', 'Space');
    expect(current.data.session?.questionElapsedMs).toBe(75);
    wait(5000);
    press(' ', 'Space');
    wait(35);
    press('1');
    expect(current.data.session?.answers[0].responseMs).toBe(110);
  });

  it('ignores numeric input and excludes time during recall before revealing', () => {
    start({ presentation: 'recall' });
    wait(125);
    press('1');
    expect(current.data.session?.phase).toBe('recall');
    expect(current.data.session?.answers).toHaveLength(0);
    act(() => current.dispatch({ type: 'REVEAL' }));
    expect(current.data.session).toMatchObject({ phase: 'choice', questionElapsedMs: 0 });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).session.phase).toBe('choice');
    wait(40);
    press('2', 'Numpad2');
    expect(current.data.session?.answers[0]).toMatchObject({
      responseMs: 40,
      outcome: 'incorrect',
      inputMethod: 'keyboard',
    });
  });

  it('keeps manual correct feedback until Enter and starts the next response clock afterwards', () => {
    start({ feedbackSpeed: 'manual' });
    wait(55);
    press('1');
    wait(4000);
    expect(current.data.session).toMatchObject({
      phase: 'feedback',
      index: 0,
      questionElapsedMs: 55,
    });
    press('Enter');
    expect(current.data.session).toMatchObject({ phase: 'choice', index: 1, questionElapsedMs: 0 });
    wait(23);
    press('2');
    expect(current.data.session?.answers.map((answer) => answer.responseMs)).toEqual([55, 23]);
  });

  it('records unknown answers and pointer methods immediately, then waits for Enter', () => {
    wait(165);
    act(() => current.dispatch({ type: 'ANSWER', choice: null, inputMethod: 'touch', now: now() }));
    expect(current.data.session?.answers[0]).toMatchObject({
      choice: null,
      outcome: 'unknown',
      inputMethod: 'touch',
      responseMs: 165,
    });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).session.answers[0].outcome).toBe(
      'unknown',
    );
    wait(3000);
    expect(current.data.session?.index).toBe(0);
    press('Enter');
    expect(current.data.session?.index).toBe(1);
  });

  it.each(['Digit0', 'Numpad0'])(
    'submits unknown with %s only once and preserves timing',
    (code) => {
      wait(165);
      press('0', code);
      expect(current.data.session?.answers[0]).toMatchObject({
        choice: null,
        outcome: 'unknown',
        inputMethod: 'keyboard',
        responseMs: 165,
      });
      press('0', code);
      expect(current.data.stats.answered).toBe(1);
      expect(current.data.session?.phase).toBe('feedback');
      press('Enter');
      expect(current.data.session?.index).toBe(1);
    },
  );

  it('ignores zero during recall, pause and form input', () => {
    start({ presentation: 'recall' });
    press('0', 'Digit0');
    expect(current.data.stats.answered).toBe(0);
    act(() => current.dispatch({ type: 'REVEAL' }));
    press(' ', 'Space');
    press('0', 'Numpad0');
    expect(current.data.stats.answered).toBe(0);
    press(' ', 'Space');
    const input = document.createElement('input');
    container.append(input);
    press('0', 'Digit0', input);
    expect(current.data.stats.answered).toBe(0);
  });

  it('does not let a duplicate answer flush fast feedback and answer the next question', () => {
    start({ feedbackSpeed: 'auto' });
    wait(165);
    press('1');
    wait(101);
    press('2');
    expect(current.data.session?.index).toBe(0);
    expect(current.data.session?.answers).toHaveLength(1);
    wait(34);
    expect(current.data.session?.index).toBe(1);
    expect(current.data.session?.answers).toHaveLength(1);
  });

  it('freezes feedback while paused and resumes exactly its remaining interval', () => {
    press('1');
    wait(FEEDBACK_DELAYS.auto! / 2);
    press(' ', 'Space');
    const paused = current.data.session!;
    expect(paused.feedbackRemainingMs).toBe(FEEDBACK_DELAYS.auto! / 2);
    wait(5000);
    press('1');
    expect(current.data.session).toEqual(paused);
    press(' ', 'Space');
    wait(400);
    expect(current.data.session?.index).toBe(1);
    expect(current.data.stats.answered).toBe(1);
  });

  it('includes the visible fraction before backgrounding but never the hidden interval', () => {
    wait(75);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(current.data.session).toMatchObject({ paused: true, questionElapsedMs: 75 });
    wait(20000);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(current.data.session?.paused).toBe(true);
    press(' ', 'Space');
    wait(25);
    press('1');
    expect(current.data.session?.answers[0].responseMs).toBe(100);
  });

  it('saves the final fractional interval on pagehide and restores paused after time away', () => {
    wait(165);
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).session.questionElapsedMs).toBe(165);
    wait(10000);
    remount();
    expect(current.data.session).toMatchObject({ paused: true, questionElapsedMs: 165 });
    press(' ', 'Space');
    wait(35);
    press('1');
    expect(current.data.session?.answers[0].responseMs).toBe(200);
  });

  it('persists the same feedback and option ordering when unmounting without a prior pagehide', () => {
    press('1');
    wait(FEEDBACK_DELAYS.auto! / 2);
    const questions = current.data.session!.questions;
    remount();
    expect(current.storageWarning).toBeNull();
    expect(current.data.session).toMatchObject({
      paused: true,
      phase: 'feedback',
      feedbackRemainingMs: FEEDBACK_DELAYS.auto! / 2,
    });
    expect(current.data.session?.questions).toEqual(questions);
    expect(current.data.stats.answered).toBe(1);
  });

  it('pauses and flushes time when leaving the game, and ignores game shortcuts elsewhere', () => {
    wait(75);
    act(() => root.render(createElement(Harness, { enabled: false })));
    expect(current.data.session).toMatchObject({ paused: true, questionElapsedMs: 75 });
    wait(5000);
    press(' ', 'Space');
    press('1');
    expect(current.data.session?.paused).toBe(true);
    expect(current.data.stats.answered).toBe(0);
  });

  it('ignores repeated, modified and form input keys but supports numpad answers', () => {
    const input = document.createElement('input');
    container.append(input);
    press('1', 'Digit1', input);
    press('1', 'Digit1', document.body, { repeat: true });
    press('1', 'Digit1', document.body, { ctrlKey: true });
    press('1', 'Digit1', document.body, { isComposing: true });
    expect(current.data.stats.answered).toBe(0);
    press('2', 'Numpad2');
    expect(current.data.session?.answers[0].inputMethod).toBe('keyboard');
    expect(current.data.stats.answered).toBe(1);
  });

  it('allows Enter to advance feedback even when an answer button retains focus', () => {
    press('2');
    const button = document.createElement('button');
    container.append(button);
    button.focus();
    button.disabled = true;
    press('Enter', 'Enter', button);
    expect(current.data.session?.index).toBe(1);
  });

  it('saves completion immediately instead of waiting for the next scheduled snapshot', () => {
    act(() => current.clearRecords());
    start({ feedbackSpeed: 'auto' }, 1);
    press('1');
    wait(100);
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.session.status).toBe('completed');
    expect(saved.history).toHaveLength(1);
    expect(saved.stats.completed).toBe(1);
    remount();
    expect(current.storageWarning).toBeNull();
    expect(current.data.history).toHaveLength(1);
  });

  it('immediately saves study position and completed lesson markers', () => {
    const lesson = LESSONS[0];
    act(() =>
      current.dispatch({
        type: 'STUDY',
        study: { lessonId: lesson.id, cardIndex: 1, mixLearned: true },
        now: now(),
      }),
    );
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).study.cardIndex).toBe(1);
    act(() => current.dispatch({ type: 'LESSON_COMPLETE', lessonId: lesson.id, now: now() }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).learnedLessons).toContain(lesson.id);
  });

  it('automatically resets corrupt records and resumes persistent practice', () => {
    act(() => root.unmount());
    localStorage.setItem(STORAGE_KEY, '{"version":1}');
    localStorage.setItem('unrelated-data', 'keep');
    root = createRoot(container);
    act(() => root.render(createElement(Harness, { enabled: true })));
    expect(current.storageWarning).toBeNull();
    expect(current.data.stats.answered).toBe(0);
    expect(current.data.recoveryNotice?.kind).toBe('reset');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).schema).toBe('learning-v1');
    expect(localStorage.getItem('unrelated-data')).toBe('keep');
    act(() => current.dispatch({ type: 'ACK_RECOVERY' }));
    start();
    wait(1100);
    press('1');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).stats.answered).toBe(1);
    expect(current.storageWarning).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).schema).toBe('learning-v1');
  });

  it('keeps the last persisted record on quota failure and continues in memory', () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    press('2');
    expect(current.storageWarning).toBe('unavailable');
    expect(current.data.stats.answered).toBe(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(saved);
    press('Enter');
    press('1');
    expect(current.data.stats.answered).toBe(2);
    expect(writes).toHaveBeenCalledTimes(1);
  });
});
