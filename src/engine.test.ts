import { describe, expect, it } from 'vitest';
import { createSession, getPool, getReviewCount, makeQuestion } from './engine';
import { CATEGORIES, DEFAULT_SETTINGS, KANA, KANA_BY_ID } from './kana';
import { LESSONS } from './lessons';
import { createPerformance } from './statistics';
import type { Direction, KanaPerformance, PracticeSettings, Question } from './types';

const NOW = '2026-11-07T04:00:00.000Z';
function seededRandom(seed = 17) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
function settings(overrides: Partial<PracticeSettings> = {}): PracticeSettings {
  return { ...DEFAULT_SETTINGS, categories: [...CATEGORIES], rows: [], ...overrides };
}
function missed(kanaId: string, direction: Direction = 'kana-romaji'): KanaPerformance {
  return {
    ...createPerformance(kanaId, direction, NOW),
    attempts: 1,
    primaryAttempts: 1,
    errors: 1,
    review: {
      stage: 0,
      dueAt: NOW,
      needsCorrection: true,
      lastPromotedDay: null,
      lastExposedDay: null,
      successfulDays: 0,
    },
  };
}
function assertUnambiguous(question: Question) {
  const target = KANA_BY_ID[question.kanaId];
  expect(question.options).toHaveLength(3);
  expect(new Set(question.options).size).toBe(3);
  expect(question.options.filter((option) => option === question.correctAnswer)).toHaveLength(1);
  for (const option of question.options) {
    const matches = KANA.filter((entry) =>
      question.direction === 'kana-romaji'
        ? entry.romaji === option
        : entry.glyph === option && entry.script === target.script,
    );
    expect(matches.length).toBeGreaterThan(0);
    if (option !== question.correctAnswer)
      expect(matches.every((entry) => entry.pronunciation !== target.pronunciation)).toBe(true);
  }
}
describe('题库与学习单元', () => {
  it('保留208个唯一条目与六类数量', () => {
    expect(KANA).toHaveLength(208);
    expect(new Set(KANA.map((entry) => entry.glyph)).size).toBe(208);
    for (const script of ['hiragana', 'katakana']) {
      for (const [group, count] of [
        ['seion', 46],
        ['dakuten', 25],
        ['yoon', 33],
      ]) {
        expect(
          KANA.filter((entry) => entry.script === script && entry.group === group),
        ).toHaveLength(count as number);
      }
    }
  });
  it('每个假名恰好属于一个单元，每单元至少三个不同读音', () => {
    expect(LESSONS).toHaveLength(52);
    expect(LESSONS.flatMap((lesson) => lesson.kanaIds).sort()).toEqual(
      KANA.map((entry) => entry.id).sort(),
    );
    for (const lesson of LESSONS) {
      expect(
        new Set(lesson.kanaIds.map((id) => KANA_BY_ID[id].pronunciation)).size,
      ).toBeGreaterThanOrEqual(3);
      const config = settings({ categories: [lesson.category], rows: [lesson.id], count: 'all' });
      expect(getPool(config).map((entry) => entry.id)).toEqual(lesson.kanaIds);
      for (const question of createSession(config, {}, 'learn', seededRandom(), NOW).questions)
        assertUnambiguous(question);
    }
  });
});
describe('出题与三选一', () => {
  it('默认20题不重复，混合近似均分，随机源可复现', () => {
    const config = settings({ mode: 'mixed', count: 'all', categories: ['hiragana-yoon'] });
    const session = createSession(config, {}, 'free', seededRandom(), NOW);
    expect(session).toEqual(createSession(config, {}, 'free', seededRandom(), NOW));
    expect(session.questions).toHaveLength(33);
    expect(new Set(session.questions.map((question) => question.kanaId)).size).toBe(33);
    const forwards = session.questions.filter(
      (question) => question.direction === 'kana-romaji',
    ).length;
    expect(Math.abs(forwards - (33 - forwards))).toBe(1);
    expect(session.primaryCount).toBe(33);
    expect(createSession(DEFAULT_SETTINGS, {}, 'free', seededRandom(), NOW).questions).toHaveLength(
      20,
    );
  });
  it('全部63种类别组合、两个方向选项均唯一且无同音多解', () => {
    for (let mask = 1; mask < 64; mask++) {
      const categories = CATEGORIES.filter((_, index) => mask & (1 << index));
      for (const mode of ['kana-romaji', 'romaji-kana'] as const) {
        const session = createSession(
          settings({ categories, mode, count: 'all' }),
          {},
          'free',
          seededRandom(mask),
          NOW,
        );
        session.questions.forEach(assertUnambiguous);
      }
    }
  });
  it('按范围截断题量，空范围拒绝启动', () => {
    expect(
      createSession(settings({ categories: ['katakana-dakuten'], count: 40 }), {}, 'free')
        .questions,
    ).toHaveLength(25);
    expect(() => createSession(settings({ categories: [] }), {}, 'free')).toThrow();
  });
  it('个人混淆优先，普通模式最多一个针对性干扰，专项可以两个', () => {
    const entry = KANA_BY_ID['katakana-シ'];
    const perf = { ...missed(entry.id), confusions: { tsu: 5, so: 3 } };
    const stats = { [entry.id + ':kana-romaji']: perf };
    const seed = { entry, direction: 'kana-romaji' as const };
    const pool = KANA.filter((item) => item.category === entry.category);
    const normal = makeQuestion(seed, pool, 'normal', seededRandom(), stats, 'free');
    expect(normal.options).toContain('tsu');
    expect(normal.options).not.toContain('so');
    const contrast = makeQuestion(seed, pool, 'contrast', seededRandom(), stats, 'contrast');
    expect(contrast.options).toEqual(expect.arrayContaining(['shi', 'tsu', 'so']));
  });
  it('双字辨析仍有三项，目标不会因借用干扰项而扩大', () => {
    const targets = ['katakana-シ', 'katakana-ツ'];
    const session = createSession(
      settings({ categories: ['katakana-seion'], mode: 'romaji-kana' }),
      {},
      'contrast',
      seededRandom(),
      NOW,
      targets,
    );
    expect(session.questions.map((question) => question.kanaId).sort()).toEqual(targets.sort());
    session.questions.forEach(assertUnambiguous);
  });
});
describe('按方向复习和反馈快照', () => {
  it('优先待纠正，保留出错方向，排除未到期和仅浏览条目', () => {
    const stats = {
      a: missed('hiragana-あ'),
      b: missed('hiragana-あ', 'romaji-kana'),
      future: {
        ...missed('hiragana-い'),
        review: {
          ...missed('hiragana-い').review,
          needsCorrection: false,
          dueAt: '2027-01-01T00:00:00Z',
        },
      },
      viewed: createPerformance('hiragana-う', 'kana-romaji', NOW),
    };
    expect(getReviewCount(DEFAULT_SETTINGS, stats, NOW)).toBe(2);
    const session = createSession(DEFAULT_SETTINGS, stats, 'review', seededRandom(), NOW);
    expect(session.questions.map((question) => question.direction).sort()).toEqual([
      'kana-romaji',
      'romaji-kana',
    ]);
    session.questions.forEach(assertUnambiguous);
  });
  it('一题复习从类别完整池补足选项，零题拒绝启动', () => {
    const stats = { only: missed('hiragana-を') };
    const session = createSession(DEFAULT_SETTINGS, stats, 'review', seededRandom(), NOW);
    expect(session.questions).toHaveLength(1);
    assertUnambiguous(session.questions[0]);
    expect(() => createSession(DEFAULT_SETTINGS, {}, 'review', seededRandom(), NOW)).toThrow();
  });
  it('建局保存实际反馈策略和回想阶段，后续偏好修改不改变本局', () => {
    const config = settings({ feedbackSpeed: 'auto', presentation: 'recall' });
    const session = createSession(config, {}, 'free', seededRandom(), NOW);
    config.feedbackSpeed = 'manual';
    config.rows.push('other');
    expect(session.feedbackDelayMs).toBe(100);
    expect(session.phase).toBe('recall');
    expect(session.settings.feedbackSpeed).toBe('auto');
    expect(session.settings.rows).toEqual([]);
    expect(createSession(settings({ feedbackSpeed: 'manual' }), {}).feedbackDelayMs).toBeNull();
  });
});
