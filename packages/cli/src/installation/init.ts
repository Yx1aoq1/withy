import { resolve } from 'node:path';
import { ensureDir, slugify, writeJsonFileIfMissing, writeText, writeTextIfMissing } from '@tuteur/core';
import {
  configureAgentPlatform,
  installCanonicalWorkflowSkills,
  type AgentTool,
  type SkillAdapterMode,
} from '../configurators/index.js';
import { PRODUCT_DISPLAY_NAME, PROJECT_DIR_NAME } from '../constants/product.js';
import { getInstalledWorkflowSkillTemplates, recordCurrentTemplateHashes } from './managed-templates.js';

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
  const projectDir = resolve(options.projectRoot, PROJECT_DIR_NAME);

  ensureDir(projectDir, createdPaths);
  ensureDir(resolve(projectDir, 'spec'), createdPaths);
  ensureDir(resolve(projectDir, 'workflows'), createdPaths);
  ensureDir(resolve(projectDir, 'tasks'), createdPaths);
  ensureDir(resolve(projectDir, 'runtime'), createdPaths);
  ensureDir(resolve(projectDir, 'workspace'), createdPaths);

  writeTextIfMissing(
    resolve(projectDir, '.gitignore'),
    [
      '# Developer identity and local runtime state',
      '# (workspace/ is committed — its subdirs are the project member roster)',
      '.developer',
      'runtime/',
      '',
      '# Temporary files',
      '*.tmp',
      '*.new',
      '',
    ].join('\n'),
    createdPaths,
  );

  writeJsonFileIfMissing(
    resolve(projectDir, 'config.json'),
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

  writeJsonFileIfMissing(
    resolve(projectDir, 'context.json'),
    {
      default: {
        required: [],
        optional: [],
        disabled: [],
      },
      nodes: {},
    },
    createdPaths,
  );

  writeJsonFileIfMissing(
    resolve(projectDir, 'workflows/default.workflow.json'),
    {
      id: 'default',
      name: 'Default Coding Workflow',
      version: '0.3.0',
      entry: 'triage',
      phases: [
        { id: 'planning', label: '规划', entry: 'brainstorm' },
        { id: 'execute', label: '执行', entry: 'dev' },
        { id: 'finish', label: '收尾', entry: 'wrapup' },
      ],
      nodes: [
        {
          id: 'triage',
          type: 'switch',
          branches: [
            { label: 'standard', criteria: '常规需求,需要完整规划再开发', default: true, next: 'brainstorm' },
            { label: 'small', criteria: '改动小、风险低,可跳过规划直接开发', next: 'dev' },
            { label: 'research', criteria: '只需调研、产出结论,不写生产代码', next: 'wrapup' },
          ],
        },
        { id: 'brainstorm', type: 'skill', skill: 'brainstorm', phase: 'planning', next: 'grill-me' },
        {
          id: 'grill-me',
          type: 'skill',
          skill: 'grill-me',
          phase: 'planning',
          next: 'dev',
          gate: { artifacts: ['design.md'], approval: true },
        },
        { id: 'dev', type: 'skill', skill: 'dev', phase: 'execute', next: 'check' },
        {
          id: 'check',
          type: 'skill',
          skill: 'check',
          phase: 'execute',
          next: 'wrapup',
          gate: { checks: ['npm test'] },
        },
        { id: 'wrapup', type: 'skill', skill: 'finish', phase: 'finish', next: null },
      ],
    },
    createdPaths,
  );

  installCanonicalWorkflowSkills({
    projectRoot: options.projectRoot,
    createdPaths,
  });

  const currentUser = options.user ? writeProjectUser(projectDir, options.user, createdPaths) : null;

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

  recordCurrentTemplateHashes(
    options.projectRoot,
    getInstalledWorkflowSkillTemplates(options.projectRoot),
    createdPaths,
  );

  return {
    projectRoot: options.projectRoot,
    createdPaths,
    installedAgents,
    currentUser,
  };
}

function writeProjectUser(projectDir: string, name: string, createdPaths: string[]): ProjectUser {
  const currentUser = {
    name: name.trim(),
    slug: slugify(name, 'user'),
  };
  const now = new Date().toISOString();

  // Local developer identity (gitignored; mirrors Trellis `.developer`).
  writeText(
    resolve(projectDir, '.developer'),
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

  // Committed workspace dir — its presence registers this developer in the
  // project roster (the set of workspace/<slug>/ dirs is the member list).
  const userWorkspace = resolve(projectDir, 'workspace', currentUser.slug);
  ensureDir(userWorkspace, createdPaths);
  writeTextIfMissing(
    resolve(userWorkspace, 'index.md'),
    `# ${currentUser.name}\n\nLocal ${PRODUCT_DISPLAY_NAME} workspace.\n`,
    createdPaths,
  );

  return currentUser;
}
