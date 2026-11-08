/**
 * 极简 Markdown → React 渲染器。
 * 不引入第三方解析器，也不使用 dangerouslySetInnerHTML，
 * 因此不存在 HTML 注入风险。
 * 支持：# 标题、**粗体**、*斜体*、`代码`、- 列表、> 引用、空行分段、--- 分隔线。
 */

import type { ReactNode } from 'react';

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // 依次匹配：行内代码、粗体、斜体
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-i${i}`;
    if (token.startsWith('`')) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-black/10 px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-white/10"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    lastIndex = match.index + token.length;
    i += 1;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];
  let paraBuffer: string[] = [];
  let quoteBuffer: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    const items = listBuffer;
    listBuffer = [];
    blocks.push(
      <ul key={`ul-${key++}`} className="my-4 list-disc space-y-1.5 pl-5 marker:text-[var(--accent)]">
        {items.map((item, idx) => (
          <li key={idx}>{renderInline(item, `li-${key}-${idx}`)}</li>
        ))}
      </ul>,
    );
  };

  const flushPara = () => {
    if (paraBuffer.length === 0) return;
    const joined = paraBuffer.join(' ');
    paraBuffer = [];
    blocks.push(
      <p key={`p-${key++}`} className="my-4 leading-[1.9] whitespace-pre-wrap">
        {renderInline(joined, `p${key}`)}
      </p>,
    );
  };

  const flushQuote = () => {
    if (quoteBuffer.length === 0) return;
    const joined = quoteBuffer.join(' ');
    quoteBuffer = [];
    blocks.push(
      <blockquote
        key={`q-${key++}`}
        className="my-5 border-l-2 pl-4 text-[1.02em] italic"
        style={{ borderColor: 'var(--accent)', color: 'var(--text-secondary)' }}
      >
        {renderInline(joined, `q${key}`)}
      </blockquote>,
    );
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      flushList();
      flushPara();
      flushQuote();
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      flushPara();
      flushQuote();
      const level = heading[1].length;
      const content = renderInline(heading[2], `h-${key}`);
      const sizes = [
        'mt-8 mb-3 text-2xl font-semibold',
        'mt-7 mb-2.5 text-xl font-semibold',
        'mt-6 mb-2 text-lg font-medium',
        'mt-5 mb-2 text-base font-medium',
      ];
      const Tag = (['h1', 'h2', 'h3', 'h4'] as const)[level - 1];
      blocks.push(
        <Tag key={`h-${key++}`} className={sizes[level - 1]}>
          {content}
        </Tag>,
      );
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushList();
      flushPara();
      flushQuote();
      blocks.push(<hr key={`hr-${key++}`} className="my-8 border-t" />);
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      flushPara();
      flushQuote();
      listBuffer.push(bullet[1]);
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushList();
      flushPara();
      quoteBuffer.push(quote[1]);
      continue;
    }

    flushList();
    flushQuote();
    paraBuffer.push(line);
  }

  flushList();
  flushPara();
  flushQuote();

  return <div className={className}>{blocks}</div>;
}
