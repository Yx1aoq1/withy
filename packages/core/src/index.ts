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
  SNAPSHOT_MAX,
  PRODUCT_SLUG,
  PHASE_FINISH,
  PROMPT_MAX,
} from './constants.js';

export {
  ProjectsRegistrySchema,
  ApprovalRecordSchema,
  DispatchConfigSchema,
  WorkflowNodeSchema,
  ArtifactSpecSchema,
  DecisionRecordSchema,
  ChecklistItemSchema,
  TaskPrioritySchema,
  TaskStatusSchema,
  ProjectRefSchema,
  SwitchNodeSchema,
  ChecklistSchema,
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
  DispatchReadEntry,
  DispatchConfig,
  ImplementationItem,
  DecisionRecord,
  ChecklistItem,
  ProgressView,
  TaskPriority,
  WorkflowNode,
  ArtifactSpec,
  ProjectRef,
  TaskStatus,
  SwitchNode,
  Checklist,
  Position,
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
  detectWithy,
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
  sweepPendingInjections,
  claimPendingInjection,
  writePendingInjection,
  readChecklistOrEmpty,
  writeChecklist,
  readChecklist,
  readProgress,
  listKnowledgeFiles,
  writeKnowledgeFile,
  readKnowledgeSource,
  listTaskArtifacts,
  readTaskArtifact,
  listKnowledgeEntries,
  listWikiEntries,
  dispatchExists,
  writeDispatch,
  readDispatch,
  readDeveloper,
  findProjectByName,
  removeProject,
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
  writeGuide,
  readGuide,
} from './store/index.js';
export type {
  PendingInjection,
  ListTasksOptions,
  KnowledgeTreeEntry,
  KnowledgeFile,
  WikiEntry,
} from './store/index.js';

export {
  countConsecutiveFailures,
  removeChecklistItems,
  editChecklistItem,
  resolveCurrentTask,
  implementationProgress,
  addChecklistItems,
  markChecklist,
  archiveTask,
  isStuck,
} from './task/index.js';
export type { ArchiveOptions, ChecklistEntry, CurrentTask } from './task/index.js';

export {
  approveCurrentNode,
  seedDispatchShell,
  isDispatchCurated,
  validateWorkflow,
  dispatchBlock,
  hasAgentNode,
  describeNext,
  deriveStatus,
  initialState,
  recordNote,
  relayNext,
  nodeById,
  rewindTo,
  skipNode,
  nextNode,
  phaseOf,
} from './workflow/index.js';
export type {
  ValidateContext,
  DispatchBlock,
  WorkflowIssue,
  BranchView,
  NextOptions,
  NextResult,
  NextStep,
} from './workflow/index.js';

export { resolvePlannedContext } from './session/index.js';
export type { PlannedEntry } from './session/index.js';

export {
  readKnowledgePageContent,
  rebuildKnowledgeIndexes,
  buildKnowledgeIndexes,
  createKnowledgeFolder,
  deleteKnowledgeEntry,
  deriveKnowledgeGraph,
  renameKnowledgeEntry,
  saveKnowledgePageBody,
  createKnowledgePage,
  listKnowledgePages,
  deriveMergedGraph,
  docsCoveringPath,
  readKnowledgeEntry,
  coverageForDoc,
  readGraphCached,
  writeGraphCache,
  KnowledgeError,
  lintKnowledge,
  relatedDocs,
} from './knowledge/index.js';
export type {
  KnowledgePageContent,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  KnowledgeIndexFile,
  KnowledgeEntry,
  KnowledgeGraph,
  KnowledgeIssue,
  KnowledgePage,
  InjectMode,
} from './knowledge/index.js';

export { logicalSkillName, resolveSkillRef, discoverSkills, skillExists } from './agents/index.js';
export type { DiscoveredSkill, ResolvedSkill } from './agents/index.js';

export {
  removeAgentDefinition,
  writeAgentDefinition,
  readAgentDefinition,
  canonicalAgentPath,
  resolveAgentRef,
  discoverAgents,
  agentExists,
} from './agents/index.js';
export type { DiscoveredAgent, ResolvedAgent } from './agents/index.js';

export { getAgentDeliveryStatus, removeAgentDelivery, deployAgents } from './agents/index.js';
export type { AgentDeliveryStatus, AgentDeliveryState } from './agents/index.js';

export { renderUserPromptSubmit, renderSessionStart } from './session/index.js';
export type { SessionStartResult } from './session/index.js';

export { serializeToCommand, toSkillAdapterMode, INIT_QUESTIONS } from './agents/index.js';
export type { SkillInstallMode, InitQuestion, InitChoice, InitConfig } from './agents/index.js';

export {
  sessionIdFromHookPayload,
  getProjectAgentDirs,
  getGlobalAgentDirs,
  CANONICAL_SKILL_DIR,
  CANONICAL_AGENT_DIR,
  getInitAgentChoices,
  getProjectSkillDirs,
  getGlobalSkillDirs,
  resolveSessionId,
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
  AgentFormat,
  AgentDef,
  AgentTool,
} from './agents/index.js';

export {
  writeJsonFileIfMissing,
  writeTextIfMissing,
  existsNonEmpty,
  readGitStatus,
  writeJsonFile,
  readJsonFile,
  readTextFile,
  isDirectory,
  dirExists,
  ensureDir,
  writeText,
  moveDir,
  slugify,
  nowIso,
} from './utils/index.js';
export type { GitStatus } from './utils/index.js';
