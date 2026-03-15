#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('.');
const requiredFiles = [
  'MO_START.md',
  'package.json',
  'BASELINE.json',
  'wrangler.jsonc',
  'tsconfig.json',
  'manifest.json',
  'VERSION',
  'RELEASE_NOTES.md',
  'src',
  'scripts',
  'docs/PROJECT.md',
  'docs/AI_MEMORY.md',
  'docs/NEXT_TASK.md',
  'docs/BUGS.md',
  'developer/SCRIPTS_GUIDE.md',
  'scripts/validate-artifacts.mjs',
  'scripts/runtime-invariants.mjs',
  'scripts/portfolio-verify.mjs',
  'scripts/recommendation-review.mjs',
  'scripts/recommendation-review-save.mjs',
  'scripts/recommendation-scoreboard.mjs',
  'scripts/baseline.mjs',
  'scripts/write-baseline.mjs',
  'scripts/_recommendation_review_lib.mjs',
  '.updates/README.md'
];
const requiredDirs = [
  '.updates/inbox',
  '.updates/outbox',
  '.updates/outbox/bak',
  '.updates/bak',
  '.updates/work',
  '.updates/history',
  '.updates/repo-backup'
];
const deprecatedDirs = [
  '.updates/backup',
  '.updates/outbox/dev',
  '.updates/outbox/patch',
  '.updates/outbox/release',
  '.updates/outbox/handoff'
];

let bad = 0;
for (const item of requiredFiles) {
  const ok = existsSync(resolve(item));
  console.log(`${ok ? '✅' : '❌'} ${item}`);
  if (!ok) bad++;
}
for (const dir of requiredDirs) {
  const p = resolve(dir);
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
  const ok = existsSync(p);
  console.log(`${ok ? '✅' : '❌'} ${dir}`);
  if (!ok) bad++;
}
for (const dir of deprecatedDirs) {
  if (existsSync(resolve(dir))) {
    console.log(`⚠️  deprecated directory detected: ${dir}`);
  }
}

const outbox = join(root, '.updates', 'outbox');
for (const name of ['dev', 'patch', 'release', 'handoff']) {
  const p = join(outbox, name);
  if (existsSync(p)) {
    console.error(`❌ deprecated outbox dir remains: .updates/outbox/${name}`);
    bad++;
  }
}

if (bad) process.exit(1);
console.log('Doctor OK');
