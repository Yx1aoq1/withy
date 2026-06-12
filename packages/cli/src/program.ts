import { Command } from 'commander';
import { registerDashboardCommand } from './commands/dashboard.js';
import { registerInitCommand } from './commands/init.js';

export function createCliProgram(): Command {
  const program = new Command();

  program.name('tuteur').description('Local-first workflow harness for AI coding agents').version('0.0.0');

  registerInitCommand(program);
  registerDashboardCommand(program);

  return program;
}
