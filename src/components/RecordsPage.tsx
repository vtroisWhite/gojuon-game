import { useState } from 'react';
import { CATEGORIES, KANA, KANA_BY_ID } from '../kana';
import { accuracy, categoryLabel, dictionaries, formatTime, modeLabel } from '../i18n';
import { coverage, getFamiliarity, getTrend } from '../statistics';
import { isDue } from '../review';
import { RECENT_DISPLAY } from '../config';
import { uiText, kindLabel } from '../uiText';
import type { Category, Direction, KanaPerformance } from '../types';
import { Stat, Timing } from './Shared';
import type { PageProps } from './Shared';

export function RecordsPage({ data, start, onClear }: PageProps & { onClear: () => void }) {
  const t = dictionaries[data.language];
  const x = uiText[data.language];
  const now = new Date().toISOString();
  const [direction, setDirection] = useState<Direction>('kana-romaji');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [filter, setFilter] = useState<'all' | 'due'>('all');
  const [sort, setSort] = useState('recent');
  const [shown, setShown] = useState(24);
  const entries = KANA.filter((e) => category === 'all' || e.category === category);
  const performances = Object.values(data.kanaStats).filter(
    (p) =>
      p.primaryAttempts > 0 &&
      p.direction === direction &&
      (category === 'all' || KANA_BY_ID[p.kanaId].category === category) &&
      (filter === 'all' || isDue(p.review, now)),
  );
  const average = (p: KanaPerformance) =>
    p.correctTiming.timedAnswers
      ? p.correctTiming.totalResponseMs / p.correctTiming.timedAnswers
      : -1;
  performances.sort((a, b) =>
    sort === 'errors'
      ? (b.primaryAttempts - b.primaryCorrect) / b.primaryAttempts -
        (a.primaryAttempts - a.primaryCorrect) / a.primaryAttempts
      : sort === 'oldest'
        ? a.lastPracticedAt.localeCompare(b.lastPracticedAt)
        : sort === 'slow'
          ? average(b) - average(a)
          : b.lastPracticedAt.localeCompare(a.lastPracticedAt),
  );
  const due = Object.values(data.kanaStats).filter(
    (p) => p.primaryAttempts > 0 && isDue(p.review, now),
  ).length;
  const contrast = (performance: KanaPerformance, choice: string) => {
    const target = KANA_BY_ID[performance.kanaId];
    const mistaken = KANA.filter(
      (e) =>
        e.script === target.script &&
        (performance.direction === 'romaji-kana' ? e.glyph === choice : e.romaji === choice),
    );
    const ids = [target.id, ...(mistaken.length === 1 ? [mistaken[0].id] : [])];
    const categories = [...new Set(ids.map((id) => KANA_BY_ID[id].category))];
    start({ ...data.settings, categories, rows: [], mode: performance.direction }, 'contrast', ids);
  };
  return (
    <section className="history-layout">
      <div className="history-heading">
        <div>
          <span className="eyebrow">{t.recordEyebrow}</span>
          <h1>{t.recordTitle}</h1>
          <p className="section-intro">{t.recordIntro}</p>
        </div>
        <button
          className="button primary"
          disabled={!due}
          onClick={() =>
            start({ ...data.settings, categories: [...CATEGORIES], rows: [] }, 'review')
          }
        >
          {x.dueAction} <span className="button-count">{due}</span>
        </button>
      </div>
      <div className="history-overview">
        <Stat value={data.stats.answered} label={x.totalPractice} />
        <Stat
          value={accuracy(data.stats.primaryCorrect, data.stats.primaryAnswered)}
          label={x.primaryAccuracy}
        />
        <Stat value={data.stats.completed} label={t.completed} />
        <Stat value={data.stats.maxStreak} label={t.bestStreak} />
        <Stat value={formatTime(data.stats.elapsedMs, data.language)} label={t.totalTime} />
      </div>
      <section className="history-section coverage-section">
        <div className="section-heading">
          <div>
            <h2>{x.coverage}</h2>
            <p>{x.coverageNote}</p>
          </div>
          <label className="compact-select">
            {x.direction}
            <select
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value as Direction);
                setShown(24);
              }}
            >
              <option value="kana-romaji">{t.forward}</option>
              <option value="romaji-kana">{t.reverse}</option>
            </select>
          </label>
        </div>
        <div className="coverage-grid">
          {CATEGORIES.map((c) => {
            const count = coverage(c, data.kanaStats, direction);
            return (
              <button
                key={c}
                className={'coverage-card ' + (category === c ? 'selected' : '')}
                onClick={() => {
                  setCategory(category === c ? 'all' : c);
                  setShown(24);
                }}
              >
                <strong>{categoryLabel(c, data.language)}</strong>
                <span>
                  {count.practiced} / {count.total}
                </span>
                <small>{x.practiced}</small>
              </button>
            );
          })}
        </div>
        <div className="chart-controls">
          <h3>{x.chart}</h3>
          <select
            aria-label={x.viewing}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as Category | 'all');
              setShown(24);
            }}
          >
            <option value="all">{x.all}</option>
            {CATEGORIES.map((c) => (
              <option value={c} key={c}>
                {categoryLabel(c, data.language)}
              </option>
            ))}
          </select>
        </div>
        <div className="kana-chart">
          {CATEGORIES.filter((c) => category === 'all' || c === category).map((c) => (
            <section className={'chart-group' + (c.endsWith('yoon') ? ' contracted' : '')} key={c}>
              <h4>{categoryLabel(c, data.language)}</h4>
              {[
                ...new Set(
                  entries.filter((entry) => entry.category === c).map((entry) => entry.rowId),
                ),
              ].map((row) => (
                <div className="chart-row" key={row}>
                  {entries
                    .filter((entry) => entry.rowId === row)
                    .map((entry) => {
                      const p = data.kanaStats[entry.id + ':' + direction];
                      const status = getFamiliarity(p);
                      const needs = p && p.primaryAttempts > 0 && isDue(p.review, now);
                      return (
                        <article
                          key={entry.id}
                          className={'chart-cell ' + status + (needs ? ' is-due' : '')}
                        >
                          <span lang="ja">{entry.glyph}</span>
                          <b>{entry.romaji}</b>
                          <small>{x[status]}</small>
                          {needs && <em>{p.review.needsCorrection ? x.correction : x.due}</em>}
                        </article>
                      );
                    })}
                </div>
              ))}
            </section>
          ))}
        </div>
      </section>
      <section className="history-section">
        <div className="section-heading">
          <div>
            <h2>{t.kanaPerformance}</h2>
            <p>{x.primaryNote}</p>
          </div>
          <div className="record-filters">
            <select
              aria-label={x.filters}
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as 'all' | 'due');
                setShown(24);
              }}
            >
              <option value="all">{x.all}</option>
              <option value="due">{x.dueOnly}</option>
            </select>
            <select
              aria-label={x.filters + ' ' + x.date}
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setShown(24);
              }}
            >
              <option value="recent">{x.recentSort}</option>
              <option value="errors">{x.errors}</option>
              <option value="oldest">{x.oldest}</option>
              <option value="slow">{x.slow}</option>
            </select>
          </div>
        </div>
        {performances.length ? (
          <>
            <div className="performance-grid">
              {performances.slice(0, shown).map((p) => {
                const entry = KANA_BY_ID[p.kanaId];
                const recent = p.recent.slice(-RECENT_DISPLAY);
                const trend = getTrend(p);
                const confusions = Object.entries(p.confusions)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 2);
                return (
                  <article
                    className={'performance-card ' + (isDue(p.review, now) ? 'needs-review' : '')}
                    key={p.kanaId + ':' + p.direction}
                  >
                    <div className="performance-top">
                      <span className="performance-glyph" lang="ja">
                        {entry.glyph}
                      </span>
                      <div>
                        <strong>{entry.romaji}</strong>
                        <small>{modeLabel(p.direction, data.language)}</small>
                      </div>
                      <span className="performance-accuracy">
                        {accuracy(p.primaryCorrect, p.primaryAttempts)}
                      </span>
                    </div>
                    <span className="familiarity-label">{x[getFamiliarity(p)]}</span>
                    <p>
                      {p.primaryAttempts} {x.firstAnswers}
                      <span>
                        {p.unknown} {x.unknownCount}
                      </span>
                    </p>
                    <p className="recent-accuracy">
                      {x.recent}:{' '}
                      {accuracy(
                        recent.filter((a) => a.outcome === 'correct').length,
                        recent.length,
                      )}{' '}
                      ({recent.length})
                    </p>
                    <Timing value={p} label={x.allAverage} language={data.language} />
                    <Timing
                      value={p.correctTiming}
                      label={x.correctAverage}
                      language={data.language}
                    />
                    <div className="trend-note">
                      <span>{x.trend}</span>
                      {trend ? (
                        <>
                          <b>
                            {trend.responseDeltaMs === null
                              ? x.noSamples
                              : Math.abs(trend.responseDeltaMs) +
                                ' ms ' +
                                (trend.responseDeltaMs < 0
                                  ? x.faster
                                  : trend.responseDeltaMs > 0
                                    ? x.slower
                                    : x.unchanged)}
                          </b>
                          <small>
                            {x.primaryAccuracy}: {trend.accuracyDelta > 0 ? '+' : ''}
                            {trend.accuracyDelta} {x.percentagePoints} · {trend.samples}{' '}
                            {x.firstAnswers}
                          </small>
                        </>
                      ) : (
                        <small>{x.noSamples}</small>
                      )}
                    </div>
                    {confusions.length > 0 && (
                      <div className="confusion-list">
                        <strong>{x.confusion}</strong>
                        {confusions.map(([choice, count]) => (
                          <button
                            key={choice}
                            onClick={() => contrast(p, choice)}
                            title={x.contrastStart}
                          >
                            <span>
                              {entry.glyph} → {choice}
                            </span>
                            <small>×{count} ↗</small>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="performance-bottom">
                      <small>
                        {x.nextReview}: {new Date(p.review.dueAt).toLocaleDateString(data.language)}
                      </small>
                      {isDue(p.review, now) && (
                        <span className="pending-tag">
                          {p.review.needsCorrection ? x.correction : x.due}
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            {shown < performances.length && (
              <button className="button secondary show-more" onClick={() => setShown(shown + 24)}>
                {t.showMore} {shown} / {performances.length}
              </button>
            )}
          </>
        ) : (
          <div className="empty-state">
            <p>{x.noMatch}</p>
          </div>
        )}
      </section>
      <section className="history-section">
        <div className="section-heading">
          <h2>{t.recent}</h2>
          <span>{data.history.length} / 100</span>
        </div>
        {data.history.length ? (
          <div className="session-list">
            {data.history.map((item) => (
              <article className="session-row" key={item.id}>
                <div className="session-info">
                  <h3>
                    {kindLabel(item.kind, data.language)}{' '}
                    <span className={'status-tag ' + item.status}>
                      {item.status === 'completed' ? x.finished : x.abandoned}
                    </span>
                  </h3>
                  <p>
                    <time dateTime={item.startedAt}>
                      {new Date(item.startedAt).toLocaleString(data.language)}
                    </time>
                  </p>
                  <p>
                    {modeLabel(item.settings.mode, data.language)} ·{' '}
                    {item.settings.categories
                      .map((c) => categoryLabel(c, data.language))
                      .join(' / ')}
                  </p>
                </div>
                <div className="session-score">
                  <strong>{accuracy(item.primaryCorrect, item.primaryAnswered)}</strong>
                  <small>
                    {item.primaryCorrect} / {item.primaryAnswered} · {item.primaryAnswered}/
                    {item.primaryTotal} {x.primary}
                  </small>
                  <small>
                    {item.maxStreak} {t.bestStreak} · {formatTime(item.elapsedMs, data.language)}
                  </small>
                  <small>
                    {item.corrected} {x.corrected}
                  </small>
                  <Timing value={item} label={x.allAverage} language={data.language} />
                  <Timing
                    value={item.correctTiming}
                    label={x.correctAverage}
                    language={data.language}
                  />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>{x.emptyHistory}</p>
          </div>
        )}
      </section>
      <div className="history-bottom">
        <p>{t.localNote}</p>
        <button className="text-button destructive" onClick={onClear}>
          {t.clearRecords}
        </button>
      </div>
    </section>
  );
}
