import { KANA, KANA_BY_ID, CATEGORIES } from '../kana';
import { accuracy, dictionaries, formatTime, modeLabel } from '../i18n';
import { getRecommendations } from '../statistics';
import { summarizeResponseTimes } from '../timing';
import { getReviewCount } from '../engine';
import { uiText } from '../uiText';
import { Stat, Timing } from './Shared';
import type { PageProps } from './Shared';

export function ResultPage({ data, start, home, onLearn }: PageProps & { onLearn: () => void }) {
  const t = dictionaries[data.language];
  const x = uiText[data.language];
  const s = data.session!;
  const primary = s.answers.filter(
    (a) => s.questions.find((q) => q.id === a.questionId)?.role === 'primary',
  );
  const corrected = s.answers.filter(
    (a) => a.correct && s.questions.find((q) => q.id === a.questionId)?.role === 'reinforcement',
  ).length;
  const wrong = s.questions.filter(
    (q) => q.role === 'primary' && primary.some((a) => a.questionId === q.id && !a.correct),
  );
  const correctTiming = summarizeResponseTimes(primary.filter((a) => a.correct));
  const recommendations = getRecommendations(data.kanaStats, new Date().toISOString());
  const remaining = KANA.filter(
    (e) => !Object.values(data.kanaStats).some((p) => p.kanaId === e.id && p.primaryAttempts > 0),
  ).length;
  const due = getReviewCount(
    { ...s.settings, categories: [...CATEGORIES], rows: [] },
    data.kanaStats,
  );
  return (
    <section className="result-layout">
      <div className="result-badge" aria-hidden="true">
        ✓
      </div>
      <span className="eyebrow">{t.finished}</span>
      <h1>{t.resultGreat}</h1>
      <p className="section-intro">{x.primaryNote}</p>
      <div className="result-panel">
        <div className="result-score">
          <strong>{accuracy(primary.filter((a) => a.correct).length, primary.length)}</strong>
          <span>{x.primaryAccuracy}</span>
        </div>
        <div className="result-stats">
          <Stat
            value={primary.filter((a) => a.correct).length + ' / ' + s.primaryCount}
            label={x.primary}
          />
          <Stat value={s.maxStreak} label={t.bestStreak} />
          <Stat value={corrected} label={x.corrected} />
          <Stat value={formatTime(s.elapsedMs, data.language)} label={t.duration} />
        </div>
        <div className="result-timing">
          <Timing
            value={summarizeResponseTimes(s.answers)}
            label={x.allAverage}
            language={data.language}
          />
          <Timing value={correctTiming} label={x.correctAverage} language={data.language} />
        </div>
      </div>
      {wrong.length > 0 && (
        <div className="result-mistakes">
          <h2>{x.recap}</h2>
          <div>
            {wrong.map((q) => (
              <div className="mistake-chip" key={q.id}>
                <span lang="ja">{KANA_BY_ID[q.kanaId].glyph}</span>
                <strong>{KANA_BY_ID[q.kanaId].romaji}</strong>
                <small>{modeLabel(q.direction, data.language)}</small>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="recommendation-panel">
        <h2>{x.recommended}</h2>
        {recommendations.length > 0 && (
          <div className="recommendation-kana">
            {recommendations.map((p) => (
              <button
                key={p.kanaId + p.direction}
                onClick={() =>
                  start(
                    { ...s.settings, categories: [...CATEGORIES], rows: [], count: 'all' },
                    'review',
                    [p.kanaId + ':' + p.direction],
                  )
                }
              >
                <span lang="ja">{KANA_BY_ID[p.kanaId].glyph}</span>
                <small>{modeLabel(p.direction, data.language)}</small>
              </button>
            ))}
          </div>
        )}
        <p>
          {remaining} {x.remaining} · {due} {x.pendingLabel}
        </p>
        <p>{x.reviewRule}</p>
      </div>
      <div className="result-actions">
        <button
          className="button primary"
          disabled={s.kind === 'review' && !getReviewCount(s.settings, data.kanaStats)}
          onClick={() => start(s.settings, s.kind)}
        >
          {x.practiceAgain}
        </button>
        {s.kind === 'review' && !getReviewCount(s.settings, data.kanaStats) && (
          <button className="button secondary" onClick={() => start(s.settings, 'free')}>
            {x.free}
          </button>
        )}
        {due > 0 && (
          <button
            className="button secondary"
            onClick={() =>
              start({ ...s.settings, categories: [...CATEGORIES], rows: [] }, 'review')
            }
          >
            {x.dueAction}
          </button>
        )}
        <button className="button secondary" onClick={onLearn}>
          {x.browseNext}
        </button>
        <button className="text-button" onClick={home}>
          {t.home} →
        </button>
      </div>
    </section>
  );
}
