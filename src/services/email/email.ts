/**
 * 邮件投递接口（预留模块）
 *
 * 重要：当前版本【未接入】任何邮件服务。
 * 用户没有配置邮件服务时，界面不显示「已发送」，也不伪造投递成功。
 * 真正的定时邮件必须由后端任务系统执行，不能依赖前端 JavaScript。
 */

export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  /** 单封投递幂等键，保证定时任务重复执行时不会重复发送 */
  idempotencyKey: string;
}

export type EmailStatus = 'not-configured' | 'queued' | 'sent' | 'failed';

export interface EmailResult {
  status: EmailStatus;
  message: string;
}

export interface EmailProvider {
  readonly name: string;
  readonly configured: boolean;
  send(payload: EmailPayload): Promise<EmailResult>;
}

/** 默认实现：未配置。任何调用都明确返回 not-configured。 */
export const unconfiguredEmailProvider: EmailProvider = {
  name: 'none',
  configured: false,
  async send(): Promise<EmailResult> {
    return {
      status: 'not-configured',
      message:
        '邮件投递未配置。此版本不发送任何邮件，请先配置支持 Cron Trigger 的后端邮件服务。',
    };
  },
};

/** 邮箱格式校验（轻量，不做 DNS 验证） */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** 当前生效的 provider —— 未配置任何服务 */
export const emailProvider: EmailProvider = unconfiguredEmailProvider;

export function isEmailConfigured(): boolean {
  return emailProvider.configured;
}
