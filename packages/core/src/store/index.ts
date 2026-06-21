// Store layer barrel — the single carry-disk face over `.withy/`. Explicit named
// re-exports only (no `export *`, CLAUDE.md): the public surface stays auditable
// and tree-shakeable. Internal helpers (readValidated, taskReadPath) are imported
// directly between store files and intentionally kept out of this barrel.

export { StoreError } from './errors.js';

export { taskExists, listTasks, writeTask, readTask } from './tasks.js';
export type { ListTasksOptions } from './tasks.js';

export { isApproved, writeState, readState } from './state.js';

export { appendEvent, readEvents } from './events.js';

export { writeWorkflow, readWorkflow } from './workflows.js';

export {
  writeCurrentTaskPointer,
  clearCurrentTaskPointer,
  readCurrentTaskPointer,
  findProjectByName,
  removeProject,
  upsertProject,
  readProjects,
} from './projects.js';

export {
  listTaskArtifacts,
  readContextConfig,
  readImplementation,
  readTaskArtifact,
  readDeveloper,
  readGuide,
} from './meta.js';

export {
  listKnowledgeFiles,
  writeKnowledgeFile,
  readKnowledgeSource,
  removeWikiEntry,
  listWikiEntries,
  wikiEntryType,
  writeWikiFile,
  moveWikiEntry,
  readWikiFile,
  makeWikiDir,
} from './knowledge.js';
export type { KnowledgeFile, WikiEntry } from './knowledge.js';
