import type { AgentPlatformConfig, ConfigureAgentContext, ConfigureAgentResult } from '@tuteur/core';
import { copyAgentTemplates, copyCanonicalSkills, linkSkills } from './shared.js';

export async function configureClaude(
  context: ConfigureAgentContext,
  platform: AgentPlatformConfig,
): Promise<ConfigureAgentResult> {
  const writtenPaths = copyAgentTemplates({
    projectRoot: context.projectRoot,
    templateId: platform.id,
    configDir: platform.configDir,
    templateContext: platform.templateContext,
    createdPaths: context.createdPaths,
  });

  writtenPaths.push(...configureClaudeSkills(context, platform.skillTarget));

  return {
    configured: true,
    writtenPaths,
  };
}

function configureClaudeSkills(context: ConfigureAgentContext, skillTarget: string | null): string[] {
  if (!skillTarget) {
    return [];
  }

  if (context.skillAdapterMode === 'copy') {
    return copyCanonicalSkills({
      projectRoot: context.projectRoot,
      targetRoot: skillTarget,
      createdPaths: context.createdPaths,
    });
  }

  return linkSkills({
    projectRoot: context.projectRoot,
    linkRoot: skillTarget,
    createdPaths: context.createdPaths,
  });
}
