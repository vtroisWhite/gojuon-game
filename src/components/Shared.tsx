import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type {
  GameAction,
  Language,
  LearningRecord,
  PracticeKind,
  PracticeSettings,
  StorageRecoveryNotice,
} from '../types';
import { dictionaries } from '../i18n';
import { uiText } from '../uiText';

export interface PageProps {
  data: LearningRecord;
  dispatch: (action: GameAction) => void;
  start: (settings: PracticeSettings, kind: PracticeKind, targetIds?: string[]) => void;
  home: () => void;
}
export function Stat({
  value,
  label,
  className = '',
}: {
  value: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div className={'stat ' + className}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
export function Timing({
  value,
  label,
  language,
}: {
  value: { timedAnswers: number; totalResponseMs: number };
  label: string;
  language: Language;
}) {
  const x = uiText[language];
  return (
    <div className="timing-value" title={x.timingHint}>
      <span>{label}</span>
      <strong>
        {value.timedAnswers ? Math.round(value.totalResponseMs / value.timedAnswers) + ' ms' : '—'}
      </strong>
      <small>
        {value.timedAnswers} {x.samples}
      </small>
    </div>
  );
}
export function ConfirmDialog({
  language,
  kind,
  onConfirm,
  onCancel,
  recoveryKind,
}: {
  language: Language;
  kind: 'clear' | 'end' | 'replace' | 'recovery';
  recoveryKind?: StorageRecoveryNotice['kind'];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = dictionaries[language];
  const ref = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const cancelAction = useRef(onCancel);
  cancelAction.current = onCancel;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancel.current?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelAction.current();
      }
      if (event.key !== 'Tab') return;
      const items = ref.current?.querySelectorAll<HTMLButtonElement>('button');
      if (!items?.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handle);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', handle);
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={kind === 'recovery' ? undefined : onCancel}>
      <div
        className="confirm-dialog"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dialog-title">
          {kind === 'recovery'
            ? recoveryKind === 'settings'
              ? t.recoverySettingsTitle
              : t.recoveryTitle
            : kind === 'clear'
              ? t.clearTitle
              : kind === 'end'
                ? t.endTitle
                : t.replaceTitle}
        </h2>
        <p id="dialog-message">
          {kind === 'recovery'
            ? recoveryKind === 'settings'
              ? t.recoverySettingsMessage
              : recoveryKind === 'partial'
                ? t.recoveryPartialMessage
                : t.recoveryResetMessage
            : kind === 'clear'
              ? t.clearMessage
              : kind === 'end'
                ? t.endMessage
                : t.replaceMessage}
        </p>
        <div className="dialog-actions">
          {kind !== 'recovery' && (
            <button ref={cancel} className="button secondary" onClick={onCancel}>
              {t.cancel}
            </button>
          )}
          <button
            ref={kind === 'recovery' ? cancel : undefined}
            className={'button ' + (kind === 'clear' ? 'danger-button' : 'primary')}
            onClick={onConfirm}
          >
            {kind === 'recovery'
              ? t.acknowledge
              : kind === 'clear'
                ? t.confirmClear
                : kind === 'end'
                  ? t.confirmEnd
                  : t.confirmReplace}
          </button>
        </div>
      </div>
    </div>
  );
}
