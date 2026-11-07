// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createSession } from './engine';
import { DEFAULT_SETTINGS } from './kana';
import { createInitialRecord, gameReducer } from './state';
import { STORAGE_KEY } from './storage';
import type { Language, LearningRecord, PracticeSettings } from './types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
const now = '2026-11-07T12:00:00.000Z';
function button(label: string) {
  const result = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => b.textContent?.trim() === label,
  );
  if (!result) throw new Error('Missing button: ' + label);
  return result;
}
function click(element: HTMLElement) {
  act(() => element.click());
}
function mount(record = createInitialRecord()) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  act(() => root.render(createElement(App)));
}
function sessionRecord(
  patch: Partial<PracticeSettings> = {},
  language: Language = 'zh-CN',
  target = 'hiragana-あ',
) {
  const record = createInitialRecord(language);
  const settings = { ...DEFAULT_SETTINGS, feedbackSpeed: 'manual' as const, ...patch };
  const session = createSession(settings, {}, 'free', () => 0.5, now, [target]);
  return gameReducer(record, { type: 'START', session, now });
}
function resume() {
  click(container.querySelector<HTMLButtonElement>('.resume-card button')!);
}
function saved(): LearningRecord {
  return JSON.parse(localStorage.getItem(STORAGE_KEY)!);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  localStorage.clear();
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('learning interface', () => {
  it('opens a row, resumes its card and starts unscored learning practice', () => {
    mount();
    click(container.querySelector<HTMLButtonElement>('.lesson-button')!);
    expect(container.querySelector('.study-glyph')?.textContent).toBe('あ');
    click(button('下一张 →'));
    expect(container.querySelector('.study-glyph')?.textContent).toBe('い');
    click(container.querySelector<HTMLButtonElement>('.brand')!);
    const studyResume = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.resume-card button'),
    ).at(-1)!;
    click(studyResume);
    expect(container.querySelector('.study-glyph')?.textContent).toBe('い');
    expect(saved().stats.answered).toBe(0);
    for (let i = 0; i < 3; i++) click(button('下一张 →'));
    click(button('开始本行练习 →'));
    expect(container.querySelector('.game-layout')).not.toBeNull();
    expect(saved().session?.kind).toBe('learn');
    expect(saved().session?.primaryCount).toBe(5);
    expect(saved().learnedLessons).toHaveLength(1);
    expect(saved().stats.answered).toBe(0);
  });
  it('does not accept hidden choices and completes manual feedback', () => {
    mount(sessionRecord({ presentation: 'recall' }));
    resume();
    expect(container.querySelectorAll('.answer-option')).toHaveLength(0);
    act(() =>
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: '1', code: 'Digit1', bubbles: true }),
      ),
    );
    expect(saved().stats.answered).toBe(0);
    click(button('显示选项'));
    expect(container.querySelectorAll('.answer-option')).toHaveLength(3);
    click(
      Array.from(container.querySelectorAll<HTMLButtonElement>('.answer-option')).find(
        (b) => b.querySelector('span:nth-child(2)')?.textContent === 'a',
      )!,
    );
    expect(saved().session?.phase).toBe('feedback');
    act(() => vi.advanceTimersByTime(2000));
    expect(container.querySelector('.game-layout')).not.toBeNull();
    click(container.querySelector<HTMLButtonElement>('.next-button')!);
    expect(container.querySelector('.result-layout')).not.toBeNull();
    expect(container.querySelector('.result-score')?.textContent).toContain('100%');
  });
  it('records unknown without a confusion pair and shows coverage and samples', () => {
    mount(sessionRecord());
    resume();
    act(() => vi.advanceTimersByTime(1234));
    click(container.querySelector<HTMLButtonElement>('.unknown-button')!);
    const performance = saved().kanaStats['hiragana-あ:kana-romaji'];
    expect(performance.unknown).toBe(1);
    expect(performance.confusions).toEqual({});
    expect(container.querySelector('.feedback')?.textContent).toContain('这次还不熟悉');
    click(container.querySelector<HTMLButtonElement>('.next-button')!);
    expect(container.querySelector('.result-score')?.textContent).toContain('0%');
    click(container.querySelectorAll<HTMLButtonElement>('nav button')[1]);
    expect(container.querySelectorAll('.chart-cell')).toHaveLength(208);
    expect(container.querySelectorAll('.chart-cell.insufficient')).toHaveLength(1);
    expect(container.querySelector('.performance-card')?.textContent).toContain('1 次计时');
    expect(container.querySelectorAll('.chart-row')[7].children).toHaveLength(3);
  });
  it('only shows the wo pronunciation note after submission', () => {
    mount(sessionRecord({}, 'zh-CN', 'hiragana-を'));
    resume();
    expect(container.querySelector('.wo-note')).toBeNull();
    click(
      Array.from(container.querySelectorAll<HTMLButtonElement>('.answer-option')).find(
        (b) => b.querySelector('span:nth-child(2)')?.textContent === 'wo',
      )!,
    );
    expect(container.querySelector('.wo-note')?.textContent).toBe('wo 通常读作 o。');
  });
  it('renders English learning controls and the full chart', () => {
    mount(createInitialRecord('en'));
    expect(container.textContent).toContain('Learn by row');
    expect(container.textContent).toContain('Think before revealing choices');
    click(container.querySelectorAll<HTMLButtonElement>('nav button')[1]);
    expect(container.textContent).toContain('Kana practice performance');
    expect(container.querySelectorAll('.chart-cell.unpracticed')).toHaveLength(208);
    expect(container.textContent).not.toContain('undefined');
  });
  it('disables contrast when selected categories have no confusable targets', () => {
    const record = createInitialRecord();
    record.settings = { ...DEFAULT_SETTINGS, categories: ['hiragana-yoon'] };
    mount(record);
    click(button('易混辨析专门辨认容易混淆的字形。'));
    expect(container.querySelector<HTMLButtonElement>('.start-button')?.disabled).toBe(true);
  });
  it('starts a personal confusion pair in its original direction', () => {
    let record = sessionRecord({ categories: ['katakana-seion'] }, 'zh-CN', 'katakana-シ');
    record = gameReducer(record, { type: 'ANSWER', choice: 'tsu', inputMethod: 'keyboard', now });
    record = gameReducer(record, { type: 'ADVANCE', now });
    record.settings = { ...record.settings, mode: 'romaji-kana' };
    mount(record);
    click(container.querySelectorAll<HTMLButtonElement>('nav button')[1]);
    click(container.querySelector<HTMLButtonElement>('.confusion-list button')!);
    expect(saved().session?.kind).toBe('contrast');
    expect(saved().session?.settings.mode).toBe('kana-romaji');
    expect(saved().session?.questions.every((q) => q.direction === 'kana-romaji')).toBe(true);
  });
  it('clears records only after confirming the dialog', () => {
    let record = sessionRecord();
    record = gameReducer(record, { type: 'ANSWER', choice: null, inputMethod: 'keyboard', now });
    record = gameReducer(record, { type: 'ADVANCE', now });
    mount(record);
    click(container.querySelectorAll<HTMLButtonElement>('nav button')[1]);
    click(button('清空学习记录'));
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(saved().stats.answered).toBe(1);
    click(button('确认清空'));
    expect(saved().stats.answered).toBe(0);
    expect(container.querySelectorAll('.chart-cell.unpracticed')).toHaveLength(208);
  });
});
