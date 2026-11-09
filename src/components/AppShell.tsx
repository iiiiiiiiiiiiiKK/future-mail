import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Archive,
  CalendarClock,
  Home,
  Menu,
  Moon,
  PenLine,
  Settings,
  Sun,
  X as XIcon,
} from 'lucide-react';
import { useAppStore } from '@/stores/app';
import { useI18n } from '@/i18n/useI18n';
import { AuthorXLink } from '@/components/AuthorXLink';
import { cn } from '@/utils/misc';
import type { TranslationKey } from '@/i18n/dictionary';

const NAV: Array<{ to: string; key: TranslationKey; icon: typeof Home }> = [
  { to: '/', key: 'nav.home', icon: Home },
  { to: '/compose', key: 'nav.compose', icon: PenLine },
  { to: '/capsule', key: 'nav.capsule', icon: CalendarClock },
  { to: '/timeline', key: 'nav.timeline', icon: CalendarClock },
  { to: '/archive', key: 'nav.archive', icon: Archive },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const theme = useAppStore((s) => s.settings.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const letters = useAppStore((s) => s.letters);
  const location = useLocation();

  /* 菜单状态与所在路径绑定：路由变化后自动回到关闭状态，无需 effect 同步 */
  const [menu, setMenu] = useState<{ open: boolean; path: string }>({
    open: false,
    path: location.pathname,
  });
  const menuOpen = menu.open && menu.path === location.pathname;

  const setMenuOpen = (open: boolean) =>
    setMenu({ open, path: location.pathname });

  const readyCount = letters.filter((l) => l.status === 'READY').length;

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'relative inline-flex min-h-[40px] items-center px-2.5 text-sm transition-colors',
      isActive ? 'text-[var(--text-primary)]' : 'text-secondary hover:text-[var(--text-primary)]',
    );

  return (
    <div className="relative z-10 flex min-h-[100dvh] flex-col">
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-xl"
        style={{
          borderColor: 'var(--border-subtle)',
          backgroundColor: 'color-mix(in srgb, var(--bg-app) 82%, transparent)',
        }}
      >
        <div className="container-page flex h-14 items-center gap-3 sm:h-16">
          {/* 品牌：min-h 保证移动端触控尺寸 */}
          <Link
            to="/"
            className="flex min-h-[44px] shrink-0 items-center gap-2"
            aria-label={t('brand.name')}
          >
            <span
              className="font-serif text-[0.95rem] font-semibold tracking-[0.22em] uppercase sm:text-base"
              style={{ color: 'var(--text-primary)' }}
            >
              Future Mail
            </span>
            <span className="hidden font-mono text-[0.6rem] tracking-[0.2em] text-muted sm:inline">
              {t('brand.cn')}
            </span>
          </Link>

          {/* 桌面导航 */}
          <nav className="ml-4 hidden items-center gap-0.5 lg:flex" aria-label="Primary">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={navLinkClass}>
                {t(item.key)}
                {item.to === '/archive' && readyCount > 0 && (
                  <span
                    className="ml-1.5 rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium"
                    style={{ backgroundColor: 'var(--accent)', color: '#191308' }}
                  >
                    {readyCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex-1" />

          {/* 右侧操作区 */}
          <div className="flex items-center gap-1.5">
            {/* 作者 X 链接：移动端显示图标，桌面端显示完整 handle */}
            <AuthorXLink variant="header" />

            <button
              type="button"
              onClick={() => void toggleTheme()}
              className="btn btn-ghost h-10 w-10 !min-h-10 !px-0"
              aria-label={t('common.theme')}
              title={t('common.theme')}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <Link
              to="/settings"
              className="btn btn-ghost hidden h-10 w-10 !min-h-10 !px-0 sm:inline-flex"
              aria-label={t('nav.settings')}
            >
              <Settings className="h-4 w-4" />
            </Link>

            <Link to="/compose" className="btn btn-primary hidden !min-h-10 md:inline-flex">
              {t('home.write')}
            </Link>

            <button
              type="button"
              className="btn btn-ghost h-10 w-10 !min-h-10 !px-0 lg:hidden"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              aria-label={t('nav.menu')}
            >
              {menuOpen ? <XIcon className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* 移动端下拉菜单 */}
        {menuOpen && (
          <div
            className="animate-fade-up border-t lg:hidden"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="container-page grid grid-cols-2 gap-1.5 py-3">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-[48px] items-center gap-2.5 rounded-lg border px-3 text-sm',
                      isActive ? 'border-[var(--accent)]' : '',
                    )
                  }
                  style={({ isActive }) => ({
                    borderColor: isActive ? 'var(--accent)' : 'var(--border-subtle)',
                    backgroundColor: isActive ? 'var(--accent-soft)' : 'transparent',
                  })}
                >
                  <item.icon className="h-4 w-4 opacity-70" />
                  {t(item.key)}
                </NavLink>
              ))}
              <NavLink
                to="/settings"
                className="flex min-h-[48px] items-center gap-2.5 rounded-lg border px-3 text-sm"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <Settings className="h-4 w-4 opacity-70" />
                {t('nav.settings')}
              </NavLink>
            </div>
            <div className="container-page flex items-center justify-between pb-3">
              <AuthorXLink variant="badge" />
              <span className="text-[0.65rem] text-muted">v1.0</span>
            </div>
          </div>
        )}
      </header>

      {/* 主内容：移动端为固定底部导航预留空间，避免内容被遮挡 */}
      <main className="flex-1 pb-[calc(56px+env(safe-area-inset-bottom,0px))] md:pb-0">
        {children}
      </main>

      {/* 移动端底部导航：固定贴住视口底部（sticky 会在短页面上浮到内容中间） */}
      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-xl md:hidden"
        style={{
          borderColor: 'var(--border-subtle)',
          backgroundColor: 'color-mix(in srgb, var(--bg-app) 92%, transparent)',
        }}
        aria-label="Mobile"
      >
        <div className="flex items-stretch justify-around">
          {[
            { to: '/', key: 'nav.home' as TranslationKey, icon: Home },
            { to: '/timeline', key: 'nav.timeline' as TranslationKey, icon: CalendarClock },
            { to: '/compose', key: 'nav.compose' as TranslationKey, icon: PenLine, primary: true },
            { to: '/archive', key: 'nav.archive' as TranslationKey, icon: Archive },
            { to: '/settings', key: 'nav.settings' as TranslationKey, icon: Settings },
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-[0.6rem] tracking-wide transition-colors',
                  isActive ? 'text-[var(--accent)]' : 'text-muted',
                )
              }
            >
              <item.icon className={cn('h-[18px] w-[18px]', item.primary && 'opacity-100')} />
              {t(item.key)}
            </NavLink>
          ))}
        </div>
      </nav>

      <footer
        className="border-t py-8"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="container-page flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-sm">
            <p className="font-serif text-sm tracking-[0.18em] uppercase">{t('brand.name')}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{t('brand.sub')}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{t('home.privacyNote')}</p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <AuthorXLink variant="footer" />
            <span className="font-mono text-[0.6rem] tracking-[0.2em] text-muted">
              LOCAL-FIRST · NO UPLOAD · v1.0.0
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
