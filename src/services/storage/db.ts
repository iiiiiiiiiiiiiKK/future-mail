/**
 * IndexedDB 存储层（Dexie）
 * Local-first：所有信件与附件只保存在当前浏览器设备中。
 * 不进行任何网络上传。
 */

import Dexie, { type EntityTable } from 'dexie';
import type {
  AppSettings,
  AttachmentBlob,
  Letter,
  ExportBundle,
} from '@/types';
import { DATA_VERSION } from '@/types';

export interface MetaRow {
  key: string;
  value: unknown;
}

class FutureMailDB extends Dexie {
  letters!: EntityTable<Letter, 'id'>;
  blobs!: EntityTable<AttachmentBlob, 'key'>;
  settings!: EntityTable<AppSettings, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;

  constructor() {
    super('future-mail');
    this.version(1).stores({
      letters: 'id, serial, status, scheduledOpenAt, createdAt, updatedAt, *tags, replyTo, starred',
      blobs: 'key, letterId',
      settings: 'id',
      meta: 'key',
    });
  }
}

export const db = new FutureMailDB();

/** 存储可用性检测 —— 隐私模式、配额耗尽等情况需要显式告知用户 */
export interface StorageProbe {
  available: boolean;
  reason?: 'no-indexeddb' | 'blocked' | 'quota';
  estimate?: { usage: number; quota: number };
}

export async function probeStorage(): Promise<StorageProbe> {
  if (typeof indexedDB === 'undefined') {
    return { available: false, reason: 'no-indexeddb' };
  }
  try {
    await db.open();
    let estimate: StorageProbe['estimate'];
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      estimate = { usage: e.usage ?? 0, quota: e.quota ?? 0 };
    }
    return { available: true, estimate };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/quota/i.test(message)) return { available: false, reason: 'quota' };
    return { available: false, reason: 'blocked' };
  }
}

export async function loadSettings(): Promise<AppSettings> {
  const existing = await db.settings.get('app');
  if (existing) return existing;
  const defaults = defaultSettings();
  await db.settings.put(defaults);
  return defaults;
}

export function defaultSettings(): AppSettings {
  return {
    id: 'app',
    language: 'zh',
    theme: 'dark',
    onboarded: false,
    notificationsAsked: false,
    notificationsEnabled: false,
  };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const next = { ...current, ...patch, id: 'app' as const };
  await db.settings.put(next);
  return next;
}

/** 数据版本记录，用于未来迁移 */
export async function getDataVersion(): Promise<number> {
  const row = await db.meta.get('dataVersion');
  return typeof row?.value === 'number' ? row.value : DATA_VERSION;
}

export async function setDataVersion(version: number): Promise<void> {
  await db.meta.put({ key: 'dataVersion', value: version });
}

/** 一次性清空全部本地数据（用户主动删除） */
export async function wipeAllData(): Promise<void> {
  await db.transaction('rw', db.letters, db.blobs, db.settings, db.meta, async () => {
    await db.letters.clear();
    await db.blobs.clear();
    await db.meta.clear();
    await db.settings.clear();
  });
}

export async function buildExportBundle(includeBlobs: boolean): Promise<ExportBundle> {
  const letters = await db.letters.toArray();
  const bundle: ExportBundle = {
    app: 'future-mail',
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    letters,
  };
  if (includeBlobs) {
    const blobs = await db.blobs.toArray();
    bundle.blobs = await Promise.all(
      blobs.map(async (b) => ({
        key: b.key,
        letterId: b.letterId,
        mimeType: b.mimeType,
        name: b.name,
        size: b.size,
        base64: await blobToBase64(b.blob),
      })),
    );
  }
  return bundle;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('读取附件失败'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('读取附件失败'));
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}
