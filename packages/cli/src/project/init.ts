import { resolve } from 'node:path';
import {
  configureAgentPlatform,
  installCanonicalWorkflowSkills,
  type AgentTool,
  type SkillAdapterMode,
} from '../configurators/index.js';
import { ensureDir, writeJsonIfMissing, writeText, writeTextIfMissing } from '../utils/fs.js';

export interface InitProjectOptions {
  projectRoot: string;
  agents?: AgentTool[];
  skillAdapterMode?: SkillAdapterMode;
  user?: string;
}

export interface InitProjectResult {
  projectRoot: string;
  createdPaths: string[];
  installedAgents: AgentTool[];
  currentUser: ProjectUser | null;
}

export interface ProjectUser {
  name: string;
  slug: string;
}

export async function initProject(options: InitProjectOptions): Promise<InitProjectResult> {
  const createdPaths: string[] = [];
  const tuteurRoot = resolve(options.projectRoot, '.tuteur');

  ensureDir(tuteurRoot, createdPaths);
  ensureDir(resolve(tuteurRoot, 'spec'), createdPaths);
  ensureDir(resolve(tuteurRoot, 'workflows'), createdPaths);
  ensureDir(resolve(tuteurRoot, 'tasks'), createdPaths);
  ensureDir(resolve(tuteurRoot, 'runtime'), createdPaths);
  ensureDir(resolve(tuteurRoot, 'workspace'), createdPaths);

  writeTextIfMissing(
    resolve(tuteurRoot, '.gitignore'),
    [
      '# User identity and local runtime state',
      '.user',
      'runtime/',
      'workspace/',
      '',
      '# Temporary files',
      '*.tmp',
      '*.new',
      '',
    ].join('\n'),
    createdPaths,
  );

  writeJsonIfMissing(
    resolve(tuteurRoot, 'config.json'),
    {
      version: '0.1.0',
      defaultWorkflow: 'default',
      defaultAgent: options.agents?.[0] ?? null,
      tasks: {
        defaultFilter: 'mine',
        ownerFields: ['creator', 'assignee'],
      },
      dashboard: {
        host: '127.0.0.1',
        port: 47321,
        defaultTaskFilter: 'mine',
      },
    },
    createdPaths,
  );

  writeJsonIfMissing(
    resolve(tuteurRoot, 'context.json'),
    {
      default: {
        required: [],
        optional: [],
        disabled: [],
      },
      agents: {},
    },
    createdPaths,
  );

  writeJsonIfMissing(
    resolve(tuteurRoot, 'workflows/default.workflow.json'),
    {
      id: 'default',
      name: 'Default Coding Workflow',
      version: '0.1.0',
      phases: [
        {
          id: 'planning',
          name: 'Planning',
          steps: [
            { id: 'brainstorm', skillRef: 'brainstorm', required: true },
            { id: 'grill-me', skillRef: 'grill-me', required: true },
          ],
        },
        {
          id: 'execute',
          name: 'Execute',
          steps: [
            { id: 'dev', skillRef: 'dev', required: true },
            { id: 'check', skillRef: 'check', required: true },
          ],
        },
        {
          id: 'finish',
          name: 'Finish',
          steps: [{ id: 'finish', skillRef: 'finish', required: true }],
        },
      ],
    },
    createdPaths,
  );

  installCanonicalWorkflowSkills({
    projectRoot: options.projectRoot,
    createdPaths,
  });

  const currentUser = options.user ? writeProjectUser(tuteurRoot, options.user, createdPaths) : null;

  const installedAgents: AgentTool[] = [];
  for (const agent of options.agents ?? []) {
    const result = await configureAgentPlatform(agent, {
      projectRoot: options.projectRoot,
      createdPaths,
      skillAdapterMode: options.skillAdapterMode ?? 'symlink',
    });

    if (result.configured) {
      installedAgents.push(agent);
    }
  }

  return {
    projectRoot: options.projectRoot,
    createdPaths,
    installedAgents,
    currentUser,
  };
}

function writeProjectUser(tuteurRoot: string, name: string, createdPaths: string[]): ProjectUser {
  const currentUser = {
    name: name.trim(),
    slug: slugifyUserName(name),
  };
  const now = new Date().toISOString();

  writeText(
    resolve(tuteurRoot, '.user'),
    `${JSON.stringify(
      {
        ...currentUser,
        initializedAt: now,
      },
      null,
      2,
    )}\n`,
    createdPaths,
  );

  const userWorkspace = resolve(tuteurRoot, 'workspace', currentUser.slug);
  ensureDir(userWorkspace, createdPaths);
  writeTextIfMissing(
    resolve(userWorkspace, 'index.md'),
    `# ${currentUser.name}\n\nLocal Tuteur workspace.\n`,
    createdPaths,
  );

  return currentUser;
}

function slugifyUserName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'user';
}
