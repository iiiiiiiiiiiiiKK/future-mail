import { useEffect, useRef, useState } from 'react';
import { Download, FileAudio, File as FileIcon, FileText, Image as ImageIcon, Link2 } from 'lucide-react';
import type { Attachment } from '@/types';
import { getBlob } from '@/services/attachments/attachments';
import { formatBytes, downloadBlob } from '@/utils/misc';
import { useI18n } from '@/i18n/useI18n';

const ICONS = {
  image: ImageIcon,
  audio: FileAudio,
  pdf: FileText,
  text: FileText,
  'video-link': Link2,
} as const;

/** 只读附件展示（已开启信件使用） */
export function AttachmentViewer({ attachments }: { attachments: Attachment[] }) {
  return (
    <ul className="space-y-2">
      {attachments.map((a) => (
        <AttachmentRow key={a.id} attachment={a} />
      ))}
    </ul>
  );
}

function AttachmentRow({ attachment }: { attachment: Attachment }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const revoked = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (attachment.kind === 'video-link' || !attachment.blobKey) return;
    void getBlob(attachment.blobKey).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setMissing(true);
        return;
      }
      const objectUrl = URL.createObjectURL(blob);
      revoked.current = objectUrl;
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (revoked.current) URL.revokeObjectURL(revoked.current);
    };
  }, [attachment.blobKey, attachment.kind]);

  const Icon = ICONS[attachment.kind] ?? FileIcon;

  const download = async () => {
    const blob = await getBlob(attachment.blobKey);
    if (blob) downloadBlob(blob, attachment.name);
  };

  return (
    <li
      className="rounded-lg border p-2.5"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          {attachment.kind === 'video-link' && attachment.externalUrl ? (
            <a
              href={attachment.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm underline-offset-2 hover:underline"
            >
              {attachment.name || attachment.externalUrl}
            </a>
          ) : (
            <p className="truncate text-sm">{attachment.name}</p>
          )}
          <p className="mt-0.5 font-mono text-[0.6rem] text-muted">
            {attachment.kind === 'video-link'
              ? t('attachment.videoLink')
              : missing
                ? t('attachment.failed', { name: attachment.name })
                : formatBytes(attachment.size)}
          </p>
        </div>
        {attachment.kind !== 'video-link' && url && !missing && (
          <a
            href={url}
            download={attachment.name}
            onClick={(e) => {
              e.preventDefault();
              void download();
            }}
            className="btn btn-ghost h-9 w-9 !min-h-9 !px-0"
            aria-label={t('letter.exported')}
          >
            <Download className="h-4 w-4" />
          </a>
        )}
      </div>

      {url && !missing && attachment.kind === 'image' && (
        <img
          src={url}
          alt={attachment.name}
          className="mt-2.5 max-h-80 w-full rounded-md object-contain"
          loading="lazy"
        />
      )}
      {url && !missing && attachment.kind === 'audio' && (
        <audio controls src={url} className="mt-2.5 w-full" preload="metadata" />
      )}
      {url && !missing && (attachment.kind === 'pdf' || attachment.kind === 'text') && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-xs text-secondary hover:text-[var(--accent)]"
        >
          <FileText className="h-3 w-3" />
          {t('attachment.openExternal')}
        </a>
      )}
    </li>
  );
}
