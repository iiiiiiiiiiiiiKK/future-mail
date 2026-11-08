/**
 * Future Mail — 核心数据类型定义
 * 所有日期统一使用 ISO 8601 字符串，显示时转换为用户本地时区。
 * 数据版本号用于后续迁移（见 services/storage/migrations.ts）。
 */

export const DATA_VERSION = 1;

/** 信件状态机：DRAFT → SEALED → READY → OPENED，任意未开启状态可 → CANCELLED */
export type LetterStatus = 'DRAFT' | 'SEALED' | 'READY' | 'OPENED' | 'CANCELLED';

/** 信件类型 */
export type LetterKind =
  | 'future-self'
  | 'someone'
  | 'family'
  | 'child'
  | 'life-chapter'
  | 'custom';

/** 心情 */
export type MoodId =
  | 'hopeful'
  | 'calm'
  | 'anxious'
  | 'grateful'
  | 'lost'
  | 'excited'
  | 'tired'
  | 'determined';

/** 附件类型 */
export type AttachmentKind = 'image' | 'audio' | 'pdf' | 'text' | 'video-link';

/** 附件（二进制内容单独存放在 attachments 表，用 blobKey 关联） */
export interface Attachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  mimeType: string;
  size: number;
  /** 点击附件表主键 */
  blobKey: string;
  /** 视频外链等不托管二进制时使用 */
  externalUrl?: string;
  createdAt: string;
}

/** 心情快照 —— 帮助未来的自己理解当时的生活状态 */
export interface MoodSnapshot {
  mood?: MoodId;
  /** 当前最重要的事 */
  mostImportant?: string;
  /** 最近在努力什么 */
  workingOn?: string;
  /** 当前最大的担忧 */
  biggestWorry?: string;
  /** 最期待发生的事 */
  lookingForwardTo?: string;
  /** 对未来自己的期待 */
  hopeForFuture?: string;
  /** 当前所在城市 */
  city?: string;
  /** 当前目标 */
  currentGoal?: string;
  /** 可选的财务记录，仅本地保存 */
  financeNote?: string;
}

/** 提醒设置 */
export interface ReminderSetting {
  enabled: boolean;
  /** 提前天数，0 表示到期当天 */
  daysBefore: number;
}

/** 数据来源：本地创建 / 导入 / 回信 */
export type LetterOrigin = 'local' | 'imported' | 'reply';

export interface Letter {
  id: string;
  /** 人类可读的专属信件编号，例如 FM-2026-4F2A */
  serial: string;
  title: string;
  recipient: string;
  /** Markdown 原文 */
  content: string;
  createdAt: string;
  /** 最后一次自动保存时间 */
  updatedAt: string;
  scheduledOpenAt: string;
  sealedAt?: string;
  openedAt?: string;
  status: LetterStatus;
  kind: LetterKind;
  /** 信件封面主题 key */
  cover: string;
  tags: string[];
  attachments: Attachment[];
  mood?: MoodSnapshot;
  /** 隐私标记：默认 private，公开内容由用户主动选择 */
  privacy: 'private' | 'shareable';
  /** 用户为分享卡片主动挑选的一句公开文字 */
  shareQuote?: string;
  reminder: ReminderSetting;
  /** 回信：关联的原始信件 id */
  replyTo?: string;
  /** 被哪些回信引用（冗余便于展示，由服务层维护） */
  replies: string[];
  /** 回顾笔记（开启后添加） */
  reviewNote?: string;
  /** 标记重要 */
  starred: boolean;
  origin: LetterOrigin;
  version: number;
}

/** 时间胶囊模板 key */
export type CapsuleTemplate =
  | 'one-year'
  | 'five-year'
  | 'ten-year'
  | 'today-life'
  | 'annual-review'
  | 'future-child'
  | 'custom';

/** 时间胶囊：在 Letter 基础上扩展结构化问题 */
export interface Capsule extends Letter {
  isCapsule: true;
  template: CapsuleTemplate;
  /** 模板引导问题的回答，key 为问题 id */
  answers: Record<string, string>;
  /** 外部视频链接 */
  videoLinks: string[];
}

/** 存储二进制附件 */
export interface AttachmentBlob {
  /** 主键，等于 Attachment.blobKey */
  key: string;
  letterId: string;
  mimeType: string;
  name: string;
  size: number;
  blob: Blob;
  createdAt: string;
}

/** 应用设置 */
export interface AppSettings {
  id: 'app';
  language: 'zh' | 'en';
  theme: 'light' | 'dark' | 'system';
  /** 首次访问引导是否已完成 */
  onboarded: boolean;
  /** 是否已经询问过通知权限 */
  notificationsAsked: boolean;
  /** 通知开关（需要浏览器授权） */
  notificationsEnabled: boolean;
  lastBackupAt?: string;
}

/** 导出文件结构 —— 用于完整备份与恢复 */
export interface ExportBundle {
  app: 'future-mail';
  version: number;
  exportedAt: string;
  letters: Letter[];
  /** 附件以 base64 内联，避免外部依赖 */
  blobs?: Array<{
    key: string;
    letterId: string;
    mimeType: string;
    name: string;
    size: number;
    base64: string;
  }>;
}

/** 导入结果 */
export interface ImportResult {
  imported: number;
  skipped: number;
  duplicated: number;
  invalid: number;
  errors: string[];
}
