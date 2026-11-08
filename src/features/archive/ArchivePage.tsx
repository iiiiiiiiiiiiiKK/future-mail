import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpDown,
  Download,
  PenLine,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app';
import { useI18n } from '@/i18n/useI18n';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { StatusBadge } from '@/components/StatusBadge';
import { Countdown } from '@/components/Countdown';
import { isCapsule } from '@/services/storage/letters';
import { deleteLetter } from '@/services/storage/letters';
import { downloadAllJson } from '@/services/export/export';
import { importFromFile, ImportError } from '@/services/import/import';
import type { Letter, LetterStatus } from '@/types';
import { formatDate, parseISO } from '@/utils/date';
import { cn, excerpt } from '@/utils/misc';
import { getCover } from '@/features/compose/themes';

type Tab = 'all' | 'draft' | 'sealed' | 'ready' | 'opened' | 'capsule' | 'replies';
type SortKey = 'createdDesc' | 'createdAsc' | 'openAsc' | 'openDesc' | 'titleAsc';

const TAB_STATUS: Record<Exclude<Tab, 'all' | 'capsule' | 'replies'>, LetterStatus> = {
  draft: 'DRAFT',
  sealed: 'SEALED',
  ready: 'READY',
  opened: 'OPENED',
};

export function ArchivePage() {
  const letters = useAppStore((s) => s.letters);
  const reloadLetters = useAppStore((s) => s.reloadLetters);
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('createdDesc');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [recipientFilter, setRecipientFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Letter | null>(null);

  const years = useMemo(() => {
    const set = new Set<string>();
    for (const l of letters) {
      const d = parseISO(l.createdAt);
      if (d) set.add(String(d.getFullYear()));
    }
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [letters]);

  const recipients = useMemo(
    () => Array.from(new Set(letters.map((l) => l.recipient).filter(Boolean))).sort(),
    [letters],
  );

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const l of letters) for (const tag of l.tags) set.add(tag);
    return Array.from(set).sort();
  }, [letters]);

  const counts = useMemo(() => {
    const base = { all: letters.length, draft: 0, sealed: 0, ready: 0, opened: 0, capsule: 0, replies: 0 };
    for (const l of letters) {
      if (l.status === 'DRAFT') base.draft += 1;
      if (l.status === 'SEALED') base.sealed += 1;
      if (l.status === 'READY') base.ready += 1;
      if (l.status === 'OPENED') base.opened += 1;
      if (isCapsule(l)) base.capsule += 1;
      if (l.replyTo) base.replies += 1;
    }
    return base;
  }, [letters]);

  const filtered = useMemo(() => {
    let list = letters.slice();

    if (tab !== 'all') {
      if (tab === 'capsule') list = list.filter((l) => isCapsule(l));
      else if (tab === 'replies') list = list.filter((l) => Boolean(l.replyTo));
      else list = list.filter((l) => l.status === TAB_STATUS[tab]);
    }

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          l.content.toLowerCase().includes(q) ||
          l.recipient.toLowerCase().includes(q) ||
          l.serial.toLowerCase().includes(q),
      );
    }

    if (yearFilter !== 'all') {
      list = list.filter((l) => (parseISO(l.createdAt)?.getFullYear() ?? 0) === Number(yearFilter));
    }
    if (recipientFilter !== 'all') list = list.filter((l) => l.recipient === recipientFilter);
    if (tagFilter !== 'all') list = list.filter((l) => l.tags.includes(tagFilter));

    switch (sort) {
      case 'createdDesc':
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'createdAsc':
        list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case 'openAsc':
        list.sort((a, b) => new Date(a.scheduledOpenAt).getTime() - new Date(b.scheduledOpenAt).getTime());
        break;
      case 'openDesc':
        list.sort((a, b) => new Date(b.scheduledOpenAt).getTime() - new Date(a.scheduledOpenAt).getTime());
        break;
      case 'titleAsc':
        list.sort((a, b) => a.title.localeCompare(b.title, lang === 'zh' ? 'zh-CN' : 'en'));
        break;
    }
    return list;
  }, [letters, tab, query, yearFilter, recipientFilter, tagFilter, sort, lang]);

  const hasFilters =
    query.trim() !== '' ||
    yearFilter !== 'all' ||
    recipientFilter !== 'all' ||
    tagFilter !== 'all';

  const clearFilters = () => {
    setQuery('');
    setYearFilter('all');
    setRecipientFilter('all');
    setTagFilter('all');
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    await deleteLetter(deleteTarget.id);
    await reloadLetters();
    setDeleteTarget(null);
    toast.success(t('common.saved'));
  };

  const handleExport = async () => {
    try {
      await downloadAllJson(true);
      toast.success(t('settings.exportDone'));
    } catch {
      toast.error(t('settings.exportFailed'));
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const result = await importFromFile(file);
        await reloadLetters();
        toast.success(t('settings.importDone', { imported: result.imported, skipped: result.skipped }));
      } catch (error) {
        if (error instanceof ImportError) {
          toast.error(`${t('settings.importFailed')}: ${error.message}`);
        } else {
          toast.error(t('settings.importFailed'));
        }
      }
    };
    input.click();
  };

  const TABS: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'all', label: t('archive.tab.all'), count: counts.all },
    { id: 'draft', label: t('archive.tab.draft'), count: counts.draft },
    { id: 'sealed', label: t('archive.tab.sealed'), count: counts.sealed },
    { id: 'ready', label: t('archive.tab.ready'), count: counts.ready },
    { id: 'opened', label: t('archive.tab.opened'), count: counts.opened },
    { id: 'capsule', label: t('archive.tab.capsule'), count: counts.capsule },
    { id: 'replies', label: t('archive.tab.replies'), count: counts.replies },
  ];

  return (
    <div className="container-page py-8 pb-20 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">{t('nav.archive')}</span>
          <h1 className="mt-2 text-3xl sm:text-4xl">{t('archive.title')}</h1>
          <p className="mt-1.5 text-sm text-secondary">{t('archive.sub')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/compose" className="btn btn-primary !min-h-10 text-xs sm:text-sm">
            <PenLine className="h-3.5 w-3.5" />
            {t('archive.newLetter')}
          </Link>
          <button type="button" className="btn btn-outline !min-h-10 text-xs sm:text-sm" onClick={() => void handleExport()}>
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('archive.export')}</span>
          </button>
          <button type="button" className="btn btn-outline !min-h-10 text-xs sm:text-sm" onClick={handleImport}>
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('archive.import')}</span>
          </button>
        </div>
      </div>

      {/* 页签 */}
      <div className="mt-6 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1.5 pb-1" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
                tab === item.id ? 'text-[var(--text-primary)]' : 'text-muted',
              )}
              style={{
                borderColor: tab === item.id ? 'var(--accent)' : 'var(--border-subtle)',
                backgroundColor: tab === item.id ? 'var(--accent-soft)' : 'transparent',
              }}
            >
              {item.label}
              {item.count > 0 && (
                <span className="font-mono text-[0.58rem] tabular-nums opacity-70">{item.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 搜索 + 筛选 */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            className="field pl-9 text-sm"
            placeholder={t('archive.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-[var(--text-primary)]"
              aria-label={t('common.close')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          className="btn btn-outline !min-h-[44px] shrink-0 text-xs"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {t('archive.sort')}
        </button>
      </div>

      {showFilters && (
        <div
          className="mt-2 grid gap-2 rounded-lg border p-3 sm:grid-cols-4"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <label className="block">
            <span className="eyebrow">{t('archive.sort')}</span>
            <select className="field mt-1 text-xs" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="createdDesc">{t('archive.sort.createdDesc')}</option>
              <option value="createdAsc">{t('archive.sort.createdAsc')}</option>
              <option value="openAsc">{t('archive.sort.openAsc')}</option>
              <option value="openDesc">{t('archive.sort.openDesc')}</option>
              <option value="titleAsc">{t('archive.sort.titleAsc')}</option>
            </select>
          </label>

          <label className="block">
            <span className="eyebrow">{t('archive.filterYear')}</span>
            <select className="field mt-1 text-xs" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
              <option value="all">{t('archive.all')}</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="eyebrow">{t('archive.filterRecipient')}</span>
            <select
              className="field mt-1 text-xs"
              value={recipientFilter}
              onChange={(e) => setRecipientFilter(e.target.value)}
            >
              <option value="all">{t('archive.all')}</option>
              {recipients.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="eyebrow">{t('archive.filterTag')}</span>
            <select className="field mt-1 text-xs" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
              <option value="all">{t('archive.all')}</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>#{tag}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="font-mono text-[0.62rem] tracking-[0.1em] text-muted">
          {t('archive.count', { n: filtered.length })}
        </p>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-[0.68rem] text-secondary hover:text-[var(--accent)]"
          >
            <ArrowUpDown className="h-3 w-3" />
            {t('archive.clearFilters')}
          </button>
        )}
      </div>

      {/* 列表 */}
      {filtered.length === 0 ? (
        <div className="mt-10 flex flex-col items-center py-16 text-center">
          <p className="text-sm text-muted">{hasFilters ? t('archive.emptyFiltered') : t('archive.empty')}</p>
          {!hasFilters && (
            <Link to="/compose" className="btn btn-outline mt-5">
              {t('archive.newLetter')}
            </Link>
          )}
        </div>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((letter) => {
            const cover = getCover(letter.cover);
            return (
              <li key={letter.id}>
                <div className="surface group relative flex h-full flex-col overflow-hidden rounded-xl transition-all hover:-translate-y-0.5">
                  <Link
                    to={letter.status === 'DRAFT' ? `/compose/${letter.id}` : `/letter/${letter.id}`}
                    className="flex flex-1 flex-col p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge status={letter.status} size="sm" />
                      <span className="font-mono text-[0.56rem] tracking-[0.08em] text-muted">
                        {letter.serial}
                      </span>
                    </div>

                    <div className="mt-3 flex items-start gap-2">
                      <span
                        className="mt-0.5 h-8 w-1 shrink-0 rounded-full"
                        style={{ background: cover.gradient }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 font-serif text-base leading-snug">
                          {letter.title || '—'}
                        </p>
                        <p className="mt-1 truncate text-[0.68rem] text-muted">
                          {t('compose.writeTo')} {letter.recipient}
                        </p>
                      </div>
                    </div>

                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">
                      {letter.status === 'SEALED' || letter.status === 'READY'
                        ? t('letter.sealedNotice')
                        : excerpt(letter.content, 80) || '—'}
                    </p>

                    <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                      <span className="font-mono text-[0.6rem] tabular-nums text-muted">
                        {formatDate(letter.scheduledOpenAt, lang, 'numeric')}
                      </span>
                      {letter.status === 'SEALED' || letter.status === 'READY' ? (
                        <Countdown target={letter.scheduledOpenAt} compact />
                      ) : (
                        <span className="font-mono text-[0.58rem] text-muted">
                          {formatDate(letter.createdAt, lang, 'numeric')}
                        </span>
                      )}
                    </div>

                    {letter.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {letter.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="font-mono text-[0.55rem] text-muted">#{tag}</span>
                        ))}
                      </div>
                    )}
                  </Link>

                  <button
                    type="button"
                    onClick={() => setDeleteTarget(letter)}
                    className="absolute right-2 top-2 rounded-md p-1.5 text-muted opacity-0 transition-opacity hover:bg-[rgba(190,70,70,0.12)] hover:text-[#d06060] focus-visible:opacity-100 group-hover:opacity-100"
                    aria-label={t('letter.delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('letter.deleteConfirmTitle')}
        body={t('letter.deleteConfirmBody')}
        danger
        confirmLabel={t('common.delete')}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void doDelete()}
      />

      {/* 点击卡片区域外的快捷入口 */}
      <div className="mt-10 flex justify-center">
        <button
          type="button"
          onClick={() => navigate('/timeline')}
          className="text-xs text-secondary hover:text-[var(--accent)]"
        >
          {t('timeline.title')}
        </button>
      </div>
    </div>
  );
}
