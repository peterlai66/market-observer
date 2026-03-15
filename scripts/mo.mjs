#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './_util.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));

function help() {
  console.log(`Market Observer CLI (mo) v${pkg.version}`);
  console.log('');
  console.log('Usage:');
  console.log('  mo doctor');
  console.log('  mo smoke');
  console.log('  mo smoke-worker');
  console.log('  mo logs');
  console.log('  mo validate-artifacts');
  console.log('  mo validate');
  console.log('  mo guard');
  console.log('  mo preflight');
  console.log('  mo preflight-worker');
  console.log('  mo runtime-invariants');
  console.log('  mo portfolio-verify');
  console.log('  mo recommendation-review');
  console.log('  mo recommendation-review-save');
  console.log('  mo recommendation-scoreboard');
  console.log('  mo baseline');
  console.log('  mo sanity');
  console.log('  mo autopilot');
  console.log('  mo autopilot-worker');
  console.log('  mo deploy');
  console.log('  mo pack');
  console.log('  mo release');
  console.log('  mo pack-patch');
  console.log('  mo patch');
  console.log('  mo update');
  console.log('  mo upgrade   # alias of mo update');
  console.log('');
  console.log('Recommended local usage:');
  console.log('  npm run mo -- doctor');
  console.log('  npm run mo -- smoke');
  console.log('  npm run mo -- smoke-worker');
  console.log('  npm run mo -- pack');
  console.log('  npm run mo -- release');
  console.log('  npm run mo -- pack-patch');
  console.log('  npm run mo -- patch');
  console.log('  npm run mo -- update');
  console.log('  npm run mo -- validate-artifacts');
  console.log('  npm run mo -- validate');
  console.log('  npm run mo -- guard');
  console.log('  npm run mo -- preflight');
  console.log('  npm run mo -- preflight-worker');
  console.log('  npm run mo -- runtime-invariants');
  console.log('  npm run mo -- portfolio-verify');
  console.log('  npm run mo -- recommendation-review');
  console.log('  npm run mo -- recommendation-review-save');
  console.log('  npm run mo -- recommendation-scoreboard');
  console.log('  npm run mo -- baseline');
  console.log('  npm run mo -- sanity');
  console.log('  npm run mo -- autopilot');
  console.log('  npm run mo -- autopilot-worker');
  console.log('  npm run mo -- deploy');
  console.log('');
  console.log('Notes:');
  console.log('  - mo pack = 打包目前 local 最新檔案給 AI 使用。');
  console.log('  - 所有 zip 一律輸出到 .updates/outbox/，只靠檔名區分用途。');
  console.log('  - mo patch = 修工具鏈（scripts/docs/developer/MO_START）。');
  console.log('  - handoff 是聊天指令，不是本地 CLI 指令。');
  console.log('  - mo release = 產生正式 release 包（會先跑 sync-structure / doctor / validate / validate-artifacts）。');
  console.log('  - mo validate = 自動跑 guard / sanity / validate-artifacts。');
  console.log('  - mo preflight = 自動跑 doctor / smoke / validate。');
  console.log('  - mo preflight-worker = 自動跑 doctor / smoke / smoke-worker / validate / runtime-invariants。');
  console.log('  - mo runtime-invariants = 檢查 remote D1 的 cash / positions / snapshot 一致性。');
  console.log('  - mo portfolio-verify = 驗證 executed orders / execution marks / positions / cash 的 closed-loop 一致性。');
  console.log('  - mo recommendation-review = 檢視最新推薦批次在 D0/D5/D10/D20 的模擬表現。');
  console.log('  - mo recommendation-review-save = 將最新推薦批次 review 結果落表到 D1。');
  console.log('  - mo recommendation-scoreboard = 彙總已落表的推薦 review / performance 統計。');
  console.log('  - mo baseline = 顯示目前鎖定中的 baseline manifest。');
  console.log('  - mo autopilot = 相容別名，行為同 mo preflight。');
  console.log('  - mo autopilot-worker = 相容別名，行為同 mo preflight-worker。');
  console.log('  - update 只更新 local repo；src/wrangler/migrations 有變更時，update 後仍需 deploy。');
}

const cmd = (process.argv[2] || '').trim().toLowerCase();
if (!cmd || ['-h', '--help', 'help'].includes(cmd)) {
  help();
  process.exit(0);
}

switch (cmd) {
  case 'doctor':
    run('node', ['scripts/doctor.mjs']);
    break;
  case 'smoke':
    run('node', ['scripts/smoke-tools.mjs']);
    break;
  case 'smoke-worker':
    run('node', ['scripts/smoke-worker.mjs']);
    break;
  case 'validate-artifacts':
    run('node', ['scripts/validate-artifacts.mjs']);
    break;
  case 'validate':
    run('node', ['scripts/validate.mjs']);
    break;
  case 'guard':
    run('node', ['scripts/sync-runtime-version.mjs']);
    run('node', ['scripts/guard.mjs']);
    break;
  case 'sanity':
    run('node', ['scripts/sanity.mjs']);
    break;
  case 'preflight':
    run('node', ['scripts/preflight.mjs']);
    break;
  case 'preflight-worker':
    run('node', ['scripts/preflight.mjs', 'worker']);
    break;
  case 'runtime-invariants':
    run('node', ['scripts/runtime-invariants.mjs']);
    break;
  case 'portfolio-verify':
    run('node', ['scripts/portfolio-verify.mjs']);
    break;
  case 'recommendation-review':
    run('node', ['scripts/recommendation-review.mjs']);
    break;
  case 'recommendation-review-save':
    run('node', ['scripts/recommendation-review-save.mjs']);
    break;
  case 'recommendation-scoreboard':
    run('node', ['scripts/recommendation-scoreboard.mjs']);
    break;
  case 'baseline':
    run('node', ['scripts/baseline.mjs']);
    break;
  case 'autopilot':
    run('node', ['scripts/autopilot.mjs']);
    break;
  case 'autopilot-worker':
  case 'autopilot-full':
    run('node', ['scripts/autopilot.mjs', 'worker']);
    break;
  case 'deploy':
    run('node', ['scripts/sync-runtime-version.mjs']);
    run('npx', ['wrangler', 'deploy']);
    break;
  case 'logs':
    run('npx', ['wrangler', 'tail', '--format', 'pretty']);
    break;
  case 'pack':
  case 'pack-dev':
    run('node', ['scripts/pack-dev.mjs']);
    break;
  case 'patch':
  case 'toolchain':
    run('node', ['scripts/apply-patch.mjs']);
    break;
  case 'pack-patch':
    run('node', ['scripts/pack-patch.mjs']);
    break;
  case 'release':
  case 'pack-release':
    run('node', ['scripts/pack-release.mjs']);
    break;
  case 'update':
  case 'upgrade':
    run('node', ['scripts/apply-update.mjs']);
    break;
  default:
    help();
    process.exit(1);
}
