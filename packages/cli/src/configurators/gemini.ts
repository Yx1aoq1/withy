import type { ConfigureAgentContext, ConfigureAgentResult } from '../types/agent.js';

export async function configureGemini(_context: ConfigureAgentContext): Promise<ConfigureAgentResult> {
  // TODO: confirm Gemini CLI project-level adapter needs beyond .agent/skill.
  return {
    configured: true,
    writtenPaths: [],
  };
}
