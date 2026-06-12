import { spawnSync } from 'node:child_process';

const build = spawnSync('pnpm', ['--silent', '--filter', '@tuteur/cli', 'build'], {
  encoding: 'utf8',
});

if (build.status !== 0) {
  process.stderr.write(build.stdout);
  process.stderr.write(build.stderr);
  process.exit(build.status ?? 1);
}

const cli = spawnSync(process.execPath, ['packages/cli/bin/index.js', ...process.argv.slice(2)], {
  stdio: 'inherit',
});

process.exit(cli.status ?? 1);
