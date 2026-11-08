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

    /**
     * v2：附件二进制从 Blob 改为 ArrayBuffer。
     * WebKit 无法可靠地把 Blob 结构化克隆进 IndexedDB，导致 iOS 上附件静默丢失。
     * 这里把历史遗留的 Blob 行迁移为 ArrayBuffer，避免老数据读不出来。
     */
    this.version(2)
      .stores({
        letters: 'id, serial, status, scheduledOpenAt, createdAt, updatedAt, *tags, replyTo, starred',
        blobs: 'key, letterId',
        settings: 'id',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        const legacy = (await tx.table('blobs').toArray()) as Array<
          Record<string, unknown> & { key: string }
        >;
        for (const row of legacy) {
          if (row.data || !row.blob) continue;
          const oldBlob = row.blob;
          if (typeof Blob !== 'undefined' && oldBlob instanceof Blob) {
            const data = await oldBlob.arrayBuffer();
            await tx.table('blobs').put({ ...row, data, blob: undefined });
          }
        }
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
    bundle.blobs = blobs.map((b) => ({
      key: b.key,
      letterId: b.letterId,
      mimeType: b.mimeType,
      name: b.name,
      size: b.size,
      base64: arrayBufferToBase64(b.data),
    }));
  }
  return bundle;
}

/** ArrayBuffer → base64（不依赖 FileReader，同步可靠） */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** base64 → ArrayBuffer */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then(arrayBufferToBase64);
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  return new Blob([base64ToArrayBuffer(base64)], { type: mimeType });
}
