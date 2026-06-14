import {
  AGENT_PLATFORMS,
  getAgentPlatform,
  getInitAgentChoices,
  type AgentTool,
  type ConfigureAgentContext,
  type ConfigureAgentResult,
  type PlatformConfigurator,
  type RegisteredAgentPlatformConfig,
} from '@tuteur/core';
import { configureClaude } from './claude.js';
import { configureCodex } from './codex.js';
import { configureGemini } from './gemini.js';

// Platform DATA lives in @tuteur/core (single source). This module only owns
// the per-agent BEHAVIOR table and the dispatch over it.
const PLATFORM_CONFIGURATORS: Record<AgentTool, PlatformConfigurator> = {
  codex: configureCodex,
  claude: configureClaude,
  gemini: configureGemini,
};

export function configureAgentPlatform(
  platformId: AgentTool,
  context: ConfigureAgentContext,
): Promise<ConfigureAgentResult> {
  return PLATFORM_CONFIGURATORS[platformId](context, AGENT_PLATFORMS[platformId]);
}

export { AGENT_PLATFORMS, getAgentPlatform, getInitAgentChoices };
export type { AgentTool, RegisteredAgentPlatformConfig };
