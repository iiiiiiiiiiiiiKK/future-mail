import { describe, expect, it } from 'vitest';
import { countWords, formatBytes, excerpt, cn } from '@/utils/misc';
import { interpolate } from '@/i18n/dictionary';
import { isValidEmail, isEmailConfigured, emailProvider } from '@/services/email/email';
import { lettersNeedingReminder } from '@/services/notifications/notifications';
import { canTransition } from '@/services/storage/letters';

describe('formatBytes', () => {
  it('格式化常见大小', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(8 * 1024 * 1024)).toBe('8 MB');
  });
});

describe('countWords', () => {
  it('统计中文按字，英文按词', () => {
    expect(countWords('你好世界')).toBe(4);
    expect(countWords('hello world')).toBe(2);
    expect(countWords('你好 hello')).toBe(3);
    expect(countWords('')).toBe(0);
  });
});

describe('excerpt', () => {
  it('去掉 Markdown 标记并截断', () => {
    expect(excerpt('# 标题\n\n**粗体**正文', 100)).toContain('标题');
    expect(excerpt('a'.repeat(200), 50).length).toBeLessThanOrEqual(51);
  });
});

describe('cn', () => {
  it('合并 class 并处理冲突', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-sm', false, undefined, 'font-bold')).toContain('font-bold');
  });
});

describe('interpolate', () => {
  it('替换命名占位符', () => {
    expect(interpolate('共 {n} 封', { n: 3 })).toBe('共 3 封');
    expect(interpolate('无占位符')).toBe('无占位符');
  });

  it('缺少变量时保留原样', () => {
    expect(interpolate('{missing}', {})).toBe('{missing}');
  });
});

describe('邮件模块（未配置状态）', () => {
  it('明确报告未配置，不伪造成功', async () => {
    expect(isEmailConfigured()).toBe(false);
    const result = await emailProvider.send({
      to: 'a@b.com',
      subject: 's',
      body: 'b',
      idempotencyKey: 'k',
    });
    expect(result.status).toBe('not-configured');
    expect(result.message).not.toMatch(/已发送|sent successfully/i);
  });

  it('邮箱格式校验', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('bad@@b.com')).toBe(false);
    expect(isValidEmail('no-at-sign')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('提醒计算', () => {
  it('未到期且未开启提醒时不产生提醒', () => {
    const result = lettersNeedingReminder();
    expect(result.due).toEqual([]);
    expect(result.upcoming).toEqual([]);
  });
});

describe('状态机不允许的转换', () => {
  it('OPENED 不能回到 SEALED', () => {
    expect(canTransition('OPENED', 'SEALED')).toBe(false);
  });
  it('CANCELLED 不能开启', () => {
    expect(canTransition('CANCELLED', 'OPENED')).toBe(false);
  });
});
