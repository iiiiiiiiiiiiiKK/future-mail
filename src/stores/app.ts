/**
 * 全局应用状态（Zustand）
 * 只保存「已从 IndexedDB 读取」的数据快照与 UI 设置；
 * 任何写入都先写库再刷新快照，避免内存与磁盘不一致。
 */

import { create } from 'zustand';
import type { AppSettings, Letter } from '@/types';
import {
  defaultSettings,
  db,
  loadSettings,
  probeStorage,
  saveSettings,
  type StorageProbe,
} from '@/services/storage/db';
import { listLetters, refreshDueLetters } from '@/services/storage/letters';

interface AppState {
  ready: boolean;
  storage: StorageProbe | null;
  settings: AppSettings;
  letters: Letter[];
  /** 本次会话中点开过的信件 id（用于首页「最近」） */
  lastVisitedId: string | null;

  init: () => Promise<void>;
  reloadLetters: () => Promise<void>;
  setSettings: (patch: Partial<AppSettings>) => Promise<void>;
  setLastVisited: (id: string | null) => void;
  toggleTheme: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  storage: null,
  settings: defaultSettings(),
  letters: [],
  lastVisitedId: null,

  init: async () => {
    const storage = await probeStorage();
    if (!storage.available) {
      set({ ready: true, storage });
      return;
    }
    const settings = await loadSettings();
    await refreshDueLetters();
    const letters = await listLetters();
    set({ ready: true, storage, settings, letters });
  },

  reloadLetters: async () => {
    await refreshDueLetters();
    const letters = await listLetters();
    set({ letters });
  },

  setSettings: async (patch) => {
    const next = await saveSettings(patch);
    set({ settings: next });
  },

  setLastVisited: (id) => set({ lastVisitedId: id }),

  toggleTheme: async () => {
    const current = get().settings.theme;
    const next = current === 'dark' ? 'light' : 'dark';
    await get().setSettings({ theme: next });
  },
}));

/** 应用主题到 <html>，system 时监听系统偏好 */
export function applyTheme(theme: AppSettings['theme']): () => void {
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  const setClass = (dark: boolean) => {
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
  };

  if (theme === 'system') {
    setClass(media.matches);
    const listener = (e: MediaQueryListEvent) => setClass(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }

  setClass(theme === 'dark');
  return () => {};
}

/** 等待数据库就绪（用于少数直接操作 db 的场景） */
export async function ensureDbOpen(): Promise<void> {
  if (!db.isOpen()) await db.open();
}
