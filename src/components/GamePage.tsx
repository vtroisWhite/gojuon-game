import { useRef } from 'react';
import { KANA_BY_ID } from '../kana';
import { getConfusionFeedback } from '../confusions';
import { accuracy, categoryLabel, dictionaries, modeLabel } from '../i18n';
import { kindLabel, uiText } from '../uiText';
import { summarizeResponseTimes } from '../timing';
import type { InputMethod } from '../types';
import { Stat, Timing } from './Shared';
import type { PageProps } from './Shared';

export function GamePage({ data, dispatch, home, onEnd }: PageProps & { onEnd: () => void }) {
  const t = dictionaries[data.language];
  const x = uiText[data.language];
  const session = data.session!;
  const question = session.questions[session.index];
  const entry = KANA_BY_ID[question.kanaId];
  const answer = session.answers.find((a) => a.questionId === question.id);
  const primary = session.answers.filter(
    (a) => session.questions.find((q) => q.id === a.questionId)?.role === 'primary',
  );
  const reinforcing = session.stage === 'reinforcement';
  const currentAnswers = reinforcing ? session.answers.length - primary.length : primary.length;
  const currentTotal = reinforcing
    ? session.questions.length - session.primaryCount
    : session.primaryCount;
  const mistake =
    answer?.outcome === 'incorrect'
      ? getConfusionFeedback(question, answer.choice!, data.language)
      : null;
  const method = useRef<InputMethod>('pointer');
  const submit = (choice: string | null, detail: number) =>
    dispatch({
      type: 'ANSWER',
      choice,
      inputMethod: detail === 0 ? 'keyboard' : method.current,
      now: new Date().toISOString(),
    });
  return (
    <section className="game-layout" aria-label={t.practice}>
      <div className="game-toolbar">
        <button className="text-button" onClick={home}>
          ← {t.back}
        </button>
        <span className="game-mode-label">
          {kindLabel(session.kind, data.language)} ·{' '}
          {modeLabel(session.settings.mode, data.language)}
        </span>
        <button
          className="pause-button"
          onClick={() => dispatch({ type: 'PAUSE', paused: !session.paused })}
        >
          {session.paused ? t.continue : t.pause} <kbd>Space</kbd>
        </button>
      </div>
      <div className="game-hud">
        <Stat
          value={accuracy(primary.filter((a) => a.correct).length, primary.length)}
          label={x.primaryAccuracy}
        />
        <Stat value={session.streak} label={t.streak} />
        <Stat value={session.maxStreak} label={t.bestStreak} />
        <Stat
          value={currentAnswers + ' / ' + currentTotal}
          label={reinforcing ? x.reinforcement : x.primary}
        />
        <Stat
          className="response-stat"
          value={
            summarizeResponseTimes(session.answers).timedAnswers
              ? Math.round(
                  summarizeResponseTimes(session.answers).totalResponseMs / session.answers.length,
                ) + ' ms'
              : '—'
          }
          label={t.averageResponse}
        />
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={reinforcing ? x.reinforcement : x.primary}
        aria-valuemin={0}
        aria-valuemax={currentTotal}
        aria-valuenow={currentAnswers}
      >
        <div style={{ width: (currentTotal ? (100 * currentAnswers) / currentTotal : 0) + '%' }} />
      </div>
      <p className="score-explanation">{x.primaryNote}</p>
      <div className={'game-stage ' + (session.paused ? 'is-paused' : '')}>
        <div className="question-content" inert={session.paused || undefined}>
          <div className="question-card">
            <div className="question-meta">
              <span>{categoryLabel(entry.category, data.language)}</span>
              <span>
                {reinforcing ? x.reinforcement : x.primary} {currentAnswers + (answer ? 0 : 1)} /{' '}
                {currentTotal}
              </span>
            </div>
            <p className="question-instruction">
              {question.direction === 'kana-romaji'
                ? t.readKana
                : entry.script === 'hiragana'
                  ? t.findHiragana
                  : t.findKatakana}
            </p>
            <div
              className={'question-glyph ' + (question.direction === 'romaji-kana' ? 'romaji' : '')}
              lang={question.direction === 'kana-romaji' ? 'ja' : 'en'}
            >
              {question.direction === 'kana-romaji' ? entry.glyph : entry.romaji}
            </div>
            <div className="question-rule" />
          </div>
          {session.phase === 'recall' ? (
            <div className="recall-panel">
              <p>{x.recallHint}</p>
              <button className="button primary" onClick={() => dispatch({ type: 'REVEAL' })}>
                {x.reveal}
              </button>
            </div>
          ) : (
            <>
              <p className="choice-hint">
                {t.choiceHint} <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>
              </p>
              <div className="answer-options">
                {question.options.map((option, index) => (
                  <button
                    key={question.id + ':' + option}
                    className={
                      'answer-option ' +
                      (answer && option === question.correctAnswer
                        ? 'correct'
                        : answer && option === answer.choice
                          ? 'incorrect'
                          : '')
                    }
                    disabled={Boolean(answer) || session.paused}
                    onPointerDown={(e) => {
                      method.current = e.pointerType === 'touch' ? 'touch' : 'pointer';
                    }}
                    onClick={(e) => submit(option, e.detail)}
                  >
                    <span className="option-number">{index + 1}</span>
                    <span
                      className={question.direction === 'romaji-kana' ? 'kana-answer' : ''}
                      lang={question.direction === 'romaji-kana' ? 'ja' : 'en'}
                    >
                      {option}
                    </span>
                    <span className="answer-indicator">
                      {answer && option === question.correctAnswer
                        ? '✓'
                        : answer && option === answer.choice
                          ? '×'
                          : ''}
                    </span>
                  </button>
                ))}
              </div>
              {!answer && (
                <button
                  className="unknown-button"
                  aria-keyshortcuts="0"
                  onPointerDown={(e) => {
                    method.current = e.pointerType === 'touch' ? 'touch' : 'pointer';
                  }}
                  onClick={(e) => submit(null, e.detail)}
                >
                  {x.unknown} <kbd>0</kbd>
                </button>
              )}
            </>
          )}
          <div
            className={'feedback ' + (answer ? (answer.correct ? 'success' : 'mistake') : '')}
            aria-live="polite"
            aria-atomic="true"
          >
            {answer && (
              <>
                <div className="feedback-copy">
                  <div>
                    <strong>
                      {answer.correct
                        ? t.correct
                        : answer.outcome === 'unknown'
                          ? x.unknownAnswer
                          : t.incorrect}
                    </strong>
                    <p>
                      {answer.correct ? (
                        session.feedbackDelayMs === null ? (
                          x.nextHint
                        ) : (
                          t.correctHint
                        )
                      ) : (
                        <>
                          {answer.choice !== null && (
                            <>
                              {t.yourAnswer}: {answer.choice} ·{' '}
                            </>
                          )}
                          {t.correctAnswer}: <b>{question.correctAnswer}</b>
                        </>
                      )}
                    </p>
                    {entry.romaji === 'wo' && <p className="wo-note">{t.woNote}</p>}
                    {mistake && (
                      <div className="contrast-feedback">
                        <span lang="ja">{mistake.target.glyph}</span>
                        <b>{mistake.target.romaji}</b>
                        {mistake.mistaken && (
                          <>
                            <span lang="ja">{mistake.mistaken.glyph}</span>
                            <b>{mistake.mistaken.romaji}</b>
                          </>
                        )}
                        <p>{mistake.hint}</p>
                      </div>
                    )}
                  </div>
                </div>
                {(!answer.correct || session.feedbackDelayMs === null) && (
                  <button
                    className="button primary next-button"
                    onClick={() => dispatch({ type: 'ADVANCE', now: new Date().toISOString() })}
                  >
                    {t.next} → <small>{t.nextKey}</small>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        {session.paused && (
          <div className="pause-overlay" role="region" aria-label={t.paused}>
            <h2>{t.paused}</h2>
            <p>{t.pausedHint}</p>
            <button
              className="button primary"
              onClick={() => dispatch({ type: 'PAUSE', paused: false })}
            >
              {t.continue}
            </button>
            <small>{t.pausedKeys}</small>
          </div>
        )}
      </div>
      <div className="game-footer">
        <span>
          {t.answerKey} · {t.pauseKey}
        </span>
        <button className="text-button muted" onClick={onEnd}>
          {t.end}
        </button>
      </div>
      <div className="game-time-note">
        <Timing
          value={summarizeResponseTimes(session.answers)}
          label={x.allAverage}
          language={data.language}
        />
        <p>{x.timingHint}</p>
      </div>
    </section>
  );
}
