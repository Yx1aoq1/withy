'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Scroller } from '@/components/Scroller';
import { DocOutline } from '@/components/markdown/DocOutline';
import type { TaskDocView } from '@/types/dashboard';

// Crepe 触碰 document,必须 client-only 动态导入(ssr:false)。
const MarkdownView = dynamic(() => import('@/components/markdown/MarkdownView').then(m => m.MarkdownView), {
  ssr: false,
});

interface TaskDocsModalProps {
  taskId: string;
  project: string;
  docs: string[]; // 已取的产物清单(详情入口传入)
  initialName: string; // 初始选中产物
  onClose: () => void;
}

// 任务产物只读审阅弹窗:三栏 —— 左产物列表 / 中只读渲染 / 右章节目录。
// 只读(无编辑/保存);关闭方式:右上关闭按钮 + Esc + 点遮罩。切换产物按 name remount 中/右栏。
export function TaskDocsModal({ taskId, project, docs, initialName, onClose }: TaskDocsModalProps) {
  const t = useTranslations('taskDocs');
  const [name, setName] = useState(initialName);
  const [doc, setDoc] = useState<TaskDocView | null>(null);
  const [failedName, setFailedName] = useState<string | null>(null); // 取正文失败的 name(派生失败态,避免 effect 同步置态)

  // Esc 关闭
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 按选中 name 取正文(只刷新中/右栏);所有 setState 落在异步回调里(不在 effect 体同步置态)。
  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/tasks/${encodeURIComponent(taskId)}/doc?project=${encodeURIComponent(project)}&name=${encodeURIComponent(name)}`,
    )
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data?.ok && data.doc) setDoc(data.doc);
        else setFailedName(name);
      })
      .catch(() => {
        if (cancelled) return;
        setFailedName(name);
      });

    return () => {
      cancelled = true;
    };
  }, [taskId, project, name]);

  // 加载/失败态由 name 派生(切换 name 即自动回到加载态、清除上一篇的失败态)。
  const activeDoc = doc?.name === name ? doc : null;
  const failed = failedName === name;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--ink)_45%,transparent)] p-6"
    >
      <div
        onClick={event => event.stopPropagation()}
        className="flex h-[min(86vh,760px)] w-[min(1100px,94vw)] flex-col overflow-hidden rounded-lg2 border border-line-strong bg-paper shadow-card"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line-strong px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="font-serif text-[15px] font-semibold">{t('title')}</span>
            <span className="rounded-full bg-paper-sunken px-2 py-px text-[10px] font-semibold text-ink-faint uppercase">
              {t('readonly')}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="cursor-pointer rounded-md px-2 py-0.5 text-[16px] leading-none text-ink-soft hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-[200px] shrink-0 flex-col border-r border-line-strong bg-canvas-tint">
            <div className="shrink-0 px-4 py-3 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
              {t('filesLabel')}
            </div>
            <Scroller className="min-h-0 flex-1">
              <nav className="px-2 pb-3">
                {docs.map(file => (
                  <button
                    key={file}
                    type="button"
                    onClick={() => setName(file)}
                    className={`block w-full truncate rounded-md px-2 py-1 text-left font-mono text-[12px] ${
                      file === name ? 'bg-paper-sunken font-semibold text-ink' : 'text-ink-soft hover:text-ink'
                    }`}
                  >
                    {file}
                  </button>
                ))}
              </nav>
            </Scroller>
          </div>

          <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-paper">
            {failed ? (
              <Centered>{t('loadFailed')}</Centered>
            ) : activeDoc ? (
              <MarkdownView key={activeDoc.name} body={activeDoc.body} />
            ) : (
              <Centered>{t('loading')}</Centered>
            )}
          </section>

          <DocOutline docKey={activeDoc?.name ?? null} />
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center text-[13px] text-ink-faint">
      {children}
    </div>
  );
}
