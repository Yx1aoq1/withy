export type SkillAdapterMode = 'symlink' | 'copy';

export interface TemplateContext<TAgentTool extends string = string> {
  cmdRefPrefix: '$' | '/tuteur:';
  userActionLabel: 'Skills' | 'Slash commands';
  cliFlag: TAgentTool;
}

export interface AgentPlatformConfig<TAgentTool extends string = string> {
  id: TAgentTool;
  name: string;
  configDir: string;
  cliFlag: TAgentTool;
  defaultChecked: boolean;
  skillLinkDir: string | null;
  templateContext: TemplateContext<TAgentTool>;
}

export interface ConfigureAgentContext {
  projectRoot: string;
  createdPaths: string[];
  skillAdapterMode: SkillAdapterMode;
}

export interface ConfigureAgentResult {
  configured: boolean;
  writtenPaths: string[];
}

export interface AgentPlatformDefinition<TAgentTool extends string = string> extends AgentPlatformConfig<TAgentTool> {
  configure: (
    context: ConfigureAgentContext,
    platform: AgentPlatformConfig<TAgentTool>,
  ) => Promise<ConfigureAgentResult>;
}
