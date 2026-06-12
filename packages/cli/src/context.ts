import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface CliContext {
  projectRoot: string;
  workspaceRoot: string;
}

export function getCliContext(): CliContext {
  const projectRoot = getInvocationRoot();

  return {
    projectRoot,
    workspaceRoot: findWorkspaceRoot(projectRoot),
  };
}

export function getInvocationRoot(): string {
  if (process.env.TUTEUR_PROJECT_ROOT) {
    return resolve(process.env.TUTEUR_PROJECT_ROOT);
  }

  return process.env.INIT_CWD ? resolve(process.env.INIT_CWD) : process.cwd();
}

function findWorkspaceRoot(start: string): string {
  let current = start;

  while (true) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return start;
    }

    current = parent;
  }
}
