import { getTranslations } from 'next-intl/server';
import { readGuide } from '@withy/core';
import { InjectionManager } from './InjectionManager';
import { EmptyState } from '@/components/EmptyState';
import { listAgents } from '@/server/agents';
import { resolveScopeByName } from '@/server/dashboard';

interface ContextPageProps {
  params: Promise<{ project: string }>;
}

// 注入管理页(/<name>/context):内层 context(编辑 guide.md)+ agents(子 agent 角色 CRUD + 投递态)。
export async function ContextPage({ params }: ContextPageProps) {
  const { project } = await params;
  const t = await getTranslations('empty');

  const scope = resolveScopeByName(decodeURIComponent(project));
  if (!scope) {
    return <EmptyState title={t('unselectedTitle')} hint={t('unselectedHint')} />;
  }

  return <InjectionManager project={scope.root} guideBody={readGuide(scope) ?? ''} agents={listAgents(scope)} />;
}
