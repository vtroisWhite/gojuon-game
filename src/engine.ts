import { FEEDBACK_DELAYS } from './config';
import { relatedGlyphs } from './confusions';
import { KANA, KANA_BY_ID } from './kana';
import { isDue } from './review';
import type {
  Direction,
  KanaEntry,
  KanaPerformance,
  PracticeKind,
  PracticeSettings,
  Question,
  QuestionRole,
  SessionSnapshot,
} from './types';

export interface QuestionSeed {
  entry: KanaEntry;
  direction: Direction;
}

export function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}
export function getPool(settings: PracticeSettings): KanaEntry[] {
  const selected = new Set(settings.categories);
  return KANA.filter(
    (entry) =>
      selected.has(entry.category) &&
      (!settings.rows.length || settings.rows.includes(entry.rowId)),
  );
}
function getReviewSeeds(
  settings: PracticeSettings,
  kanaStats: Record<string, KanaPerformance>,
  now: string,
): QuestionSeed[] {
  const allowed = new Set(getPool(settings).map((entry) => entry.id));
  const unique = new Map<string, KanaPerformance>();
  for (const performance of Object.values(kanaStats)) {
    if (
      !performance.primaryAttempts ||
      !KANA_BY_ID[performance.kanaId] ||
      !allowed.has(performance.kanaId) ||
      !isDue(performance.review, now)
    )
      continue;
    if (performance.direction !== 'kana-romaji' && performance.direction !== 'romaji-kana')
      continue;
    unique.set(performance.kanaId + ':' + performance.direction, performance);
  }
  // Review retains the original question direction.
  return [...unique.values()]
    .sort(
      (a, b) =>
        Number(b.review.needsCorrection) - Number(a.review.needsCorrection) ||
        Date.parse(a.review.dueAt) - Date.parse(b.review.dueAt) ||
        (b.errors + b.unknown) / Math.max(1, b.attempts) -
          (a.errors + a.unknown) / Math.max(1, a.attempts),
    )
    .map((performance) => ({
      entry: KANA_BY_ID[performance.kanaId],
      direction: performance.direction,
    }));
}
export function getReviewCount(
  settings: PracticeSettings,
  kanaStats: Record<string, KanaPerformance>,
  now = new Date().toISOString(),
): number {
  return getReviewSeeds(settings, kanaStats, now).length;
}
export function makeQuestion(
  seed: QuestionSeed,
  pool: KanaEntry[],
  id: string,
  random: () => number = Math.random,
  kanaStats: Record<string, KanaPerformance> = {},
  kind: PracticeKind = 'free',
  role: QuestionRole = 'primary',
  sourceQuestionId?: string,
): Question {
  const { entry, direction } = seed;
  const forward = direction === 'kana-romaji';
  const value = (candidate: KanaEntry) => (forward ? candidate.romaji : candidate.glyph);
  const valid = (candidate: KanaEntry) =>
    candidate.pronunciation !== entry.pronunciation &&
    (forward || candidate.script === entry.script);
  let candidates = pool.filter(valid);
  // Small target ranges may borrow distractors from their full category.
  if (new Set(candidates.map(value)).size < 2) {
    candidates = [
      ...candidates,
      ...KANA.filter((candidate) => candidate.category === entry.category && valid(candidate)),
    ];
  }
  const alternatives = [...new Set(candidates.map(value))];
  if (alternatives.length < 2) throw new Error('Not enough distinct answers.');
  const personal = kanaStats[entry.id + ':' + direction]?.confusions ?? {};
  const related = new Set(
    relatedGlyphs(entry).flatMap((glyph) =>
      KANA.filter((candidate) => candidate.glyph === glyph).map(value),
    ),
  );
  const ranked = shuffled(alternatives, random)
    .filter((option) => (personal[option] ?? 0) > 0 || related.has(option))
    .sort((a, b) => (personal[b] ?? 0) - (personal[a] ?? 0));
  const targeted = ranked.slice(0, kind === 'contrast' ? 2 : 1);
  const ordinary = shuffled(
    alternatives.filter((option) => !ranked.includes(option)),
    random,
  );
  const fallback = shuffled(
    alternatives.filter((option) => !targeted.includes(option) && !ordinary.includes(option)),
    random,
  );
  const distractors = [...targeted, ...ordinary, ...fallback].slice(0, 2);
  return {
    id,
    kanaId: entry.id,
    direction,
    role,
    ...(sourceQuestionId ? { sourceQuestionId } : {}),
    options: shuffled([value(entry), ...distractors], random),
    correctAnswer: value(entry),
  };
}
export function createSession(
  settings: PracticeSettings,
  kanaStats: Record<string, KanaPerformance>,
  kind: PracticeKind = 'free',
  random: () => number = Math.random,
  now: string = new Date().toISOString(),
  targetIds?: string[],
): SessionSnapshot {
  const pool = getPool(settings);
  const targeted = (entry: KanaEntry, direction?: Direction) =>
    !targetIds ||
    targetIds.includes(entry.id) ||
    (direction !== undefined
      ? targetIds.includes(entry.id + ':' + direction)
      : targetIds.some((id) => id.startsWith(entry.id + ':')));
  let seeds: QuestionSeed[];
  if (kind === 'review') {
    seeds = getReviewSeeds(settings, kanaStats, now).filter((seed) =>
      targeted(seed.entry, seed.direction),
    );
    if (settings.count !== 'all') seeds = seeds.slice(0, settings.count);
  } else {
    let entries = pool.filter((entry) => targeted(entry));
    if (kind === 'contrast' && !targetIds) {
      entries = entries.filter(
        (entry) =>
          relatedGlyphs(entry).length ||
          Object.values(kanaStats).some(
            (performance) =>
              performance.kanaId === entry.id && Object.keys(performance.confusions).length,
          ),
      );
    }
    entries = shuffled(entries, random).slice(
      0,
      settings.count === 'all' ? entries.length : settings.count,
    );
    const forwardCount =
      Math.floor(entries.length / 2) + (entries.length % 2 === 1 && random() < 0.5 ? 1 : 0);
    const directions: Direction[] =
      settings.mode === 'mixed'
        ? shuffled(
            entries.map((_, index) => (index < forwardCount ? 'kana-romaji' : 'romaji-kana')),
            random,
          )
        : entries.map(() => settings.mode as Direction);
    seeds = entries.flatMap((entry, index) => {
      const explicit =
        kind === 'contrast'
          ? (['kana-romaji', 'romaji-kana'] as const).filter((direction) =>
              targetIds?.includes(entry.id + ':' + direction),
            )
          : [];
      return explicit.length
        ? explicit.map((direction) => ({ entry, direction }))
        : [{ entry, direction: directions[index] }];
    });
    if (settings.count !== 'all') seeds = seeds.slice(0, settings.count);
  }
  if (!seeds.length) throw new Error('No questions in the selected range.');
  const id =
    'session-' +
    now +
    '-' +
    Math.floor(random() * 0x100000000).toString(36) +
    '-' +
    Math.floor(random() * 0x100000000).toString(36);
  const distractorPool =
    kind === 'learn' ? pool : KANA.filter((entry) => settings.categories.includes(entry.category));
  const questions = seeds.map((seed, index) =>
    makeQuestion(seed, distractorPool, id + ':' + index, random, kanaStats, kind),
  );
  return {
    id,
    kind,
    settings: { ...settings, categories: [...settings.categories], rows: [...settings.rows] },
    questions,
    primaryCount: questions.length,
    index: 0,
    answers: [],
    phase: settings.presentation === 'recall' ? 'recall' : 'choice',
    stage: 'primary',
    feedbackDelayMs: FEEDBACK_DELAYS[settings.feedbackSpeed],
    feedbackRemainingMs: 0,
    paused: false,
    status: 'active',
    streak: 0,
    maxStreak: 0,
    elapsedMs: 0,
    questionElapsedMs: 0,
    startedAt: now,
  };
}
