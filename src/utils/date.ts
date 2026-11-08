/**
 * 日期与时间工具
 * 全部使用真实日历计算（不是「固定天数代替年份」），
 * 内部以 ISO 8601 字符串存储，展示时转为本地时区。
 */

import { differenceInCalendarDays, differenceInCalendarMonths, format } from 'date-fns';

export const MS_PER_DAY = 86_400_000;

/** 解析为 Date；无效返回 null，避免 NaN 污染后续比较 */
export function parseISO(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function toISO(d: Date): string {
  return d.toISOString();
}

/**
 * 按「年 / 月」推进日期，保留月末夹取语义。
 * 例：2024-02-29 + 1 年 → 2025-02-28（不是 2025-03-01）。
 */
export function addMonthsClamped(base: Date, months: number): Date {
  const result = new Date(base.getTime());
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const daysInTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(day, daysInTargetMonth));
  return result;
}

export function addYearsClamped(base: Date, years: number): Date {
  return addMonthsClamped(base, years * 12);
}

/** 剩余天数（向上取整，负数代表已过期天数） */
export function daysUntil(target: Date, from: Date = new Date()): number {
  return Math.ceil((target.getTime() - from.getTime()) / MS_PER_DAY);
}

/** 日历天数差，用于「相隔 N 天」展示 */
export function calendarDaysBetween(from: Date, to: Date): number {
  return Math.abs(differenceInCalendarDays(to, from));
}

/**
 * 人类可读的剩余时间：优先按真实月/年差显示。
 * 例如「5 年 3 个月」「12 天」「3 小时」。
 */
export function humanizeRemaining(
  target: Date,
  from: Date = new Date(),
  locale: 'zh' | 'en' = 'zh',
): string {
  const diff = target.getTime() - from.getTime();
  if (diff <= 0) {
    return locale === 'zh' ? '已到开启时间' : 'Ready to open';
  }

  const months = differenceInCalendarMonths(target, from);
  if (months >= 12) {
    const years = Math.floor(months / 12);
    const restMonths = months % 12;
    if (locale === 'zh') {
      return restMonths > 0 ? `${years} 年 ${restMonths} 个月` : `${years} 年`;
    }
    return restMonths > 0 ? `${years}y ${restMonths}mo` : `${years}y`;
  }
  if (months >= 1) {
    const restDays = differenceInCalendarDays(target, addMonthsClamped(from, months));
    if (locale === 'zh') {
      return restDays > 0 ? `${months} 个月 ${restDays} 天` : `${months} 个月`;
    }
    return restDays > 0 ? `${months}mo ${restDays}d` : `${months}mo`;
  }

  const days = Math.max(0, differenceInCalendarDays(target, from));
  if (days >= 1) {
    return locale === 'zh' ? `${days} 天` : `${days}d`;
  }

  const hours = Math.max(1, Math.ceil(diff / 3_600_000));
  return locale === 'zh' ? `${hours} 小时` : `${hours}h`;
}

/** 精确倒计时：日 / 时 / 分 / 秒 */
export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

export function countdownParts(target: Date, from: Date = new Date()): CountdownParts {
  const diff = target.getTime() - from.getTime();
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    expired: false,
  };
}

/** 本地化日期格式（跟随用户时区） */
export function formatDate(
  value: string | Date,
  locale: 'zh' | 'en' = 'zh',
  style: 'short' | 'long' | 'numeric' = 'short',
): string {
  const d = value instanceof Date ? value : parseISO(value);
  if (!d) return '—';
  const pattern =
    style === 'long'
      ? locale === 'zh'
        ? 'yyyy 年 M 月 d 日 HH:mm'
        : 'MMMM d, yyyy HH:mm'
      : style === 'numeric'
        ? 'yyyy.MM.dd'
        : locale === 'zh'
          ? 'yyyy 年 M 月 d 日'
          : 'MMM d, yyyy';
  return format(d, pattern);
}

/**
 * `datetime-local` 输入框使用本地时区的朴素格式。
 * 不能直接 `toISOString()` 截断，否则会用 UTC 冒充本地时间。
 */
export function toDateTimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** 将 `datetime-local` 的值按本地时区解释为 Date */
export function fromDateTimeLocalValue(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 用于日期输入框（yyyy-MM-dd） */
export function toDateInputValue(d: Date): string {
  return toDateTimeLocalValue(d).slice(0, 10);
}

export function fromDateInputValue(value: string): Date | null {
  if (!value) return null;
  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 快捷开启日期选项 */
export type QuickOffset = '1m' | '3m' | '6m' | '1y' | '3y' | '5y' | '10y';

export function offsetToDate(offset: QuickOffset, base: Date = new Date()): Date {
  switch (offset) {
    case '1m':
      return addMonthsClamped(base, 1);
    case '3m':
      return addMonthsClamped(base, 3);
    case '6m':
      return addMonthsClamped(base, 6);
    case '1y':
      return addYearsClamped(base, 1);
    case '3y':
      return addYearsClamped(base, 3);
    case '5y':
      return addYearsClamped(base, 5);
    case '10y':
      return addYearsClamped(base, 10);
    default:
      return addYearsClamped(base, 1);
  }
}

/** 是否是可接受的未来开启时间（必须晚于当前时间，留 60 秒容差） */
export function isValidFutureDate(d: Date, from: Date = new Date()): boolean {
  return d.getTime() > from.getTime() + 60_000;
}

/** 生成 yyyyMMdd 形式的时间戳片段，用于文件命名 */
export function stampForFilename(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
