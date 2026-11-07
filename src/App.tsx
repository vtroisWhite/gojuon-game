import { useEffect, useRef, useState } from 'react';
import { useGame } from './useGame';
import { createSession } from './engine';
import { dictionaries } from './i18n';
import { uiText } from './uiText';
import { HomePage } from './components/HomePage';
import { LearnPage } from './components/LearnPage';
import { GamePage } from './components/GamePage';
import { ResultPage } from './components/ResultPage';
import { RecordsPage } from './components/RecordsPage';
import { ConfirmDialog } from './components/Shared';
import type { PracticeKind, PracticeSettings, StudySnapshot } from './types';
import './styles.css';

type View = 'home' | 'study' | 'game' | 'history';
type Dialog = { kind: 'replace' | 'end' | 'clear'; action: () => void };
export default function App() {
  const [view, setView] = useState<View>('home');
  const [kind, setKind] = useState<PracticeKind>('learn');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState('');
  const wasRunning = useRef(false);
  const { data, dispatch, storageWarning, clearRecords } = useGame(
    view === 'game' && dialog === null,
  );
  const t = dictionaries[data.language];
  const x = uiText[data.language];
  const [, refreshDate] = useState(0);
  useEffect(() => {
    document.title = t.name;
    document.documentElement.lang = data.language;
  }, [t.name, data.language]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [view, data.session?.status]);
  useEffect(() => {
    const timer = window.setInterval(() => refreshDate((v) => v + 1), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const now = () => new Date().toISOString();
  function navigate(next: View) {
    dispatch({ type: 'PAUSE', paused: true });
    setView(next);
    setError('');
  }
  function ask(next: Dialog) {
    wasRunning.current = Boolean(
      view === 'game' && data.session?.status === 'active' && !data.session.paused,
    );
    dispatch({ type: 'PAUSE', paused: true });
    setDialog(next);
  }
  function cancel() {
    setDialog(null);
    if (wasRunning.current) dispatch({ type: 'PAUSE', paused: false });
  }
  function start(settings: PracticeSettings, practiceKind: PracticeKind, targetIds?: string[]) {
    const action = () => {
      try {
        const session = createSession(
          settings,
          data.kanaStats,
          practiceKind,
          Math.random,
          now(),
          targetIds,
        );
        dispatch({ type: 'START', session, now: now() });
        setView('game');
        setError('');
      } catch {
        setError(t.startError);
      }
    };
    if (data.session?.status === 'active') ask({ kind: 'replace', action });
    else action();
  }
  function study(snapshot: StudySnapshot) {
    dispatch({ type: 'PAUSE', paused: true });
    dispatch({ type: 'STUDY', study: snapshot, now: now() });
    setView('study');
    setError('');
  }
  function resume() {
    setView('game');
    dispatch({ type: 'PAUSE', paused: false });
  }
  const props = { data, dispatch, start, home: () => navigate('home') };
  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" onClick={() => navigate('home')} aria-label={t.home}>
          <span className="brand-mark" lang="ja">
            あ
          </span>
          <span>
            {t.name}
            <small>{t.tagline}</small>
          </span>
        </button>
        <nav aria-label={data.language === 'zh-CN' ? '主导航' : 'Main navigation'}>
          <button
            className={'nav-button ' + (view !== 'history' ? 'active' : '')}
            onClick={() => navigate('home')}
          >
            {t.practice}
          </button>
          <button
            className={'nav-button ' + (view === 'history' ? 'active' : '')}
            onClick={() => navigate('history')}
          >
            {t.records}
          </button>
        </nav>
        <button
          className="language-button"
          onClick={() =>
            dispatch({ type: 'LANGUAGE', language: data.language === 'zh-CN' ? 'en' : 'zh-CN' })
          }
          aria-label={t.language}
        >
          {data.language === 'zh-CN' ? 'EN' : '中文'}
        </button>
      </header>
      {storageWarning && (
        <div className="notice" role="status">
          <span>
            {t.storageWarning}
            {storageWarning === 'corrupt' && <> {x.clearHint}</>}
          </span>
        </div>
      )}
      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}
      <main>
        {view === 'home' && (
          <HomePage {...props} kind={kind} setKind={setKind} onStudy={study} onResume={resume} />
        )}
        {view === 'study' && <LearnPage {...props} />}
        {view === 'game' && data.session?.status === 'active' && (
          <GamePage
            {...props}
            onEnd={() =>
              ask({
                kind: 'end',
                action: () => {
                  dispatch({ type: 'ABANDON', now: now() });
                  setView('home');
                },
              })
            }
          />
        )}
        {view === 'game' && data.session?.status === 'completed' && (
          <ResultPage
            {...props}
            onLearn={() => {
              setKind('learn');
              navigate('home');
            }}
          />
        )}
        {view === 'history' && (
          <RecordsPage
            {...props}
            onClear={() =>
              ask({
                kind: 'clear',
                action: () => {
                  clearRecords();
                  setError('');
                },
              })
            }
          />
        )}
      </main>
      <footer className="site-footer">
        <span>
          <span lang="ja">あ</span> {t.footerNote}
        </span>
        <span>{t.localNote}</span>
      </footer>
      {dialog && (
        <ConfirmDialog
          language={data.language}
          kind={dialog.kind}
          onCancel={cancel}
          onConfirm={() => {
            const action = dialog.action;
            setDialog(null);
            action();
          }}
        />
      )}
    </div>
  );
}
