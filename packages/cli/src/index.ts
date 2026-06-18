#!/usr/bin/env node
import { createCliProgram } from './program.js';

try {
  const program = await createCliProgram();
  await program.parseAsync();
} catch (error) {
  const message = formatErrorMessage(error);
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(1);
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
