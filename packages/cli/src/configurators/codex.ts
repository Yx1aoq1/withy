import type { AgentPlatformConfig, ConfigureAgentContext, ConfigureAgentResult } from '@tuteur/core';
import { copyAgentTemplates } from './shared.js';

export async function configureCodex(
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

  warnCodexHookFlag();

  return {
    configured: true,
    writtenPaths,
  };
}

function warnCodexHookFlag(): void {
  if (process.env.VITEST || process.env.TUTEUR_QUIET) {
    return;
  }

  process.stderr.write(
    '⚠️  Codex hooks require `features.hooks = true` in your ~/.codex/config.toml. ' +
      'Without it the session-start hook never fires (no session_start events). See Tuteur docs.\n',
  );
}
