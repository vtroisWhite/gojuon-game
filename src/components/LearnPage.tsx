import { KANA_BY_ID } from '../kana';
import { LESSONS, LESSON_BY_ID, lessonLabel } from '../lessons';
import { dictionaries } from '../i18n';
import { CONFUSION_PAIRS } from '../confusions';
import { uiText } from '../uiText';
import type { PageProps } from './Shared';

export function LearnPage({ data, dispatch, start, home }: PageProps) {
  const t = dictionaries[data.language];
  const x = uiText[data.language];
  const study = data.study;
  const lesson = study ? LESSON_BY_ID[study.lessonId] : null;
  if (!study || !lesson)
    return (
      <div className="empty-state">
        <p>{x.lesson}</p>
        <button className="button primary" onClick={home}>
          {t.home}
        </button>
      </div>
    );
  const index = Math.min(study.cardIndex, lesson.kanaIds.length - 1);
  const entry = KANA_BY_ID[lesson.kanaIds[index]];
  const hint = CONFUSION_PAIRS.find((pair) => pair.glyphs.includes(entry.glyph))?.hint[
    data.language
  ];
  const move = (cardIndex: number) =>
    dispatch({ type: 'STUDY', study: { ...study, cardIndex }, now: new Date().toISOString() });
  const begin = () => {
    dispatch({ type: 'LESSON_COMPLETE', lessonId: lesson.id, now: new Date().toISOString() });
    const rows = study.mixLearned
      ? LESSONS.filter(
          (l) =>
            l.category === lesson.category &&
            (l.id === lesson.id || data.learnedLessons.includes(l.id)),
        ).map((l) => l.id)
      : [lesson.id];
    start({ ...data.settings, categories: [lesson.category], rows, count: 'all' }, 'learn');
  };
  return (
    <section className="study-layout">
      <div className="game-toolbar">
        <button className="text-button" onClick={home}>
          ← {t.back}
        </button>
        <span>{lessonLabel(lesson, data.language)}</span>
        <span>
          {index + 1} / {lesson.kanaIds.length}
        </span>
      </div>
      <div className="study-heading">
        <span className="eyebrow">{x.card}</span>
        <h1>{lessonLabel(lesson, data.language)}</h1>
        <p>{x.studyOnly}</p>
      </div>
      <article className="study-card">
        <span className="study-glyph" lang="ja">
          {entry.glyph}
        </span>
        <strong>{entry.romaji}</strong>
        {entry.romaji === 'wo' && <p>{t.woNote}</p>}
        {hint && <p className="study-hint">{hint}</p>}
      </article>
      <div className="study-actions">
        <button className="button secondary" disabled={index === 0} onClick={() => move(index - 1)}>
          {x.previous}
        </button>
        {index < lesson.kanaIds.length - 1 ? (
          <button className="button primary" onClick={() => move(index + 1)}>
            {x.nextCard} →
          </button>
        ) : (
          <button className="button primary" onClick={begin}>
            {x.beginLesson} →
          </button>
        )}
      </div>
      <label className="mix-learned">
        <input
          type="checkbox"
          checked={study.mixLearned}
          onChange={(e) =>
            dispatch({
              type: 'STUDY',
              study: { ...study, mixLearned: e.target.checked },
              now: new Date().toISOString(),
            })
          }
        />
        {x.mixLearned}
      </label>
      <div className="study-row" aria-hidden="true">
        {lesson.kanaIds.map((id, i) => (
          <span key={id} className={i === index ? 'active' : ''} lang="ja">
            {KANA_BY_ID[id].glyph}
          </span>
        ))}
      </div>
    </section>
  );
}
