#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const sourceRoot = resolve('.');
const sandboxRoot = join(tmpdir(), `mo-smoke-${Date.now()}`);
const repoRoot = join(sandboxRoot, 'repo');
const nodeCmd = process.execPath;
const isWin = process.platform === 'win32';

const copyItems = [
  'MO_START.md',
  'README.md',
  'package.json',
  'package-lock.json',
  'BASELINE.json',
  'tsconfig.json',
  'wrangler.jsonc',
  'worker-configuration.d.ts',
  'manifest.json',
  'VERSION',
  'CHANGELOG.md',
  'RELEASE_NOTES.md',
  'src',
  'scripts',
  'migrations',
  'docs',
  'developer',
  '.updates/README.md',
  '.editorconfig',
  '.gitignore',
  '.env.example',
  '.prettierrc',
  '.zipignore'
];

function log(step, message) {
  console.log(`[${step}] ${message}`);
}

function run(step, command, args) {
  log(step, `${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, CI: '1' }
  });
}

function assertExists(step, path) {
  if (!existsSync(path)) throw new Error(`[${step}] missing: ${path}`);
}

function assertMissing(step, path) {
  if (existsSync(path)) throw new Error(`[${step}] deprecated path still exists: ${path}`);
}

function ensureSandboxNodeModules() {
  const sourceModules = join(sourceRoot, 'node_modules');
  const targetModules = join(repoRoot, 'node_modules');

  if (!existsSync(sourceModules)) {
    throw new Error('[0] missing source node_modules. Please run npm install once in the repo before smoke:tools.');
  }

  if (existsSync(targetModules)) return;

  if (isWin) {
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'mklink', '/J', targetModules, sourceModules], {
      stdio: 'inherit'
    });
  } else {
    symlinkSync(sourceModules, targetModules, 'dir');
  }
}

function setupSandbox() {
  rmSync(sandboxRoot, { recursive: true, force: true });
  mkdirSync(repoRoot, { recursive: true });
  for (const item of copyItems) {
    const src = join(sourceRoot, item);
    if (!existsSync(src)) continue;
    cpSync(src, join(repoRoot, item), { recursive: true, force: true });
  }
  mkdirSync(join(repoRoot, '.updates', 'backup'), { recursive: true });
  mkdirSync(join(repoRoot, '.updates', 'inbox'), { recursive: true });
  mkdirSync(join(repoRoot, '.updates', 'outbox', 'release'), { recursive: true });
  mkdirSync(join(repoRoot, '.updates', 'outbox', 'dev'), { recursive: true });
  mkdirSync(join(repoRoot, '.updates', 'outbox', 'handoff'), { recursive: true });
  writeFileSync(join(repoRoot, '.updates', 'backup', 'deprecated.txt'), 'deprecated');
  ensureSandboxNodeModules();
}

try {
  setupSandbox();

  log('0', 'reuse installed node_modules from source repo');
  run('1', nodeCmd, ['scripts/sync-structure.mjs']);
  assertMissing('1', join(repoRoot, '.updates', 'backup'));
  assertMissing('1', join(repoRoot, '.updates', 'outbox', 'dev'));
  assertMissing('1', join(repoRoot, '.updates', 'outbox', 'release'));
  assertMissing('1', join(repoRoot, '.updates', 'outbox', 'handoff'));
  run('2', nodeCmd, ['scripts/doctor.mjs']);
  run('2b', nodeCmd, ['scripts/guard.mjs']);
  run('2c', nodeCmd, ['scripts/sanity.mjs']);
  run('3', nodeCmd, ['scripts/pack-dev.mjs']);
  assertExists('3', join(repoRoot, '.updates', 'outbox', 'market-observer_dev_latest.zip'));

  run('4', nodeCmd, ['scripts/pack-patch.mjs']);
  assertExists('4', join(repoRoot, '.updates', 'outbox', 'market-observer_patch_latest.zip'));
  cpSync(
    join(repoRoot, '.updates', 'outbox', 'market-observer_patch_latest.zip'),
    join(repoRoot, '.updates', 'inbox', 'market-observer_patch_latest.zip'),
    { force: true }
  );
  run('5', nodeCmd, ['scripts/apply-patch.mjs']);
  assertExists('5', join(repoRoot, '.updates', 'bak'));
  assertExists('5', join(repoRoot, '.updates', 'repo-backup'));
  assertMissing('5', join(repoRoot, '.updates', 'backup'));
  assertMissing('5', join(repoRoot, '.updates', 'outbox', 'dev'));
  assertMissing('5', join(repoRoot, '.updates', 'outbox', 'release'));

  run('6', nodeCmd, ['scripts/pack-release.mjs']);
  assertExists('6', join(repoRoot, '.updates', 'outbox', 'market-observer_release_latest.zip'));
  run('6b', nodeCmd, ['scripts/validate-artifacts.mjs']);
  run('6c', nodeCmd, ['scripts/guard.mjs']);
  run('6d', nodeCmd, ['scripts/sanity.mjs']);

  mkdirSync(join(repoRoot, '.updates', 'backup'), { recursive: true });
  mkdirSync(join(repoRoot, '.updates', 'outbox', 'release'), { recursive: true });
  writeFileSync(join(repoRoot, '.updates', 'backup', 'deprecated.txt'), 'deprecated-again');

  cpSync(
    join(repoRoot, '.updates', 'outbox', 'market-observer_release_latest.zip'),
    join(repoRoot, '.updates', 'inbox', 'market-observer_release_latest.zip'),
    { force: true }
  );
  run('7', nodeCmd, ['scripts/apply-update.mjs']);
  assertMissing('7', join(repoRoot, '.updates', 'backup'));
  assertMissing('7', join(repoRoot, '.updates', 'outbox', 'release'));
  assertMissing('7', join(repoRoot, '.updates', 'outbox', 'dev'));
  assertMissing('7', join(repoRoot, '.updates', 'outbox', 'handoff'));

  assertExists('7', join(repoRoot, '.updates', 'history'));
  assertExists('7', join(repoRoot, '.updates', 'bak'));
  assertExists('7', join(repoRoot, '.updates', 'repo-backup'));

  log('OK', `Smoke test passed in ${repoRoot}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
