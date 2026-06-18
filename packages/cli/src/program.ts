import { createRequire } from 'node:module';
import { Command } from 'commander';
import { registerCommands } from './commands/index.js';
import { configureOutput } from './harness/runtime.js';
import { CLI_COMMAND_NAME } from './constants/product.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version: string };

export async function createCliProgram(): Promise<Command> {
  const program = new Command();

  program
    .name(CLI_COMMAND_NAME)
    .description('Local-first workflow harness for AI coding agents')
    .option('--json', 'Output a single structured JSON object')
    .version(packageJson.version);

  configureOutput(program);
  await registerCommands(program);

  return program;
}
