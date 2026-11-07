import { describe, expect, it } from 'vitest';
import { createSession } from './engine';
import { DEFAULT_SETTINGS } from './kana';
import { LESSONS } from './lessons';
import { createInitialRecord, gameReducer } from './state';
import { loadRecord, saveRecord } from './storage';
import type { FeedbackSpeed, GameAction, PracticeKind, Presentation } from './types';

const now = '2026-11-07T04:00:00.000Z';
describe('session persistence contract', () => {
  it.each(['learn', 'free', 'review', 'contrast'] as PracticeKind[])(
    'persists every %s transition and frozen correction queue',
    (kind) => {
      for (const presentation of ['direct', 'recall'] as Presentation[]) {
        for (const feedbackSpeed of ['manual', 'auto'] as FeedbackSpeed[]) {
          let r = createInitialRecord();
          const check = () => {
            let saved = '';
            expect(
              saveRecord(
                {
                  setItem: (_key, value) => {
                    saved = value;
                  },
                },
                r,
              ),
            ).toBeNull();
            const loaded = loadRecord({ getItem: () => saved }, 'en');
            expect(loaded.warning).toBeNull();
            expect(loaded.data).toEqual({
              ...r,
              session: r.session
                ? { ...r.session, paused: r.session.status === 'active' || r.session.paused }
                : null,
            });
          };
          const apply = (action: GameAction) => {
            r = gameReducer(r, action);
            check();
          };
          check();
          const session = createSession(
            { ...DEFAULT_SETTINGS, presentation, feedbackSpeed },
            {},
            'free',
            () => 0.42,
            now,
          );
          session.kind = kind;
          session.questions = session.questions.slice(0, 5);
          session.primaryCount = 5;
          apply({ type: 'START', session, now });
          let guard = 0;
          while (r.session?.status === 'active' && guard++ < 60) {
            if (r.session.phase === 'recall') apply({ type: 'REVEAL' });
            else if (r.session.phase === 'choice') {
              apply({ type: 'TICK', deltaMs: 165.5, now });
              const q = r.session.questions[r.session.index];
              apply({
                type: 'ANSWER',
                choice: r.session.index < 2 ? null : q.correctAnswer,
                inputMethod: 'touch',
                now,
              });
            } else if (r.session.feedbackRemainingMs)
              apply({ type: 'TICK', deltaMs: r.session.feedbackRemainingMs, now });
            else apply({ type: 'ADVANCE', now });
          }
          expect(guard).toBeLessThan(60);
          expect(r.history).toHaveLength(1);
        }
      }
    },
  );

  it('persists viewed lessons, partial completion, abandonment and clear', () => {
    let r = createInitialRecord();
    const lesson = LESSONS[0];
    const actions: GameAction[] = [
      { type: 'STUDY', study: { lessonId: lesson.id, cardIndex: 0, mixLearned: true }, now },
      { type: 'LESSON_COMPLETE', lessonId: lesson.id, now },
      { type: 'LANGUAGE', language: 'en' },
      { type: 'CLEAR' },
    ];
    for (const action of actions) {
      r = gameReducer(r, action);
      const loaded = loadRecord({ getItem: () => JSON.stringify(r) }, 'zh-CN');
      expect(loaded.warning).toBeNull();
      expect(loaded.data).toEqual(r);
    }
  });
});
