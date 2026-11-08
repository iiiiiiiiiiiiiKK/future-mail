/**
 * 提醒服务
 * 明确区分：
 *  1) 站内提醒：打开网站时按到期日期展示（始终可用）
 *  2) 浏览器通知：需用户主动授权，且网站关闭后不能保证送达
 * 不承诺任何邮件投递（当前版本未接入邮件服务，接口已预留）。
 */

import { useAppStore } from '@/stores/app';
import { saveSettings } from '@/services/storage/db';
import { parseISO } from '@/utils/date';

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  const result = await Notification.requestPermission();
  await saveSettings({ notificationsAsked: true, notificationsEnabled: result === 'granted' });
  return result;
}

export function showNotification(title: string, body: string): boolean {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  try {
    const n = new Notification(title, {
      body,
      tag: 'future-mail-due',
      icon: './favicon.svg',
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

/**
 * 计算「应该提醒」的信件：
 * - 已到期的 SEALED/READY
 * - 处于提醒窗口内的 SEALED（daysBefore）
 */
export function lettersNeedingReminder(): {
  due: string[];
  upcoming: Array<{ id: string; days: number }>;
} {
  const letters = useAppStore.getState().letters;
  const now = Date.now();
  const due: string[] = [];
  const upcoming: Array<{ id: string; days: number }> = [];

  for (const letter of letters) {
    const open = parseISO(letter.scheduledOpenAt);
    if (!open) continue;
    const diffDays = (open.getTime() - now) / 86_400_000;

    if (letter.status === 'READY' || (letter.status === 'SEALED' && diffDays <= 0)) {
      due.push(letter.id);
      continue;
    }
    if (
      letter.status === 'SEALED' &&
      letter.reminder.enabled &&
      diffDays > 0 &&
      diffDays <= letter.reminder.daysBefore
    ) {
      upcoming.push({ id: letter.id, days: Math.ceil(diffDays) });
    }
  }

  return { due, upcoming };
}

/** 会话级去重：同一天同一封信只通知一次 */
const NOTIFIED_KEY = 'future-mail:notified';

function loadNotified(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function saveNotified(map: Record<string, string>): void {
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(map));
  } catch {
    /* localStorage 不可用时忽略：通知只是便利功能 */
  }
}

/**
 * 页面加载时调用一次：
 * 对到期信件发浏览器通知（若已授权），并按天去重。
 */
export function runReminderCheck(t: (key: 'notify.due.title' | 'notify.due.body') => string): void {
  const { due } = lettersNeedingReminder();
  if (due.length === 0) return;

  const today = new Date().toISOString().slice(0, 10);
  const notified = loadNotified();
  const fresh = due.filter((id) => notified[id] !== today);
  if (fresh.length === 0) return;

  const shown = showNotification(t('notify.due.title'), t('notify.due.body'));
  if (shown) {
    for (const id of fresh) notified[id] = today;
    saveNotified(notified);
  }
}
