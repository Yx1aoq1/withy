import { execSync } from 'node:child_process';
import { stdin as input, stdout as output } from 'node:process';
import { checkbox, input as textInput, select } from '@inquirer/prompts';
import { serializeToCommand, INIT_QUESTIONS } from '@tuteur/core';
import type { Command } from 'commander';
import type { SkillInstallMode, InitConfig } from '@tuteur/core';
import { PRODUCT_DISPLAY_NAME } from '../constants/product.js';
import { getInitAgentChoices, type AgentPlatformConfig, type AgentTool } from '../configurators/index.js';
import { runInit, type InitResult } from '../installation/init.js';

interface InitCommandOptions {
  yes?: boolean;
  user?: string;
  global?: boolean;
  copy?: boolean;
}

export default function registerInitCommand(program: Command): void {
  const command = program
    .command('init')
    .description(`Initialize ${PRODUCT_DISPLAY_NAME} in the current project or global root`)
    .option('-y, --yes', 'Use default agent selections')
    .option('-u, --user <name>', 'Initialize local user identity for task ownership')
    .option('--global', 'Initialize the global ~/.tuteur root (config + templates, no agent setup)')
    .option('--copy', 'Install skills as independent copies instead of symlinks');

  // Per-agent boolean flags (--codex/--claude/...) derive from the registry, so
  // adding an agent adds its flag without touching this command.
  for (const platform of getInitAgentChoices()) {
    command.option(`--${platform.cliFlag}`, `Configure ${platform.name}`);
  }

  command.action(runInitCommand);
}

async function runInitCommand(options: InitCommandOptions): Promise<void> {
  const config = await resolveInitConfig(options).catch((error: unknown) => {
    if (isPromptCanceled(error)) {
      console.log('Init canceled.');
      process.exitCode = 1;
      return null;
    }

    throw error;
  });
  if (!config) {
    return;
  }

  const result = await runInit(config, { projectRoot: process.cwd() });
  printResult(result, config);
}

async function resolveInitConfig(options: InitCommandOptions): Promise<InitConfig> {
  if (options.global) {
    // Global root configures no agents and no developer identity (core §2.3).
    return { scope: 'global', agents: [], skills: options.copy ? 'copy' : 'link' };
  }

  const agents = await resolveSelectedAgents(options);
  return {
    scope: 'project',
    agents,
    skills: await resolveSkillMode(options, agents),
    user: await resolveUserName(options),
  };
}

async function resolveSelectedAgents(options: InitCommandOptions): Promise<AgentTool[]> {
  const explicit = explicitAgents(options);
  if (explicit.length > 0) {
    return explicit;
  }

  const defaults = getDefaultAgents();
  if (options.yes || !input.isTTY || !output.isTTY) {
    return defaults;
  }

  return promptForAgents(defaults);
}

function explicitAgents(options: InitCommandOptions): AgentTool[] {
  const flags = options as Record<string, unknown>;
  return getInitAgentChoices()
    .filter(choice => Boolean(flags[choice.cliFlag]))
    .map(choice => choice.id);
}

function getDefaultAgents(): AgentTool[] {
  return getInitAgentChoices()
    .filter(choice => choice.defaultChecked)
    .map(choice => choice.id);
}

async function promptForAgents(defaults: AgentTool[]): Promise<AgentTool[]> {
  const choices = getInitAgentChoices();

  return checkbox<AgentTool>({
    message: 'Select agent tools to configure',
    required: true,
    loop: false,
    choices: choices.map(choice => toCheckboxChoice(choice, defaults)),
  });
}

async function resolveSkillMode(options: InitCommandOptions, agents: AgentTool[]): Promise<SkillInstallMode> {
  if (options.copy) {
    return 'copy';
  }
  if (!hasSkillAdapterTargets(agents) || options.yes || !input.isTTY || !output.isTTY) {
    return 'link';
  }

  return promptForSkillMode();
}

async function promptForSkillMode(): Promise<SkillInstallMode> {
  const question = skillsQuestion();

  return select<SkillInstallMode>({
    message: question.message,
    default: question.default,
    choices: question.choices.map(choice => ({
      name: choice.label,
      value: choice.value,
      description: choice.description,
    })),
  });
}

// Pull the shared skills question (core INIT_QUESTIONS) and narrow it to the
// select variant, so CLI prompt copy stays in sync with the web form.
function skillsQuestion() {
  const question = INIT_QUESTIONS.find(item => item.key === 'skills');
  if (!question || question.key !== 'skills') {
    throw new Error('INIT_QUESTIONS is missing the skills question');
  }

  return question;
}

function hasSkillAdapterTargets(agents: AgentTool[]): boolean {
  const selected = new Set(agents);
  return getInitAgentChoices().some(choice => selected.has(choice.id) && Boolean(choice.skillTarget));
}

function toCheckboxChoice(choice: AgentPlatformConfig, defaults: AgentTool[]) {
  return {
    name: `${choice.name} (${choice.id})`,
    value: choice.id,
    checked: defaults.includes(choice.id),
  };
}

async function resolveUserName(options: InitCommandOptions): Promise<string | undefined> {
  const normalizedOption = normalizeUserName(options.user);
  if (normalizedOption) {
    return normalizedOption;
  }

  const detected = detectDefaultUserName();
  if (options.yes || !input.isTTY || !output.isTTY) {
    return detected;
  }

  const answer = await textInput({
    message: 'User name for local task ownership',
    default: detected,
    required: true,
  });

  return normalizeUserName(answer);
}

function normalizeUserName(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function detectDefaultUserName(): string | undefined {
  try {
    const gitUser = execSync('git config user.name', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (gitUser) {
      return gitUser;
    }
  } catch {
    // No configured git user; fall back to environment.
  }

  return normalizeUserName(process.env.USER ?? process.env.USERNAME);
}

function printResult(result: InitResult, config: InitConfig): void {
  if (result.scope === 'global') {
    console.log(`Initialized ${PRODUCT_DISPLAY_NAME} global root at ${result.root}`);
  } else {
    console.log(`Initialized ${PRODUCT_DISPLAY_NAME} at ${result.root}`);
    if (result.installedAgents.length > 0) {
      console.log(`Selected agents: ${result.installedAgents.join(', ')}`);
    }
    console.log(`Agent skill adapter: ${config.skills}`);
    if (result.user) {
      console.log(`Current user: ${result.user.name}`);
    }
    if (result.registeredProject) {
      console.log('Registered in the global project registry.');
    }
  }

  if (result.createdPaths.length > 0) {
    console.log(`Created ${result.createdPaths.length} path(s).`);
  }
  console.log(`Equivalent command: ${serializeToCommand(config)}`);
}

function isPromptCanceled(error: unknown): boolean {
  return error instanceof Error && error.name === 'ExitPromptError';
}
