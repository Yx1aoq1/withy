import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import { getCliContext } from '../context.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 47321;

interface DashboardState {
  pid?: number;
  host?: string;
  port?: number;
  url?: string;
  projectRoot?: string;
  startedAt?: string;
}

export function registerDashboardCommand(program: Command): void {
  const dashboard = program
    .command('dashboard')
    .alias('dashbord')
    .description('Manage the local dashboard background process');

  dashboard.command('start').description('Start the dashboard in the background').action(startDashboard);

  dashboard.command('stop').description('Stop the dashboard background process').action(stopDashboard);
}

function startDashboard(): void {
  const context = getCliContext();
  const runtimeDir = resolve(context.projectRoot, '.tuteur/runtime');
  const statePath = resolve(runtimeDir, 'dashboard.json');
  mkdirSync(runtimeDir, { recursive: true });

  const currentState = readDashboardState(statePath);
  if (currentState?.pid && isProcessAlive(currentState.pid)) {
    console.log(`Dashboard already running: ${currentState.url ?? defaultDashboardUrl()}`);
    return;
  }

  const child = spawn(
    'pnpm',
    ['--filter', '@tuteur/app', 'exec', 'next', 'dev', '--hostname', DEFAULT_HOST, '--port', String(DEFAULT_PORT)],
    {
      cwd: context.workspaceRoot,
      detached: true,
      env: {
        ...process.env,
        TUTEUR_PROJECT_ROOT: context.projectRoot,
      },
      stdio: 'ignore',
    },
  );
  child.unref();

  const url = defaultDashboardUrl();
  writeFileSync(
    statePath,
    JSON.stringify(
      {
        pid: child.pid,
        host: DEFAULT_HOST,
        port: DEFAULT_PORT,
        url,
        projectRoot: context.projectRoot,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(`Dashboard started: ${url}`);
}

function stopDashboard(): void {
  const context = getCliContext();
  const statePath = resolve(context.projectRoot, '.tuteur/runtime/dashboard.json');
  const currentState = readDashboardState(statePath);

  if (!currentState) {
    console.log('Dashboard is not running.');
    return;
  }

  if (currentState.pid && isProcessAlive(currentState.pid)) {
    process.kill(currentState.pid, 'SIGTERM');
  }
  rmSync(statePath, { force: true });
  console.log('Dashboard stopped.');
}

function readDashboardState(statePath: string): DashboardState | null {
  if (!existsSync(statePath)) {
    return null;
  }

  return JSON.parse(readFileSync(statePath, 'utf8')) as DashboardState;
}

function defaultDashboardUrl(): string {
  return `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
