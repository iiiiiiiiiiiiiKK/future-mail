import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/i18n/useI18n';
import { useAppStore } from '@/stores/app';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AttachmentManager, VideoLinkEditor } from '@/features/attachments/AttachmentManager';
import { SchedulePicker } from '@/features/compose/SchedulePicker';
import { getCover } from '@/features/compose/themes';
import { generateSerial, insertLetter, newId, sealLetter } from '@/services/storage/letters';
import type { Attachment, Capsule, CapsuleTemplate, Letter } from '@/types';
import { DATA_VERSION } from '@/types';
import { formatDate, isValidFutureDate, offsetToDate, parseISO } from '@/utils/date';
import { countWords } from '@/utils/misc';

interface TemplateDef {
  id: CapsuleTemplate;
  zhTitle: string;
  enTitle: string;
  zhDesc: string;
  enDesc: string;
  offset: Parameters<typeof offsetToDate>[0];
  cover: string;
  recipientZh: string;
  recipientEn: string;
  questions: Array<{ id: string; zh: string; en: string; zhPlaceholder?: string }>;
}

const TEMPLATES: TemplateDef[] = [
  {
    id: 'one-year',
    zhTitle: '一年后的我',
    enTitle: 'Me, one year later',
    zhDesc: '一年不长，却足够改变很多事。',
    enDesc: 'A year is short, yet enough to change a lot.',
    offset: '1y',
    cover: 'aurora',
    recipientZh: '一年后的我',
    recipientEn: 'Me in a year',
    questions: [
      { id: 'now', zh: '今天的你在做什么？', en: 'What are you doing today?' },
      { id: 'goal', zh: '这一年的目标是什么？', en: 'What is your goal this year?' },
      { id: 'worry', zh: '现在最担心什么？', en: 'What worries you most?' },
      { id: 'promise', zh: '想对一年后的自己说什么？', en: 'A message for the you one year later?' },
    ],
  },
  {
    id: 'five-year',
    zhTitle: '五年后的我',
    enTitle: 'Me, five years later',
    zhDesc: '五年，是一个人生阶段。',
    enDesc: 'Five years is a whole chapter.',
    offset: '5y',
    cover: 'night',
    recipientZh: '五年后的我',
    recipientEn: 'Me in five years',
    questions: [
      { id: 'life', zh: '现在的生活是什么样子？', en: 'What does life look like now?' },
      { id: 'dream', zh: '五年后想成为什么样的人？', en: 'Who do you want to become?' },
      { id: 'fear', zh: '害怕失去什么？', en: 'What are you afraid of losing?' },
      { id: 'letter', zh: '写给五年后的自己', en: 'Letter to your self in five years' },
    ],
  },
  {
    id: 'ten-year',
    zhTitle: '十年后的我',
    enTitle: 'Me, ten years later',
    zhDesc: '十年后，你还会记得今天吗？',
    enDesc: 'Will you still remember today?',
    offset: '10y',
    cover: 'dusk',
    recipientZh: '十年后的我',
    recipientEn: 'Me in ten years',
    questions: [
      { id: 'world', zh: '现在的世界是什么样？', en: 'What is the world like now?' },
      { id: 'people', zh: '身边有哪些人？', en: 'Who is around you?' },
      { id: 'hope', zh: '希望十年后还记得什么？', en: 'What do you hope to still remember?' },
    ],
  },
  {
    id: 'today-life',
    zhTitle: '今天的生活',
    enTitle: "Today's life",
    zhDesc: '记录今天真实的样子。',
    enDesc: 'Record what today truly looks like.',
    offset: '1y',
    cover: 'parchment',
    recipientZh: '未来的我',
    recipientEn: 'Future me',
    questions: [
      { id: 'morning', zh: '今天早上做了什么？', en: 'What did you do this morning?' },
      { id: 'meal', zh: '今天吃了什么？', en: 'What did you eat today?' },
      { id: 'price', zh: '现在一杯咖啡多少钱？', en: 'How much is a coffee right now?' },
      { id: 'mood', zh: '今天心情如何？', en: 'How do you feel today?' },
      { id: 'sound', zh: '今天听到什么声音？', en: 'What sounds did you hear today?' },
    ],
  },
  {
    id: 'annual-review',
    zhTitle: '我的年度总结',
    enTitle: 'My year in review',
    zhDesc: '这一年的得与失。',
    enDesc: 'What you gained and lost this year.',
    offset: '1y',
    cover: 'ember',
    recipientZh: '明年的我',
    recipientEn: 'Me next year',
    questions: [
      { id: 'best', zh: '今年最好的事是什么？', en: 'The best thing this year?' },
      { id: 'worst', zh: '今年最难的事是什么？', en: 'The hardest thing this year?' },
      { id: 'learned', zh: '学到了什么？', en: 'What did you learn?' },
      { id: 'next', zh: '明年想做什么？', en: 'What do you want next year?' },
    ],
  },
  {
    id: 'future-child',
    zhTitle: '给未来孩子',
    enTitle: 'To a future child',
    zhDesc: '写给还没到来的你。',
    enDesc: 'For someone not here yet.',
    offset: '5y',
    cover: 'sea',
    recipientZh: '未来的孩子',
    recipientEn: 'My future child',
    questions: [
      { id: 'world-now', zh: '现在的世界是什么样？', en: 'What is the world like now?' },
      { id: 'us', zh: '我们现在的生活', en: 'Our life right now' },
      { id: 'wish', zh: '想对你说的话', en: 'What I want to tell you' },
      { id: 'hope', zh: '希望你成为什么样的人', en: 'Who I hope you become' },
    ],
  },
  {
    id: 'custom',
    zhTitle: '自定义时间胶囊',
    enTitle: 'Custom capsule',
    zhDesc: '自由组合你想留下的东西。',
    enDesc: 'Anything you want to keep.',
    offset: '1y',
    cover: 'night',
    recipientZh: '未来的我',
    recipientEn: 'Future me',
    questions: [
      { id: 'free', zh: '想留下的话', en: 'What you want to leave behind' },
    ],
  },
];

