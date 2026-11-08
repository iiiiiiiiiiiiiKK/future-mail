import { useCallback, useEffect, useRef, useState } from 'react';

/** 自动保存：输入停止 delay 毫秒后触发，返回保存状态供 UI 显示 */
export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function useAutoSave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  options: { delay?: number; enabled?: boolean } = {},
) {
  const { delay = 900, enabled = true } = options;
  const [state, setState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const firstRun = useRef(true);
  const timer = useRef<number | null>(null);
  const pendingValue = useRef<T>(value);
  const saveRef = useRef(save);

  /* 保持最新 save 引用，但不在渲染期间写 ref */
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const flush = useCallback(async () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setState('saving');
    try {
      await saveRef.current(pendingValue.current);
      setState('saved');
      setLastSavedAt(new Date());
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    pendingValue.current = value;
    setState('pending');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void flush();
    }, delay);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [value, delay, enabled, flush]);

  /* 页面卸载前尽力保存（浏览器可能中断异步写库，属已知限制） */
  useEffect(() => {
    if (!enabled) return;
    const handler = () => {
      if (pendingValue.current !== undefined) void flush();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [enabled, flush]);

  return { state, lastSavedAt, flush };
}

/** 内容级撤销/重做（独立于浏览器原生 undo，便于工具栏按钮使用） */
export function useUndoableText(initial: string, limit = 80) {
  const [value, setValueRaw] = useState(initial);
  const [pastCount, setPastCount] = useState(0);
  const [futureCount, setFutureCount] = useState(0);
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);

  const syncCounts = useCallback(() => {
    setPastCount(past.current.length);
    setFutureCount(future.current.length);
  }, []);

  const setValue = useCallback(
    (next: string) => {
      setValueRaw((prev) => {
        if (next === prev) return prev;
        past.current.push(prev);
        if (past.current.length > limit) past.current.shift();
        future.current = [];
        return next;
      });
      syncCounts();
    },
    [limit, syncCounts],
  );

  const undo = useCallback(() => {
    setValueRaw((prev) => {
      const last = past.current.pop();
      if (last === undefined) return prev;
      future.current.push(prev);
      return last;
    });
    syncCounts();
  }, [syncCounts]);

  const redo = useCallback(() => {
    setValueRaw((prev) => {
      const next = future.current.pop();
      if (next === undefined) return prev;
      past.current.push(prev);
      return next;
    });
    syncCounts();
  }, [syncCounts]);

  /** 外部整体替换（例如载入草稿），不写入历史 */
  const reset = useCallback(
    (next: string) => {
      past.current = [];
      future.current = [];
      setValueRaw(next);
      syncCounts();
    },
    [syncCounts],
  );

  return {
    value,
    setValue,
    undo,
    redo,
    reset,
    canUndo: pastCount > 0,
    canRedo: futureCount > 0,
  };
}
