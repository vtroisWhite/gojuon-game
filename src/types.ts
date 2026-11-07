export type Language = 'zh-CN' | 'en';
export type Script = 'hiragana' | 'katakana';
export type Group = 'seion' | 'dakuten' | 'yoon';
export type Category = `${Script}-${Group}`;
export type Direction = 'kana-romaji' | 'romaji-kana';
export type Mode = Direction | 'mixed';
export type QuestionCount = 10 | 20 | 40 | 'all';
export type PracticeKind = 'learn' | 'free' | 'review' | 'contrast';
export type Presentation = 'direct' | 'recall';
export type FeedbackSpeed = 'manual' | 'standard' | 'fast';
export type InputMethod = 'keyboard' | 'pointer' | 'touch';
export type AnswerOutcome = 'correct' | 'incorrect' | 'unknown';
export type QuestionRole = 'primary' | 'reinforcement';
export interface KanaEntry {
  id: string;
  script: Script;
  group: Group;
  category: Category;
  glyph: string;
  romaji: string;
  pronunciation: string;
  rowId: string;
}
export interface LessonDefinition {
  id: string;
  category: Category;
  kanaIds: string[];
}
export interface PracticeSettings {
  categories: Category[];
  rows: string[];
  count: QuestionCount;
  mode: Mode;
  presentation: Presentation;
  feedbackSpeed: FeedbackSpeed;
}
export interface Question {
  id: string;
  kanaId: string;
  direction: Direction;
  options: string[];
  correctAnswer: string;
  role: QuestionRole;
  sourceQuestionId?: string;
}
export interface Answer {
  questionId: string;
  choice: string | null;
  outcome: AnswerOutcome;
  correct: boolean;
  answeredAt: string;
  responseMs: number;
  inputMethod: InputMethod;
}
export interface ResponseTiming {
  timedAnswers: number;
  totalResponseMs: number;
}
export interface RecentAttempt {
  answeredAt: string;
  outcome: AnswerOutcome;
  responseMs: number;
  presentation: Presentation;
  kind: PracticeKind;
  inputMethod: InputMethod;
}
export interface ReviewProgress {
  stage: number;
  dueAt: string;
  needsCorrection: boolean;
  lastPromotedDay: string | null;
  lastExposedDay: string | null;
  successfulDays: number;
}
export interface KanaPerformance extends ResponseTiming {
  kanaId: string;
  direction: Direction;
  attempts: number;
  correct: number;
  errors: number;
  unknown: number;
  primaryAttempts: number;
  primaryCorrect: number;
  correctTiming: ResponseTiming;
  recent: RecentAttempt[];
  confusions: Record<string, number>;
  review: ReviewProgress;
  lastPracticedAt: string;
}
export interface SessionSnapshot {
  id: string;
  kind: PracticeKind;
  settings: PracticeSettings;
  questions: Question[];
  primaryCount: number;
  index: number;
  answers: Answer[];
  phase: 'recall' | 'choice' | 'feedback';
  stage: 'primary' | 'reinforcement';
  feedbackDelayMs: number | null;
  feedbackRemainingMs: number;
  paused: boolean;
  status: 'active' | 'completed' | 'abandoned';
  streak: number;
  maxStreak: number;
  elapsedMs: number;
  questionElapsedMs: number;
  startedAt: string;
  endedAt?: string;
}
export interface SessionSummary extends ResponseTiming {
  id: string;
  kind: PracticeKind;
  settings: PracticeSettings;
  startedAt: string;
  endedAt: string;
  status: 'completed' | 'abandoned';
  total: number;
  primaryTotal: number;
  answered: number;
  correct: number;
  primaryAnswered: number;
  primaryCorrect: number;
  corrected: number;
  correctTiming: ResponseTiming;
  maxStreak: number;
  elapsedMs: number;
}
export interface StudySnapshot {
  lessonId: string;
  cardIndex: number;
  mixLearned: boolean;
}
export interface LearningRecord {
  version: 1;
  schema: 'learning-v1';
  language: Language;
  settings: PracticeSettings;
  session: SessionSnapshot | null;
  study: StudySnapshot | null;
  learnedLessons: string[];
  history: SessionSummary[];
  stats: {
    answered: number;
    correct: number;
    primaryAnswered: number;
    primaryCorrect: number;
    completed: number;
    maxStreak: number;
    elapsedMs: number;
  };
  kanaStats: Record<string, KanaPerformance>;
}
export type GameAction =
  | { type: 'START'; session: SessionSnapshot; now: string }
  | { type: 'ANSWER'; choice: string | null; inputMethod: InputMethod; now: string }
  | { type: 'REVEAL' }
  | { type: 'ADVANCE'; now: string }
  | { type: 'TICK'; deltaMs: number; now: string }
  | { type: 'PAUSE'; paused: boolean }
  | { type: 'ABANDON'; now: string }
  | { type: 'STUDY'; study: StudySnapshot; now: string }
  | { type: 'LESSON_COMPLETE'; lessonId: string; now: string }
  | { type: 'SETTINGS'; settings: PracticeSettings }
  | { type: 'LANGUAGE'; language: Language }
  | { type: 'CLEAR' };