export function CapsulePage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const reloadLetters = useAppStore((s) => s.reloadLetters);

  const [template, setTemplate] = useState<TemplateDef | null>(null);
  const [title, setTitle] = useState('');
  const [recipient, setRecipient] = useState('未来的我');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [videoLinks, setVideoLinks] = useState<string[]>([]);
  const [scheduleAt, setScheduleAt] = useState(() => offsetToDate('1y').toISOString());
  const [confirmSeal, setConfirmSeal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [draftId] = useState(() => newId());

  const pick = (tpl: TemplateDef) => {
    setTemplate(tpl);
    setTitle(lang === 'zh' ? tpl.zhTitle : tpl.enTitle);
    setRecipient(lang === 'zh' ? tpl.recipientZh : tpl.recipientEn);
    setScheduleAt(offsetToDate(tpl.offset).toISOString());
    setAnswers({});
  };

  const scheduleDate = parseISO(scheduleAt) ?? new Date();

  const composedContent = useMemo(() => {
    if (!template) return '';
    const parts = template.questions
      .map((q) => {
        const value = answers[q.id]?.trim();
        if (!value) return null;
        return `## ${lang === 'zh' ? q.zh : q.en}\n\n${value}`;
      })
      .filter(Boolean);
    return parts.join('\n\n');
  }, [template, answers, lang]);

  const hasAnyContent =
    Boolean(composedContent.trim()) || attachments.length > 0 || videoLinks.length > 0;

  const handleSeal = async () => {
    if (!template) return;
    if (!isValidFutureDate(scheduleDate)) {
      toast.error(t('compose.invalidDate'));
      return;
    }
    if (!hasAnyContent) {
      toast.error(t('compose.needContent'));
      return;
    }
    setSaving(true);
    try {
      const createdAt = new Date().toISOString();
      const capsule: Capsule = {
        id: draftId,
        serial: generateSerial(createdAt),
        title: title.trim() || (lang === 'zh' ? template.zhTitle : template.enTitle),
        recipient,
        content: composedContent,
        createdAt,
        updatedAt: createdAt,
        scheduledOpenAt: scheduleAt,
        status: 'DRAFT',
        kind: 'future-self',
        cover: template.cover,
        tags: ['capsule'],
        attachments,
        mood: {},
        privacy: 'private',
        reminder: { enabled: false, daysBefore: 0 },
        replies: [],
        starred: false,
        origin: 'local',
        version: DATA_VERSION,
        isCapsule: true,
        template: template.id,
        answers,
        videoLinks,
      };
      await insertLetter(capsule as unknown as Letter);
      await sealLetter(capsule.id, scheduleAt);
      await reloadLetters();
      toast.success(t('compose.sealed'));
      navigate(`/letter/${capsule.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  /* ───── 模板选择 ───── */
  if (!template) {
    return (
      <div className="container-page py-8 sm:py-12">
        <div className="max-w-2xl">
          <span className="eyebrow">{t('capsule.title')}</span>
          <h1 className="mt-3 text-3xl sm:text-4xl">{t('capsule.title')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-secondary">{t('capsule.sub')}</p>
        </div>

        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((tpl) => {
            const theme = getCover(tpl.cover);
            return (
              <li key={tpl.id}>
                <button
                  type="button"
                  onClick={() => pick(tpl)}
                  className="surface group flex h-full w-full flex-col overflow-hidden rounded-xl text-left transition-transform hover:-translate-y-0.5"
                >
                  <div
                    className="flex h-24 items-end p-3"
                    style={{ background: theme.gradient }}
                  >
                    <span
                      className="font-mono text-[0.55rem] tracking-[0.2em] uppercase"
                      style={{ color: theme.accent }}
                    >
                      {tpl.id.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <p className="font-serif text-base">{lang === 'zh' ? tpl.zhTitle : tpl.enTitle}</p>
                    <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted">
                      {lang === 'zh' ? tpl.zhDesc : tpl.enDesc}
                    </p>
                    <span className="mt-3 inline-flex items-center gap-1 text-[0.68rem] text-secondary group-hover:text-[var(--accent)]">
                      {lang === 'zh' ? '开始' : 'Start'}
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  /* ───── 填写 ───── */
  return (
    <div className="container-page py-6 pb-24 sm:py-10">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-ghost h-9 w-9 !min-h-9 !px-0"
          onClick={() => setTemplate(null)}
          aria-label={t('common.back')}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-xl sm:text-2xl">
            {lang === 'zh' ? template.zhTitle : template.enTitle}
          </h1>
          <p className="mt-0.5 text-xs text-muted">{t('capsule.skippable')}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        <div className="min-w-0 space-y-4">
          <section className="surface rounded-xl p-4 sm:p-5">
            <div className="space-y-3">
              <div>
                <label className="eyebrow">{t('compose.letterTitle')}</label>
                <input
                  className="field mt-1.5 font-serif"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div>
                <label className="eyebrow">{t('compose.recipient')}</label>
                <input
                  className="field mt-1.5"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  maxLength={60}
                />
              </div>
            </div>
          </section>

          <section className="surface rounded-xl p-4 sm:p-5">
            <h2 className="eyebrow">{t('capsule.title')}</h2>
            <div className="mt-3 space-y-4">
              {template.questions.map((q) => (
                <div key={q.id}>
                  <label className="mb-1.5 block text-xs text-secondary" htmlFor={`q-${q.id}`}>
                    {lang === 'zh' ? q.zh : q.en}{' '}
                    <span className="text-muted">({t('common.optional')})</span>
                  </label>
                  <textarea
                    id={`q-${q.id}`}
                    className="field min-h-[86px] resize-y font-serif leading-relaxed"
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            {composedContent && (
              <p className="mt-3 font-mono text-[0.6rem] text-muted">
                {t('compose.words', { n: countWords(composedContent) })}
              </p>
            )}
          </section>

          <section className="surface rounded-xl p-4 sm:p-5">
            <h2 className="eyebrow">{t('capsule.media')}</h2>
            <div className="mt-3">
              <AttachmentManager
                letterId={draftId}
                attachments={attachments}
                onChange={setAttachments}
              />
            </div>
            <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
              <h3 className="eyebrow">{t('capsule.videoLinks')}</h3>
              <p className="mt-1 text-[0.65rem] text-muted">{t('capsule.videoLinksHint')}</p>
              <div className="mt-2">
                <VideoLinkEditor links={videoLinks} onChange={setVideoLinks} />
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="surface rounded-xl p-4">
            <h2 className="eyebrow">{t('compose.schedule')}</h2>
            <div className="mt-3">
              <SchedulePicker value={scheduleAt} onChange={setScheduleAt} />
            </div>
          </section>

          <section
            className="rounded-xl border p-4"
            style={{ borderColor: 'var(--border-subtle)', background: getCover(template.cover).gradient }}
          >
            <p
              className="font-mono text-[0.55rem] tracking-[0.2em] uppercase"
              style={{ color: getCover(template.cover).accent }}
            >
              TO: {recipient.toUpperCase()}
            </p>
            <p
              className="mt-2 font-serif text-base leading-snug"
              style={{ color: getCover(template.cover).accent }}
            >
              {title || '—'}
            </p>
            <p
              className="mt-3 font-mono text-[0.6rem] tabular-nums"
              style={{ color: getCover(template.cover).accent, opacity: 0.82 }}
            >
              OPEN: {formatDate(scheduleDate, lang, 'numeric')}
            </p>
          </section>

          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={() => setConfirmSeal(true)}
            disabled={saving || !hasAnyContent}
          >
            <Check className="h-4 w-4" />
            {saving ? t('common.loading') : t('compose.seal')}
          </button>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmSeal}
        title={t('compose.sealConfirmTitle')}
        body={t('compose.sealConfirmBody')}
        confirmLabel={t('compose.sealConfirmOk')}
        onCancel={() => setConfirmSeal(false)}
        onConfirm={() => void handleSeal()}
      />
    </div>
  );
}
