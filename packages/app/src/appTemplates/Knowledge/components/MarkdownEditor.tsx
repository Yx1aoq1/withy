'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Crepe } from '@milkdown/crepe';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import '@/components/markdown/milkdown-tokens.css';
import { wikiLink } from './wikilink';
import { markLocalWrite } from '@/lib/knowledgeEcho';
import type { KnowledgeFileView } from '@/types/knowledge';

type SaveStatus = 'idle' | 'editing' | 'saving' | 'saved' | 'error';

interface MarkdownEditorProps {
  file: KnowledgeFileView;
  project: string;
  // 可选保存覆盖:提供则用它替代默认 /api/knowledge/save(注入管理页复用编辑器、写别处)— design §6.2。
  onSave?: (markdown: string) => Promise<boolean>;
}

const AUTOSAVE_MS = 1000;

// Crepe 封装:按 relPath keyed(父层)+ 非受控(defaultValue 仅初始);markdownUpdated 与载入基线 diff,
// 确有变更才防抖 1s 调 save API。只读页(index.md)只读渲染、不进保存。
function CrepeEditor({ file, project, onSave }: MarkdownEditorProps) {
  const t = useTranslations('knowledge');
  const crepeRef = useRef<Crepe | null>(null);
  const baselineRef = useRef<string | null>(null); // 编辑器对载入正文的首次序列化(避免初始重排空写)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');

  const save = useCallback(
    (markdown: string) => {
      setStatus('saving');

      const done = (ok: boolean): void => {
        if (ok) {
          baselineRef.current = markdown; // 已落盘 → 新基线
          setStatus('saved');
        } else {
          setStatus('error');
        }
      };

      if (onSave) {
        onSave(markdown)
          .then(done)
          .catch(() => setStatus('error'));
        return;
      }

      fetch(`/api/knowledge/save?project=${encodeURIComponent(project)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relPath: file.relPath, body: markdown }),
      })
        .then(res => res.json())
        .then(data => {
          if (data?.ok) markLocalWrite(); // echo 抑制打戳
          done(Boolean(data?.ok));
        })
        .catch(() => setStatus('error'));
    },
    [project, file.relPath, onSave],
  );

  const { loading } = useEditor(root => {
    const crepe = new Crepe({ root, defaultValue: file.body });
    crepe.editor.use(wikiLink);
    if (file.readonly) crepe.setReadonly(true);

    crepe.on(listener => {
      listener.markdownUpdated((_ctx, markdown) => {
        if (file.readonly || baselineRef.current === null) return; // 基线未就绪时忽略初始重排
        if (markdown === baselineRef.current) {
          setStatus('idle');
          return;
        }
        setStatus('editing');
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => save(markdown), AUTOSAVE_MS);
      });
    });

    crepeRef.current = crepe;
    return crepe;
  }, []);

  // 编辑器就绪后捕获基线(此时 getMarkdown 可用);只读页不参与保存。
  useEffect(() => {
    if (loading || file.readonly) return;
    baselineRef.current = crepeRef.current?.getMarkdown() ?? file.body;
  }, [loading, file.readonly, file.body]);

  // 卸载清防抖定时器(切文件时父层 remount)。
  useEffect(() => () => clearTimeout(timerRef.current ?? undefined), []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[34px] shrink-0 items-center justify-between border-b border-line px-4 text-[12px] text-ink-faint">
        <span className="truncate font-mono">{file.relPath}</span>
        {!file.readonly && <SaveBadge status={status} t={t} />}
        {file.readonly && <span className="text-ink-faint">{t('readonly')}</span>}
      </div>
      <div className="doc-scroll min-h-0 flex-1 overflow-auto" data-doc-scroll>
        <Milkdown />
      </div>
    </div>
  );
}

function SaveBadge({ status, t }: { status: SaveStatus; t: ReturnType<typeof useTranslations> }) {
  if (status === 'idle') return null;
  const tone = status === 'error' ? 'text-terracotta' : status === 'saved' ? 'text-teal' : 'text-ink-faint';
  return <span className={tone}>{t(`save_${status}`)}</span>;
}

// 入口:MilkdownProvider 包裹(每个文件一个实例,父层按 relPath key remount)。
export function MarkdownEditor(props: MarkdownEditorProps) {
  return (
    <MilkdownProvider>
      <CrepeEditor {...props} />
    </MilkdownProvider>
  );
}
