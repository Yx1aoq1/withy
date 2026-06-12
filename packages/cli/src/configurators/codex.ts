import type { ConfigureAgentContext, ConfigureAgentResult } from '../types/agent.js';

export async function configureCodex(_context: ConfigureAgentContext): Promise<ConfigureAgentResult> {
  // TODO: add Codex-specific config only if Codex needs an adapter beyond .agent/skill.
  return {
    configured: true,
    writtenPaths: [],
  };
}
