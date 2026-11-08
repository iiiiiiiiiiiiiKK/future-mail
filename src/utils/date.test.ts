import { describe, expect, it } from 'vitest';
import {
  addMonthsClamped,
  addYearsClamped,
  calendarDaysBetween,
  countdownParts,
  daysUntil,
  fromDateInputValue,
  fromDateTimeLocalValue,
  humanizeRemaining,
  isValidFutureDate,
  offsetToDate,
  parseISO,
  toDateTimeLocalValue,
} from '@/utils/date';

describe('parseISO', () => {
  it('解析合法 ISO 字符串', () => {
    const d = parseISO('2031-11-08T00:00:00.000Z');
    expect(d?.toISOString()).toBe('2031-11-08T00:00:00.000Z');
  });

  it('对无效值返回 null 而不是 Invalid Date', () => {
    expect(parseISO('not-a-date')).toBeNull();
    expect(parseISO('')).toBeNull();
    expect(parseISO(undefined)).toBeNull();
    expect(parseISO(null)).toBeNull();
  });
});

describe('addMonthsClamped / addYearsClamped', () => {
  it('保留月末夹取语义（闰年 2 月 29 日 + 1 年）', () => {
    const base = new Date(2024, 1, 29, 12, 0, 0);
    const result = addYearsClamped(base, 1);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(1); // 2 月
    expect(result.getDate()).toBe(28);
  });

  it('1 月 31 日 + 1 个月 → 2 月末', () => {
    const base = new Date(2025, 0, 31, 9, 30);
    const result = addMonthsClamped(base, 1);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(28);
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(30);
  });

  it('普通情况保持原日期', () => {
    const base = new Date(2026, 10, 8, 15, 0);
    const result = addYearsClamped(base, 5);
    expect(result.getFullYear()).toBe(2031);
    expect(result.getMonth()).toBe(10);
    expect(result.getDate()).toBe(8);
  });

  it('10 年跨多个闰年不出错', () => {
    const base = new Date(2026, 10, 8);
    const result = addYearsClamped(base, 10);
    expect(result.getFullYear()).toBe(2036);
    expect(result.getMonth()).toBe(10);
    expect(result.getDate()).toBe(8);
  });
});

describe('offsetToDate', () => {
  const base = new Date(2026, 10, 8, 12, 0, 0);

  it('支持全部快捷选项', () => {
    expect(offsetToDate('1m', base).getMonth()).toBe(11);
    expect(offsetToDate('3m', base).getMonth()).toBe(1); // 2027-02
    expect(offsetToDate('1y', base).getFullYear()).toBe(2027);
    expect(offsetToDate('5y', base).getFullYear()).toBe(2031);
    expect(offsetToDate('10y', base).getFullYear()).toBe(2036);
  });
});

describe('isValidFutureDate', () => {
  it('拒绝过去时间', () => {
    const past = new Date(Date.now() - 86_400_000);
    expect(isValidFutureDate(past)).toBe(false);
  });

  it('接受一年后', () => {
    expect(isValidFutureDate(addYearsClamped(new Date(), 1))).toBe(true);
  });

  it('拒绝 30 秒内的「未来」时间（容差）', () => {
    expect(isValidFutureDate(new Date(Date.now() + 20_000))).toBe(false);
  });
});

describe('daysUntil / calendarDaysBetween', () => {
  it('按日历天计算，跨夏令时仍为整数', () => {
    const from = new Date(2026, 2, 1, 23, 0);
    const to = new Date(2026, 2, 3, 1, 0);
    expect(calendarDaysBetween(from, to)).toBe(2);
  });

  it('daysUntil 向上取整', () => {
    const from = new Date(2026, 0, 1, 0, 0, 0);
    const to = new Date(2026, 0, 2, 12, 0, 0);
    expect(daysUntil(to, from)).toBe(2);
  });
});

describe('humanizeRemaining', () => {
  const from = new Date(2026, 10, 8, 12, 0, 0);

  it('整年显示年', () => {
    const target = addYearsClamped(from, 5);
    expect(humanizeRemaining(target, from, 'zh')).toBe('5 年');
    expect(humanizeRemaining(target, from, 'en')).toBe('5y');
  });

  it('年 + 月', () => {
    const target = addMonthsClamped(from, 5 * 12 + 3);
    expect(humanizeRemaining(target, from, 'zh')).toBe('5 年 3 个月');
  });

  it('月级', () => {
    const target = addMonthsClamped(from, 3);
    expect(humanizeRemaining(target, from, 'zh')).toBe('3 个月');
  });

  it('天级', () => {
    const target = new Date(2026, 10, 20, 12, 0, 0);
    expect(humanizeRemaining(target, from, 'zh')).toContain('天');
  });

  it('过期后提示已到开启时间', () => {
    const target = new Date(2020, 0, 1);
    expect(humanizeRemaining(target, from, 'zh')).toBe('已到开启时间');
    expect(humanizeRemaining(target, from, 'en')).toBe('Ready to open');
  });
});

describe('countdownParts', () => {
  it('正确拆分天/时/分/秒', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const target = new Date('2026-01-02T03:04:05.000Z');
    const parts = countdownParts(target, from);
    expect(parts.expired).toBe(false);
    expect(parts.days).toBe(1);
    expect(parts.hours).toBe(3);
    expect(parts.minutes).toBe(4);
    expect(parts.seconds).toBe(5);
  });

  it('过期返回 expired', () => {
    const parts = countdownParts(new Date('2020-01-01'), new Date('2026-01-01'));
    expect(parts.expired).toBe(true);
  });
});

describe('datetime-local 往返转换', () => {
  it('保留本地时区时分，不因 UTC 偏移丢失小时', () => {
    const original = new Date(2031, 10, 8, 14, 35);
    const value = toDateTimeLocalValue(original);
    expect(value).toBe('2031-11-08T14:35');
    const parsed = fromDateTimeLocalValue(value);
    expect(parsed?.getHours()).toBe(14);
    expect(parsed?.getMinutes()).toBe(35);
  });

  it('无效输入返回 null', () => {
    expect(fromDateTimeLocalValue('')).toBeNull();
    expect(fromDateTimeLocalValue('xxx')).toBeNull();
  });
});

describe('fromDateInputValue', () => {
  it('按本地时区解析日期', () => {
    const d = fromDateInputValue('2031-11-08');
    expect(d?.getFullYear()).toBe(2031);
    expect(d?.getMonth()).toBe(10);
    expect(d?.getDate()).toBe(8);
  });

  it('格式错误返回 null', () => {
    expect(fromDateInputValue('2031/11/08')).toBeNull();
    expect(fromDateInputValue('')).toBeNull();
  });
});
