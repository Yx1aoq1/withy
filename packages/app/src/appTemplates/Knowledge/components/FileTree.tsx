'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { markLocalWrite } from '@/lib/knowledgeEcho';
import type { KnowledgeTreeNode } from '@/types/knowledge';

interface FileTreeProps {
  tree: KnowledgeTreeNode[];
  selected: string | null;
  project: string;
  onSelect: (node: KnowledgeTreeNode) => void;
  onDeleted: (relPath: string) => void;
}

type DialogKind = 'new-page' | 'new-folder' | 'rename' | 'delete';

// 当前打开的对话框:dirRelPath = 操作所在目录('' = 根);node = rename/delete 的目标
interface DialogState {
  kind: DialogKind;
  dirRelPath: string;
  node?: KnowledgeTreeNode;
}

// 文件树(左栏):递归渲染(标签为文件名、含空目录)、展开/折叠、选中高亮、index.md 锁标记,
// 节点操作菜单触发新建页/建空夹/重命名/删除(接 API,删除二次确认)。
export function FileTree({ tree, selected, project, onSelect, onDeleted }: FileTreeProps) {
  const t = useTranslations('knowledge');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const toggle = (relPath: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(relPath)) next.delete(relPath);
      else next.add(relPath);
      return next;
    });

  const openDialog = (state: DialogState) => {
    setMenuFor(null);
    setDialog(state);
  };

  const renderNode = (node: KnowledgeTreeNode, depth: number) => {
    const isDir = node.type === 'dir';
    const isOpen = expanded.has(node.relPath);
    const isSelected = node.relPath === selected;

    return (
      <div key={node.relPath}>
        <div
          className={`group flex items-center gap-1 rounded-md pr-1 ${
            isSelected ? 'bg-paper-sunken' : 'hover:bg-paper-sunken/60'
          }`}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          <button
            type="button"
            onClick={() => (isDir ? toggle(node.relPath) : onSelect(node))}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-[13px] text-ink-soft"
          >
            <span className="w-3 shrink-0 text-[10px] text-ink-faint">{isDir ? (isOpen ? '▾' : '▸') : ''}</span>
            <span className="shrink-0 text-[12px]">{isDir ? '🗀' : node.readonly ? '🔒' : '🗎'}</span>
            <span className={`truncate ${isSelected ? 'font-semibold text-ink' : ''}`}>{node.name}</span>
          </button>

          <button
            type="button"
            onClick={() => setMenuFor(menuFor === node.relPath ? null : node.relPath)}
            className="shrink-0 px-1 text-[13px] text-ink-faint opacity-0 group-hover:opacity-100"
            aria-label={t('actions')}
          >
            ⋯
          </button>
        </div>

        {menuFor === node.relPath && (
          <NodeMenu node={node} t={t} onPick={openDialog} onClose={() => setMenuFor(null)} />
        )}

        {isDir && isOpen && node.children && <div>{node.children.map(child => renderNode(child, depth + 1))}</div>}
      </div>
    );
  };

  return (
    <aside className="flex w-[230px] shrink-0 flex-col border-r border-line-strong bg-canvas-tint">
      <div className="flex shrink-0 items-center justify-between px-3 py-3">
        <span className="text-[11px] font-semibold tracking-wide text-ink-faint uppercase">{t('files')}</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => openDialog({ kind: 'new-page', dirRelPath: 'wiki' })}
            className={iconBtn}
          >
            {t('newPageShort')}
          </button>
          <button
            type="button"
            onClick={() => openDialog({ kind: 'new-folder', dirRelPath: 'wiki' })}
            className={iconBtn}
          >
            {t('newFolderShort')}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-1.5 pb-3">
        {tree.length === 0 ? (
          <p className="px-2 py-4 text-[12px] text-ink-faint">{t('treeEmpty')}</p>
        ) : (
          tree.map(node => renderNode(node, 0))
        )}
      </div>

      {dialog && (
        <KnowledgeDialog
          dialog={dialog}
          project={project}
          onClose={() => setDialog(null)}
          onSelectRel={onSelect}
          onDeleted={onDeleted}
        />
      )}
    </aside>
  );
}

const iconBtn =
  'cursor-pointer rounded-md border border-line-strong bg-paper px-1.5 py-0.5 text-[12px] text-ink-soft hover:text-ink';

