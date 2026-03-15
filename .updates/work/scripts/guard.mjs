#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('.');
const failList = [];
const warnList = [];

function check(condition, message) {
  if (!condition) failList.push(message);
}

function warn(condition, message) {
  if (!condition) warnList.push(message);
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf-8');
}

const criticalFiles = [
  'MO_START.md',
  'package.json',
  'VERSION',
  'CHANGELOG.md',
  'RELEASE_NOTES.md',
  'manifest.json',
  'BASELINE.json',
  'wrangler.jsonc',
  'scripts/mo.mjs',
  'scripts/doctor.mjs',
  'scripts/validate-artifacts.mjs',
  'scripts/guard.mjs',
  'scripts/sanity.mjs',
  'scripts/runtime-invariants.mjs',
  'developer/SCRIPTS_GUIDE.md',
  'docs/PROJECT.md',
  'docs/AI_MEMORY.md',
  'docs/NEXT_TASK.md',
  'docs/BUGS.md',
  'docs/FUTURE_SYSTEMS.md',
  'docs/commands.md',
  'src/version.ts'
];
for (const rel of criticalFiles) check(existsSync(join(root, rel)), `Missing critical file: ${rel}`);

const moStart = existsSync(join(root, 'MO_START.md')) ? read('MO_START.md') : '';
const commandsDoc = existsSync(join(root, 'docs/commands.md')) ? read('docs/commands.md') : '';
const scriptsGuide = existsSync(join(root, 'developer/SCRIPTS_GUIDE.md')) ? read('developer/SCRIPTS_GUIDE.md') : '';
const moCli = existsSync(join(root, 'scripts/mo.mjs')) ? read('scripts/mo.mjs') : '';
const pkgRaw = existsSync(join(root, 'package.json')) ? JSON.parse(read('package.json')) : { scripts: {} };
const pkgScripts = pkgRaw.scripts || {};
const versionRaw = existsSync(join(root, 'VERSION')) ? read('VERSION').trim() : '';
const indexTs = existsSync(join(root, 'src/index.ts')) ? read('src/index.ts') : '';
const versionModule = existsSync(join(root, 'src/version.ts')) ? read('src/version.ts') : '';
const appVersionMatch = versionModule.match(/export const APP_VERSION = ['"]([^'"]+)['"]/);

for (const cmd of ['doctor','smoke','smoke-worker','validate-artifacts','guard','sanity','validate','preflight','preflight-worker','runtime-invariants','autopilot','autopilot-worker','deploy','logs','pack','release','pack-patch','patch','update','baseline']) {
  check(moCli.includes(`'  mo ${cmd}`) || moCli.includes(`"  mo ${cmd}`), `mo help missing command: ${cmd}`);
}
for (const scriptName of ['doctor','pack:dev','pack:release','update','patch','pack:patch','release','smoke:tools','smoke:worker','autopilot','validate','preflight','preflight:worker','runtime:invariants','mo']) {
  check(Boolean(pkgScripts[scriptName]), `package.json missing script: ${scriptName}`);
}
check(Boolean(pkgScripts['guard']), 'package.json missing script: guard');
check(Boolean(pkgScripts['sanity']), 'package.json missing script: sanity');
check(Boolean(pkgScripts['validate:artifacts']), 'package.json missing script: validate:artifacts');
check(indexTs.includes("import { APP_VERSION } from './version';"), 'src/index.ts missing APP_VERSION import from src/version.ts');
check(Boolean(appVersionMatch), 'src/version.ts missing APP_VERSION export');
if (appVersionMatch) check(appVersionMatch[1] === versionRaw, `APP_VERSION mismatch: src/version.ts=${appVersionMatch[1]} VERSION=${versionRaw}`);

check(moStart.includes('market-observer_release_latest.zip'), 'MO_START.md missing release latest contract');
check(moStart.includes('mo validate-artifacts'), 'MO_START.md missing validate-artifacts rule');
check(moStart.includes('mo guard'), 'MO_START.md missing mo guard rule');
check(moStart.includes('mo sanity'), 'MO_START.md missing mo sanity rule');
check(moStart.includes('mo autopilot'), 'MO_START.md missing mo autopilot rule');
check(moStart.includes('market-observer_dev_latest.zip') && moStart.includes('AI 必須以使用者提供的 dev 包為基底實作'), 'MO_START.md missing dev->release cycle rule');
check(moStart.includes('Baseline lock rule') || moStart.includes('Baseline Lock Rule'), 'MO_START.md missing baseline lock rule');
check(moStart.includes('每次 release 交付時，AI 必須先列出本輪實際改動檔案'), 'MO_START.md missing delivery proof rule');
check(moStart.includes('第一步固定為 `npm run mo -- doctor`'), 'MO_START.md missing doctor-first verification rule');
check(moStart.includes('未經版本驗證與目標腳本驗證，不得宣稱「已完成修正」或「已完成開發」'), 'MO_START.md missing no-claim-before-proof rule');
check(moStart.includes('第一個功能驗證必須只驗那支腳本'), 'MO_START.md missing target-script-first rule');

for (const needle of ['guard','sanity','validate-artifacts','validate','preflight','runtime-invariants','autopilot','baseline']) {
  check(commandsDoc.includes(needle), `docs/commands.md missing ${needle}`);
  check(scriptsGuide.includes(needle), `developer/SCRIPTS_GUIDE.md missing ${needle}`);
}

const outbox = join(root, '.updates', 'outbox');
check(existsSync(outbox), 'Missing .updates/outbox');
if (existsSync(outbox)) {
  const entries = readdirSync(outbox, { withFileTypes: true });
  for (const bad of ['dev', 'patch', 'release', 'handoff']) {
    check(!entries.some((e) => e.isDirectory() && e.name === bad), `Deprecated outbox subdirectory exists: .updates/outbox/${bad}`);
  }
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  const badVersioned = files.filter((name) => /^market-observer_release_(?!latest\.zip$).+\.zip$/i.test(name));
  check(badVersioned.length === 0, `Forbidden versioned release artifacts found: ${badVersioned.join(', ')}`);
  warn(files.includes('market-observer_release_latest.zip'), 'No market-observer_release_latest.zip in outbox yet (OK before release build)');
}

if (warnList.length) {
  console.log('Warnings:');
  for (const msg of warnList) console.log(`- ${msg}`);
}

if (failList.length) {
  console.error('Guard failed:');
  for (const msg of failList) console.error(`- ${msg}`);
  process.exit(1);
}

console.log('Guard OK');
