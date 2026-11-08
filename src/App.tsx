import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { applyTheme, useAppStore } from '@/stores/app';
import { AppShell } from '@/components/AppShell';
import { StorageGuard } from '@/components/StorageGuard';
import { HomePage } from '@/features/home/HomePage';
import { ComposePage } from '@/features/compose/ComposePage';
import { CapsulePage } from '@/features/capsule/CapsulePage';
import { TimelinePage } from '@/features/timeline/TimelinePage';
import { ArchivePage } from '@/features/archive/ArchivePage';
import { LetterPage } from '@/features/letters/LetterPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { ShareCardPage } from '@/features/sharing/ShareCardPage';
import { runReminderCheck } from '@/services/notifications/notifications';
import { dictionaries, type Lang } from '@/i18n/dictionary';

export default function App() {
  const init = useAppStore((s) => s.init);
  const ready = useAppStore((s) => s.ready);
  const theme = useAppStore((s) => s.settings.theme);
  const language = useAppStore((s) => s.settings.language);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);

  /* 到期检查：站内必然提示；浏览器通知仅在已授权时发送，且按天去重 */
  useEffect(() => {
    if (!ready) return;
    const dict = dictionaries[language as Lang] ?? dictionaries.zh;
    runReminderCheck((key) => dict[key]);
  }, [ready, language]);

  return (
    <>
      <StorageGuard>
        <AppShell>
          {ready ? (
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/compose" element={<ComposePage />} />
              <Route path="/compose/:id" element={<ComposePage />} />
              <Route path="/capsule" element={<CapsulePage />} />
              <Route path="/capsule/:id" element={<CapsulePage />} />
              <Route path="/timeline" element={<TimelinePage />} />
              <Route path="/archive" element={<ArchivePage />} />
              <Route path="/letter/:id" element={<LetterPage />} />
              <Route path="/letter/:id/share" element={<ShareCardPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          ) : (
            <div className="flex min-h-[60dvh] items-center justify-center">
              <span className="eyebrow animate-pulse">FUTURE MAIL</span>
            </div>
          )}
        </AppShell>
      </StorageGuard>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.875rem',
          },
        }}
      />
    </>
  );
}
