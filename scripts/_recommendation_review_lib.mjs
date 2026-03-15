import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const root = resolve(__dirname, '..');

export function stripJsonComments(input) {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

export function stripTrailingCommas(input) {
  return input.replace(/,(\s*[}\]])/g, '$1');
}

export function parseJsonc(input) {
  return JSON.parse(stripTrailingCommas(stripJsonComments(input)));
}

export function loadDbName() {
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

export function runQuery(sql, remote = true) {
  const normalizedSql = normalizeSql(sql);
  if (!normalizedSql) {
    throw new Error(`SQL is empty (${remote ? 'remote' : 'local'})`);
  }
  const database = loadDbName();
  const args = ['wrangler', 'd1', 'execute', database, remote ? '--remote' : '--local', '--json', '--command', normalizedSql];
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

export function execSql(sql, remote = true) {
  runQuery(normalizeSql(sql), remote);
}

export function tableColumns(table, remote = true) {
  const rows = runQuery(`PRAGMA table_info(${table});`, remote);
  return new Set(rows.map((r) => String(r.name || '').trim()).filter(Boolean));
}

export function getStr(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

export function getNum(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v == null) continue;
    const n = Number(String(v).replace(/,/g, '').trim());
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

export function parseTwsePayload(raw) {
  try {
    const payload = JSON.parse(String(raw || 'null'));
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    for (const value of Object.values(payload || {})) {
      if (Array.isArray(value)) return value;
    }
    return [];
  } catch {
    return [];
  }
}

export function buildCloseMap(rows) {
  const m = new Map();
  for (const r of rows) {
    const code = getStr(r, ['證券代號', 'Code', 'code', 'StockCode']);
    const close = getNum(r, ['收盤價', 'Close', 'close', '收盤', 'ClosingPrice', 'lastPrice', 'LastPrice']);
    if (code && Number.isFinite(close) && close > 0) m.set(code, close);
  }
  return m;
}

export function pct(base, px) {
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(px) || px <= 0) return NaN;
  return ((px / base) - 1) * 100;
}

export function fmtPct(v) {
  return Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—';
}

export function fmtPrice(v) {
  return Number.isFinite(v) ? v.toFixed(2) : '—';
}

export function checkpointLabel(cp) {
  return cp === 0 ? 'D0' : `D${cp}`;
}

export function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function sqlStr(v) {
  return `'${String(v ?? '').replace(/'/g, "''")}'`;
}

function sqlNum(v) {
  return Number.isFinite(v) ? String(v) : 'NULL';
}

function normalizeSql(input) {
  return String(input || '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(values) {
  return [...new Set((values || []).filter((v) => String(v || '').trim()).map((v) => String(v).trim()))];
}

function isTwBareSymbol(symbol) {
  return /^\d{4,6}$/.test(String(symbol || '').trim());
}

function canonicalTwSymbol(symbol) {
  const s = String(symbol || '').trim().toUpperCase();
  if (!s) return '';
  if (/^\d{4,6}\.TW$/.test(s)) return s;
  if (isTwBareSymbol(s)) return `${s}.TW`;
  return s;
}

function bareTwSymbol(symbol) {
  const s = String(symbol || '').trim().toUpperCase();
  if (/^\d{4,6}\.TW$/.test(s)) return s.replace(/\.TW$/, '');
  return s;
}


function getReviewFillPolicy() {
  const raw = String(process.env.SIM_FILL_POLICY || 'RANGE_OR_CLOSE').trim().toUpperCase();
  return ['STRICT_RANGE', 'RANGE_OR_CLOSE', 'NEXT_OPEN'].includes(raw) ? raw : 'RANGE_OR_CLOSE';
}

function normalizeExecutionReason(reason) {
  const raw = String(reason || '').trim();
  if (!raw) return '';
  const t = raw.toLowerCase();
  if (raw.includes('價格未進入買入區間')) return 'execution:buy-range-not-hit';
  if (raw.includes('價格未進入賣出區間')) return 'execution:sell-range-not-hit';
  if (raw.includes('現金不足')) return 'execution:insufficient-cash';
  if (raw.includes('無持倉')) return 'execution:no-position';
  if (raw.includes('交易門檻未通過')) return 'execution:trade-guard-blocked';
  if (raw.includes('成交（模擬）')) return 'execution:filled';
  if (t === 'pending') return 'execution:pending';
  return `execution:${raw.replace(/\s+/g, '-').slice(0, 80)}`;
}

function twTaipeiDateString() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function monthKeyFromDate(dateStr) {
  const s = String(dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  return `${s.slice(0, 4)}${s.slice(5, 7)}01`;
}

function monthKeysBetween(startDate, endDate) {
  const startKey = monthKeyFromDate(startDate);
  const endKey = monthKeyFromDate(endDate);
  if (!startKey || !endKey) return [];
  const out = [];
  let y = Number(startKey.slice(0, 4));
  let m = Number(startKey.slice(4, 6));
  const endY = Number(endKey.slice(0, 4));
  const endM = Number(endKey.slice(4, 6));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${String(y).padStart(4, '0')}${String(m).padStart(2, '0')}01`);
    m += 1;
    if (m > 12) {
      y += 1;
      m = 1;
    }
  }
  return out;
}

function normalizeTwseDate(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const ad = s.match(/^(\d{4})[\/-](\d{2})[\/-](\d{2})$/);
  if (ad) return `${ad[1]}-${ad[2]}-${ad[3]}`;
  const roc = s.match(/^(\d{2,3})[\/-](\d{2})[\/-](\d{2})$/);
  if (roc) {
    const year = Number(roc[1]) + 1911;
    return `${String(year).padStart(4, '0')}-${roc[2]}-${roc[3]}`;
  }
  return '';
}

function parseTwseMonthlyPayload(payload) {
  const fields = Array.isArray(payload?.fields) ? payload.fields.map((x) => String(x || '').trim()) : [];
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  if (!rows.length) return [];

  let dateIdx = fields.findIndex((f) => /日期|date/i.test(f));
  let closeIdx = fields.findIndex((f) => /收盤價|Closing Price|Close/i.test(f));
  if (dateIdx < 0) dateIdx = 0;
  if (closeIdx < 0) closeIdx = rows[0].length >= 2 ? 1 : -1;
  if (closeIdx < 0) return [];

  const out = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const date = normalizeTwseDate(row[dateIdx]);
    const close = Number(String(row[closeIdx] ?? '').replace(/,/g, '').trim());
    if (!date || !Number.isFinite(close) || close <= 0) continue;
    out.push({ date, close });
  }
  return out;
}

async function fetchTwseMonthlyCloseRows(symbolBare, monthKey) {
  const bare = String(symbolBare || '').trim();
  const month = String(monthKey || '').trim();
  if (!/^\d{4,6}$/.test(bare) || !/^\d{8}$/.test(month)) return [];
  const urls = [
    `https://www.twse.com.tw/exchangeReport/STOCK_DAY_AVG?response=json&date=${month}&stockNo=${bare}`,
    `https://www.twse.com.tw/rwd/en/afterTrading/STOCK_DAY_AVG?response=json&date=${month}&stockNo=${bare}`,
    `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_AVG?response=json&date=${month}&stockNo=${bare}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'accept': 'application/json,text/plain,*/*',
          'user-agent': 'market-observer/0.14.8',
        },
      });
      if (!res.ok) continue;
      const payload = await res.json();
      const rows = parseTwseMonthlyPayload(payload);
      if (rows.length) return rows;
    } catch {
      // try next endpoint
    }
  }
  return [];
}

function ensurePricesDailyTable(remote = true) {
  execSql(`
CREATE TABLE IF NOT EXISTS prices_daily (
  symbol TEXT,
  date TEXT,
  close REAL,
  created_at TEXT,
  PRIMARY KEY (symbol, date)
);`, remote);
}

async function backfillTwPricesForReview(remote, symbols, tradeDate) {
  ensurePricesDailyTable(remote);
  const canonicalSymbols = unique(symbols.map(canonicalTwSymbol).filter((s) => /^\d{4,6}\.TW$/.test(s)));
  if (!canonicalSymbols.length) return { inserted: 0, fetchedRows: 0, months: 0, symbols: 0 };
  const today = twTaipeiDateString();
  const monthKeys = monthKeysBetween(tradeDate, today);
  if (!monthKeys.length) return { inserted: 0, fetchedRows: 0, months: 0, symbols: canonicalSymbols.length };

  let inserted = 0;
  let fetchedRows = 0;
  for (const canonical of canonicalSymbols) {
    const bare = bareTwSymbol(canonical);
    for (const monthKey of monthKeys) {
      const rows = await fetchTwseMonthlyCloseRows(bare, monthKey);
      fetchedRows += rows.length;
      for (const row of rows) {
        execSql(`INSERT OR REPLACE INTO prices_daily(symbol, date, close, created_at) VALUES (${sqlStr(canonical)}, ${sqlStr(row.date)}, ${sqlNum(row.close)}, CURRENT_TIMESTAMP);`, remote);
        inserted += 1;
      }
    }
  }
  return { inserted, fetchedRows, months: monthKeys.length, symbols: canonicalSymbols.length };
}

export function ensureReviewTables(remote = true) {
  execSql(`
CREATE TABLE IF NOT EXISTS mo_recommendation_review_batches (
  trade_date TEXT PRIMARY KEY,
  review_generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  review_universe INTEGER NOT NULL,
  available_trade_dates INTEGER NOT NULL,
  max_review_horizon INTEGER NOT NULL,
  available_checkpoints TEXT NOT NULL,
  pending_checkpoints TEXT NOT NULL,
  summary_note TEXT NOT NULL
);`, remote);
  execSql(`
CREATE TABLE IF NOT EXISTS mo_recommendation_review_items (
  trade_date TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT,
  base_price REAL,
  order_status TEXT,
  d0_return REAL,
  d5_return REAL,
  d10_return REAL,
  d20_return REAL,
  review_note TEXT NOT NULL,
  reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (trade_date, symbol)
);`, remote);
}

export function saveReviewSnapshot(review, remote = true) {
  ensureReviewTables(remote);
  const batch = review.batch;
  execSql(`INSERT OR REPLACE INTO mo_recommendation_review_batches (
    trade_date, review_generated_at, review_universe, available_trade_dates,
    max_review_horizon, available_checkpoints, pending_checkpoints, summary_note
  ) VALUES (
    ${sqlStr(batch.trade_date)}, CURRENT_TIMESTAMP, ${batch.review_universe}, ${batch.available_trade_dates},
    ${batch.max_review_horizon}, ${sqlStr(batch.available_checkpoints)}, ${sqlStr(batch.pending_checkpoints)}, ${sqlStr(batch.summary_note)}
  );`, remote);

  for (const item of review.items) {
    const canonicalSymbol = canonicalTwSymbol(item.symbol);
    const bareSymbol = bareTwSymbol(canonicalSymbol);
    execSql(`DELETE FROM mo_recommendation_review_items WHERE trade_date=${sqlStr(batch.trade_date)} AND symbol=${sqlStr(bareSymbol)};`, remote);
    execSql(`INSERT OR REPLACE INTO mo_recommendation_review_items (
      trade_date, symbol, name, base_price, order_status,
      d0_return, d5_return, d10_return, d20_return, review_note, reviewed_at
    ) VALUES (
      ${sqlStr(batch.trade_date)}, ${sqlStr(canonicalSymbol)}, ${sqlStr(item.name)}, ${sqlNum(item.base_price)}, ${sqlStr(item.order_status)},
      ${sqlNum(item.d0_return)}, ${sqlNum(item.d5_return)}, ${sqlNum(item.d10_return)}, ${sqlNum(item.d20_return)}, ${sqlStr(item.review_note)}, CURRENT_TIMESTAMP
    );`, remote);
  }
}

function loadPriceRowsBySymbol(remote, symbols, startDate) {
  const canonical = unique(symbols.map(canonicalTwSymbol));
  if (!canonical.length) return [];
  const inList = canonical.map(sqlStr).join(', ');
  return runQuery(`SELECT symbol, date, close FROM prices_daily WHERE symbol IN (${inList}) AND date>=${sqlStr(startDate)} ORDER BY date ASC;`, remote);
}

function buildPriceCloseByDate(rows) {
  const byDate = new Map();
  for (const row of rows) {
    const symbol = canonicalTwSymbol(row.symbol);
    const date = String(row.date || '').trim();
    const close = Number(row.close);
    if (!symbol || !date || !Number.isFinite(close) || close <= 0) continue;
    if (!byDate.has(date)) byDate.set(date, new Map());
    byDate.get(date).set(symbol, close);
  }
  return byDate;
}

function mergeCloseMaps(baseMap, overlayMap) {
  for (const [date, symbolMap] of overlayMap.entries()) {
    if (!baseMap.has(date)) baseMap.set(date, new Map());
    const target = baseMap.get(date);
    for (const [symbol, close] of symbolMap.entries()) {
      target.set(symbol, close);
    }
  }
  return baseMap;
}

export async function computeRecommendationReview({ remote = true, explicitDate = '' } = {}) {
  const latestRows = explicitDate
    ? [{ trade_date: explicitDate }]
    : runQuery("SELECT trade_date FROM mo_recommendation_log WHERE rec_count > 0 ORDER BY trade_date DESC, id DESC LIMIT 1;", remote);
  if (!latestRows.length) fail('no recommendation batch found');
  const tradeDate = String(latestRows[0].trade_date || explicitDate || '').trim();
  if (!tradeDate) fail('cannot resolve review trade_date');

  const moOrderCols = tableColumns('mo_orders', remote);
  for (const required of ['signal_date', 'symbol', 'side', 'entry_low', 'entry_high', 'qty', 'status']) {
    if (!moOrderCols.has(required)) fail(`mo_orders missing required column: ${required}`);
  }
  const optionalName = moOrderCols.has('name') ? 'name,' : "'' AS name,";
  const recRows = runQuery(`SELECT signal_date, symbol, ${optionalName} side, entry_low, entry_high, qty, status, reason FROM mo_orders WHERE signal_date='${tradeDate}' AND side='BUY' ORDER BY symbol;`, remote)
    .map((row) => ({ ...row, symbol: canonicalTwSymbol(row.symbol) }));
  if (!recRows.length) fail(`no BUY recommendations found for ${tradeDate}`);

  const rawRows = runQuery(`SELECT date, payload_json FROM twse_daily_raw WHERE date>=${sqlStr(tradeDate)} ORDER BY date ASC LIMIT 60;`, remote);
  const canonicalSymbols = unique(recRows.map((r) => r.symbol));
  const backfill = await backfillTwPricesForReview(remote, canonicalSymbols, tradeDate);
  const priceRows = loadPriceRowsBySymbol(remote, canonicalSymbols, tradeDate);

  const rawTradingDates = unique(rawRows.map((r) => String(r.date || '').trim()).filter(Boolean));
  const priceTradingDates = unique(priceRows.map((r) => String(r.date || '').trim()).filter(Boolean));
  const tradingDates = unique([...rawTradingDates, ...priceTradingDates]).sort();
  if (!tradingDates.length) fail(`no twse_daily_raw / prices_daily rows found on/after ${tradeDate}`);

  const closeByDate = new Map();
  for (const row of rawRows) {
    const d = String(row.date || '').trim();
    if (!d) continue;
    if (!closeByDate.has(d)) closeByDate.set(d, new Map());
    const parsed = buildCloseMap(parseTwsePayload(row.payload_json));
    for (const [symbol, close] of parsed.entries()) {
      closeByDate.get(d).set(canonicalTwSymbol(symbol), close);
    }
  }
  mergeCloseMaps(closeByDate, buildPriceCloseByDate(priceRows));

  const checkpoints = [0, 5, 10, 20];
  const fillPolicy = getReviewFillPolicy();
  const maxOffset = Math.max(0, tradingDates.length - 1);
  const availableCheckpointLabels = checkpoints.filter((cp) => cp <= maxOffset).map(checkpointLabel);
  const pendingCheckpointLabels = checkpoints.filter((cp) => cp > maxOffset).map(checkpointLabel);
  const lines = [];
  lines.push(`trade_date=${tradeDate}`);
  lines.push(`review_universe=${recRows.length} symbols`);
  lines.push(`available_trade_dates=${tradingDates.length} (${tradingDates[0]} -> ${tradingDates[tradingDates.length - 1]})`);
  if (backfill.inserted > 0 || backfill.fetchedRows > 0) {
    lines.push(`tw_price_backfill=symbols:${backfill.symbols} months:${backfill.months} fetched_rows:${backfill.fetchedRows} upserts:${backfill.inserted}`);
  }
  lines.push(`max_review_horizon=D${maxOffset}`);
  lines.push(`available_checkpoints=${availableCheckpointLabels.length ? availableCheckpointLabels.join(', ') : 'none'}`);
  if (pendingCheckpointLabels.length) lines.push(`pending_checkpoints=${pendingCheckpointLabels.join(', ')} (not enough future trade dates yet)`);
  lines.push('');
  lines.push('symbol | base | D0 | D5 | D10 | D20 | order_status | review_note');

  const d20Returns = [];
  let missingCloseCount = 0;
  let horizonLimitedCount = 0;
  const items = [];
  for (const row of recRows) {
    const symbol = String(row.symbol || '').trim();
    const name = String(row.name || '').trim();
    const rawOrderStatus = String(row.status || '').trim() || '—';
    let orderStatus = rawOrderStatus;
    const entryLow = Number(row.entry_low);
    const entryHigh = Number(row.entry_high);
    const base = Number.isFinite(entryLow) && Number.isFinite(entryHigh) && entryLow > 0 && entryHigh > 0
      ? (entryLow + entryHigh) / 2
      : NaN;

    const review = [];
    const notes = [];
    const returns = {0: NaN, 5: NaN, 10: NaN, 20: NaN};
    for (const cp of checkpoints) {
      const label = checkpointLabel(cp);
      const d = tradingDates[cp];
      if (!d) {
        review.push(`${label} —`);
        notes.push(`${label}:not-enough-trade-days`);
        horizonLimitedCount += 1;
        continue;
      }
      const close = closeByDate.get(d)?.get(symbol);
      if (!Number.isFinite(close) || close <= 0) {
        review.push(`${label} —`);
        notes.push(`${label}:missing-close`);
        missingCloseCount += 1;
        continue;
      }
      const r = pct(base, close);
      returns[cp] = r;
      review.push(`${label} ${fmtPct(r)}`);
      if (cp === 20 && Number.isFinite(r)) d20Returns.push(r);
    }

    const normalizedExecutionReason = normalizeExecutionReason(row.reason);
    const canFallbackFill = orderStatus === 'SKIPPED'
      && normalizedExecutionReason === 'execution:buy-range-not-hit'
      && fillPolicy === 'RANGE_OR_CLOSE'
      && Number.isFinite(returns[0]);

    if (canFallbackFill) {
      orderStatus = 'EXECUTED';
      notes.unshift('execution:fallback-range-or-close');
    } else if (orderStatus === 'SKIPPED') {
      if (normalizedExecutionReason) notes.unshift(normalizedExecutionReason);
      notes.unshift('signal-generated-but-not-filled');
    } else if (orderStatus === 'PENDING') {
      notes.unshift('execution:pending');
    } else if (orderStatus === 'EXECUTED') {
      if (normalizedExecutionReason) notes.unshift(normalizedExecutionReason);
    }

    const reviewNote = notes.join(', ') || 'ok';
    lines.push(`${symbol}${name ? ` ${name}` : ''} | base=${fmtPrice(base)} | ${review.join(' | ')} | ${orderStatus} | ${reviewNote}`);
    items.push({
      symbol,
      name,
      base_price: base,
      order_status: orderStatus,
      d0_return: returns[0],
      d5_return: returns[5],
      d10_return: returns[10],
      d20_return: returns[20],
      review_note: reviewNote,
    });
  }

  lines.push('');
  let summaryNote = '';
  if (d20Returns.length) {
    const avg = d20Returns.reduce((a, b) => a + b, 0) / d20Returns.length;
    const winRate = (d20Returns.filter((x) => x > 0).length / d20Returns.length) * 100;
    summaryNote = `D20 summary avg=${fmtPct(avg)} win_rate=${winRate.toFixed(1)}% samples=${d20Returns.length}`;
  } else {
    summaryNote = `D20 summary skipped (max_review_horizon=D${maxOffset}, missing_close_marks=${missingCloseCount}, horizon_limited_marks=${horizonLimitedCount})`;
  }
  lines.push(summaryNote);

  return {
    lines,
    batch: {
      trade_date: tradeDate,
      review_universe: recRows.length,
      available_trade_dates: tradingDates.length,
      max_review_horizon: maxOffset,
      available_checkpoints: availableCheckpointLabels.join(', '),
      pending_checkpoints: pendingCheckpointLabels.join(', '),
      summary_note: summaryNote,
    },
    items,
  };
}
