#!/usr/bin/env node

// On Node 22.x, node:sqlite is experimental and requires --experimental-sqlite flag.
// If node:sqlite is not accessible, automatically re-spawn with the required flag.
try {
  await import('node:sqlite');
} catch (err) {
  if (process.versions.node.startsWith('22.') && !process.execArgv.includes('--experimental-sqlite')) {
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync(
      process.execPath,
      ['--experimental-sqlite', ...process.execArgv, ...process.argv.slice(1)],
      {
        stdio: 'inherit',
        env: process.env,
      }
    );
    process.exit(result.status ?? 0);
  }
  console.error('Error loading SQLite module:', err);
  process.exit(1);
}

const { runCli } = await import('../dist/cli.js');

runCli().catch((err) => {
  console.error(err);
  process.exit(1);
});
