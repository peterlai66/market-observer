#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('.');
const problems = [];

function check(condition, message) {
  if (!condition) problems.push(message);
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf-8').trim();
}

const versionTxt = existsSync(join(root, 'VERSION')) ? read('VERSION') : '';
const pkg = existsSync(join(root, 'package.json')) ? JSON.parse(read('package.json')) : {};
const pkgVersion = pkg.version || '';
check(Boolean(versionTxt), 'VERSION is empty or missing');
check(Boolean(pkgVersion), 'package.json version missing');
if (versionTxt && pkgVersion) {
  check(versionTxt == pkgVersion, `VERSION (${versionTxt}) does not match package.json (${pkgVersion})`);
}

const releaseNotes = existsSync(join(root, 'RELEASE_NOTES.md')) ? read('RELEASE_NOTES.md') : '';
const changelog = existsSync(join(root, 'CHANGELOG.md')) ? read('CHANGELOG.md') : '';
if (versionTxt) {
  check(releaseNotes.includes(`## ${versionTxt}`), `RELEASE_NOTES.md missing heading for ${versionTxt}`);
  check(changelog.includes(`## ${versionTxt}`), `CHANGELOG.md missing heading for ${versionTxt}`);
}

const outbox = join(root, '.updates', 'outbox');
check(existsSync(outbox), 'Missing .updates/outbox');
if (existsSync(outbox)) {
  const entries = readdirSync(outbox, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  const releaseFiles = files.filter((n) => n.startsWith('market-observer_release_'));
  check(releaseFiles.length <= 1 || (releaseFiles.length === 1 && releaseFiles[0] === 'market-observer_release_latest.zip'), 'Outbox contains multiple release artifacts; keep only market-observer_release_latest.zip as latest');
}

check(existsSync(join(root, 'BASELINE.json')), 'Missing required baseline manifest: BASELINE.json');
for (const rel of ['docs/PROJECT.md','docs/AI_MEMORY.md','docs/NEXT_TASK.md','docs/BUGS.md','docs/FUTURE_SYSTEMS.md']) {
  check(existsSync(join(root, rel)), `Missing required project doc: ${rel}`);
}

if (problems.length) {
  console.error('Sanity failed:');
  for (const msg of problems) console.error(`- ${msg}`);
  process.exit(1);
}
console.log('Sanity OK');
