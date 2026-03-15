#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('.');
const requiredDirs = [
  '.updates/inbox',
  '.updates/outbox',
  '.updates/outbox/bak',
  '.updates/bak',
  '.updates/work',
  '.updates/history',
  '.updates/repo-backup',
  'developer'
];
const deprecatedDirs = [
  '.updates/backup',
  '.updates/outbox/dev',
  '.updates/outbox/dev/bak',
  '.updates/outbox/patch',
  '.updates/outbox/patch/bak',
  '.updates/outbox/release',
  '.updates/outbox/release/bak',
  '.updates/outbox/handoff',
  '.updates/outbox/handoff/bak'
];
const removed = [];

for (const dir of deprecatedDirs) {
  const p = join(root, dir);
  if (existsSync(p)) {
    rmSync(p, { recursive: true, force: true });
    if (!existsSync(p)) removed.push(dir);
  }
}

for (const dir of requiredDirs) {
  const p = join(root, dir);
  mkdirSync(p, { recursive: true });
}

const updatesReadme = join(root, '.updates', 'README.md');
writeFileSync(updatesReadme, `# .updates directory contract

- inbox/: incoming patch / release package waiting for mo patch / mo update
- work/: temporary extraction and staging area
- bak/: archive of consumed patch / release packages
- repo-backup/: repository snapshot before patch / update
- outbox/: generated dev / patch / release / handoff artifacts (single root, file-name based)
- outbox/bak/: archived previous *_latest.zip artifacts
- history/: update history and operation records

Deprecated directories that must not exist anymore:
- outbox/dev/
- outbox/patch/
- outbox/release/
- outbox/handoff/
- .updates/backup/
`);

console.log('Structure synced.');
if (removed.length) console.log(`Removed deprecated dirs: ${removed.join(', ')}`);
