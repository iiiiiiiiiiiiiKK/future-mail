/**
 * 信封封面主题与心情定义。
 */

export interface CoverTheme {
  id: string;
  nameZh: string;
  nameEn: string;
  /** 用于卡片背景的 CSS 渐变 */
  gradient: string;
  /** 主色调，用于强调 */
  accent: string;
}

export const COVER_THEMES: CoverTheme[] = [
  {
    id: 'night',
    nameZh: '深蓝夜色',
    nameEn: 'Midnight',
    gradient: 'linear-gradient(146deg, #1b2a49 0%, #0e1628 60%, #080e1a 100%)',
    accent: '#d4b168',
  },
  {
    id: 'parchment',
    nameZh: '旧纸',
    nameEn: 'Parchment',
    gradient: 'linear-gradient(146deg, #f6f1e5 0%, #ece3d1 55%, #ddd0b7 100%)',
    accent: '#9a7533',
  },
  {
    id: 'aurora',
    nameZh: '极光',
    nameEn: 'Aurora',
    gradient: 'linear-gradient(146deg, #1b3a3f 0%, #14313a 45%, #0d1f2b 100%)',
    accent: '#7fc9b4',
  },
  {
    id: 'dusk',
    nameZh: '暮色',
    nameEn: 'Dusk',
    gradient: 'linear-gradient(146deg, #3a2740 0%, #2a1c30 55%, #17101d 100%)',
    accent: '#d09a86',
  },
  {
    id: 'sea',
    nameZh: '深海',
    nameEn: 'Deep Sea',
    gradient: 'linear-gradient(146deg, #142736 0%, #0f1e2b 55%, #09141d 100%)',
    accent: '#8fb6d4',
  },
  {
    id: 'ember',
    nameZh: '余烬',
    nameEn: 'Ember',
    gradient: 'linear-gradient(146deg, #3a2418 0%, #2a1a11 55%, #180f0a 100%)',
    accent: '#e0a86a',
  },
];

export function getCover(id: string): CoverTheme {
  return COVER_THEMES.find((c) => c.id === id) ?? COVER_THEMES[0];
}

export interface MoodDef {
  id: string;
  zh: string;
  en: string;
  glyph: string;
  color: string;
}

export const MOODS: MoodDef[] = [
  { id: 'hopeful', zh: '充满希望', en: 'Hopeful', glyph: '◐', color: '#d4b168' },
  { id: 'calm', zh: '平静', en: 'Calm', glyph: '○', color: '#8fb6d4' },
  { id: 'anxious', zh: '焦虑', en: 'Anxious', glyph: '◭', color: '#b98a86' },
  { id: 'grateful', zh: '感恩', en: 'Grateful', glyph: '✦', color: '#7fc9b4' },
  { id: 'lost', zh: '迷茫', en: 'Lost', glyph: '◌', color: '#9aa3b5' },
  { id: 'excited', zh: '兴奋', en: 'Excited', glyph: '◈', color: '#e0a86a' },
  { id: 'tired', zh: '疲惫', en: 'Tired', glyph: '◍', color: '#8d93a1' },
  { id: 'determined', zh: '坚定', en: 'Determined', glyph: '▲', color: '#c9755f' },
];

export function getMood(id: string | undefined): MoodDef | null {
  if (!id) return null;
  return MOODS.find((m) => m.id === id) ?? null;
}

/** 信件类型说明 */
export const LETTER_KINDS = [
  { id: 'future-self', zh: '写给未来的自己', en: 'To my future self', recipient: '未来的我' },
  { id: 'someone', zh: '写给某个人', en: 'To someone', recipient: '' },
  { id: 'family', zh: '写给未来的家人', en: 'To future family', recipient: '家人' },
  { id: 'child', zh: '写给未来的孩子', en: 'To a future child', recipient: '未来的孩子' },
  { id: 'life-chapter', zh: '写给未来的一段人生', en: 'To a life chapter', recipient: '未来的我' },
  { id: 'custom', zh: '自定义收件人', en: 'Custom recipient', recipient: '' },
] as const;
