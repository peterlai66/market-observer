#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const mode = (process.argv[2] || 'remote').trim().toLowerCase();
const remote = mode !== 'local';

function stripJsonComments(input) {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

function stripTrailingCommas(input) {
  return input.replace(/,(\s*[}\]])/g, '$1');
}

function parseJsonc(input) {
  return JSON.parse(stripTrailingCommas(stripJsonComments(input)));
}

function loadDbName() {
  const raw = readFileSync(resolve(root, 'wrangler.jsonc'), 'utf-8');
  const cfg = parseJsonc(raw);
  const db = cfg?.d1_databases?.[0]?.database_name;
  if (!db) throw new Error('Cannot resolve D1 database_name from wrangler.jsonc');
  return String(db);
}

function spawnCapture(cmd, args = []) {
  const isWin = process.platform === 'win32' && (cmd === 'npx' || cmd === 'npm' || /\.(cmd|bat)$/i.test(cmd));
  const finalCmd = isWin ? 'cmd.exe' : cmd;
  const finalArgs = isWin ? ['/d', '/s', '/c', cmd, ...args] : args;
  const res = spawnSync(finalCmd, finalArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  return res;
}

function runQuery(sql) {
  const database = loadDbName();
  const args = [
    'wrangler',
    'd1',
    'execute',
    database,
    remote ? '--remote' : '--local',
    '--json',
    '--command',
    sql,
  ];
  const res = spawnCapture('npx', args);
  if ((res.status ?? 1) !== 0) {
    process.stdout.write(res.stdout || '');
    process.stderr.write(res.stderr || '');
    throw new Error(`wrangler d1 execute failed (${remote ? 'remote' : 'local'})`);
  }
  const txt = String(res.stdout || '').trim();
  if (!txt) return [];
  const parsed = JSON.parse(txt);
  if (Array.isArray(parsed)) {
    if (parsed.length && Array.isArray(parsed[0]?.results)) return parsed[0].results;
    return parsed;
  }
  if (Array.isArray(parsed?.results)) return parsed.results;
  return [];
}

function toFiniteNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

console.log(`MO Runtime Invariants (${remote ? 'remote' : 'local'})`);

const pfRows = runQuery('SELECT id, principal_twd, cash_twd, updated_at FROM mo_portfolio_state WHERE id=1;');
if (!pfRows.length) fail('missing mo_portfolio_state snapshot row id=1');
const pf = pfRows[0];
const principal = toFiniteNumber(pf.principal_twd);
const cash = toFiniteNumber(pf.cash_twd);
if (!Number.isFinite(principal) || principal <= 0) fail(`invalid principal_twd: ${pf.principal_twd}`);
if (!Number.isFinite(cash)) fail(`cash_twd is not finite: ${pf.cash_twd}`);
if (cash < -1e-6) fail(`negative cash_twd detected: ${cash}`);
console.log(`✓ portfolio_state principal=${principal} cash=${cash}`);

const positions = runQuery('SELECT symbol, name, shares, avg_cost, updated_at FROM mo_positions ORDER BY symbol;');
for (const row of positions) {
  const shares = toFiniteNumber(row.shares);
  const avgCost = toFiniteNumber(row.avg_cost);
  if (!String(row.symbol || '').trim()) fail('mo_positions contains empty symbol');
  if (!Number.isFinite(shares)) fail(`position ${row.symbol} has non-finite shares: ${row.shares}`);
  if (!Number.isFinite(avgCost)) fail(`position ${row.symbol} has non-finite avg_cost: ${row.avg_cost}`);
  if (shares <= 0) fail(`position ${row.symbol} has non-positive shares: ${shares}`);
  if (avgCost < 0) fail(`position ${row.symbol} has negative avg_cost: ${avgCost}`);
}
console.log(`✓ positions checked (${positions.length} rows)`);

const latestMarkRows = runQuery('SELECT created_at FROM mo_execution_mark ORDER BY id DESC LIMIT 1;');
if (latestMarkRows.length) {
  const latestMark = String(latestMarkRows[0].created_at || '').trim();
  const updatedAt = String(pf.updated_at || '').trim();
  if (!updatedAt) fail('mo_portfolio_state.updated_at missing');
  if (latestMark && updatedAt < latestMark) {
    fail(`portfolio snapshot stale: updated_at=${updatedAt} older than latest execution mark=${latestMark}`);
  }
  console.log(`✓ snapshot fresh against execution marks (${latestMark})`);
} else {
  console.log('✓ no execution marks yet (snapshot freshness skip)');
}

const pendingExecRows = runQuery("SELECT COUNT(*) AS c FROM mo_orders WHERE status='EXECUTED' AND exec_date IS NULL;");
const pendingExec = Number(pendingExecRows?.[0]?.c ?? 0);
if (pendingExec > 0) fail(`executed orders missing exec_date: ${pendingExec}`);
console.log('✓ executed orders all have exec_date');

console.log('Runtime invariants OK');
