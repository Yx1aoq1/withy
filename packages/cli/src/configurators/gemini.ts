import type { AgentPlatformConfig, ConfigureAgentContext, ConfigureAgentResult } from '@tuteur/core';
import { copyAgentTemplates } from './shared.js';

export async function configureGemini(
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

  return {
    configured: true,
    writtenPaths,
  };
}
