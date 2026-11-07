import { KANA, KANA_BY_ID } from './kana';
import type { Language, LessonDefinition } from './types';

export const LESSONS: LessonDefinition[] = [...new Set(KANA.map((entry) => entry.rowId))].map(
  (id) => {
    const entries = KANA.filter((entry) => entry.rowId === id);
    return { id, category: entries[0].category, kanaIds: entries.map((entry) => entry.id) };
  },
);
export const LESSON_BY_ID: Record<string, LessonDefinition> = Object.fromEntries(
  LESSONS.map((lesson) => [lesson.id, lesson]),
);

export function lessonLabel(lesson: LessonDefinition, language: Language): string {
  const entries = lesson.kanaIds.map((id) => KANA_BY_ID[id]);
  return entries
    .map((entry) => (language === 'zh-CN' ? entry.glyph : entry.glyph + ' ' + entry.romaji))
    .join(' · ');
}
