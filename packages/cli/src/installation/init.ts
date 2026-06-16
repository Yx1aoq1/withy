import { resolve, basename } from 'node:path';
import {
  writeJsonFileIfMissing,
  projectsRegistryPath,
  resolveGlobalScope,
  toSkillAdapterMode,
  writeTextIfMissing,
  globalConfigPath,
  upsertProject,
  workflowPath,
  dirExists,
  ensureDir,
  writeText,
  slugify,
} from '@tuteur/core';
import {
  configureAgentPlatform,
  installCanonicalWorkflowSkills,
  type AgentTool,
  type SkillAdapterMode,
} from '../configurators/index.js';
import { PRODUCT_DISPLAY_NAME, PROJECT_DIR_NAME } from '../constants/product.js';
import { getInstalledWorkflowSkillTemplates, recordCurrentTemplateHashes } from './managed-templates.js';
import { DEFAULT_WORKFLOW } from './default-workflow.js';
import type { InitConfig } from '@tuteur/core';

// 默认播种的会话开场说明:放在工具目录下供用户直接编辑,session-start 注入文本开头注全文
const GUIDE_TEMPLATE = `# 项目须知

这是一个由 ${PRODUCT_DISPLAY_NAME} 托管的项目。请按本次注入的 workflow 与任务状态推进:

- 流转只认 \`ttur complete <node>\`;agent 自称完成不等于步骤完成。
- 声明了产物 / 检查 / 审批的步骤,必须门禁通过才能推进。
- 不清楚下一步时,以注入的 Next-Action 为准。

> 想改这段开场说明,直接编辑 \`${PROJECT_DIR_NAME}/guide.md\`(或在控制台编辑)。
`;

// 知识库根索引种子:占位,由 \`ttur knowledge index\` 据 frontmatter 重算(knowledge.md §6.1)
const KNOWLEDGE_INDEX_SEED = `# Knowledge

_空知识库。把页写进 \`wiki/\`,再跑 \`ttur knowledge index\` 重算本目录。_
`;

// 知识库时间线种子:ingest/query/lint 由 agent 追加(knowledge.md §6.2)
const KNOWLEDGE_LOG_SEED = `# Knowledge log
`;

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

// Normalized result of any init run (project or global), for command output.
export interface InitResult {
  scope: 'project' | 'global';
  // Project root, or the global ~/.tuteur directory.
  root: string;
  createdPaths: string[];
  installedAgents: AgentTool[];
  user: ProjectUser | null;
  // Project path registered into the global registry, when a global root exists.
  registeredProject: string | null;
}

/**
 * Execute a structured `InitConfig`. Single entry shared by CLI flags/interactive
 * and (via the serialized command) the web initialize button — core §8.
 *
 * @param config the structured init selection
 * @param opts project scope uses `opts.projectRoot`; global scope ignores it
 */
export async function runInit(config: InitConfig, opts: { projectRoot: string }): Promise<InitResult> {
  if (config.scope === 'global') {
    return initGlobal(config);
  }

  const result = await initProject({
    projectRoot: opts.projectRoot,
    agents: config.agents,
    skillAdapterMode: toSkillAdapterMode(config.skills),
    user: config.user,
  });

  return {
    scope: 'project',
    root: result.projectRoot,
    createdPaths: result.createdPaths,
    installedAgents: result.installedAgents,
    user: result.currentUser,
    registeredProject: registerInGlobalRegistry(result.projectRoot),
  };
}

/**
 * Initialize the global root `~/.tuteur/`: config + project registry + workflow
 * template + an empty knowledge base. No agent configuration, no developer
 * identity, no workspace roster — the global root never holds agent dirs (core
 * §2.3 safety boundary).
 */
export async function initGlobal(config: InitConfig): Promise<InitResult> {
  const createdPaths: string[] = [];
  const scope = resolveGlobalScope();

  ensureDir(scope.tuteurDir, createdPaths);
  ensureDir(resolve(scope.tuteurDir, 'workflows'), createdPaths);
  seedKnowledgeBase(scope.tuteurDir, createdPaths);

  writeJsonFileIfMissing(
    globalConfigPath(scope),
    {
      version: '0.1.0',
      defaults: { agent: null, workflow: 'default', skills: config.skills },
      dashboard: { host: '127.0.0.1', port: 47321 },
    },
    createdPaths,
  );

  writeJsonFileIfMissing(projectsRegistryPath(scope), { projects: [] }, createdPaths);
  writeJsonFileIfMissing(workflowPath(scope, DEFAULT_WORKFLOW.id), DEFAULT_WORKFLOW, createdPaths);

  return {
    scope: 'global',
    root: scope.tuteurDir,
    createdPaths,
    installedAgents: [],
    user: null,
    registeredProject: null,
  };
}

// Best-effort: register the freshly-initialized project into the global registry
// when a global root exists. Registry bookkeeping must never fail a project init.
function registerInGlobalRegistry(projectRoot: string): string | null {
  try {
    const globalScope = resolveGlobalScope();
    if (!dirExists(globalScope.tuteurDir)) return null;
    upsertProject(globalScope, { path: projectRoot, name: basename(projectRoot) });
    return projectRoot;
  } catch {
    return null;
  }
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
  seedKnowledgeBase(projectDir, createdPaths);

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

  writeJsonFileIfMissing(resolve(projectDir, 'workflows/default.workflow.json'), DEFAULT_WORKFLOW, createdPaths);

  writeTextIfMissing(resolve(projectDir, 'guide.md'), GUIDE_TEMPLATE, createdPaths);

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

// Scaffold an empty knowledge base under `<tuteurDir>/knowledge/`: sources/ + wiki/
// dirs and seed root index.md/log.md. Shared by project and global init — both
// levels share the same layout (knowledge.md §2/§12).
function seedKnowledgeBase(tuteurDir: string, createdPaths: string[]): void {
  const base = resolve(tuteurDir, 'knowledge');
  ensureDir(resolve(base, 'sources'), createdPaths);
  ensureDir(resolve(base, 'wiki'), createdPaths);
  writeTextIfMissing(resolve(base, 'index.md'), KNOWLEDGE_INDEX_SEED, createdPaths);
  writeTextIfMissing(resolve(base, 'log.md'), KNOWLEDGE_LOG_SEED, createdPaths);
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
