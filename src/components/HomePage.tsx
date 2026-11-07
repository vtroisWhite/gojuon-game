import { CATEGORIES, KANA_BY_ID } from '../kana';
import { getPool, getReviewCount } from '../engine';
import { LESSONS, lessonLabel } from '../lessons';
import { FEEDBACK_DELAYS } from '../config';
import { CONFUSION_PAIRS, relatedGlyphs } from '../confusions';
import { accuracy, categoryLabel, dictionaries, modeLabel } from '../i18n';
import { kindLabel, uiText } from '../uiText';
import type {
  Category,
  FeedbackSpeed,
  Mode,
  PracticeKind,
  Presentation,
  QuestionCount,
  StudySnapshot,
} from '../types';
import { Stat } from './Shared';
import type { PageProps } from './Shared';

export function HomePage({
  data,
  dispatch,
  start,
  kind,
  setKind,
  onStudy,
  onResume,
}: PageProps & {
  kind: PracticeKind;
  setKind: (kind: PracticeKind) => void;
  onStudy: (study: StudySnapshot) => void;
  onResume: () => void;
}) {
  const t = dictionaries[data.language];
  const x = uiText[data.language];
  const settings = data.settings;
  const pool = getPool(settings);
  const due = getReviewCount(settings, data.kanaStats);
  const update = (patch: Partial<typeof settings>) =>
    dispatch({ type: 'SETTINGS', settings: { ...settings, ...patch } });
  const lessons = LESSONS.filter((l) => settings.categories.includes(l.category));
  const active = data.session?.status === 'active';
  const contrastAvailable = pool.some(
    (entry) =>
      relatedGlyphs(entry).length > 0 ||
      Object.values(data.kanaStats).some(
        (p) => p.kanaId === entry.id && Object.keys(p.confusions).length > 0,
      ),
  );
  return (
    <div className="home-layout">
      <section className="welcome-panel">
        <span className="eyebrow">{t.eyebrow}</span>
        <h1>
          {t.hero.split('\n').map((line) => (
            <span key={line}>{line}</span>
          ))}
        </h1>
        <p className="hero-description">{t.intro}</p>
        <div className="kana-illustration" aria-hidden="true">
          <div className="orbit" />
          <div className="illustration-card illustration-secondary">
            <span lang="ja">ア</span>
          </div>
          <div className="illustration-card illustration-main">
            <span lang="ja">あ</span>
            <div>a</div>
          </div>
        </div>
        <div className="journey">
          <h2>{t.today}</h2>
          <div className="journey-stats">
            <Stat value={data.stats.primaryAnswered} label={x.firstAnswers} />
            <Stat
              value={accuracy(data.stats.primaryCorrect, data.stats.primaryAnswered)}
              label={x.primaryAccuracy}
            />
            <Stat value={due} label={x.todayDue} />
          </div>
        </div>
        {active && (
          <div className="resume-card">
            <div>
              <h3>{t.resumeTitle}</h3>
              <p>
                {data.session!.answers.length} · {t.resumeHint}
              </p>
            </div>
            <button className="text-button" onClick={onResume}>
              {t.resume} →
            </button>
          </div>
        )}
        {data.study && (
          <div className="resume-card">
            <h3>{x.card}</h3>
            <button className="text-button" onClick={() => onStudy(data.study!)}>
              {t.resume} →
            </button>
          </div>
        )}
        <p className="range-note">{x.reviewRule}</p>
      </section>
      <section className="settings-panel" aria-label={t.configure}>
        <div className="entry-grid">
          {(['learn', 'free', 'review', 'contrast'] as PracticeKind[]).map((k) => (
            <button
              key={k}
              className={'entry-card ' + (kind === k ? 'selected' : '')}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              <strong>{kindLabel(k, data.language)}</strong>
              <small>
                {x[(k + 'Hint') as 'learnHint' | 'freeHint' | 'reviewHint' | 'contrastHint']}
              </small>
            </button>
          ))}
        </div>
        <fieldset className="setting-section">
          <legend>{t.stepRange}</legend>
          <div className="range-actions">
            <button
              className="text-button"
              onClick={() => update({ categories: [...CATEGORIES], rows: [] })}
            >
              {t.selectAll}
            </button>
            <button
              className="text-button muted"
              onClick={() => update({ categories: [], rows: [] })}
            >
              {t.clear}
            </button>
          </div>
          <div className="category-grid">
            {CATEGORIES.map((category) => (
              <label
                key={category}
                className={
                  'category-card ' + (settings.categories.includes(category) ? 'selected' : '')
                }
              >
                <input
                  type="checkbox"
                  checked={settings.categories.includes(category)}
                  onChange={() =>
                    update({
                      categories: settings.categories.includes(category)
                        ? settings.categories.filter((c) => c !== category)
                        : [...settings.categories, category],
                      rows: [],
                    })
                  }
                />
                <span className="category-info">
                  <strong>{categoryLabel(category, data.language)}</strong>
                  <small>
                    {category.endsWith('seion') ? 46 : category.endsWith('dakuten') ? 25 : 33}{' '}
                    {t.kanaUnit}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {kind !== 'learn' && (
          <fieldset className="setting-section">
            <legend>{x.rows}</legend>
            <div className="row-options">
              <button
                className={!settings.rows.length ? 'selected' : ''}
                onClick={() => update({ rows: [] })}
              >
                {x.allRows}
              </button>
              {lessons.map((l) => (
                <button
                  key={l.id}
                  className={settings.rows.includes(l.id) ? 'selected' : ''}
                  onClick={() =>
                    update({
                      rows: settings.rows.includes(l.id)
                        ? settings.rows.filter((r) => r !== l.id)
                        : [...settings.rows, l.id],
                    })
                  }
                >
                  {lessonLabel(l, data.language)}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset className="setting-section">
          <legend>{t.stepMode}</legend>
          <div className="mode-grid">
            {(['kana-romaji', 'romaji-kana', 'mixed'] as Mode[]).map((mode) => (
              <label
                key={mode}
                className={'mode-card ' + (settings.mode === mode ? 'selected' : '')}
              >
                <input
                  type="radio"
                  name="mode"
                  checked={settings.mode === mode}
                  onChange={() => update({ mode })}
                />
                <strong>{modeLabel(mode, data.language)}</strong>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="settings-pair">
          <label>
            {x.presentation}
            <select
              value={settings.presentation}
              onChange={(e) => update({ presentation: e.target.value as Presentation })}
            >
              <option value="direct">{x.direct}</option>
              <option value="recall">{x.recall}</option>
            </select>
          </label>
          <label>
            {x.feedback}
            <select
              value={settings.feedbackSpeed}
              onChange={(e) => update({ feedbackSpeed: e.target.value as FeedbackSpeed })}
            >
              <option value="manual">{x.manual}</option>
              <option value="standard">
                {x.standard} · {FEEDBACK_DELAYS.standard} ms
              </option>
              <option value="fast">
                {x.fast} · {FEEDBACK_DELAYS.fast} ms
              </option>
            </select>
          </label>
        </div>
        {kind === 'learn' ? (
          <div className="lesson-picker">
            <h2>{x.lesson}</h2>
            <p>{x.lessonHint}</p>
            <div className="lesson-grid">
              {lessons.map((lesson) => (
                <button
                  className="lesson-button"
                  key={lesson.id}
                  onClick={() =>
                    onStudy(
                      data.study?.lessonId === lesson.id
                        ? data.study
                        : { lessonId: lesson.id, cardIndex: 0, mixLearned: false },
                    )
                  }
                >
                  <span lang="ja">
                    {lesson.kanaIds.map((id) => KANA_BY_ID[id].glyph).join(' ')}
                  </span>
                  <strong>{lessonLabel(lesson, data.language)}</strong>
                  {data.learnedLessons.includes(lesson.id) && <small>{x.learned}</small>}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <fieldset className="setting-section count-section">
              <legend>{t.stepCount}</legend>
              <div className="count-options">
                {([10, 20, 40, 'all'] as QuestionCount[]).map((count) => (
                  <label key={count} className={settings.count === count ? 'selected' : ''}>
                    <input
                      type="radio"
                      name="count"
                      checked={settings.count === count}
                      onChange={() => update({ count })}
                    />
                    <span>{count === 'all' ? t.all : count}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {kind === 'contrast' ? (
              <>
                <p className="range-note">{x.outsideChoices}</p>
                <div className="contrast-grid">
                  {CONFUSION_PAIRS.filter((pair) =>
                    pair.glyphs.every((g) => pool.some((e) => e.glyph === g)),
                  ).map((pair) => (
                    <button
                      key={pair.glyphs.join('')}
                      className="lesson-button"
                      onClick={() =>
                        start(
                          settings,
                          'contrast',
                          pool.filter((e) => pair.glyphs.includes(e.glyph)).map((e) => e.id),
                        )
                      }
                    >
                      <span lang="ja">{pair.glyphs.join(' ／ ')}</span>
                      <small>{pair.hint[data.language]}</small>
                    </button>
                  ))}
                </div>
                <button
                  className="button primary start-button"
                  disabled={!contrastAvailable}
                  onClick={() => start(settings, 'contrast')}
                >
                  {t.start}
                </button>
                {!contrastAvailable && <p className="range-note">{x.noMatch}</p>}
              </>
            ) : (
              <div className="start-area">
                <p className="session-count">
                  {kind === 'review' ? due : pool.length}{' '}
                  {kind === 'review' ? x.pendingLabel : t.kanaUnit}
                </p>
                <button
                  className="button primary start-button"
                  disabled={kind === 'review' ? !due : !pool.length}
                  onClick={() => start(settings, kind)}
                >
                  {kind === 'review' ? x.dueAction : t.start} →
                </button>
                {kind === 'review' && !due && <p className="range-note">{x.noDue}</p>}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
