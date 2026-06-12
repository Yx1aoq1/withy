import { execSync } from 'node:child_process';
import { stdin as input, stdout as output } from 'node:process';
import { checkbox, input as textInput, select } from '@inquirer/prompts';
import type { Command } from 'commander';
import {
  getInitAgentChoices,
  type AgentPlatformConfig,
  type AgentTool,
  type SkillAdapterMode,
} from '../configurators/index.js';
import { getCliContext } from '../context.js';
import { initProject } from '../project/init.js';

interface InitCommandOptions {
  yes?: boolean;
  user?: string;
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize Tuteur in the current project')
    .option('-y, --yes', 'Use default agent selections')
    .option('-u, --user <name>', 'Initialize local user identity for task ownership')
    .action(runInitCommand);
}

async function runInitCommand(options: InitCommandOptions): Promise<void> {
  const initSelection = await resolveInitSelection(options).catch((error: unknown) => {
    if (isPromptCanceled(error)) {
      console.log('Init canceled.');
      process.exitCode = 1;
      return null;
    }

    throw error;
  });
  if (!initSelection) {
    return;
  }

  const context = getCliContext();

  const result = await initProject({
    projectRoot: context.projectRoot,
    agents: initSelection.agents,
    skillAdapterMode: initSelection.skillAdapterMode,
    user: initSelection.user,
  });

  console.log(`Initialized Tuteur at ${result.projectRoot}`);
  console.log('Skills installed: .agent/skill');
  console.log(`Selected agents: ${result.installedAgents.join(', ')}`);
  console.log(`Agent skill adapter: ${initSelection.skillAdapterMode}`);
  if (result.currentUser) {
    console.log(`Current user: ${result.currentUser.name}`);
  }
  if (result.createdPaths.length > 0) {
    console.log(`Created ${result.createdPaths.length} path(s).`);
  }
}

interface InitSelection {
  agents: AgentTool[];
  skillAdapterMode: SkillAdapterMode;
  user?: string;
}

async function resolveInitSelection(options: InitCommandOptions): Promise<InitSelection> {
  const agents = await resolveSelectedAgents(options);
  return {
    agents,
    skillAdapterMode: await resolveSkillAdapterMode(options, agents),
    user: await resolveUserName(options),
  };
}

async function resolveSelectedAgents(options: InitCommandOptions): Promise<AgentTool[]> {
  const defaults = getDefaultAgents();
  if (options.yes || !input.isTTY || !output.isTTY) {
    return defaults;
  }

  return promptForAgents(defaults);
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

async function resolveSkillAdapterMode(options: InitCommandOptions, agents: AgentTool[]): Promise<SkillAdapterMode> {
  if (!hasSkillAdapterTargets(agents) || options.yes || !input.isTTY || !output.isTTY) {
    return 'symlink';
  }

  return select<SkillAdapterMode>({
    message: 'How should agent-specific skill directories be created?',
    default: 'symlink',
    choices: [
      {
        name: 'Symlink to .agent/skill',
        value: 'symlink',
        description: 'One canonical skill copy; agent directories point to it.',
      },
      {
        name: 'Copy into each agent directory',
        value: 'copy',
        description: 'Creates independent files under agent-specific skill directories.',
      },
    ],
  });
}

function hasSkillAdapterTargets(agents: AgentTool[]): boolean {
  const selected = new Set(agents);
  return getInitAgentChoices().some(choice => selected.has(choice.id) && Boolean(choice.skillLinkDir));
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

function isPromptCanceled(error: unknown): boolean {
  return error instanceof Error && error.name === 'ExitPromptError';
}
