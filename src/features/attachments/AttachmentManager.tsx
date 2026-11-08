import { useEffect, useRef, useState } from 'react';
import { FileAudio, FileText, Image as ImageIcon, Link2, Paperclip, Plus, Trash2, File as FileIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/i18n/useI18n';
import { MAX_ATTACHMENTS, MAX_FILE_SIZE, deleteAttachment, getBlobUrl, saveAttachment } from '@/services/attachments/attachments';
import type { Attachment } from '@/types';
import { formatBytes } from '@/utils/misc';

const KIND_ICON = {
  image: ImageIcon,
  audio: FileAudio,
  pdf: FileText,
  text: FileText,
  'video-link': Link2,
} as const;

function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const revoked = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (attachment.kind === 'video-link' || !attachment.blobKey) return;
    void getBlobUrl(attachment.blobKey).then((u) => {
      if (cancelled) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      revoked.current = u;
      setUrl(u);
    });
    return () => {
      cancelled = true;
      if (revoked.current) URL.revokeObjectURL(revoked.current);
    };
  }, [attachment.blobKey, attachment.kind]);

  if (attachment.kind === 'image' && url) {
    return (
      <img
        src={url}
        alt={attachment.name}
        className="h-20 w-20 rounded-md object-cover"
        loading="lazy"
      />
    );
  }
  if (attachment.kind === 'audio' && url) {
    return <audio controls src={url} className="h-9 w-full max-w-[260px]" preload="metadata" />;
  }
  return null;
}

export function AttachmentManager({
  letterId,
  attachments,
  onChange,
  disabled = false,
}: {
  letterId: string;
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      toast.error(t('attachment.failed', { name: `> ${MAX_ATTACHMENTS}` }));
      return;
    }
    setBusy(true);
    const next = [...attachments];
    for (const file of Array.from(files)) {
      const result = await saveAttachment(file, letterId);
      if ('error' in result) {
        const { reason } = result.error;
        if (reason === 'too-large') {
          toast.error(t('attachment.tooLarge', { name: result.error.file, size: formatBytes(MAX_FILE_SIZE) }));
        } else if (reason === 'bad-type') {
          toast.error(t('attachment.badType', { name: result.error.file }));
        } else if (reason === 'quota') {
          toast.error(t('attachment.quota'));
        } else {
          toast.error(t('attachment.failed', { name: result.error.file }));
        }
        continue;
      }
      next.push(result.attachment);
    }
    onChange(next);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const remove = async (attachment: Attachment) => {
    if (attachment.kind !== 'video-link' && attachment.blobKey) {
      await deleteAttachment(letterId, attachment);
    }
    onChange(attachments.filter((a) => a.id !== attachment.id));
    toast.success(t('attachment.removed'));
  };

  return (
    <div>
      {attachments.length > 0 && (
        <ul className="mb-3 space-y-2">
          {attachments.map((a) => {
            const Icon = KIND_ICON[a.kind] ?? FileIcon;
            return (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-lg border p-2.5"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <AttachmentPreview attachment={a} />
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                  style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  {a.kind === 'video-link' && a.externalUrl ? (
                    <a
                      href={a.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm underline-offset-2 hover:underline"
                    >
                      {a.name}
                    </a>
                  ) : (
                    <p className="truncate text-sm">{a.name}</p>
                  )}
                  <p className="mt-0.5 font-mono text-[0.6rem] text-muted">
                    {a.kind === 'video-link' ? t('attachment.videoLink') : formatBytes(a.size)}
                  </p>
                </div>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => void remove(a)}
                    className="btn btn-ghost h-9 w-9 !min-h-9 !px-0 text-muted hover:text-[#d06060]"
                    aria-label={t('attachment.remove')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!disabled && (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,audio/*,application/pdf,text/plain,text/markdown,.md,.txt,.csv"
            className="sr-only"
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy || attachments.length >= MAX_ATTACHMENTS}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-4 text-xs text-secondary transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50"
            style={{ borderColor: 'var(--border-strong)' }}
          >
            <Paperclip className="h-3.5 w-3.5" />
            <span className="text-center leading-relaxed">
              {busy ? t('common.loading') : t('attachment.drop')}
              <br />
              <span className="text-[0.65rem] text-muted">
                {t('attachment.hint', { size: formatBytes(MAX_FILE_SIZE) })}
              </span>
            </span>
          </button>
        </>
      )}
    </div>
  );
}

/** 视频外链小工具 */
export function VideoLinkEditor({
  links,
  onChange,
  disabled = false,
}: {
  links: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    if (!/^https?:\/\//i.test(value)) {
      toast.error(t('attachment.badType', { name: value }));
      return;
    }
    onChange([...links, value]);
    setDraft('');
  };

  return (
    <div>
      {links.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {links.map((link, i) => (
            <li
              key={`${link}-${i}`}
              className="flex items-center gap-2 rounded-md border px-2.5 py-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <Link2 className="h-3.5 w-3.5 shrink-0 text-muted" />
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-xs underline-offset-2 hover:underline"
              >
                {link}
              </a>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(links.filter((_, idx) => idx !== i))}
                  className="text-muted hover:text-[#d06060]"
                  aria-label={t('attachment.remove')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="flex gap-2">
          <input
            className="field flex-1 text-sm"
            placeholder="https://"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            inputMode="url"
          />
          <button type="button" className="btn btn-outline !min-h-[44px] shrink-0" onClick={add}>
            <Plus className="h-3.5 w-3.5" />
            {t('capsule.addLink')}
          </button>
        </div>
      )}
    </div>
  );
}
