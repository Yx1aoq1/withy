import { createRequire } from 'node:module';
import { Command } from 'commander';
import { registerCommands } from './commands/index.js';
import { CLI_COMMAND_NAME } from './constants/product.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version: string };

export async function createCliProgram(): Promise<Command> {
  const program = new Command();

  program
    .name(CLI_COMMAND_NAME)
    .description('Local-first workflow harness for AI coding agents')
    .version(packageJson.version);

  await registerCommands(program);

  return program;
}
