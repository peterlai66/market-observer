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
  return spawnSync(finalCmd, finalArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
}

function runQuery(sql) {
  const database = loadDbName();
  const args = ['wrangler', 'd1', 'execute', database, remote ? '--remote' : '--local', '--json', '--command', sql];
  const res = spawnCapture('npx', args);
  if ((res.status ?? 1) !== 0) {
    process.stdout.write(res.stdout || '');
    process.stderr.write(res.stderr || '');
    throw new Error(`wrangler d1 execute failed (${remote ? 'remote' : 'local'})`);
  }
  const txt = String(res.stdout || '').trim();
  if (!txt) return [];
  const parsed = JSON.parse(txt);
  if (Array.isArray(parsed)) return Array.isArray(parsed[0]?.results) ? parsed[0].results : parsed;
  return Array.isArray(parsed?.results) ? parsed.results : [];
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

console.log(`MO Portfolio Verify (${remote ? 'remote' : 'local'})`);

const pfRows = runQuery('SELECT id, principal_twd, cash_twd, updated_at FROM mo_portfolio_state WHERE id=1;');
if (!pfRows.length) fail('missing mo_portfolio_state snapshot row id=1');
const pf = pfRows[0];
const principal = toNum(pf.principal_twd);
const cash = toNum(pf.cash_twd);
if (!Number.isFinite(principal) || principal <= 0) fail(`invalid principal_twd: ${pf.principal_twd}`);
if (!Number.isFinite(cash)) fail(`invalid cash_twd: ${pf.cash_twd}`);
console.log(`✓ portfolio principal=${principal} cash=${cash}`);

const positions = runQuery('SELECT symbol, shares, avg_cost FROM mo_positions ORDER BY symbol;');
let grossCost = 0;
for (const row of positions) {
  const shares = toNum(row.shares);
  const avgCost = toNum(row.avg_cost);
  if (!String(row.symbol || '').trim()) fail('position contains empty symbol');
  if (!Number.isFinite(shares) || shares <= 0) fail(`position ${row.symbol} has invalid shares: ${row.shares}`);
  if (!Number.isFinite(avgCost) || avgCost < 0) fail(`position ${row.symbol} has invalid avg_cost: ${row.avg_cost}`);
  grossCost += shares * avgCost;
}
console.log(`✓ positions snapshot ok (${positions.length} rows, gross_cost=${grossCost.toFixed(2)})`);

const execRows = runQuery("SELECT signal_date, exec_date, symbol, side, qty, exec_price FROM mo_orders WHERE status='EXECUTED' ORDER BY id DESC;");
if (!execRows.length) {
  console.log('✓ no executed orders yet (closed-loop execution checks skip)');
  console.log('Portfolio verify OK');
  process.exit(0);
}

let executedNotional = 0;
for (const row of execRows) {
  const qty = toNum(row.qty);
  const px = toNum(row.exec_price);
  if (!String(row.symbol || '').trim()) fail('executed order contains empty symbol');
  if (!String(row.exec_date || '').trim()) fail(`executed order ${row.symbol} missing exec_date`);
  if (!Number.isFinite(qty) || qty <= 0) fail(`executed order ${row.symbol} has invalid qty: ${row.qty}`);
  if (!Number.isFinite(px) || px <= 0) fail(`executed order ${row.symbol} has invalid exec_price: ${row.exec_price}`);
  executedNotional += qty * px;
}
console.log(`✓ executed orders snapshot ok (${execRows.length} rows, gross_notional=${executedNotional.toFixed(2)})`);

const filledMarks = runQuery('SELECT symbol, side, qty, trade_date, filled, filled_price FROM mo_execution_mark WHERE filled=1 ORDER BY id DESC;');
if (filledMarks.length < execRows.length) {
  fail(`filled execution marks (${filledMarks.length}) fewer than executed orders (${execRows.length})`);
}
console.log(`✓ execution marks cover executed orders (${filledMarks.length} filled marks)`);

console.log('Portfolio verify OK');