// 节点操作小菜单(目录可新建页/夹;非 index.md 可重命名/删除)。
function NodeMenu({
  node,
  t,
  onPick,
  onClose,
}: {
  node: KnowledgeTreeNode;
  t: ReturnType<typeof useTranslations>;
  onPick: (state: DialogState) => void;
  onClose: () => void;
}) {
  const isDir = node.type === 'dir';
  const dirRelPath = isDir ? node.relPath : node.relPath.split('/').slice(0, -1).join('/');

  return (
    <div className="ml-6 mb-1 flex flex-wrap gap-1 px-2">
      {isDir && (
        <>
          <button type="button" className={menuBtn} onClick={() => onPick({ kind: 'new-page', dirRelPath })}>
            {t('newPage')}
          </button>
          <button type="button" className={menuBtn} onClick={() => onPick({ kind: 'new-folder', dirRelPath })}>
            {t('newFolder')}
          </button>
        </>
      )}
      {!node.readonly && (
        <>
          <button type="button" className={menuBtn} onClick={() => onPick({ kind: 'rename', dirRelPath, node })}>
            {t('rename')}
          </button>
          <button type="button" className={menuBtnDanger} onClick={() => onPick({ kind: 'delete', dirRelPath, node })}>
            {t('delete')}
          </button>
        </>
      )}
      <button type="button" className={menuBtn} onClick={onClose}>
        {t('cancel')}
      </button>
    </div>
  );
}

const menuBtn =
  'cursor-pointer rounded border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink-soft hover:text-ink';
const menuBtnDanger = 'cursor-pointer rounded border border-line bg-paper px-1.5 py-0.5 text-[11px] text-terracotta';

// 操作对话框:新建页/夹与重命名为单输入框;删除为二次确认。错误透传 API message。
function KnowledgeDialog({
  dialog,
  project,
  onClose,
  onSelectRel,
  onDeleted,
}: {
  dialog: DialogState;
  project: string;
  onClose: () => void;
  onSelectRel: (node: KnowledgeTreeNode) => void;
  onDeleted: (relPath: string) => void;
}) {
  const t = useTranslations('knowledge');
  const router = useRouter();
  const { kind, dirRelPath, node } = dialog;
  const initial = kind === 'rename' ? (node?.name ?? '') : '';
  const [name, setName] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = `?project=${encodeURIComponent(project)}`;
  const post = (path: string, body: unknown) =>
    fetch(`/api/knowledge/${path}${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(res => res.json());

  const afterWrite = () => {
    markLocalWrite();
    router.refresh();
    onClose();
  };

  const submit = () => {
    setError(null);
    setPending(true);

    const done = (data: { ok?: boolean; error?: string; relPath?: string }) => {
      setPending(false);
      if (!data?.ok) {
        setError(data?.error ?? 'error');
        return;
      }
      if (kind === 'new-page' && data.relPath) {
        const rel = data.relPath;
        onSelectRel({ name: name, relPath: rel, type: 'file', readonly: false });
      }
      if (kind === 'delete' && node) onDeleted(node.relPath);
      afterWrite();
    };
    const fail = () => {
      setPending(false);
      setError('network error');
    };

    if (kind === 'new-page') post('create-page', { dirRelPath, name }).then(done).catch(fail);
    else if (kind === 'new-folder') post('create-folder', { dirRelPath, name }).then(done).catch(fail);
    else if (kind === 'delete' && node) post('delete', { relPath: node.relPath }).then(done).catch(fail);
    else if (kind === 'rename' && node) {
      const base = node.type === 'file' ? `${name.trim()}.md` : name.trim();
      const toRelPath = dirRelPath ? `${dirRelPath}/${base}` : base;
      post('rename', { fromRelPath: node.relPath, toRelPath }).then(done).catch(fail);
    }
  };

  const title = t(`dialog_${kind}`);
  const isDelete = kind === 'delete';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(20,26,44,0.45)] p-4"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-[380px] max-w-full rounded-[14px] border border-line-strong bg-paper p-4 shadow-[0_24px_60px_-20px_rgba(20,26,44,0.6)]"
      >
        <h3 className="mb-3 font-serif text-[16px] font-semibold">{title}</h3>

        {isDelete ? (
          <p className="mb-3 text-[13px] leading-relaxed text-ink-soft">
            {t('deleteConfirm', { name: node?.name ?? '' })}
          </p>
        ) : (
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && name.trim() && submit()}
            placeholder={t('namePlaceholder')}
            className="mb-3 w-full rounded-lg border border-line-strong bg-paper-sunken px-2.5 py-2 text-[13px] text-ink outline-none focus:border-line-strong"
          />
        )}

        {error && <p className="mb-2 text-[12px] font-semibold text-terracotta">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className={ghostBtn}>
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || (!isDelete && !name.trim())}
            className={isDelete ? dangerBtn : confirmBtn}
          >
            {pending ? t('pending') : isDelete ? t('delete') : t('create')}
          </button>
        </div>
      </div>
    </div>
  );
}

const ghostBtn =
  'cursor-pointer rounded-lg border border-line-strong bg-paper-sunken px-3.5 py-2 text-[13px] font-semibold text-ink-soft hover:text-ink disabled:opacity-50';
const confirmBtn =
  'cursor-pointer rounded-lg bg-teal px-3.5 py-2 text-[13px] font-semibold text-brand-ink disabled:opacity-50';
const dangerBtn =
  'cursor-pointer rounded-lg bg-terracotta px-3.5 py-2 text-[13px] font-semibold text-brand-ink disabled:opacity-50';
