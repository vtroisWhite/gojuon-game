import { useCallback, useEffect, useRef, useState } from 'react';
import { SNAPSHOT_INTERVAL_MS } from './config';
import { createInitialRecord, gameReducer } from './state';
import { loadRecord, saveRecord } from './storage';
import type { GameAction, Language, LearningRecord } from './types';

function initialData() {
  const language: Language = navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
  try {
    return loadRecord(window.localStorage, language);
  } catch {
    return { data: createInitialRecord(language), warning: 'unavailable' };
  }
}

export function useGame(enabled: boolean) {
  const [initial] = useState(initialData);
  const [data, setData] = useState(initial.data);
  const [storageWarning, setStorageWarning] = useState<string | null>(initial.warning);
  const dataRef = useRef(data);
  // Preserve unreadable records until the user explicitly clears them.
  const canPersist = useRef(initial.warning === null);
  const clock = useRef(performance.now());
  const lastSnapshot = useRef(performance.now());
  const activeContext = useRef(enabled);
  activeContext.current = enabled;

  const persist = useCallback((next: LearningRecord, timestamp: number) => {
    if (!canPersist.current) return;
    let warning: string | null;
    try {
      warning = saveRecord(window.localStorage, next);
    } catch {
      warning = 'unavailable';
    }
    if (warning) {
      canPersist.current = false;
      setStorageWarning(warning);
    } else lastSnapshot.current = timestamp;
  }, []);

  const dispatch = useCallback(
    (action: GameAction) => {
      const eventTime = performance.now();
      const original = dataRef.current;
      const originalSession = original.session;
      const originalQuestion = originalSession?.questions[originalSession.index];
      // Reject duplicate / wrong-phase input before a time flush can advance the queue.
      // Otherwise a second keypress during fast feedback could answer the next question.
      if (
        action.type === 'ANSWER' &&
        (!originalSession ||
          originalSession.status !== 'active' ||
          originalSession.paused ||
          originalSession.phase !== 'choice' ||
          !originalQuestion ||
          originalSession.answers.some((answer) => answer.questionId === originalQuestion.id) ||
          (action.choice !== null && !originalQuestion.options.includes(action.choice)))
      )
        return;
      if (
        action.type === 'REVEAL' &&
        (!originalSession ||
          originalSession.status !== 'active' ||
          originalSession.paused ||
          originalSession.phase !== 'recall')
      )
        return;
      if (
        action.type === 'ADVANCE' &&
        (!originalSession ||
          originalSession.status !== 'active' ||
          originalSession.paused ||
          originalSession.phase !== 'feedback')
      )
        return;
      let previous = original;
      const flushClock =
        action.type === 'ANSWER' ||
        action.type === 'REVEAL' ||
        action.type === 'PAUSE' ||
        action.type === 'ADVANCE' ||
        action.type === 'START' ||
        action.type === 'ABANDON' ||
        action.type === 'STUDY';
      if (
        flushClock &&
        originalSession?.status === 'active' &&
        !originalSession.paused &&
        !document.hidden
      ) {
        // Include the visible interval between the last 100 ms tick and the input event.
        previous = gameReducer(previous, {
          type: 'TICK',
          deltaMs: Math.max(0, eventTime - clock.current),
          now: new Date().toISOString(),
        });
        clock.current = eventTime;
      }
      const currentQuestion = previous.session?.questions[previous.session.index];
      const questionChanged =
        currentQuestion?.id !== originalQuestion?.id ||
        previous.session?.status !== originalSession?.status;
      const staleQuestionAction =
        questionChanged &&
        (action.type === 'ANSWER' || action.type === 'REVEAL' || action.type === 'ADVANCE');
      const next = staleQuestionAction ? previous : gameReducer(previous, action);
      if (
        action.type === 'START' ||
        action.type === 'PAUSE' ||
        action.type === 'ADVANCE' ||
        action.type === 'CLEAR'
      )
        clock.current = eventTime;
      if (next !== original) {
        dataRef.current = next;
        setData(next);
      }
      const transitioned =
        next.session?.index !== originalSession?.index ||
        next.session?.phase !== originalSession?.phase ||
        next.session?.status !== originalSession?.status ||
        next.session?.id !== originalSession?.id;
      if (
        action.type !== 'TICK' ||
        transitioned ||
        eventTime - lastSnapshot.current >= SNAPSHOT_INTERVAL_MS
      )
        persist(next, eventTime);
    },
    [persist],
  );

  const clearRecords = useCallback(() => {
    canPersist.current = true;
    setStorageWarning(null);
    dispatch({ type: 'CLEAR' });
  }, [dispatch]);

  useEffect(() => {
    if (!enabled) dispatch({ type: 'PAUSE', paused: true });
    clock.current = performance.now();
  }, [enabled, dispatch]);

  useEffect(() => {
    const tick = () => {
      const timestamp = performance.now();
      const elapsed = Math.max(0, timestamp - clock.current);
      clock.current = timestamp;
      if (
        activeContext.current &&
        !document.hidden &&
        dataRef.current.session?.status === 'active' &&
        !dataRef.current.session.paused
      ) {
        dispatch({ type: 'TICK', deltaMs: elapsed, now: new Date().toISOString() });
      }
    };
    const pauseForBackground = () => {
      if (document.hidden) {
        // visibilitychange reports hidden already: account for the last visible fraction explicitly.
        const timestamp = performance.now();
        if (activeContext.current)
          dispatch({
            type: 'TICK',
            deltaMs: Math.max(0, timestamp - clock.current),
            now: new Date().toISOString(),
          });
        clock.current = timestamp;
        dispatch({ type: 'PAUSE', paused: true });
      } else clock.current = performance.now();
    };
    const pageHide = () => {
      if (document.hidden) pauseForBackground();
      else dispatch({ type: 'PAUSE', paused: true });
    };
    const timer = window.setInterval(tick, 100);
    document.addEventListener('visibilitychange', pauseForBackground);
    window.addEventListener('pagehide', pageHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', pauseForBackground);
      window.removeEventListener('pagehide', pageHide);
      pageHide();
    };
  }, [dispatch]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        !activeContext.current ||
        document.hidden ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.isComposing
      )
        return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')
      )
        return;
      const session = dataRef.current.session;
      if (!session || session.status !== 'active') return;
      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        dispatch({ type: 'PAUSE', paused: !session.paused });
        return;
      }
      if (session.paused) return;
      if (/^[0123]$/.test(event.key) && session.phase === 'choice') {
        event.preventDefault();
        dispatch({
          type: 'ANSWER',
          choice: event.key === '0' ? null : session.questions[session.index].options[Number(event.key) - 1],
          inputMethod: 'keyboard',
          now: new Date().toISOString(),
        });
      } else if (event.key === 'Enter' && session.phase === 'feedback') {
        event.preventDefault();
        dispatch({ type: 'ADVANCE', now: new Date().toISOString() });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  return { data, dispatch, storageWarning, clearRecords };
}
