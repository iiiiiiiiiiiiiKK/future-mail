import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/utils/misc';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** 二次确认：必须输入指定文字才能继续 */
  requireTyping?: string;
  children?: ReactNode;
}

/**
 * 二次确认对话框。
 * 内层 DialogBody 以 open 为 key 挂载，因此每次打开都是干净状态（无需在 effect 里重置）。
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
  requireTyping,
  children,
}: ConfirmDialogProps) {
  if (!open) return null;
  return createPortal(
    <DialogBody
      key="dialog"
      title={title}
      body={body}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      danger={danger}
      onConfirm={onConfirm}
      onCancel={onCancel}
      requireTyping={requireTyping}
    >
      {children}
    </DialogBody>,
    document.body,
  );
}

function DialogBody({
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
  onCancel,
  requireTyping,
  children,
}: Omit<ConfirmDialogProps, 'open'>) {
  const { t } = useI18n();
  const [typed, setTyped] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const blocked = Boolean(requireTyping) && typed.trim() !== requireTyping;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="surface-elevated w-full max-w-md animate-fade-up rounded-t-2xl p-5 sm:rounded-2xl sm:p-6"
        style={{ maxHeight: '90dvh', overflowY: 'auto' }}
      >
        <div className="flex items-start gap-3">
          {danger && (
            <span
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: 'rgba(190,70,70,0.12)', color: '#d06060' }}
            >
              <AlertTriangle className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg leading-snug">{title}</h2>
            {body && <p className="mt-2 text-sm leading-relaxed text-secondary">{body}</p>}
          </div>
        </div>

        {children && <div className="mt-4">{children}</div>}

        {requireTyping && (
          <div className="mt-4">
            <label className="eyebrow" htmlFor="confirm-typing">
              {requireTyping}
            </label>
            <input
              id="confirm-typing"
              className="field mt-2 font-mono"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-outline" onClick={onCancel}>
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button
            type="button"
            className={cn('btn', danger ? 'btn-danger' : 'btn-primary')}
            onClick={onConfirm}
            disabled={blocked}
          >
            {confirmLabel ?? t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
