'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MarkdownEditor } from '@/appTemplates/Knowledge/components/MarkdownEditor';
import type { AgentSummaryView, AgentDetailView } from '@/types/agents';

interface InjectionManagerProps {
  project: string;
  guideBody: string;
  agents: AgentSummaryView[];
}

type InnerTab = 'context' | 'agents';

// 注入管理页(取代旧 /p/context 空壳):内层左侧功能导航 + 右侧内容区。
// context 功能编辑 .withy/guide.md(复用知识库 MarkdownEditor,保存走 /api/guide);
// agents 功能管理子 agent 角色(canonical CRUD + 各工具投递态)— design §6。
export function InjectionManager({ project, guideBody, agents: initialAgents }: InjectionManagerProps) {
  const t = useTranslations('inject');
  const [tab, setTab] = useState<InnerTab>('context');

  return (
    <div className="flex min-h-0 flex-1">
      <nav className="flex w-[180px] shrink-0 flex-col gap-1 border-r border-line-strong p-3">
        <NavItem active={tab === 'context'} icon="⇲" label={t('context')} onClick={() => setTab('context')} />
        <NavItem active={tab === 'agents'} icon="❋" label={t('agents')} onClick={() => setTab('agents')} />
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {tab === 'context' ? (
          <ContextPanel project={project} guideBody={guideBody} />
        ) : (
          <AgentsPanel project={project} initialAgents={initialAgents} />
        )}
      </div>
    </div>
  );
}

function NavItem({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  const base = 'flex items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[13px] font-semibold cursor-pointer';
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? `${base} bg-brand text-brand-ink` : `${base} text-ink-soft hover:bg-paper-sunken`}
    >
      <span className="text-[13px]">{icon}</span>
      {label}
    </button>
  );
}

// ── context 功能:编辑 .withy/guide.md ────────────────────────────────────────

