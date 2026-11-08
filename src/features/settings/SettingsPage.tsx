import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bell, BellOff, Download, Globe, HardDrive, Info, Moon, Sun, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app';
import { useI18n } from '@/i18n/useI18n';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AuthorXLink } from '@/components/AuthorXLink';
import { probeStorage, wipeAllData } from '@/services/storage/db';
import { downloadAllJson } from '@/services/export/export';
import { importFromFile, ImportError } from '@/services/import/import';
import {
  notificationPermission,
  requestNotificationPermission,
  showNotification,
} from '@/services/notifications/notifications';
import { formatBytes } from '@/utils/misc';

export function SettingsPage() {
  const { t, lang } = useI18n();
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const reloadLetters = useAppStore((s) => s.reloadLetters);
  const letters = useAppStore((s) => s.letters);

  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [permission, setPermission] = useState(() => notificationPermission());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void probeStorage().then((probe) => setUsage(probe.estimate ?? null));
  }, [letters.length]);

  const enableNotifications = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'granted') toast.success(t('settings.notificationsEnabled'));
    else if (result === 'denied') toast.error(t('settings.notificationsDenied'));
    else if (result === 'unsupported') toast.error(t('settings.notificationsUnsupported'));
  };

  const sendTest = () => {
    const ok = showNotification(t('notify.testTitle'), t('notify.testBody'));
    if (ok) toast.success(t('settings.notificationsTestSent'));
    else toast.error(t('settings.notificationsDenied'));
  };

  const handleExport = async (includeBlobs: boolean) => {
    try {
      await downloadAllJson(includeBlobs);
      await setSettings({ lastBackupAt: new Date().toISOString() });
      toast.success(t('settings.exportDone'));
    } catch {
      toast.error(t('settings.exportFailed'));
    }
  };

  const handleImport = async (file: File) => {
    try {
      const result = await importFromFile(file);
      await reloadLetters();
      toast.success(t('settings.importDone', { imported: result.imported, skipped: result.skipped }));
      if (result.errors.length > 0) {
        toast.message(`${result.errors.length} 条问题`, { description: result.errors[0] });
      }
    } catch (error) {
      if (error instanceof ImportError) {
        toast.error(`${t('settings.importFailed')}: ${error.message}`);
      } else {
        toast.error(t('settings.importFailed'));
      }
    }
  };

  const doWipe = async () => {
    await wipeAllData();
    await reloadLetters();
    setConfirmWipe(false);
    toast.success(t('settings.wiped'));
  };

  return (
    <div className="container-page max-w-3xl py-8 pb-20 sm:py-12">
      <span className="eyebrow">{t('nav.settings')}</span>
      <h1 className="mt-2 text-3xl sm:text-4xl">{t('settings.title')}</h1>
      <p className="mt-1.5 text-sm text-secondary">{t('settings.sub')}</p>

      <div className="mt-8 space-y-4">
        {/* 外观 */}
        <section className="surface rounded-xl p-4 sm:p-5">
          <h2 className="eyebrow">{t('settings.appearance')}</h2>

          <div className="mt-3 space-y-4">
            <div>
              <p className="mb-2 text-xs text-secondary">{t('settings.theme')}</p>
              <div className="flex gap-1.5">
                {(
                  [
                    ['light', t('settings.theme.light'), Sun],
                    ['dark', t('settings.theme.dark'), Moon],
                    ['system', t('settings.theme.system'), HardDrive],
                  ] as const
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    className="chip"
                    data-active={settings.theme === id}
                    onClick={() => void setSettings({ theme: id })}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs text-secondary">{t('settings.language')}</p>
              <div className="flex gap-1.5">
                {(
                  [
                    ['zh', '中文'],
                    ['en', 'English'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className="chip"
                    data-active={settings.language === id}
                    onClick={() => void setSettings({ language: id })}
                  >
                    <Globe className="h-3 w-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 提醒 */}
        <section className="surface rounded-xl p-4 sm:p-5">
          <h2 className="eyebrow">{t('settings.notifications')}</h2>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            {t('settings.notificationsDesc')}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {permission === 'granted' ? (
              <>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.62rem] font-mono uppercase tracking-[0.1em]"
                  style={{ color: '#4c9a6a', backgroundColor: 'rgba(76,154,106,0.16)' }}
                >
                  <Bell className="h-3 w-3" />
                  {t('settings.notificationsEnabled')}
                </span>
                <button type="button" className="btn btn-outline !min-h-9 text-xs" onClick={sendTest}>
                  {t('settings.notificationsTest')}
                </button>
              </>
            ) : permission === 'denied' ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.62rem] font-mono uppercase tracking-[0.1em]"
                style={{ color: '#b06a6a', backgroundColor: 'rgba(176,106,106,0.12)' }}
              >
                <BellOff className="h-3 w-3" />
                {t('settings.notificationsDenied')}
              </span>
            ) : permission === 'unsupported' ? (
              <span className="text-xs text-muted">{t('settings.notificationsUnsupported')}</span>
            ) : (
              <button type="button" className="btn btn-outline !min-h-9 text-xs" onClick={() => void enableNotifications()}>
                <Bell className="h-3.5 w-3.5" />
                {t('settings.notificationsEnable')}
              </button>
            )}
          </div>
        </section>

        {/* 数据 */}
        <section className="surface rounded-xl p-4 sm:p-5">
          <h2 className="eyebrow">{t('settings.data')}</h2>

          <div className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-secondary">{t('settings.storage')}</span>
              <span className="font-mono text-[0.62rem] tabular-nums text-muted">
                {usage
                  ? t('settings.storageUsage', {
                      used: formatBytes(usage.usage),
                      quota: formatBytes(usage.quota),
                    })
                  : t('settings.storageUnknown')}
              </span>
            </div>
            {usage && usage.quota > 0 && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--border-subtle)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (usage.usage / usage.quota) * 100)}%`,
                    backgroundColor: 'var(--accent)',
                  }}
                />
              </div>
            )}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn btn-outline !min-h-10 text-xs" onClick={() => void handleExport(true)}>
              <Download className="h-3.5 w-3.5" />
              {t('settings.exportAll')}
            </button>
            <button type="button" className="btn btn-outline !min-h-10 text-xs" onClick={() => void handleExport(false)}>
              <Download className="h-3.5 w-3.5" />
              {t('settings.exportNoBlobs')}
            </button>
            <button type="button" className="btn btn-outline !min-h-10 text-xs" onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              {t('settings.import')}
            </button>
            <button type="button" className="btn btn-danger !min-h-10 text-xs" onClick={() => setConfirmWipe(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              {t('settings.wipe')}
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImport(file);
              e.target.value = '';
            }}
          />

          {settings.lastBackupAt && (
            <p className="mt-2 font-mono text-[0.6rem] text-muted">
              LAST BACKUP · {new Date(settings.lastBackupAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}
            </p>
          )}
        </section>

        {/* 关于 */}
        <section className="surface rounded-xl p-4 sm:p-5">
          <h2 className="eyebrow">{t('settings.about')}</h2>
          <p className="mt-2 text-xs leading-relaxed text-secondary">{t('settings.aboutBody')}</p>
          <p
            className="mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-[0.68rem] leading-relaxed"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
          >
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t('settings.aboutEmail')}
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <AuthorXLink variant="badge" />
            <span className="font-mono text-[0.58rem] tracking-[0.16em] text-muted">
              FUTURE MAIL v1.0.0 · MIT
            </span>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={confirmWipe}
        title={t('settings.wipeConfirmTitle')}
        body={t('settings.wipeConfirmBody')}
        danger
        confirmLabel={t('settings.wipeOk')}
        onCancel={() => setConfirmWipe(false)}
        onConfirm={() => void doWipe()}
      >
        <div
          className="flex items-start gap-2 rounded-lg border p-2.5 text-[0.65rem] leading-relaxed"
          style={{ borderColor: 'rgba(190,70,70,0.4)', color: '#d06060' }}
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {lang === 'zh'
            ? `当前共 ${letters.length} 封本地信件将被永久删除。`
            : `${letters.length} local letters will be permanently deleted.`}
        </div>
      </ConfirmDialog>
    </div>
  );
}
