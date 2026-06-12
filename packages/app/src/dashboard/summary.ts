import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface LocalUser {
  name: string;
  slug: string;
}

interface TaskRecord {
  creator?: string;
  assignee?: string;
}

export type TaskFilterMode = 'mine' | 'all';

export async function getDashboardSummary(requestedTaskFilter: TaskFilterMode = 'mine') {
  const projectRoot = process.env.TUTEUR_PROJECT_ROOT ?? process.cwd();
  const tuteurRoot = resolve(projectRoot, '.tuteur');
  const currentUser = readLocalUser(tuteurRoot);
  const taskFilter = currentUser && requestedTaskFilter === 'mine' ? 'mine' : 'all';
  const taskCounts = countTasks(tuteurRoot, currentUser, taskFilter);

  return {
    product: 'Tuteur',
    status: 'scaffold',
    currentUser,
    taskFilter,
    taskCounts,
    nextStep: 'Implement CLI-owned services',
  };
}

function readLocalUser(tuteurRoot: string): LocalUser | null {
  const userPath = resolve(tuteurRoot, '.user');
  if (!existsSync(userPath)) {
    return null;
  }

  try {
    const value = JSON.parse(readFileSync(userPath, 'utf8')) as Partial<LocalUser>;
    if (!value.name || !value.slug) {
      return null;
    }

    return {
      name: value.name,
      slug: value.slug,
    };
  } catch {
    return null;
  }
}

function countTasks(tuteurRoot: string, currentUser: LocalUser | null, taskFilter: TaskFilterMode) {
  const tasksRoot = resolve(tuteurRoot, 'tasks');
  if (!existsSync(tasksRoot)) {
    return {
      total: 0,
      mine: 0,
      visible: 0,
    };
  }

  const tasks = readdirSync(tasksRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => readTaskRecord(resolve(tasksRoot, entry.name, 'task.json')))
    .filter((task): task is TaskRecord => Boolean(task));

  const mine = currentUser ? tasks.filter(task => isOwnedByUser(task, currentUser)).length : 0;
  const visible = taskFilter === 'mine' ? mine : tasks.length;

  return {
    total: tasks.length,
    mine,
    visible,
  };
}

function readTaskRecord(path: string): TaskRecord | null {
  if (!existsSync(path)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(path, 'utf8')) as TaskRecord;
  } catch {
    return null;
  }
}

function isOwnedByUser(task: TaskRecord, user: LocalUser): boolean {
  return (
    task.creator === user.name ||
    task.creator === user.slug ||
    task.assignee === user.name ||
    task.assignee === user.slug
  );
}