function ContextPanel({ project, guideBody }: { project: string; guideBody: string }) {
  const t = useTranslations('inject');

  const saveGuide = useCallback(
    async (markdown: string): Promise<boolean> => {
      const res = await fetch(`/api/guide?project=${encodeURIComponent(project)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: markdown }),
      });
      const data = await res.json();
      return Boolean(data?.ok);
    },
    [project],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="shrink-0 border-b border-line px-4 py-2.5 text-[12px] text-ink-faint">{t('contextHint')}</p>
      <MarkdownEditor
        file={{ relPath: 'guide.md', readonly: false, body: guideBody }}
        project={project}
        onSave={saveGuide}
      />
    </div>
  );
}

// ── agents 功能:角色 CRUD + 投递态 ──────────────────────────────────────────

const NEW_ROLE_BODY = `---\nname: ROLE\ndescription: One-line role summary.\n---\n\n# ROLE (subagent role)\n\nYou are a focused subagent. Start by reading the Active task's \`dispatch.json\` and \`design.md\`, then do the work and return a compact summary.\n`;

function AgentsPanel({ project, initialAgents }: { project: string; initialAgents: AgentSummaryView[] }) {
  const t = useTranslations('inject');
  const [agents, setAgents] = useState<AgentSummaryView[]>(initialAgents);
  const [selected, setSelected] = useState<string | null>(initialAgents[0]?.name ?? null);
  const [detail, setDetail] = useState<AgentDetailView | null>(null);

  const refresh = useCallback(async (): Promise<AgentSummaryView[]> => {
    const res = await fetch(`/api/agents?project=${encodeURIComponent(project)}`);
    const data = await res.json();
    const list: AgentSummaryView[] = data?.agents ?? [];
    setAgents(list);
    return list;
  }, [project]);

  const loadDetail = useCallback(
    async (role: string): Promise<AgentDetailView | null> => {
      const res = await fetch(`/api/agents/${encodeURIComponent(role)}?project=${encodeURIComponent(project)}`);
      const data = await res.json();
      return data?.ok ? data.agent : null;
    },
    [project],
  );

  // 选中变化 → 拉详情(在 promise 续体里 setState,不在 effect 体同步置态)。
  useEffect(() => {
    let cancelled = false;
    if (!selected) return;
    loadDetail(selected).then(loaded => {
      if (!cancelled) setDetail(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [selected, loadDetail]);

  const saveRole = useCallback(
    async (markdown: string): Promise<boolean> => {
      if (!selected) return false;
      const res = await fetch(`/api/agents/${encodeURIComponent(selected)}?project=${encodeURIComponent(project)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: markdown }),
      });
      const data = await res.json();
      if (data?.ok) await refresh();
      return Boolean(data?.ok);
    },
    [project, selected, refresh],
  );

  const createRole = useCallback(async (): Promise<void> => {
    const name = window.prompt(t('newRolePrompt'))?.trim();
    if (!name) return;
    const res = await fetch(`/api/agents/${encodeURIComponent(name)}?project=${encodeURIComponent(project)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: NEW_ROLE_BODY.replaceAll('ROLE', name) }),
    });
    const data = await res.json();
    if (data?.ok) {
      await refresh();
      setSelected(name);
    } else {
      window.alert(data?.error ?? 'create failed');
    }
  }, [project, refresh, t]);

  const deleteRole = useCallback(
    async (role: string): Promise<void> => {
      if (!window.confirm(t('deleteRoleConfirm', { role }))) return;
      await fetch(`/api/agents/${encodeURIComponent(role)}?project=${encodeURIComponent(project)}`, {
        method: 'DELETE',
      });
      const list = await refresh();
      const next = list[0]?.name ?? null;
      setSelected(next);
      if (!next) setDetail(null);
    },
    [project, refresh, t],
  );

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-[220px] shrink-0 flex-col border-r border-line p-3">
        <button
          type="button"
          onClick={createRole}
          className="mb-2 rounded-[10px] border border-dashed border-line-strong px-2.5 py-2 text-[12.5px] font-semibold text-ink-soft hover:border-ink-faint hover:text-ink"
        >
          + {t('newRole')}
        </button>
        <div className="flex flex-col gap-1 overflow-y-auto">
          {agents.length === 0 && <p className="px-1 py-2 text-[12px] text-ink-faint">{t('noRoles')}</p>}
          {agents.map(agent => (
            <button
              key={agent.name}
              type="button"
              onClick={() => setSelected(agent.name)}
              className={`flex flex-col gap-1 rounded-[10px] border px-2.5 py-2 text-left ${
                selected === agent.name ? 'border-brand bg-paper-sunken' : 'border-line hover:border-line-strong'
              }`}
            >
              <span className="text-[13px] font-semibold text-ink">{agent.name}</span>
              <span className="flex gap-1">
                {agent.delivery.map(d => (
                  <DeliveryBadge key={d.platform} platform={d.platform} state={d.state} />
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {selected && detail ? (
          <>
            <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2.5">
              <span className="font-mono text-[12px] text-ink-faint">.agents/agents/{selected}.md</span>
              <button
                type="button"
                onClick={() => deleteRole(selected)}
                className="rounded-[8px] border border-terracotta px-2.5 py-1 text-[12px] font-semibold text-terracotta hover:bg-terracotta-bg"
              >
                {t('deleteRole')}
              </button>
            </div>
            <MarkdownEditor
              key={selected}
              file={{ relPath: `${selected}.md`, readonly: false, body: detail.body }}
              project={project}
              onSave={saveRole}
            />
          </>
        ) : (
          <p className="m-auto text-[13px] text-ink-faint">{t('selectRole')}</p>
        )}
      </div>
    </div>
  );
}

function DeliveryBadge({ platform, state }: { platform: string; state: string }) {
  const tone =
    state === 'linked' || state === 'generated'
      ? 'text-teal border-teal'
      : state === 'stale'
        ? 'text-terracotta border-terracotta'
        : 'text-ink-faint border-line';
  return (
    <span className={`rounded-full border px-1.5 text-[9px] font-bold tracking-wide uppercase ${tone}`}>
      {platform}
    </span>
  );
}
