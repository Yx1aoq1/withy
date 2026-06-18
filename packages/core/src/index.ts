// Explicit named re-exports (no `export *`): better tree-shaking + faster type
// resolution, and the public surface stays auditable. See CLAUDE.md.

export {
  DASHBOARD_PROJECT_ROOT_ENV,
  DASHBOARD_SERVICE_NAME,
  DASHBOARD_PACKAGE_NAME,
  DEFAULT_STUCK_THRESHOLD,
  PRODUCT_DISPLAY_NAME,
  SKILL_NAME_PREFIX,
  getSlashCommandPrefix,
  getBundledSkillName,
  CLI_COMMAND_NAME,
  PROJECT_DIR_NAME,
  GLOBAL_DIR_NAME,
  EVENT_REASON_MAX,
  toDirectoryName,
  PHASE_PLANNING,
  PHASE_EXECUTE,
  PRODUCT_SLUG,
  PHASE_FINISH,
} from './constants.js';

export {
  ProjectsRegistrySchema,
  ApprovalRecordSchema,
  ContextConfigSchema,
  ChecklistItemSchema,
  WorkflowNodeSchema,
  ArtifactSpecSchema,
  DecisionRecordSchema,
  TaskPrioritySchema,
  TaskStatusSchema,
  ChecklistSchema,
  ProjectRefSchema,
  SwitchNodeSchema,
  DeveloperSchema,
  PositionSchema,
  TaskEventSchema,
  SkillNodeSchema,
  ApprovalsSchema,
  WorkflowSchema,
  BranchSchema,
  PhaseSchema,
  StateSchema,
  TaskSchema,
  GateSchema,
} from './types.js';
export type {
  ProjectsRegistry,
  ContextConfig,
  ChecklistItem,
  DecisionRecord,
  TaskPriority,
  WorkflowNode,
  ArtifactSpec,
  ProjectRef,
  TaskStatus,
  SwitchNode,
  Position,
  Checklist,
  Developer,
  Approvals,
  SkillNode,
  TaskEvent,
  Workflow,
  Branch,
  Phase,
  State,
  Gate,
  Task,
} from './types.js';

export {
  currentTaskPointerPath,
  projectsRegistryPath,
  knowledgeWikiPath,
  resolveProjectScope,
  resolveGlobalScope,
  globalConfigPath,
  detectTuteur,
  knowledgeDir,
  workflowsDir,
  workflowPath,
  guidePath,
  archiveDir,
  runtimeDir,
  tasksDir,
  taskPath,
  taskDir,
} from './paths.js';
export type { Scope } from './paths.js';

export {
  writeCurrentTaskPointer,
  clearCurrentTaskPointer,
  readCurrentTaskPointer,
  listKnowledgeFiles,
  writeKnowledgeFile,
  readKnowledgeSource,
  readContextConfig,
  addChecklistItem,
  setChecklistItem,
  writeChecklist,
  readChecklist,
  readDeveloper,
  upsertProject,
  readProjects,
  writeWorkflow,
  readWorkflow,
  appendEvent,
  isApproved,
  readEvents,
  taskExists,
  writeState,
  readState,
  StoreError,
  writeTask,
  listTasks,
  readTask,
  readGuide,
} from './store.js';
export type { ListTasksOptions, KnowledgeFile } from './store.js';

export { countConsecutiveFailures, resolveCurrentTask, checklistProgress, archiveTask, isStuck } from './task.js';
export type { ArchiveOptions, CurrentTask } from './task.js';

export {
  approveCurrentNode,
  validateWorkflow,
  deriveStatus,
  initialState,
  nodeById,
  rewindTo,
  skipNode,
  nextNode,
  phaseOf,
} from './workflow/index.js';
export type {
  ValidateContext,
  WorkflowIssue,
  BranchView,
  NextOptions,
  NextResult,
  NextStep,
} from './workflow/index.js';

export { resolvePlannedContext } from './context.js';
export type { PlannedEntry } from './context.js';

export {
  rebuildKnowledgeIndexes,
  buildKnowledgeIndexes,
  deriveKnowledgeGraph,
  listKnowledgePages,
  readKnowledgeEntry,
  deriveMergedGraph,
  lintKnowledge,
} from './knowledge.js';
export type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  KnowledgeIndexFile,
  KnowledgeEntry,
  KnowledgeGraph,
  KnowledgeIssue,
  KnowledgePage,
  InjectMode,
} from './knowledge.js';

export { logicalSkillName, resolveSkillRef, discoverSkills, skillExists } from './skills.js';
export type { DiscoveredSkill, ResolvedSkill } from './skills.js';

export { renderSessionStart } from './hook.js';
export type { SessionStartResult } from './hook.js';

export { serializeToCommand, toSkillAdapterMode, INIT_QUESTIONS } from './init-config.js';
export type { SkillInstallMode, InitQuestion, InitChoice, InitConfig } from './init-config.js';

export {
  CANONICAL_SKILL_DIR,
  getInitAgentChoices,
  getProjectSkillDirs,
  getGlobalSkillDirs,
  getAgentPlatform,
  AGENT_PLATFORMS,
} from './agents/index.js';
export type {
  RegisteredAgentPlatformConfig,
  ConfigureAgentContext,
  ConfigureAgentResult,
  PlatformConfigurator,
  AgentPlatformConfig,
  SkillAdapterMode,
  TemplateContext,
  AgentTool,
} from './agents/index.js';

export {
  writeJsonFileIfMissing,
  writeTextIfMissing,
  existsNonEmpty,
  readGitStatus,
  writeJsonFile,
  readJsonFile,
  isDirectory,
  dirExists,
  ensureDir,
  writeText,
  moveDir,
  slugify,
  nowIso,
} from './utils/index.js';
export type { GitStatus } from './utils/index.js';
