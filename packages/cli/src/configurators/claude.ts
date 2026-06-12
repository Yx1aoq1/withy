import type { AgentPlatformConfig, ConfigureAgentContext, ConfigureAgentResult } from '../types/agent.js';
import { copyCanonicalSkills, linkSkills } from './shared.js';

export async function configureClaude(
  context: ConfigureAgentContext,
  platform: AgentPlatformConfig,
): Promise<ConfigureAgentResult> {
  const writtenPaths = configureClaudeSkills(context, platform.skillLinkDir);

  // TODO: add Claude slash commands/hooks after the workflow command contract is stable.
  return {
    configured: true,
    writtenPaths,
  };
}

function configureClaudeSkills(context: ConfigureAgentContext, skillLinkDir: string | null): string[] {
  if (!skillLinkDir) {
    return [];
  }

  if (context.skillAdapterMode === 'copy') {
    return copyCanonicalSkills({
      projectRoot: context.projectRoot,
      targetRoot: skillLinkDir,
      createdPaths: context.createdPaths,
    });
  }

  return linkSkills({
    projectRoot: context.projectRoot,
    linkRoot: skillLinkDir,
    createdPaths: context.createdPaths,
  });
}
