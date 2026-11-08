import { useEffect, useState } from 'react';

/**
 * 提供一个「随时间推进」的当前时间。
 * 避免在渲染期间直接读取 Date.now()（保持渲染纯粹），
 * 同时让到期判断与倒计时能自动刷新。
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
