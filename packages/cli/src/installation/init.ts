import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import {
  writeJsonFileIfMissing,
  projectsRegistryPath,
  resolveGlobalScope,
  toSkillAdapterMode,
  writeTextIfMissing,
  globalConfigPath,
  upsertProject,
  readJsonFile,
  readTextFile,
  workflowPath,
  dirExists,
  ensureDir,
  writeText,
  slugify,
} from '@withy/core';
import {
  configureAgentPlatform,
  installCanonicalWorkflowSkills,
  type AgentTool,
  type SkillAdapterMode,
} from '../configurators/index.js';
import { PRODUCT_DISPLAY_NAME, PROJECT_DIR_NAME } from '../constants/product.js';
import { getInstalledWorkflowSkillTemplates, recordCurrentTemplateHashes } from './managed-templates.js';
import type { SkillInstallMode, InitConfig, Workflow } from '@withy/core';

// CLI 模板根目录(由 copy-assets 拷到 dist/templates)。按子目录分工:
//   workflow/   Withy 专属工程配置(config.yaml / guide.md / workflow.json)
//   knowledge/  知识库种子(index.md / log.md)
//   common/     skill 与 agent 通用配置
// init.ts 只负责编排与变量替换,内容全部外置到这些模板文件。
const TEMPLATES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../templates');

// 读模板文件(路径相对 TEMPLATES_ROOT)并做 {{TOKEN}} 文本替换。模板含占位符,
// 渲染前不是合法 YAML/MD,故不进 prettier(见 .prettierignore)。
function renderTemplate(relativePath: string, tokens: Record<string, string> = {}): string {
  let out = readTextFile(resolve(TEMPLATES_ROOT, relativePath));
  for (const [token, value] of Object.entries(tokens)) {
    out = out.replaceAll(token, value);
  }
  return out;
}

// Default coding workflow seeded into both project and global roots (core §4.3):
// the linear chain brainstorm → grill-me → dev → check → finish lives in
// templates/workflow/workflow.json, the single on-disk source shared by project
// init and the global template.
const DEFAULT_WORKFLOW = readJsonFile(resolve(TEMPLATES_ROOT, 'workflow/workflow.json')) as Workflow;

// 会话开场说明种子(.withy/guide.md):用户可直接编辑,session-start 注入文本开头注全文。
const GUIDE_TEMPLATE = renderTemplate('workflow/guide.md', {
  '{{PRODUCT_NAME}}': PRODUCT_DISPLAY_NAME,
  '{{PROJECT_DIR}}': PROJECT_DIR_NAME,
});

// 全局配置种子(~/.withy/config.yaml)。用 YAML 是为了允许用户手编时写注释;
// 将来 web 设置页写回须走 yaml 的 Document/CST 模式做保留式 round-trip,勿整体重写。
function buildGlobalConfigYaml(skills: SkillInstallMode): string {
  return renderTemplate('workflow/config.global.yaml', {
    '{{PRODUCT_NAME}}': PRODUCT_DISPLAY_NAME,
    '{{SKILLS}}': skills,
  });
}

// 项目配置种子(.withy/config.yaml,随仓库提交)。注释保留约定同上。
function buildProjectConfigYaml(agent: AgentTool | null): string {
  return renderTemplate('workflow/config.project.yaml', {
    '{{PRODUCT_NAME}}': PRODUCT_DISPLAY_NAME,
    '{{DEFAULT_AGENT}}': String(agent ?? 'null'),
  });
}

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
  // Project root, or the global ~/.withy directory.
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
 * Initialize the global root `~/.withy/`: config + project registry + workflow
 * template + an empty knowledge base. No agent configuration, no developer
 * identity, no workspace roster — the global root never holds agent dirs (core
 * §2.3 safety boundary).
 */
export async function initGlobal(config: InitConfig): Promise<InitResult> {
  const createdPaths: string[] = [];
  const scope = resolveGlobalScope();

  ensureDir(scope.withyDir, createdPaths);
  ensureDir(resolve(scope.withyDir, 'workflows'), createdPaths);
  seedKnowledgeBase(scope.withyDir, createdPaths);

  writeTextIfMissing(globalConfigPath(scope), buildGlobalConfigYaml(config.skills), createdPaths);

  writeJsonFileIfMissing(projectsRegistryPath(scope), { projects: [] }, createdPaths);
  writeJsonFileIfMissing(workflowPath(scope, DEFAULT_WORKFLOW.id), DEFAULT_WORKFLOW, createdPaths);

  return {
    scope: 'global',
    root: scope.withyDir,
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
    if (!dirExists(globalScope.withyDir)) return null;
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

  writeTextIfMissing(
    resolve(projectDir, 'config.yaml'),
    buildProjectConfigYaml(options.agents?.[0] ?? null),
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

// 把 templates/<srcDir> 整棵目录镜像到 targetDir:目录照建,文件缺失则补写(幂等)。
// `.gitkeep` 只是模板侧空目录占位(让空目录进 git/dist),不拷进产物。
function mirrorTemplateTree(srcDir: string, targetDir: string, createdPaths: string[]): void {
  ensureDir(targetDir, createdPaths);
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const src = resolve(srcDir, entry.name);
    const dst = resolve(targetDir, entry.name);
    if (entry.isDirectory()) {
      mirrorTemplateTree(src, dst, createdPaths);
      continue;
    }
    if (entry.name === '.gitkeep') {
      continue;
    }
    writeTextIfMissing(dst, readTextFile(src), createdPaths);
  }
}

// Scaffold the knowledge base under `<withyDir>/knowledge/` by mirroring
// templates/knowledge/ (sources/ + wiki/ dirs and root index.md/log.md). Shared
// by project and global init — both levels share the same layout (knowledge.md §2/§12).
function seedKnowledgeBase(withyDir: string, createdPaths: string[]): void {
  mirrorTemplateTree(resolve(TEMPLATES_ROOT, 'knowledge'), resolve(withyDir, 'knowledge'), createdPaths);
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
