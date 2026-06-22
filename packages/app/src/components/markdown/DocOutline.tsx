'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

interface Heading {
  // Milkdown 为 heading 自动生成的稳定 id(作锚点;ProseMirror 重渲染会保留,故优于自注入属性)
  id: string;
  level: number;
  text: string;
}

interface DocOutlineProps {
  // 当前文档键(知识库 relPath / 产物文件名):切文档时重挂渲染器,据此重扫;空 = 无选中
  docKey: string | null;
}

const SCROLL_SELECTOR = '[data-doc-scroll]';
const HEADING_SELECTOR = '.milkdown :is(h1, h2, h3, h4)';
const RESCAN_DEBOUNCE_MS = 300;

// 共享章节目录:从只读 markdown 渲染出的 heading DOM 直接生成大纲,锚点用 Milkdown 自带的 heading id
// (自注入 data-* 会被 ProseMirror 重渲染擦除)。点击平滑滚动、IntersectionObserver 滚动高亮。
// 同一时刻仅一个只读渲染实例(看板 ViewDetail 不挂 Crepe、仅弹窗挂;知识库为独立页),故容器选择器全局查即可。
export function DocOutline({ docKey }: DocOutlineProps) {
  const t = useTranslations('doc');
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string>('');

  // 重扫生成大纲项。渲染器为动态(ssr:false)异步挂载,可能晚于本 effect,故轮询等待
  // scroll 容器出现再挂 MutationObserver(随后用它捕获内容改动)。setState 收在具名 scan 内。
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let stop: ReturnType<typeof setTimeout> | null = null;
    let observer: MutationObserver | null = null;

    const scan = () => {
      const scroll = docKey ? document.querySelector<HTMLElement>(SCROLL_SELECTOR) : null;
      const nodes = scroll ? Array.from(scroll.querySelectorAll<HTMLElement>(HEADING_SELECTOR)) : [];
      setHeadings(
        nodes
          .map(node => ({ id: node.id, level: Number(node.tagName.slice(1)), text: node.textContent?.trim() ?? '' }))
          .filter(heading => heading.id),
      );
    };

    const attach = (): boolean => {
      const scroll = docKey ? document.querySelector<HTMLElement>(SCROLL_SELECTOR) : null;
      if (!scroll) return false;

      scan();
      const debouncedScan = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(scan, RESCAN_DEBOUNCE_MS);
      };
      observer = new MutationObserver(debouncedScan);
      observer.observe(scroll, { childList: true, subtree: true, characterData: true });
      return true;
    };

    scan(); // 立即重置(无 docKey/渲染器未挂载时清空)
    if (docKey && !attach()) {
      poll = setInterval(() => attach() && poll && clearInterval(poll), 150);
      stop = setTimeout(() => poll && clearInterval(poll), 4000); // 4s 仍无渲染器则放弃
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
      if (stop) clearTimeout(stop);
      observer?.disconnect();
    };
  }, [docKey]);

  // 滚动高亮:观察各 heading,取最靠近顶部的可见项为当前。headings 变化时重挂。
  useEffect(() => {
    if (headings.length < 2) return;
    const scroll = document.querySelector<HTMLElement>(SCROLL_SELECTOR);
    if (!scroll) return;

    const order = new Map(headings.map((heading, index) => [heading.id, index]));
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        if (visible.size) {
          setActiveId([...visible].reduce((top, id) => ((order.get(id) ?? 0) < (order.get(top) ?? 0) ? id : top)));
        }
      },
      { root: scroll, rootMargin: '0px 0px -70% 0px', threshold: 0 },
    );

    for (const heading of headings) {
      const node = document.getElementById(heading.id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 2) {
    return <aside className="w-[200px] shrink-0 border-l border-line-strong bg-canvas-tint" aria-hidden />;
  }

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <aside className="flex w-[200px] shrink-0 flex-col border-l border-line-strong bg-canvas-tint">
      <div className="shrink-0 px-4 py-3 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
        {t('outline')}
      </div>
      <nav className="doc-scroll min-h-0 flex-1 overflow-auto px-2 pb-3">
        {headings.map(heading => (
          <button
            key={heading.id}
            type="button"
            onClick={() => jump(heading.id)}
            style={{ paddingLeft: `${(heading.level - 1) * 12 + 8}px` }}
            className={`block w-full truncate rounded-md py-1 pr-2 text-left text-[12px] ${
              heading.id === activeId ? 'bg-paper-sunken font-semibold text-ink' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {heading.text || t('untitledHeading')}
          </button>
        ))}
      </nav>
    </aside>
  );
}
