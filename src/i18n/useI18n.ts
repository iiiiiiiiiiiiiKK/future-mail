/**
 * i18n hook —— 基于 Zustand 设置，无额外依赖。
 */

import { useCallback } from 'react';
import { useAppStore } from '@/stores/app';
import { dictionaries, interpolate, type Lang, type TranslationKey } from './dictionary';

export function useI18n() {
  const lang = useAppStore((s) => s.settings.language) as Lang;

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      const dict = dictionaries[lang] ?? dictionaries.zh;
      const value = dict[key] ?? dictionaries.zh[key] ?? key;
      return interpolate(value, vars);
    },
    [lang],
  );

  return { t, lang };
}

/** 非组件环境（例如导出服务）使用 */
export function translate(
  lang: Lang,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const dict = dictionaries[lang] ?? dictionaries.zh;
  return interpolate(dict[key] ?? dictionaries.zh[key] ?? key, vars);
}
