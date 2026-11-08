import type { ReactNode } from 'react';
import { AlertOctagon, HardDrive } from 'lucide-react';
import { useAppStore } from '@/stores/app';
import { useI18n } from '@/i18n/useI18n';

/**
 * 存储不可用时的明确拦截。
 * 绝不让用户在 IndexedDB 失效的情况下「以为」信件已经保存。
 */
export function StorageGuard({ children }: { children: ReactNode }) {
  const storage = useAppStore((s) => s.storage);
  const ready = useAppStore((s) => s.ready);
  const { t } = useI18n();

  if (!ready || !storage || storage.available) return <>{children}</>;

  const isQuota = storage.reason === 'quota';

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-16">
      <div className="surface max-w-lg rounded-2xl p-6 text-center sm:p-8">
        <span
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          {isQuota ? <HardDrive className="h-5 w-5" /> : <AlertOctagon className="h-5 w-5" />}
        </span>
        <h1 className="mt-4 text-xl">
          {isQuota ? t('storage.quota.title') : t('storage.blocked.title')}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-secondary">
          {isQuota ? t('storage.quota.body') : t('storage.blocked.body')}
        </p>
        {!isQuota && (
          <p className="mt-2 text-xs leading-relaxed text-muted">{t('storage.blocked.steps')}</p>
        )}
      </div>
    </div>
  );
}
