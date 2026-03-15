#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { countFilesRecursive, createZip, extractZip } from './_pack_common.mjs';
import { nowTag } from './_util.mjs';

const root = resolve('.');
const updatesDir = join(root, '.updates');
const inbox = join(updatesDir, 'inbox');
const bak = join(updatesDir, 'bak');
const work = join(updatesDir, 'work');
const history = join(updatesDir, 'history');
const repoBackup = join(updatesDir, 'repo-backup');
const cleanupRemoved = [];

function removeDeprecatedDirs() {
  const deprecatedDirs = [
    join(updatesDir, 'backup'),
    join(updatesDir, 'outbox', 'dev'),
    join(updatesDir, 'outbox', 'patch'),
    join(updatesDir, 'outbox', 'release'),
    join(updatesDir, 'outbox', 'handoff')
  ];
  for (const dir of deprecatedDirs) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      if (!existsSync(dir)) cleanupRemoved.push(relative(root, dir));
    }
  }
}


for (const p of [inbox, bak, work, history, repoBackup]) mkdirSync(p, { recursive: true });

const expectedName = 'market-observer_release_latest.zip';
const zipPath = join(inbox, expectedName);
if (!existsSync(zipPath)) {
  console.error(`Missing ${expectedName} in .updates/inbox`);
  process.exit(1);
}

const tag = nowTag();
const archivedZip = join(bak, expectedName.replace(/_latest\.zip$/i, `_${tag}.zip`));
const backupZip = join(repoBackup, `market-observer_repo_${tag}.zip`);

const items = [
  'MO_START.md',
  'README.md',
  'BASELINE.json',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'wrangler.jsonc',
  'worker-configuration.d.ts',
  'manifest.json',
  'VERSION',
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
  '.zipignore',
  'CHANGELOG.md',
  'RELEASE_NOTES.md'
];

function topLevelEntries(dir) {
  return readdirSync(dir)
    .filter((name) => name !== '.updates')
    .sort();
}

function applyWorktree(stageDir, projectRoot) {
  const entries = topLevelEntries(stageDir);
  if (entries.length === 0) throw new Error('no extracted entries to apply');
  for (const name of entries) {
    const src = join(stageDir, name);
    const dest = join(projectRoot, name);
    cpSync(src, dest, { recursive: true, force: true });
  }
  const updateReadme = join(stageDir, '.updates', 'README.md');
  if (existsSync(updateReadme)) {
    cpSync(updateReadme, join(projectRoot, '.updates', 'README.md'), { force: true });
  }
  return entries;
}

function requireNonEmptyFile(path, label) {
  if (!existsSync(path)) throw new Error(`${label} missing: ${relative(root, path)}`);
  const st = statSync(path);
  if (!st.isFile() || st.size === 0) throw new Error(`${label} empty: ${relative(root, path)}`);
  return st.size;
}

try {
  console.log('Update: creating repository backup...');
  await createZip(root, backupZip, items);
  const backupBytes = requireNonEmptyFile(backupZip, 'repo backup');

  console.log('Update: extracting release package into .updates/work ...');
  extractZip(zipPath, work);
  const extractedFiles = countFilesRecursive(work);
  if (extractedFiles === 0) {
    throw new Error('extracted work directory is empty');
  }

  console.log('Update: applying extracted files to repository root...');
  const appliedEntries = applyWorktree(work, root);
  console.log('Update: archiving consumed release package...');
  renameSync(zipPath, archivedZip);

  removeDeprecatedDirs();
  const archivedBytes = requireNonEmptyFile(archivedZip, 'archived release package');

  console.log('Update: writing history record...');
  const record = {
    applied_at: new Date().toISOString(),
    command: 'update',
    inbox_entry: expectedName,
    package_name: basename(archivedZip),
    moved_to_bak: relative(root, archivedZip),
    repo_backup: relative(root, backupZip),
    repo_backup_bytes: backupBytes,
    extracted_to: relative(root, work),
    extracted_files: extractedFiles,
    applied_entries: appliedEntries,
    archived_bytes: archivedBytes,
    cleanup_removed: cleanupRemoved,
    status: 'applied'
  };
  writeFileSync(join(history, `update_${tag}.json`), JSON.stringify(record, null, 2));
  console.log('Update completed successfully.');
  console.log(`- backup: ${relative(root, backupZip)}`);
  console.log(`- archived package: ${relative(root, archivedZip)}`);
  console.log(`- work files: ${extractedFiles}`);
  console.log(`- applied entries: ${appliedEntries.join(', ')}`);
  if (cleanupRemoved.length) console.log(`- cleanup removed: ${cleanupRemoved.join(', ')}`);
} catch (error) {
  console.error('Update failed. Inbox package preserved for retry.');
  throw error;
}
