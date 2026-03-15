import { DEFAULT_UNIVERSE } from './config/universe';
import { generateAiExplanation } from './ai/aiClient';
import { buildAiRecommendationPayload, buildAiReportPayload, buildAiStatusPayload } from './ai/render';
import { buildReviewAdminAuditLines, buildReviewProgressView, getLatestReviewBatchExact, getLatestReviewItemsExact, pushReviewProgressLines } from './review/runtime';
import { APP_VERSION } from './version';
import { buildPositionSizing } from './portfolio/position_sizing';
export interface Env {
	DB: D1Database;
	LINE_CHANNEL_ACCESS_TOKEN: string;
	LINE_PUSH_USER_ID: string;
	/** 用於 /admin/run 手動觸發 */
	ADMIN_TOKEN?: string;
	// ===== Feature flags (string: "1" / "0") =====
	FEATURE_MULTI_ASSET?: string; // 多標的推薦 + 模擬成交
	FEATURE_SIM?: string; // 是否執行模擬成交（不開就只產出建議）
	MO_UNIVERSE?: string; // 以逗號分隔的推薦標的池覆寫
	OPENAI_API_KEY?: string; // GPT explanation layer
	OPENAI_MODEL?: string; // optional model override
	AI_ENABLED?: string; // explicit AI on/off gate
	SIM_FILL_POLICY?: string; // STRICT_RANGE / RANGE_OR_CLOSE / NEXT_OPEN
	FINMIND_TOKEN?: string; // FinMind token for trade-date backstop
}
/** 台灣今天日期（僅當資料本身沒提供日期時，當 fallback 用） */
function twTodayString(): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Taipei',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(new Date());
}
async function upsertDailyMark(env: Env, tradeDate: string, readyLevel: 'NONE' | 'PARTIAL' | 'FULL', note?: string) {
	try {
		await env.DB.prepare(
			`INSERT INTO mo_daily_mark (trade_date, ready_level, fetched_at, note, updated_at)
			 VALUES (?, ?, datetime('now'), ?, datetime('now'))
			 ON CONFLICT(trade_date) DO UPDATE SET
			   ready_level=excluded.ready_level,
			   fetched_at=excluded.fetched_at,
			   note=excluded.note,
			   updated_at=excluded.updated_at`,
		)
			.bind(tradeDate, readyLevel, note ?? null)
			.run();
	} catch (e) {
		// audit 不中斷主流程
		console.warn('upsertDailyMark failed', e);
	}
}
function twNowHM(): { hh: number; mm: number } {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Taipei',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	}).formatToParts(new Date());
	const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
	const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
	return { hh, mm };
}
function hmToMin(hh: number, mm: number): number {
	return hh * 60 + mm;
}
function inWindow(hh: number, mm: number, startHH: number, startMM: number, endHH: number, endMM: number): boolean {
	const t = hmToMin(hh, mm);
	const a = hmToMin(startHH, startMM);
	const b = hmToMin(endHH, endMM);
	return t >= a && t <= b;
}
function getTaipeiDateParts(at = new Date()): { date: string; hh: number; mm: number; weekday: number } {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Taipei',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
		weekday: 'short',
	}).formatToParts(at);
	const year = parts.find((p) => p.type === 'year')?.value ?? '0000';
	const month = parts.find((p) => p.type === 'month')?.value ?? '01';
	const day = parts.find((p) => p.type === 'day')?.value ?? '01';
	const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
	const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
	const weekdayText = (parts.find((p) => p.type === 'weekday')?.value ?? '').toLowerCase();
	const weekdayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
	return { date: `${year}-${month}-${day}`, hh, mm, weekday: weekdayMap[weekdayText] ?? -1 };
}
function twNowDate(): Date {
	return new Date();
}
function twDateStringFromDate(d: Date): string {
	return getTaipeiDateParts(d).date;
}
function isoNowTaipei(): string {
	return twNowDate().toISOString();
}
function parseYmd(dateStr: string): { y: number; m: number; d: number } {
	const [yy, mm, dd] = String(dateStr).split('-').map((x) => Number(x));
	return { y: yy || 0, m: mm || 1, d: dd || 1 };
}
function addDays(dateStr: string, deltaDays: number): string {
	const { y, m, d } = parseYmd(dateStr);
	const dt = new Date(Date.UTC(y, m - 1, d));
	dt.setUTCDate(dt.getUTCDate() + deltaDays);
	const yy = dt.getUTCFullYear();
	const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(dt.getUTCDate()).padStart(2, '0');
	return `${yy}-${mm}-${dd}`;
}
function isWeekend(dateStr: string): boolean {
	const { y, m, d } = parseYmd(dateStr);
	const dt = new Date(Date.UTC(y, m - 1, d));
	const day = dt.getUTCDay();
	return day === 0 || day === 6;
}
function cycleDeadlineForTradeDate(tradeDate: string): string {
	return `${addDays(tradeDate, 1)}T09:00:00+08:00`;
}
type ReportStatus = 'VALID' | 'SOURCE_DELAY' | 'INVALID' | 'MO_ERROR';
type RecommendationStatus = 'READY' | 'BLOCKED_REPORT_INCOMPLETE' | 'NO_CANDIDATE' | 'ERROR';
function nextWeekday(dateStr: string): string {
	let d = addDays(dateStr, 1);
	while (isWeekend(d)) d = addDays(d, 1);
	return d;
}
function previousWeekday(dateStr: string): string {
	let d = addDays(dateStr, -1);
	while (isWeekend(d)) d = addDays(d, -1);
	return d;
}
function latestCompletedTradingDate(nowDate = twNowDate()): string {
	const taipei = getTaipeiDateParts(nowDate);
	const today = taipei.date;
	if (taipei.weekday === 0) return previousWeekday(today);
	if (taipei.weekday === 6) return previousWeekday(today);
	const afterClose = hmToMin(taipei.hh, taipei.mm) >= hmToMin(14, 30);
	return afterClose ? today : previousWeekday(today);
}
async function getLatestDateValue(env: Env, sql: string, bindValue?: string): Promise<string> {
	try {
		const stmt = env.DB.prepare(sql);
		const row = bindValue == null ? await stmt.first<any>().catch(() => null) : await stmt.bind(bindValue).first<any>().catch(() => null);
		return safeText(row?.trade_date || row?.date || row?.d);
	} catch {
		return '';
	}
}
function maxIsoDate(values: Array<string | null | undefined>): string {
	const cleaned = values.map((v) => safeText(v)).filter(Boolean).sort();
	return cleaned.length ? cleaned[cleaned.length - 1] : '';
}
async function resolveEffectiveTradeDate(env: Env): Promise<string> {
	const today = twTodayString();
	const completedTradeDate = latestCompletedTradingDate();
	const [cycleDate, recDate, signalDate, reviewDate, summaryDate] = await Promise.all([
		getLatestDateValue(
			env,
			"SELECT trade_date FROM mo_cycle_state WHERE trade_date <= ? AND status != 'expired' ORDER BY trade_date DESC LIMIT 1",
			today,
		),
		getLatestDateValue(
			env,
			'SELECT trade_date FROM mo_recommendation_log WHERE trade_date <= ? ORDER BY trade_date DESC, id DESC LIMIT 1',
			today,
		),
		getLatestDateValue(
			env,
			'SELECT signal_date AS d FROM mo_orders WHERE signal_date <= ? ORDER BY signal_date DESC LIMIT 1',
			today,
		),
		getLatestDateValue(
			env,
			'SELECT trade_date FROM mo_recommendation_review_batches WHERE trade_date <= ? ORDER BY trade_date DESC LIMIT 1',
			today,
		),
		getLatestDateValue(env, 'SELECT date FROM twse_daily_summary WHERE date <= ? ORDER BY date DESC LIMIT 1', today),
	]);
	// 核心原則：summary/report 只是衍生說明，不得反向決定 reference trade date。
	// 只要 cycle / recommendation / signal / review 已經到更晚的交易日，主判讀就應該前進。
	return maxIsoDate([cycleDate, recDate, signalDate, reviewDate, completedTradeDate]) || completedTradeDate || today;
}
async function resolveMarketSummaryDate(env: Env, referenceTradeDate: string): Promise<string> {
	const today = twTodayString();
	return await getLatestDateValue(
		env,
		'SELECT date FROM twse_daily_summary WHERE date <= ? ORDER BY date DESC LIMIT 1',
		safeText(referenceTradeDate) || today,
	) || '';
}
async function getLatestSummaryOnOrBefore(env: Env, maxDate: string): Promise<any | null> {
	return await env.DB.prepare('SELECT date, summary_text FROM twse_daily_summary WHERE date <= ? ORDER BY date DESC LIMIT 1').bind(maxDate).first<any>().catch(() => null);
}
async function getLatestCycleOnOrBefore(env: Env, maxDate: string): Promise<MoCycleStateRow> {
	const row = await env.DB.prepare(
		"SELECT trade_date, status, data_ready, summary_ready, recommendation_ready, simulation_seeded, actionable, report_pushed, attempt_count, last_checked_at, deadline_at, note, updated_at FROM mo_cycle_state WHERE trade_date <= ? AND status NOT IN ('completed','expired') ORDER BY trade_date DESC LIMIT 1",
	).bind(maxDate).first<any>().catch(() => null);
	if (!row) return null;
	return {
		trade_date: String(row.trade_date),
		status: String(row.status || 'waiting_data') as CycleStatus,
		data_ready: Number(row.data_ready || 0),
		summary_ready: Number(row.summary_ready || 0),
		recommendation_ready: Number(row.recommendation_ready || 0),
		simulation_seeded: Number(row.simulation_seeded || 0),
		actionable: Number(row.actionable || 0),
		report_pushed: Number(row.report_pushed || 0),
		attempt_count: Number(row.attempt_count || 0),
		last_checked_at: row.last_checked_at ? String(row.last_checked_at) : null,
		deadline_at: String(row.deadline_at || cycleDeadlineForTradeDate(String(row.trade_date))),
		note: row.note == null ? null : String(row.note),
		updated_at: String(row.updated_at || ''),
	};
}
function buildReportCoverageHeader(tradeDate: string): string {
	const effectiveDate = tradeDate || latestCompletedTradingDate();
	const today = twTodayString();
	return effectiveDate && effectiveDate !== today ? `資料截至 ${effectiveDate}` : effectiveDate;
}
function validateReportStatus(args: {
	tradeDate: string;
	isTodayReady: boolean;
	raw: any;
	stocksAll: any[];
	summaryReady: boolean;
}): { reportStatus: ReportStatus; reason?: string } {
	const { tradeDate, isTodayReady, raw, stocksAll, summaryReady } = args;
	if (!tradeDate || !summaryReady || !Array.isArray(stocksAll) || !stocksAll.length) return { reportStatus: 'INVALID', reason: 'missing_summary_or_snapshot' };
	const idxStatus = String(raw?.idx?.status || 'MISSING');
	const idxTradeDate = String(raw?.idx?.indexTradeDate || '').trim();
	if (idxStatus !== 'OK') return { reportStatus: 'SOURCE_DELAY', reason: idxTradeDate ? `index_mismatch:${idxTradeDate}` : 'index_not_ready' };
	const snapshotTradeDate = String(raw?.tradeDate || '').trim() || tradeDate;
	const completedTradeDate = latestCompletedTradingDate();
	const sourceAligned = snapshotTradeDate === tradeDate && (!idxTradeDate || idxTradeDate === tradeDate);
	if (!sourceAligned) {
		return {
			reportStatus: 'SOURCE_DELAY',
			reason: `source_misaligned:tradeDate=${tradeDate};snapshot=${snapshotTradeDate || 'n/a'};index=${idxTradeDate || 'n/a'}`,
		};
	}
	if (tradeDate < completedTradeDate) {
		return { reportStatus: 'SOURCE_DELAY', reason: `stale_trade_date=${tradeDate};latest_completed_trade_date=${completedTradeDate}` };
	}
	if (isTodayReady) return { reportStatus: 'VALID', reason: `today_ready:${tradeDate}` };
	if (tradeDate === completedTradeDate) return { reportStatus: 'VALID', reason: `latest_completed_trade_date=${completedTradeDate}` };
	return { reportStatus: 'VALID', reason: `source_aligned_latest_available=${tradeDate};latest_completed_trade_date=${completedTradeDate}` };
}
function inExtendedCycleWindow(hh: number, mm: number): boolean {
	return inWindow(hh, mm, 14, 30, 23, 59) || inWindow(hh, mm, 0, 0, 8, 59);
}
type MarketTimingHint = {
	sourceStart: string;
	sourceEnd: string;
	analysisStart: string;
	analysisEnd: string;
	statusText: string;
	learned: boolean;
	learningSource?: string;
};
type LearnedTimingWindows = {
	sourceStartMin: number;
	sourceEndMin: number;
	analysisStartMin: number;
	analysisEndMin: number;
	learningSource: string;
};
function formatHm(totalMinutes: number): string {
	const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
	const hh = String(Math.floor(clamped / 60)).padStart(2, '0');
	const mm = String(clamped % 60).padStart(2, '0');
	return `${hh}:${mm}`;
}
function parseTickSummaryMinute(summary: string): number | null {
	const m = String(summary || '').match(/\bt=(\d{2}):(\d{2})\b/);
	if (!m) return null;
	const total = hmToMin(Number(m[1]), Number(m[2]));
	if (!Number.isFinite(total) || total < hmToMin(14, 0) || total > hmToMin(18, 30)) return null;
	return total;
}
function clampLearnedWindow(centerMin: number, beforeMin: number, afterMin: number, floorMin: number, ceilMin: number): { startMin: number; endMin: number } {
	const startMin = Math.max(floorMin, centerMin - beforeMin);
	const endMin = Math.min(ceilMin, Math.max(startMin + 10, centerMin + afterMin));
	return { startMin, endMin };
}
async function getLearnedTimingWindows(env: Env): Promise<LearnedTimingWindows | null> {
	try {
		const tickRows = await env.DB.prepare(`
			SELECT summary
			FROM mo_tick_audit
			WHERE error IS NULL AND summary LIKE 'tick=%'
			ORDER BY triggered_at DESC
			LIMIT 160
		`).all<any>();
		const perTradeDate = new Map<string, { sourceMin?: number; recMin?: number }>();
		for (const row of tickRows?.results ?? []) {
			const summary = String(row?.summary || '');
			const tradeDateMatch = summary.match(/tick=(\d{8})-/);
			const minute = parseTickSummaryMinute(summary);
			if (!tradeDateMatch || minute == null) continue;
			const raw = tradeDateMatch[1];
			const tradeDate = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
			const slot = perTradeDate.get(tradeDate) || {};
			if (/\bsummary=Y\b/.test(summary)) slot.sourceMin = slot.sourceMin == null ? minute : Math.min(slot.sourceMin, minute);
			if (/\brec=Y\b/.test(summary)) slot.recMin = slot.recMin == null ? minute : Math.min(slot.recMin, minute);
			perTradeDate.set(tradeDate, slot);
		}
		const sourceSamples = Array.from(perTradeDate.values()).map((v) => v.sourceMin).filter((v): v is number => Number.isFinite(v));
		const recSamples = Array.from(perTradeDate.values()).map((v) => v.recMin).filter((v): v is number => Number.isFinite(v));
		if (sourceSamples.length >= 3 && recSamples.length >= 3) {
			sourceSamples.sort((a, b) => a - b);
			recSamples.sort((a, b) => a - b);
			const sourceMedian = sourceSamples[Math.floor(sourceSamples.length / 2)];
			const recMedian = recSamples[Math.floor(recSamples.length / 2)];
			const sourceWindow = clampLearnedWindow(sourceMedian, 10, 15, hmToMin(14, 30), hmToMin(16, 0));
			const recWindow = clampLearnedWindow(Math.max(recMedian, sourceWindow.endMin), 5, 25, sourceWindow.startMin + 15, hmToMin(17, 30));
			return {
				sourceStartMin: sourceWindow.startMin,
				sourceEndMin: sourceWindow.endMin,
				analysisStartMin: recWindow.startMin,
				analysisEndMin: recWindow.endMin,
				learningSource: 'recent_source_and_recommendation_ticks',
			};
		}
		const doneMinutes = (tickRows?.results ?? [])
			.map((row: any) => parseTickSummaryMinute(String(row?.summary || '')))
			.filter((v: number | null): v is number => v != null);
		if (doneMinutes.length >= 3) {
			const avgDone = Math.round(doneMinutes.reduce((acc: number, v: number) => acc + v, 0) / doneMinutes.length);
			const sourceWindow = clampLearnedWindow(avgDone, 20, 10, hmToMin(14, 30), hmToMin(16, 0));
			const recWindow = clampLearnedWindow(avgDone + 10, 5, 35, sourceWindow.startMin + 15, hmToMin(17, 30));
			return {
				sourceStartMin: sourceWindow.startMin,
				sourceEndMin: sourceWindow.endMin,
				analysisStartMin: recWindow.startMin,
				analysisEndMin: recWindow.endMin,
				learningSource: 'fallback_cycle_done_ticks',
			};
		}
	} catch {
		// use defaults when tick audit is not available yet
	}
	return null;
}
async function buildMarketTimingHint(env: Env): Promise<MarketTimingHint> {
	const defaults = {
		sourceStartMin: hmToMin(14, 35),
		sourceEndMin: hmToMin(15, 10),
		analysisStartMin: hmToMin(15, 5),
		analysisEndMin: hmToMin(16, 0),
	};
	let learned = false;
	let learningSource: string | undefined;
	let sourceStartMin = defaults.sourceStartMin;
	let sourceEndMin = defaults.sourceEndMin;
	let analysisStartMin = defaults.analysisStartMin;
	let analysisEndMin = defaults.analysisEndMin;
	const learnedWindows = await getLearnedTimingWindows(env);
	if (learnedWindows) {
		learned = true;
		learningSource = learnedWindows.learningSource;
		sourceStartMin = learnedWindows.sourceStartMin;
		sourceEndMin = learnedWindows.sourceEndMin;
		analysisStartMin = learnedWindows.analysisStartMin;
		analysisEndMin = learnedWindows.analysisEndMin;
	}
	const now = getTaipeiDateParts();
	const completedTradeDate = latestCompletedTradingDate();
	const referenceTradeDate = await resolveEffectiveTradeDate(env);
	const marketSummaryDate = await resolveMarketSummaryDate(env, referenceTradeDate);
	const [recLog] = await Promise.all([
		getLatestRecommendationLog(env),
	]);
	const summaryDate = safeText(marketSummaryDate);
	const recDate = safeText(recLog?.trade_date);
	const nowMin = hmToMin(now.hh, now.mm);
	const isTradingDay = now.weekday >= 1 && now.weekday <= 5;
	let statusText = '等待盤後資料';
	if (!isTradingDay) {
		if (referenceTradeDate && summaryDate && referenceTradeDate !== summaryDate) {
			statusText = `非交易日；主判讀已到 ${referenceTradeDate}，市場摘要仍停在 ${summaryDate}`;
		} else if (referenceTradeDate) {
			statusText = `非交易日；目前沿用 ${referenceTradeDate} 的最新資料`;
		} else {
			statusText = `非交易日；等待下一個交易日，最新完成交易日為 ${completedTradeDate}`;
		}
	} else if (summaryDate === completedTradeDate && recDate === completedTradeDate) {
		statusText = `最新交易日 ${completedTradeDate} 的盤後資料與建議已就緒`;
	} else if (summaryDate === completedTradeDate) {
		statusText = `盤後資料已到 ${completedTradeDate}；分析/建議仍在整理中`;
	} else if (referenceTradeDate && referenceTradeDate !== summaryDate && recDate === referenceTradeDate) {
		statusText = `資料已到 ${referenceTradeDate}；市場摘要尚未補齊`;
	} else if (nowMin < sourceStartMin) {
		statusText = '尚在正常等待盤後資料時段';
	} else if (nowMin <= sourceEndMin) {
		statusText = '盤後資料進入常見到站時段，請稍候';
	} else if (nowMin <= analysisEndMin) {
		statusText = '盤後資料可能延遲，系統正在等待並補齊分析';
	} else {
		statusText = '已超過常見完成時段，建議檢查來源資料或稍後再試';
	}
	return {
		sourceStart: formatHm(sourceStartMin),
		sourceEnd: formatHm(sourceEndMin),
		analysisStart: formatHm(analysisStartMin),
		analysisEnd: formatHm(analysisEndMin),
		statusText,
		learned,
		learningSource,
	};
}
function envFlag(env: Env, key: keyof Env, def: boolean): boolean {
	const v = (env as any)[key];
	if (v == null) return def;
	const s = String(v).trim().toLowerCase();
	return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}
type UniverseSource = 'default' | 'env' | 'db';
function canonicalSymbol(symbol: string): string {
	const s = String(symbol || '').trim().toUpperCase();
	if (!s) return '';
	if (/^\d{4,6}$/.test(s)) return `${s}.TW`;
	return s;
}
function bareSymbol(symbol: string): string {
	const s = String(symbol || '').trim().toUpperCase();
	if (s.endsWith('.TW') || s.endsWith('.US')) return s.slice(0, -3);
	return s;
}
function normalizeUniverseSymbol(symbol: string): string {
	return bareSymbol(symbol);
}
function parseUniverseOverride(env: Env): string[] | null {
	const raw = String(env.MO_UNIVERSE ?? '').trim();
	if (!raw) return null;
	const symbols = raw
		.split(',')
		.map((x) => normalizeUniverseSymbol(x))
		.filter(Boolean);
	return symbols.length ? symbols : null;
}
async function getActiveUniverse(env: Env): Promise<{ symbols: string[]; source: UniverseSource }> {
	const override = parseUniverseOverride(env);
	if (override?.length) return { symbols: override, source: 'env' };
	try {
		const rs = await env.DB.prepare("SELECT symbol FROM etf_universe WHERE enabled=1 ORDER BY CASE tier WHEN 'core' THEN 1 WHEN 'attack' THEN 2 WHEN 'defense' THEN 3 ELSE 9 END, market, symbol").all<any>();
		const symbols = (rs?.results ?? [])
			.map((r: any) => normalizeUniverseSymbol(String(r?.symbol ?? '')))
			.filter(Boolean);
		if (symbols.length) return { symbols, source: 'db' };
	} catch (e) {
		console.warn('getActiveUniverse db failed', e);
	}
	return { symbols: [...DEFAULT_UNIVERSE].map((x) => normalizeUniverseSymbol(x)), source: 'default' };
}
function filterUniverseCandidates(topByValue: any[], symbols: string[]): any[] {
	if (!symbols.length) return [];
	const wanted = new Set(symbols.map((x) => normalizeUniverseSymbol(x)));
	const rows = topByValue.filter((x) => wanted.has(normalizeUniverseSymbol(String(x?.code ?? ''))));
	const rank = new Map(symbols.map((s, i) => [normalizeUniverseSymbol(s), i]));
	return rows.sort((a, b) => Number(rank.get(normalizeUniverseSymbol(String(a?.code ?? ''))) ?? 999) - Number(rank.get(normalizeUniverseSymbol(String(b?.code ?? ''))) ?? 999));
}
function pickFirstFinite(values: Array<unknown>): number {
	for (const v of values) {
		const n = Number(v);
		if (Number.isFinite(n)) return n;
	}
	return NaN;
}
function resolveCandidateClose(args: { raw?: any; px?: any; top?: any }): { close: number; source: string } {
	const { raw, px, top } = args;
	const rawClose = getNum(raw, ['收盤價', 'Close', 'close', '收盤', 'ClosingPrice', 'lastPrice', 'LastPrice']);
	if (Number.isFinite(rawClose) && rawClose > 0) return { close: rawClose, source: 'raw.close' };
	const pxClose = Number(px?.close ?? NaN);
	if (Number.isFinite(pxClose) && pxClose > 0) return { close: pxClose, source: 'priceByCode.close' };
	const topClose = Number(top?.close ?? NaN);
	if (Number.isFinite(topClose) && topClose > 0) return { close: topClose, source: 'topByValue.close' };
	const rawOpen = getNum(raw, ['開盤價', 'Open', 'open', '開盤']);
	const rawHigh = getNum(raw, ['最高價', 'High', 'high', '最高']);
	const rawLow = getNum(raw, ['最低價', 'Low', 'low', '最低']);
	const avgOhl = [rawOpen, rawHigh, rawLow].filter((x) => Number.isFinite(x) && Number(x) > 0);
	if (avgOhl.length) {
		const close = round2(avgOhl.reduce((a, b) => a + Number(b), 0) / avgOhl.length);
		return { close, source: avgOhl.length === 1 ? 'raw.ohl_single' : 'raw.ohl_avg' };
	}
	const pxFallback = pickFirstFinite([px?.open, px?.high, px?.low]);
	if (Number.isFinite(pxFallback) && pxFallback > 0) return { close: pxFallback, source: 'priceByCode.ohl' };
	const topFallback = pickFirstFinite([top?.open, top?.high, top?.low]);
	if (Number.isFinite(topFallback) && topFallback > 0) return { close: topFallback, source: 'topByValue.ohl' };
	return { close: NaN, source: 'missing' };
}
function buildUniverseSnapshotCandidates(stocksAll: any[], symbols: string[], priceByCode?: Map<string, any>, topByValue?: any[]): any[] {
	if (!Array.isArray(stocksAll) || !stocksAll.length || !symbols.length) return [];
	const wanted = new Set(symbols.map((x) => normalizeUniverseSymbol(x)));
	const rank = new Map(symbols.map((s, i) => [normalizeUniverseSymbol(s), i]));
	const topMap = new Map<string, any>((topByValue ?? []).map((r: any) => [normalizeUniverseSymbol(String(r?.code ?? '')), r]));
	const rows: any[] = [];
	for (const r of stocksAll) {
		const code = normalizeUniverseSymbol(getStr(r, ['證券代號', 'Code', 'code', 'StockCode']));
		if (!code || !wanted.has(code)) continue;
		const px = priceByCode?.get(code) ?? null;
		const top = topMap.get(code) ?? null;
		const { close, source: closeSource } = resolveCandidateClose({ raw: r, px, top });
		const chgRaw = getNum(r, ['漲跌價差', 'Change', 'chg', '漲跌', '漲跌價差(元)']);
		const valueRaw = getNum(r, ['成交金額', 'TradeValue', 'tradeValue', 'value', '成交金額(元)', 'TradeValue(元)']);
		const chg = Number.isFinite(chgRaw) ? chgRaw : Number(px?.chg ?? top?.chg ?? NaN);
		const value = Number.isFinite(valueRaw) ? valueRaw : Number(top?.value ?? 0);
		rows.push({
			code,
			name: getStr(r, ['證券名稱', 'Name', 'name', 'StockName']) || String(px?.name ?? top?.name ?? ''),
			close,
			chg,
			value,
			closeSource,
			hasClose: Number.isFinite(close) && close > 0,
			hasValue: Number.isFinite(value) && value > 0,
		});
	}
	return rows.sort((a, b) => Number(rank.get(normalizeUniverseSymbol(a.code)) ?? 999) - Number(rank.get(normalizeUniverseSymbol(b.code)) ?? 999));
}
function toNumber(s: unknown): number {
	if (s == null) return NaN;
	const str = String(s).trim();
	if (!str || str === '--') return NaN;
	return Number(str.replace(/,/g, ''));
}
function formatYi(n: number): string {
	if (!Number.isFinite(n)) return '—';
	const yi = n / 1e8;
	if (yi >= 100) return `${yi.toFixed(0)}億`;
	if (yi >= 10) return `${yi.toFixed(1)}億`;
	return `${yi.toFixed(2)}億`;
}
type SignalLevel = 'AGGRESSIVE' | 'TRY' | 'HOLD';
function round2(n: number): number {
	return Math.round(n * 100) / 100;
}
type MarketCode = 'TW' | 'US';
type TradeCostProfile = {
	market: MarketCode;
	minQty: number;
	minNotionalTwd: number;
	commissionRate: number;
	minCommissionTwd: number;
	sellTaxRate: number;
	slippageRate: number;
	minEdgeRate: number;
};
const TRADE_COST_TW_ETF: TradeCostProfile = {
	market: 'TW',
	minQty: 100,
	minNotionalTwd: 10000,
	commissionRate: 0.001425,
	minCommissionTwd: 20,
	sellTaxRate: 0.001,
	slippageRate: 0.0005,
	minEdgeRate: 0.01,
};
const TRADE_COST_US_ETF: TradeCostProfile = {
	market: 'US',
	minQty: 1,
	minNotionalTwd: 15000,
	commissionRate: 0.001,
	minCommissionTwd: 15,
	sellTaxRate: 0,
	slippageRate: 0.001,
	minEdgeRate: 0.012,
};
function detectMarketBySymbol(symbol: string): MarketCode {
	const s = String(symbol || '').trim().toUpperCase();
	if (/^\d{4,6}(\.TW)?$/.test(s)) return 'TW';
	return 'US';
}
function getTradeCostProfile(symbol: string): TradeCostProfile {
	return detectMarketBySymbol(symbol) === 'TW' ? TRADE_COST_TW_ETF : TRADE_COST_US_ETF;
}
function calcCommissionTwd(notionalTwd: number, profile: TradeCostProfile): number {
	if (!Number.isFinite(notionalTwd) || notionalTwd <= 0) return 0;
	return Math.max(profile.minCommissionTwd, round2(notionalTwd * profile.commissionRate));
}
function calcTradeCostEstimate(args: { symbol: string; side: MoOrderSide; price: number; qty: number }): {
	notionalTwd: number;
	commissionTwd: number;
	taxTwd: number;
	slippageTwd: number;
	totalTwd: number;
	profile: TradeCostProfile;
} {
	const profile = getTradeCostProfile(args.symbol);
	const notionalTwd = round2(Math.max(0, args.price) * Math.max(0, args.qty));
	const commissionTwd = calcCommissionTwd(notionalTwd, profile);
	const taxTwd = args.side === 'SELL' ? round2(notionalTwd * profile.sellTaxRate) : 0;
	const slippageTwd = round2(notionalTwd * profile.slippageRate);
	const totalTwd = round2(commissionTwd + taxTwd + slippageTwd);
	return { notionalTwd, commissionTwd, taxTwd, slippageTwd, totalTwd, profile };
}
function estimateRoundTripCostTwd(symbol: string, notionalTwd: number): number {
	const profile = getTradeCostProfile(symbol);
	const buyCommission = calcCommissionTwd(notionalTwd, profile);
	const sellCommission = calcCommissionTwd(notionalTwd, profile);
	const sellTax = round2(notionalTwd * profile.sellTaxRate);
	const slip = round2(notionalTwd * profile.slippageRate * 2);
	return round2(buyCommission + sellCommission + sellTax + slip);
}
function expectedEdgeRateForSignal(signal: SignalLevel, score: number): number {
	const base = signal === 'AGGRESSIVE' ? 0.018 : signal === 'TRY' ? 0.012 : 0.008;
	const bonus = Math.max(0, (Number(score || 0) - 60) / 1000);
	return round2(base + bonus);
}
function buildTradeGuardResult(args: { symbol: string; side: MoOrderSide; price: number; qty: number; signal?: SignalLevel; score?: number }): {
	ok: boolean;
	reason?: string;
	costText?: string;
	notionalTwd: number;
	totalCostTwd: number;
	profile: TradeCostProfile;
} {
	const cost = calcTradeCostEstimate({ symbol: args.symbol, side: args.side, price: args.price, qty: args.qty });
	const { profile, notionalTwd } = cost;
	if (!Number.isFinite(args.qty) || args.qty < profile.minQty) {
		return { ok: false, reason: `qty_too_small min=${profile.minQty}`, costText: `notional=${Math.round(notionalTwd)} cost=${Math.round(cost.totalTwd)}`, notionalTwd, totalCostTwd: cost.totalTwd, profile };
	}
	if (notionalTwd < profile.minNotionalTwd) {
		return { ok: false, reason: `notional_too_small min=${Math.round(profile.minNotionalTwd)}`, costText: `notional=${Math.round(notionalTwd)} cost=${Math.round(cost.totalTwd)}`, notionalTwd, totalCostTwd: cost.totalTwd, profile };
	}
	if (args.side === 'BUY') {
		const edgeRate = expectedEdgeRateForSignal(args.signal ?? 'TRY', Number(args.score ?? 0));
		const minEdge = Math.max(profile.minEdgeRate, edgeRate);
		const requiredProfit = round2(notionalTwd * minEdge);
		const roundTripCost = estimateRoundTripCostTwd(args.symbol, notionalTwd);
		if (requiredProfit <= roundTripCost) {
			return { ok: false, reason: `edge_lt_cost edge=${Math.round(requiredProfit)} cost=${Math.round(roundTripCost)}`, costText: `notional=${Math.round(notionalTwd)} rtCost=${Math.round(roundTripCost)}`, notionalTwd, totalCostTwd: roundTripCost, profile };
		}
	}
	return { ok: true, costText: `notional=${Math.round(notionalTwd)} cost=${Math.round(cost.totalTwd)}`, notionalTwd, totalCostTwd: cost.totalTwd, profile };
}
function decideSignalLevel(args: { dir: string; up: number; down: number; concentration: number; valid: number }): SignalLevel {
	const { dir, up, down, concentration, valid } = args;
	// 資料不足 → 保守不動
	if (valid < 200) return 'HOLD';
	const upStrong = up > down * 1.2;
	const downStrong = down > up * 1.2;
	const concHigh = Number.isFinite(concentration) && concentration >= 0.25;
	// 積極：大盤上漲 + 多數上漲 + 資金不過度集中
	if (dir === '上漲' && upStrong && !concHigh) return 'AGGRESSIVE';
	// 試單：盤面分歧（沒有明顯共識）
	if (!upStrong && !downStrong) return 'TRY';
	// 不動：大盤下跌 + 多數下跌 + 資金集中（偏保守）
	if (dir === '下跌' && downStrong && concHigh) return 'HOLD';
	return 'TRY';
}
function pickTargetFromTop5(top5: any[]): { code: string; name: string; close: number } | null {
	// 你要求：從成交前 5 挑，但不要太像追最熱 → 優先挑第 2~4 名
	const candidates = top5.slice(1, 4).filter((x) => Number.isFinite(x?.close));
	if (!candidates.length) return null;
	// 優先挑「今天收盤是上漲（chg > 0）」的，沒有就用第一個
	const upOnDay = candidates.filter((x) => Number.isFinite(x?.chg) && x.chg > 0);
	const pick = (upOnDay.length ? upOnDay : candidates)[0];
	return { code: pick.code, name: pick.name, close: pick.close };
}
async function linePush(env: Env, text: string): Promise<void> {
	const res = await fetch('https://api.line.me/v2/bot/message/push', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			to: env.LINE_PUSH_USER_ID,
			messages: [{ type: 'text', text }],
		}),
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`LINE push failed: ${res.status} ${body}`);
	}
}
async function lineReply(env: Env, replyToken: string, text: string): Promise<void> {
	const res = await fetch('https://api.line.me/v2/bot/message/reply', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			replyToken,
			messages: [{ type: 'text', text }],
		}),
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`LINE reply failed: ${res.status} ${body}`);
	}
}
function safeText(s: unknown): string {
	return String(s ?? '')
		.replace(/\r/g, '')
		.trim();
}
function normalizeTwseSummaryText(txt: string): string {
	let out = txt;
	// Fix direction text if sign and percent disagree (common when sign column missing)
	out = out.replace(/(大盤：[^｜]+｜)上漲\s+([0-9.,]+)點（-/, '$1下跌 $2點（-');
	out = out.replace(/(大盤：[^｜]+｜)下跌\s+([0-9.,]+)點（\+/, '$1上漲 $2點（+');
	// If breadth is explicitly marked incomplete, don't show tiny counts
	if (/還不完整（資料稍晚會補齊）/.test(out)) {
		out = out.replace(/📈 個股：上漲\s+\d+｜下跌\s+\d+｜持平\s+\d+/, '📈 個股：漲跌統計未齊（資料稍晚會補齊）');
	}
	return out;
}
async function buildStatusText(env: Env): Promise<string> {
	await ensureMultiAssetTables(env);
	const effectiveTradeDate = await resolveEffectiveTradeDate(env);
	const marketSummaryDate = await resolveMarketSummaryDate(env, effectiveTradeDate);
	const [summaryRow, cycle, recLog, signalView, portfolio, timing] = await Promise.all([
		getLatestSummaryOnOrBefore(env, marketSummaryDate || effectiveTradeDate),
		getLatestCycleOnOrBefore(env, effectiveTradeDate),
		getLatestRecommendationLog(env),
		getLatestSignalView(env),
		getPortfolioQuickView(env),
		buildMarketTimingHint(env),
	]);
	const lines: string[] = [];
	lines.push('📌 MO 狀態');
	lines.push(`盤後資料預估：${timing.sourceStart}–${timing.sourceEnd}`);
	lines.push(`分析/推薦預估：${timing.analysisStart}–${timing.analysisEnd}${timing.learned ? '（依近期完成時間校正）' : '（預設值）'}`);
	lines.push(`目前判定：${timing.statusText}`);
	lines.push(`摘要：${safeText(effectiveTradeDate) || safeText(summaryRow?.date) || '—'}`);
	if (recLog) lines.push(`建議：${safeText(recLog.trade_date) || '—'}｜${safeText(recLog.signal) || 'HOLD'}｜${Number(recLog.rec_count ?? 0)}/${Number(recLog.candidate_count ?? 0)}`);
	else lines.push('建議：尚無最新建議紀錄');
	if (signalView) {
		const execPart = signalView.executed > 0 ? `｜已模擬成交 ${signalView.executed}` : signalView.pending > 0 ? `｜待模擬 ${signalView.pending}` : '';
		lines.push(`訊號批次：${signalView.signalDate}｜total ${signalView.total}｜pending ${signalView.pending}｜executed ${signalView.executed}｜skipped ${signalView.skipped}${execPart}`);
		if (signalView.execDate) lines.push(`模擬執行日：${signalView.execDate}`);
	} else {
		lines.push('訊號批次：目前尚無待處理/已執行訊號');
	}
	lines.push(`策略池：現金 ${Math.round(portfolio.cash).toLocaleString()}｜持倉 ${portfolio.positions}`);
	if (cycle) {
		lines.push(`Cycle：${safeText(effectiveTradeDate) || safeText(cycle.trade_date)}｜${cycleStatusLabel(safeText(cycle.status))}`);
		if (marketSummaryDate && marketSummaryDate !== effectiveTradeDate) lines.push(`市場摘要參考：${marketSummaryDate}（主判讀 ${effectiveTradeDate}；摘要尚未補齊）`);
		if (cycle.note) lines.push(`備註：${safeText(cycle.note)}`);
	}
	return lines.join('\n');
}
async function buildPortfolioText(env: Env): Promise<string> {
	await ensureMultiAssetTables(env);
	const [pf, positions] = await Promise.all([
		env.DB.prepare('SELECT cash_twd, market_value_twd, total_equity_twd, cumulative_return_pct, regime, streak_down, streak_up, updated_at FROM mo_portfolio_state WHERE id=1').first<any>().catch(() => null),
		env.DB.prepare('SELECT symbol, name, qty, avg_cost, last_price, market_value, unrealized_pnl, unrealized_pnl_pct FROM mo_positions ORDER BY market_value DESC, symbol ASC LIMIT 12').all<any>().catch(() => ({ results: [] } as any)),
	]);
	const rows = positions?.results ?? [];
	const cash = Number(pf?.cash_twd ?? 300000);
	const marketValue = Number(pf?.market_value_twd ?? rows.reduce((acc: number, r: any) => acc + Number(r?.market_value ?? 0), 0));
	const totalEquity = Number(pf?.total_equity_twd ?? (cash + marketValue));
	const cumRet = Number(pf?.cumulative_return_pct ?? 0);
	const regime = safeText(pf?.regime) || 'NORMAL';
	const streakDown = Number(pf?.streak_down ?? 0);
	const streakUp = Number(pf?.streak_up ?? 0);
	const lines: string[] = [];
	lines.push('📦 策略池持倉');
	lines.push(`現金：${Math.round(cash).toLocaleString()}｜持倉 ${rows.length}`);
	lines.push(`市值：${Math.round(marketValue).toLocaleString()}｜總資產：${Math.round(totalEquity).toLocaleString()}`);
	lines.push(`累積報酬：${cumRet.toFixed(2)}%｜模式：${regime}（連跌 ${streakDown} / 連漲 ${streakUp}）`);
	if (!rows.length) {
		lines.push('目前尚無持倉。');
		return lines.join('\n');
	}
	for (const r of rows) {
		const symbol = safeText(r?.symbol);
		const name = safeText(r?.name);
		const qty = Number(r?.qty ?? 0);
		const avgCost = Number(r?.avg_cost ?? 0);
		const lastPrice = Number(r?.last_price ?? 0);
		const mv = Number(r?.market_value ?? qty * lastPrice);
		const pnlPct = Number(r?.unrealized_pnl_pct ?? (avgCost > 0 ? ((lastPrice - avgCost) / avgCost) * 100 : 0));
		lines.push(`${symbol}${name ? ' ' + name : ''}`);
		lines.push(`股數：${qty}｜均價：${avgCost.toFixed(2)}｜現價：${lastPrice.toFixed(2)}`);
		lines.push(`市值：${Math.round(mv).toLocaleString()}｜未實現：${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`);
	}
	return lines.join('\n');
}
async function getLatestRecommendationLog(env: Env): Promise<any | null> {
	const tries = [
		"SELECT trade_date, signal, universe_source, universe_symbols, candidate_count, rec_count, note FROM mo_recommendation_log ORDER BY id DESC LIMIT 1",
		"SELECT signal_date AS trade_date, action AS signal, 'legacy' AS universe_source, '' AS universe_symbols, 0 AS candidate_count, COUNT(*) AS rec_count, 'legacy_schema' AS note FROM mo_recommendation_log WHERE is_latest=1 GROUP BY signal_date, action ORDER BY id DESC LIMIT 1",
		"SELECT signal_date AS trade_date, action AS signal, 'legacy' AS universe_source, '' AS universe_symbols, 0 AS candidate_count, COUNT(*) AS rec_count, 'recommendation_log' AS note FROM recommendation_log GROUP BY signal_date, action ORDER BY id DESC LIMIT 1",
	];
	for (const sql of tries) {
		try {
			const row = await env.DB.prepare(sql).first<any>();
			if (row) return row;
		} catch (e) {
			// ignore schema drift and try next shape
		}
	}
	return null;
}
type LatestSignalView = {
	signalDate: string;
	total: number;
	pending: number;
	executed: number;
	skipped: number;
	execDate: string;
};
async function getLatestSignalView(env: Env): Promise<LatestSignalView | null> {
	const row = await env.DB.prepare(`
		SELECT signal_date,
			COUNT(*) AS total_count,
			SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) AS pending_count,
			SUM(CASE WHEN status='EXECUTED' THEN 1 ELSE 0 END) AS executed_count,
			SUM(CASE WHEN status='SKIPPED' THEN 1 ELSE 0 END) AS skipped_count,
			MAX(COALESCE(exec_date, '')) AS exec_date
		FROM mo_orders
		GROUP BY signal_date
		ORDER BY signal_date DESC
		LIMIT 1
	`).first<any>().catch(() => null);
	if (!row?.signal_date) return null;
	return {
		signalDate: safeText(row.signal_date),
		total: Number(row.total_count || 0),
		pending: Number(row.pending_count || 0),
		executed: Number(row.executed_count || 0),
		skipped: Number(row.skipped_count || 0),
		execDate: safeText(row.exec_date),
	};
}
async function getPortfolioQuickView(env: Env): Promise<{ cash: number; positions: number }> {
	const [pf, pos] = await Promise.all([
		env.DB.prepare('SELECT cash_twd FROM mo_portfolio_state WHERE id=1').first<any>().catch(() => null),
		env.DB.prepare('SELECT COUNT(*) AS c FROM mo_positions').first<any>().catch(() => null),
	]);
	return {
		cash: Number(pf?.cash_twd ?? 300000),
		positions: Number(pos?.c || 0),
	};
}
function formatPercentOrDash(value: unknown): string {
	if (value == null || value === '') return '—';
	const num = Number(value);
	if (!Number.isFinite(num)) return '—';
	return `${num.toFixed(2)}%`;
}
function cycleStatusLabel(status: string): string {
	switch (safeText(status)) {
		case 'actionable_ready':
			return '可形成可執行建議';
		case 'core_ready':
			return '核心資料已到齊';
		case 'report_ready':
			return '報告可讀';
		case 'report_only':
			return '僅供觀察報告';
		case 'expired':
			return '本輪已過觀察時窗';
		case 'waiting_data':
		default:
			return '仍在等資料補齊';
	}
}
function summarizeSignal(signal: string, recCount: number, candidateCount: number): string {
	const cleanSignal = safeText(signal) || 'HOLD';
	if (cleanSignal === 'HOLD' || recCount <= 0) {
		return `目前結論：${cleanSignal}，先不建議新進場。`;
	}
	return `目前結論：${cleanSignal}，候選 ${candidateCount} 檔中已有 ${recCount} 檔進入建議名單。`;
}
async function buildOperatorReportText(env: Env): Promise<string> {
	await ensureMultiAssetTables(env);
	await ensureCycleStateTable(env);
	const effectiveTradeDate = await resolveEffectiveTradeDate(env);
	const marketSummaryDate = await resolveMarketSummaryDate(env, effectiveTradeDate);
	const [summaryRow, cycle, recLog] = await Promise.all([
		getLatestSummaryOnOrBefore(env, marketSummaryDate || effectiveTradeDate),
		getLatestCycleOnOrBefore(env, effectiveTradeDate),
		getLatestRecommendationLog(env),
	]);
	const tradeDate = safeText(effectiveTradeDate);
	if (!tradeDate) return '目前尚無最新報告可查看。';
	const reviewReferenceTradeDate = safeText(recLog?.trade_date) || tradeDate;
	const reviewBatch = await getLatestReviewBatchExact(env, reviewReferenceTradeDate);
	const reviewView = await buildReviewProgressView(env, reviewReferenceTradeDate, reviewBatch);
	const items = reviewBatch && safeText(reviewBatch.trade_date) === reviewReferenceTradeDate && reviewView?.source !== 'live_projection'
		? await getLatestReviewItemsExact(env, reviewReferenceTradeDate)
		: [];
	const lines: string[] = [];
	const signal = safeText(recLog?.signal) || 'HOLD';
	const recCount = Number(recLog?.rec_count ?? 0);
	const candidateCount = Number(recLog?.candidate_count ?? 0);
	const horizon = Math.max(0, Number(reviewView?.maxReviewHorizon ?? reviewBatch?.max_review_horizon ?? 0));
	const cycleLabel = cycleStatusLabel(safeText(cycle?.status));
	lines.push(`🧭 Market Operator Report｜資料截至 ${tradeDate}`);
	lines.push(summarizeSignal(signal, recCount, candidateCount));
	if (cycle) {
		lines.push('');
		lines.push('目前狀態');
		lines.push(`- Cycle：${cycleLabel}`);
		if (cycle.deadline_at) lines.push(`- 本輪觀察截止：${safeText(cycle.deadline_at)}`);
		if (cycle.note) lines.push(`- 系統備註：${safeText(cycle.note)}`);
	}
	const signalView = await getLatestSignalView(env);
	const portfolio = await getPortfolioQuickView(env);
	const timing = await buildMarketTimingHint(env);
	lines.push(`- 盤後資料常見時段：${timing.sourceStart}–${timing.sourceEnd}`);
	lines.push(`- 分析/推薦預估：${timing.analysisStart}–${timing.analysisEnd}${timing.learned ? '（依近期完成時間校正）' : '（預設值）'}`);
	lines.push(`- 目前判定：${timing.statusText}`);
	if (signalView) {
		if (!cycle) {
			lines.push('');
			lines.push('目前狀態');
		}
		lines.push(`- 最新訊號批次：${signalView.signalDate}｜pending ${signalView.pending}｜executed ${signalView.executed}｜skipped ${signalView.skipped}`);
		if (signalView.execDate) lines.push(`- 最新模擬執行日：${signalView.execDate}`);
	}
	lines.push(`- 策略池：現金 ${Math.round(portfolio.cash).toLocaleString()}｜持倉 ${portfolio.positions}`);
	if (reviewView) {
		lines.push('');
		lines.push('驗證進度');
		pushReviewProgressLines(lines, reviewView);
	}
	lines.push('');
	lines.push('系統判讀');
	if (signal === 'HOLD' || recCount <= 0) {
		lines.push(`- 候選標的雖有 ${candidateCount} 檔，但目前仍未形成可執行名單。`);
		if (horizon <= 1) lines.push('- 目前大多只看到短期觀察資料，D5 / D10 / D20 尚未成熟，先以觀察為主。');
		else lines.push('- 系統仍偏向保守，會等更多條件到齊後再決定是否轉為可執行建議。');
	} else {
		lines.push(`- 本輪候選 ${candidateCount} 檔，已有 ${recCount} 檔符合建議條件。`);
		lines.push('- 可優先關注下列重點標的，但仍需依後續成交與風險條件確認。');
	}
	if (items.length) {
		lines.push('');
		lines.push('重點標的');
		for (const item of items.slice(0, 3)) {
			const symbol = safeText(item.symbol);
			const name = safeText(item.name);
			const status = safeText(item.order_status) || 'UNKNOWN';
			const d0 = formatPercentOrDash(item?.d0_return);
			lines.push(`- ${symbol} ${name}：${status}，D0 ${d0}`);
			if (item?.review_note) lines.push(`  ${safeText(item.review_note)}`);
		}
	}
	lines.push('');
	lines.push('接下來怎麼看');
	if (horizon <= 1) lines.push('- 先等待 D5 / D10 / D20 累積完成，再判斷這批標的是否能從觀察轉為正式建議。');
	else lines.push('- 持續追蹤後續 checkpoint 與成交條件，確認這批訊號是否能維持。');
	if (summaryRow) {
		const summaryDate = safeText(summaryRow.date);
		if (summaryDate !== tradeDate) lines.push(`- 市場摘要最新資料日仍是 ${summaryDate}；${tradeDate} 的原始資料已存在，系統主判讀不再因摘要缺失而回退。`);
	} else {
		lines.push(`- 市場摘要尚未產生；${tradeDate} 的原始資料已存在，系統主判讀仍以 ${tradeDate} 為準。`);
	}
	if (summaryRow) {
		const summaryDate = safeText(summaryRow.date);
		const txt = normalizeTwseSummaryText(safeText(summaryRow.summary_text));
		lines.push('');
		lines.push(`市場摘要參考（${summaryDate}）`);
		lines.push(txt || '（空）');
	}
	return lines.join('\n');
}
async function buildYesterdayReport(env: Env): Promise<string> {
	return await buildOperatorReportText(env);
}
async function buildLatestRecs(env: Env): Promise<string> {
	await ensureMultiAssetTables(env);
	const signalView = await getLatestSignalView(env);
	const portfolio = await getPortfolioQuickView(env);
	const d = await env.DB.prepare(
		"SELECT signal_date AS d FROM mo_orders WHERE status='PENDING' ORDER BY signal_date DESC LIMIT 1",
	).first<any>();
	if (!d?.d) {
		if (signalView?.executed) {
			return [`🧠 明日建議：最新批次 ${signalView.signalDate} 已完成模擬`, `已執行 ${signalView.executed}｜未成交 ${signalView.skipped}`, `策略池：現金 ${Math.round(portfolio.cash).toLocaleString()}｜持倉 ${portfolio.positions}`].join('\n');
		}
		return '目前沒有可用的明日建議（mo_orders PENDING 空）。';
	}
	const rows = await env.DB.prepare(
		"SELECT side, symbol, name, entry_low, entry_high, qty, reason FROM mo_orders WHERE status='PENDING' AND signal_date=? ORDER BY rowid ASC",
	)
		.bind(d.d)
		.all<any>();
	const recs = rows?.results ?? [];
	if (!recs.length) return `目前沒有可用的明日建議（${d.d}）。`;
	const lines: string[] = [];
	lines.push(`🧠 建議清單（資料截至 ${d.d}）`);
	if (signalView) lines.push(`批次狀態：pending ${signalView.pending}｜executed ${signalView.executed}｜skipped ${signalView.skipped}`);
	for (const [i, r] of recs.entries()) {
		lines.push(`${i + 1}. ${r.side} ${r.symbol} ${safeText(r.name)}`.trim());
		lines.push(`   價格：${r.entry_low} – ${r.entry_high}｜數量：${r.qty}`);
		if (r.reason) lines.push(`   原因：${safeText(r.reason)}`);
	}
	lines.push(`策略池：現金 ${Math.round(portfolio.cash).toLocaleString()}｜持倉 ${portfolio.positions}`);
	return lines.join('\n');
}
async function ensureAiAuditTable(env: Env): Promise<void> {
	await env.DB.prepare(
		`CREATE TABLE IF NOT EXISTS mo_ai_audit (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			called_at TEXT NOT NULL DEFAULT (datetime('now')),
			kind TEXT NOT NULL,
			model TEXT,
			enabled INTEGER NOT NULL DEFAULT 1,
			ok INTEGER NOT NULL DEFAULT 0,
			status_code INTEGER,
			duration_ms INTEGER,
			response_chars INTEGER,
			error TEXT,
			request_id TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);`,
	).run();
	await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mo_ai_audit_called_at ON mo_ai_audit(called_at DESC);`).run();
}
async function appendAiAudit(
	env: Env,
	args: {
		kind: string;
		model?: string | null;
		enabled: boolean;
		ok: boolean;
		statusCode?: number | null;
		durationMs?: number | null;
		responseChars?: number | null;
		error?: string | null;
		requestId?: string | null;
	},
): Promise<void> {
	try {
		await ensureAiAuditTable(env);
		await env.DB.prepare(
			`INSERT INTO mo_ai_audit (kind, model, enabled, ok, status_code, duration_ms, response_chars, error, request_id)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
			.bind(
				args.kind,
				args.model ?? null,
				args.enabled ? 1 : 0,
				args.ok ? 1 : 0,
				args.statusCode ?? null,
				args.durationMs ?? null,
				args.responseChars ?? null,
				args.error ? safeText(args.error).slice(0, 500) : null,
				args.requestId ?? null,
			)
			.run();
	} catch (e) {
		console.warn('[AI] audit write failed', e);
	}
}
async function buildAiFallbackText(
	env: Env,
	kind: 'status' | 'report' | 'recommendation',
	reason?: string,
): Promise<string> {
	const why = reason ? `（AI 暫時不可用：${safeText(reason).slice(0, 120)}）` : '（AI 暫時不可用）';
	if (kind === 'status') return `🤖 AI 狀態改用內建摘要 ${why}
${await buildStatusText(env)}`;
	if (kind === 'report') return `🤖 AI 報告改用內建摘要 ${why}
${await buildYesterdayReport(env)}`;
	return `🤖 AI 建議改用內建摘要 ${why}
${await buildLatestRecs(env)}`;
}
async function buildAiText(
	env: Env,
	kind: 'status' | 'report' | 'recommendation',
): Promise<string> {
	const aiEnabled = envFlag(env, 'AI_ENABLED', true);
	const model = String(env.OPENAI_MODEL ?? '').trim() || 'gpt-4o-mini';
	if (!aiEnabled) {
		await appendAiAudit(env, {
			kind,
			model,
			enabled: false,
			ok: false,
			error: 'AI disabled by AI_ENABLED',
		});
		return await buildAiFallbackText(env, kind, 'AI_ENABLED=0');
	}
	try {
		const payload =
			kind === 'status'
				? await buildAiStatusPayload(env)
				: kind === 'report'
					? await buildAiReportPayload(env)
					: await buildAiRecommendationPayload(env);
		return await generateAiExplanation(env, kind, payload);
	} catch (e: any) {
		return await buildAiFallbackText(env, kind, String(e?.message || e));
	}
}
async function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | null = null;
	try {
		return await Promise.race([
			promise,
			new Promise<T>((resolve) => {
				timer = setTimeout(async () => {
					resolve(await onTimeout());
				}, ms);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}
type TwseIndexRow = Record<string, unknown>;
type StockDayRow = Record<string, unknown>;
// Global fetch mode (set per request in /admin/run)
let FORCE_NO_STORE = false;
type FetchJsonOpts = {
	label?: string;
	noStore?: boolean;
	headers?: Record<string, string>;
};
async function fetchJson<T>(url: string, opts?: FetchJsonOpts): Promise<T> {
	const label = opts?.label ? ` ${opts.label}` : '';
	const noStore = opts?.noStore != null ? Boolean(opts.noStore) : FORCE_NO_STORE;
	const extraHeaders = opts?.headers ?? {};
	// ✅ 除錯/force 時避免 CF cache 干擾，並把實際 URL 印出來
	console.log(`[TWSE] fetch${label} url=${url} cache=${noStore ? 'no-store' : 'cf'}`);
	// ✅ Timeout guard：避免 TWSE/OpenAPI 偶發卡住拖垮整個 Worker invocation
	const timeoutMs = 9000;
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(`timeout ${timeoutMs}ms`), timeoutMs);
	try {
		const res = await fetch(url, {
			headers: { accept: 'application/json', ...extraHeaders },
			cache: noStore ? ('no-store' as any) : undefined,
			// NOTE: cache:'no-store' conflicts with cf.cacheTtl; omit cf in noStore mode.
			cf: noStore ? undefined : ({ cacheTtl: 60, cacheEverything: true } as any),
			signal: ac.signal,
		} as any);
		if (!res.ok) {
			const txt = await res.text().catch(() => '');
			throw new Error(`fetch failed ${res.status} ${res.statusText}${txt ? `: ${txt.slice(0, 200)}` : ''}`);
		}
		return (await res.json()) as T;
	} catch (e: any) {
		const isAbort = String(e?.name || '') === 'AbortError' || String(e?.message || '').includes('aborted');
		const msg = isAbort ? `fetch timeout after ${timeoutMs}ms: ${url}` : String(e?.message || e);
		throw new Error(msg);
	} finally {
		clearTimeout(timer);
	}
}
function getStr(r: any, keys: string[]): string {
	for (const k of keys) {
		const v = r?.[k];
		if (v != null) {
			const s = String(v).trim();
			if (s) return s;
		}
	}
	return '';
}
function getNum(r: any, keys: string[]): number {
	const s = getStr(r, keys);
	return toNumber(s);
}
/** 從 TWSE 回傳資料中抽「交易日」(YYYY-MM-DD) */
function pickTradeDateFromRow(r: any): string {
	// TWSE/OpenAPI 欄位名偶爾會改/多語系混用：盡量涵蓋常見變體
	const raw = getStr(r, ['日期', '交易日期', '交易日', '資料日期', '資料日', '年月日', 'TradeDate', 'ReportDate', 'Date', 'date']);
	return normalizeTradeDate(raw);
}
/** 兼容 TWSE 多種日期格式（含 2026/3/5 這種非補零格式） */
function normalizeTradeDate(raw: string): string {
	const s0 = String(raw ?? '').trim();
	if (!s0) return '';
	// 去掉空白與常見括號/文字（例如：2026/3/5(四)、2026年3月5日）
	let s = s0.replaceAll(' ', '').replace(/[（(].*[)）]$/g, '');
	// 先移除結尾的時分秒 / 時區（例如：2026/03/05 00:00:00、2026-03-05T00:00:00+08:00）
	s = s.replace(/(T|\s)\d{1,2}:\d{2}(:\d{2})?(\.\d+)?([Zz]|[\+\-]\d{2}:?\d{2})?$/g, '');
	// 中文年月日
	s = s.replace(/年/g, '/').replace(/月/g, '/').replace(/日/g, '');
	// A) 2026/03/05 或 2026/3/5
	let m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
	if (m) {
		const mm = m[2].padStart(2, '0');
		const dd = m[3].padStart(2, '0');
		return `${m[1]}-${mm}-${dd}`;
	}
	// B) 2026-03-05 或 2026-3-5
	m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
	if (m) {
		const mm = m[2].padStart(2, '0');
		const dd = m[3].padStart(2, '0');
		return `${m[1]}-${mm}-${dd}`;
	}
	// C) 20260305
	if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
	// C2) 民國 1150305
	if (/^\d{6,7}$/.test(s)) {
		// 2~3 位民國年 + 4 位月日
		const yPart = s.length === 6 ? s.slice(0, 2) : s.slice(0, 3);
		const md = s.slice(yPart.length);
		const y = String(Number(yPart) + 1911);
		return `${y}-${md.slice(0, 2)}-${md.slice(2, 4)}`;
	}
	// D) 民國 115/03/05 或 115/3/5
	m = s.match(/^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/);
	if (m) {
		const y = String(Number(m[1]) + 1911);
		const mm = m[2].padStart(2, '0');
		const dd = m[3].padStart(2, '0');
		return `${y}-${mm}-${dd}`;
	}
	// E) 2026.03.05 / 115.3.5
	m = s.match(/^(\d{2,4})\.(\d{1,2})\.(\d{1,2})$/);
	if (m) {
		const yRaw = Number(m[1]);
		const y = yRaw < 1911 ? String(yRaw + 1911) : String(yRaw);
		const mm = m[2].padStart(2, '0');
		const dd = m[3].padStart(2, '0');
		return `${y}-${mm}-${dd}`;
	}
	return '';
}
/**
 * TWSE openapi 有時會從「陣列」改成「包一層物件」(例如 { date, data } )。
 * 這裡做一次寬鬆解包，避免 schema 變動就整個 D0 崩。
 */
function twseUnwrapRows(payload: any): any[] {
	if (Array.isArray(payload)) return payload;
	if (!payload || typeof payload !== 'object') return [];
	const cand = (payload as any).data ?? (payload as any).aaData ?? (payload as any).rows ?? (payload as any).result;
	return Array.isArray(cand) ? cand : [];
}
function twsePickDateFromPayload(payload: any): string {
	if (!payload || typeof payload !== 'object') return '';
	const raw = getStr(payload, ['date', 'Date', 'tradeDate', 'TradeDate', 'ReportDate', 'reportDate', '交易日期', '日期', '資料日期']);
	return normalizeTradeDate(raw);
}
function pickLatestTradeDateFromRows(rows: any[], label: string): string {
	if (!Array.isArray(rows) || rows.length === 0) return '';
	const dates = new Set<string>();
	for (const r of rows) {
		const d = pickTradeDateFromRow(r);
		if (d) dates.add(d);
	}
	const distinct = Array.from(dates).sort();
	if (distinct.length) {
		const first = distinct[0] as string;
		const last = distinct[distinct.length - 1] as string;
		console.log(`[TWSE] ${label} date span first=${first} last=${last} distinct=${distinct.length}`);
		return last;
	}
	return '';
}
async function fetchTradeDateFromLegacyMiIndex(anchorDate: string, noStore?: boolean): Promise<string> {
	const today = twTodayString();
	const cappedAnchor = anchorDate && anchorDate <= today ? anchorDate : today;
	const probes = Array.from(
		new Set([addDays(cappedAnchor, 1), cappedAnchor, addDays(cappedAnchor, -1), addDays(cappedAnchor, -2)].filter((d) => d && d <= today)),
	);
	console.log(`[TWSE] legacy probe anchor=${cappedAnchor} probes=${probes.join(',')}`);
	let best = '';
	for (const probe of probes) {
		const dateParam = probe.replace(/-/g, '');
		const url = `https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=${dateParam}&type=MS`;
		try {
			const payload = await fetchJson<any>(url, { label: `MI_INDEX_LEGACY(${probe})`, noStore });
			const payloadDate = twsePickDateFromPayload(payload);
			const rows = twseUnwrapRows(payload);
			const rowDate = pickLatestTradeDateFromRows(rows, `MI_INDEX_LEGACY(${probe})`);
			const resolved = rowDate || payloadDate;
			if (!resolved) continue;
			const delta = daysBetween(cappedAnchor, resolved);
			console.log(`[TWSE] candidate tradeDate=${resolved} via MI_INDEX_LEGACY(${probe}) delta=${delta}`);
			if (resolved > today) {
				console.warn(`[TWSE] ignore legacy candidate in future resolved=${resolved} today=${today}`);
				continue;
			}
			if (delta > 1) {
				console.warn(`[TWSE] ignore legacy candidate too far ahead resolved=${resolved} anchor=${cappedAnchor} delta=${delta}`);
				continue;
			}
			if (!best || resolved > best) best = resolved;
		} catch (e: any) {
			console.warn(`[TWSE] legacy MI_INDEX probe failed probe=${probe} err=${String(e?.message || e)}`);
		}
	}
	return best;
}
async function fetchTradeDateFromFmtqik(): Promise<string> {
	const url = 'https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK';
	const payload = await fetchJson<any>(url, { label: 'FMTQIK' });
	const headerDate = twsePickDateFromPayload(payload);
	const rows = twseUnwrapRows(payload);
	const latestRowDate = pickLatestTradeDateFromRows(rows, 'FMTQIK');
	if (latestRowDate) return latestRowDate;
	if (headerDate) return headerDate;
	if (!Array.isArray(rows) || rows.length === 0) return '';
	for (const r of rows) {
		for (const v of Object.values(r || {})) {
			const s = String(v ?? '').trim();
			if (!s) continue;
			const d2 = normalizeTradeDate(s);
			if (d2) return d2;
		}
	}
	try {
		const first = rows[0] || {};
		const keys = Object.keys(first);
		console.warn(`[TWSE] FMTQIK date not found. firstRowKeys=${keys.slice(0, 40).join(',')}`);
	} catch {}
	return '';
}
async function fetchTradeDateFromStocksAll(payload: any, rows: any[]): Promise<string> {
	const headerDate = twsePickDateFromPayload(payload);
	const latestRowDate = pickLatestTradeDateFromRows(rows, 'STOCK_DAY_ALL');
	if (latestRowDate) return latestRowDate;
	if (headerDate) return headerDate;
	if (!Array.isArray(rows) || rows.length === 0) return '';
	const n = Math.min(20, rows.length);
	for (let i = n - 1; i >= 0; i--) {
		const r = rows[i];
		for (const v of Object.values(r || {})) {
			const s = String(v ?? '').trim();
			if (!s) continue;
			const d2 = normalizeTradeDate(s);
			if (d2) return d2;
		}
	}
	return '';
}
function daysBetween(a: string, b: string): number {
	// a,b: YYYY-MM-DD
	const da = new Date(a + 'T00:00:00Z').getTime();
	const db = new Date(b + 'T00:00:00Z').getTime();
	return Math.round((db - da) / 86400000);
}
function finMindAuthHeaders(env: Env): Record<string, string> {
	const token = String(env.FINMIND_TOKEN || '').trim();
	return token ? { Authorization: `Bearer ${token}` } : {};
}
async function fetchTradeDateFromFinMind(env: Env, anchorDate: string, noStore?: boolean): Promise<string> {
	const token = String(env.FINMIND_TOKEN || '').trim();
	if (!token) {
		console.log('[FINMIND] skip: FINMIND_TOKEN not set');
		return '';
	}
	const today = twTodayString();
	const cappedAnchor = anchorDate && anchorDate <= today ? anchorDate : today;
	const probes = Array.from(
		new Set([addDays(cappedAnchor, 1), cappedAnchor, addDays(cappedAnchor, -1), addDays(cappedAnchor, -2)].filter((d) => d && d <= today)),
	);
	console.log(`[FINMIND] probe anchor=${cappedAnchor} probes=${probes.join(',')}`);
	let best = '';
	let unavailable = false;
	for (const probe of probes) {
		const qs = new URLSearchParams({
			dataset: 'TaiwanStockTradingDate',
			start_date: probe,
			end_date: probe,
		});
		const url = `https://api.finmindtrade.com/api/v4/data?${qs.toString()}`;
		try {
			const payload = await fetchJson<any>(url, {
				label: `FINMIND_TRADING_DATE(${probe})`,
				noStore,
				headers: finMindAuthHeaders(env),
			});
			const rows = Array.isArray(payload?.data) ? payload.data : [];
			if (!rows.length) continue;
			const resolved = pickLatestTradeDateFromRows(rows, `FINMIND_TRADING_DATE(${probe})`) || normalizeTradeDate(rows[rows.length - 1]?.date);
			if (!resolved) continue;
			const delta = daysBetween(cappedAnchor, resolved);
			console.log(`[FINMIND] candidate tradeDate=${resolved} via TaiwanStockTradingDate(${probe}) delta=${delta}`);
			if (resolved > today) {
				console.warn(`[FINMIND] ignore candidate in future resolved=${resolved} today=${today}`);
				continue;
			}
			if (delta > 1) {
				console.warn(`[FINMIND] ignore candidate too far ahead resolved=${resolved} anchor=${cappedAnchor} delta=${delta}`);
				continue;
			}
			if (!best || resolved > best) best = resolved;
		} catch (e: any) {
			const msg = String(e?.message || e);
			if (msg.includes('400') || msg.includes('401') || msg.includes('403') || msg.includes('Please update your user level')) {
				unavailable = true;
				console.warn(`[FINMIND] unavailable: ${msg}`);
				break;
			}
			console.warn(`[FINMIND] probe failed probe=${probe} err=${msg}`);
		}
	}
	if (unavailable && !best) return '';
	return best;
}
async function buildDailySummary(env: Env, opts?: {
	noStore?: boolean;
}): Promise<{ tradeDate: string; raw: any; summary: string; stocksAll: any[]; isTodayReady: boolean }> {
	const noStore = opts?.noStore != null ? Boolean(opts.noStore) : FORCE_NO_STORE;
	// 1) 大盤
	const indexUrl = 'https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX';
	const idxPayload = await fetchJson<any>(indexUrl, { label: 'MI_INDEX', noStore });
	const idxRows = twseUnwrapRows(idxPayload) as TwseIndexRow[];
	// 盡量用「發行量加權股價指數」那列
	const taiex = (idxRows as any[]).find((r) => String(r?.['指數'] ?? '').includes('發行量加權股價指數'));
	// 1b) 全市場個股快照（用於成交排行 / 漲跌家數）
	// 注意：TWSE 有時會延遲或暫時回空；此時仍可用指數資料產生摘要，但 breadth/top 會降級。
	const stocksUrl = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
	let stocksAll: any[] = [];
	let stocksPayload: any = null;
	try {
		stocksPayload = await fetchJson<any>(stocksUrl, { label: 'STOCK_DAY_ALL', noStore });
		const rows = twseUnwrapRows(stocksPayload);
		stocksAll = Array.isArray(rows) ? rows : [];
	} catch (e: any) {
		// 盤後資料未 ready / 休市 / 端點短暫異常
		stocksAll = [];
		stocksPayload = null;
	}
	const stocks = stocksAll;
	const stocksCount = stocks.length;
	let idxStatus: 'OK' | 'STALE' | 'MISSING' = 'OK';
	let close = toNumber(taiex?.['收盤指數']);
	let chgPtsRaw = toNumber(taiex?.['漲跌點數']);
	let chgPct = toNumber(taiex?.['漲跌百分比']);
	// TWSE 常用欄位：漲跌(+/-)（有時也可能是「漲跌」）
	let sign = String((taiex as any)?.['漲跌(+/-)'] ?? (taiex as any)?.['漲跌'] ?? '').trim();
	// 把方向套到漲跌點數，避免出現「上漲 1494.77（-4.35%）」這種矛盾
	// 1) 優先採用「漲跌(+/-)」方向
	// 2) 若方向欄位缺失，則以百分比正負作為 fallback（TWSE 偶發不回方向）
	const chgPts = Number.isFinite(chgPtsRaw)
		? sign === '-'
			? -Math.abs(chgPtsRaw)
			: sign === '+'
				? Math.abs(chgPtsRaw)
				: Number.isFinite(chgPct)
					? chgPct < 0
						? -Math.abs(chgPtsRaw)
						: chgPct > 0
							? Math.abs(chgPtsRaw)
							: 0
					: chgPtsRaw
		: NaN;
	// ✅ 修正：用 close 與漲跌點數自行回推百分比（避免欄位偶發錯誤）
	const prevClose = Number.isFinite(close) && Number.isFinite(chgPts) ? close - chgPts : NaN;
	const chgPctCalc = Number.isFinite(prevClose) && prevClose !== 0 && Number.isFinite(chgPts) ? (chgPts / prevClose) * 100 : NaN;
	const useChgPct = Number.isFinite(chgPctCalc) ? chgPctCalc : chgPct;
	const chgPtsAbs = Number.isFinite(chgPts) ? Math.abs(chgPts) : NaN;
	const dir = Number.isFinite(chgPts)
		? chgPts < 0
			? '下跌'
			: chgPts > 0
				? '上漲'
				: '持平'
		: Number.isFinite(useChgPct)
			? useChgPct < 0
				? '下跌'
				: useChgPct > 0
					? '上漲'
					: '持平'
			: '持平';
	let tradeDateMissing = false;
	// ----- tradeDate resolver (D0) -----
	// 我們同時觀察多個來源：FMTQIK / MI_INDEX / STOCK_DAY_ALL
	// 原則：
	// 1) 優先選擇「最新且一致」的交易日（至少 2 個來源一致）
	// 2) 若只有 1 個來源有日期，允許採用（但必須在合理範圍內且不能是未來）
	// 3) 若來源之間不一致且無法形成一致結論 -> ABORT（B 模式）
	const today = twTodayString();
	const fmtDate = await fetchTradeDateFromFmtqik();
	if (fmtDate) console.log(`[TWSE] candidate tradeDate=${fmtDate} via FMTQIK`);
	const idxRowDate = pickTradeDateFromRow(taiex);
	if (idxRowDate) console.log(`[TWSE] candidate tradeDate=${idxRowDate} via MI_INDEX(taiex)`);
	const idxPayloadDate = twsePickDateFromPayload(idxPayload);
	if (idxPayloadDate) console.log(`[TWSE] candidate tradeDate=${idxPayloadDate} via MI_INDEX(payload)`);
	const stocksDate = await fetchTradeDateFromStocksAll(stocksPayload, stocksAll);
	if (stocksDate) console.log(`[TWSE] candidate tradeDate=${stocksDate} via STOCK_DAY_ALL`);
	const primaryBaseDate = [fmtDate, idxRowDate, idxPayloadDate, stocksDate].filter(Boolean).sort().slice(-1)[0] || '';
	const legacyIdxDate = await fetchTradeDateFromLegacyMiIndex(primaryBaseDate, noStore);
	const finMindDate = await fetchTradeDateFromFinMind(env, primaryBaseDate, noStore);
	if (finMindDate) console.log(`[FINMIND] candidate tradeDate=${finMindDate} via TaiwanStockTradingDate`);
	const candidates = [
		{ src: 'FMTQIK', d: fmtDate },
		{ src: 'MI_INDEX_ROW', d: idxRowDate },
		{ src: 'MI_INDEX_PAYLOAD', d: idxPayloadDate },
		{ src: 'MI_INDEX_LEGACY', d: legacyIdxDate },
		{ src: 'FINMIND', d: finMindDate },
		{ src: 'STOCK_DAY_ALL', d: stocksDate },
	].filter((x) => x.d);
	let tradeDate = '';
	if (candidates.length > 0) {
		// 取最新日期
		tradeDate = candidates
			.map((x) => x.d)
			.sort()
			.slice(-1)[0] as string;
		// 計算一致性（同日的來源數）
		const same = candidates.filter((x) => x.d === tradeDate);
		const quorum = same.length;
		// 防呆：不接受未來日期（以台灣 today 為上限）
		if (tradeDate > today) {
			console.warn(`[TWSE] tradeDate in future: tradeDate=${tradeDate} today=${today} -> NOT READY`);
			tradeDate = '';
		} else if (quorum >= 2) {
			console.log(`[TWSE] resolved tradeDate=${tradeDate} via quorum(${same.map((x) => x.src).join(',')})`);
		} else {
			// 只有 1 個來源提供最新日期：允許在「合理新鮮度」內採用（例如 API 部分端點延遲）
			// 但若同時存在明顯落後的日期，且無法判斷哪個是對的，就交給 B 模式 ABORT
			const uniqueDates = Array.from(new Set(candidates.map((x) => x.d))).sort();
			const oldest = uniqueDates[0] as string;
			const newest = uniqueDates[uniqueDates.length - 1] as string;
			const spread = daysBetween(oldest, newest);
			// 若 spread 很小（<=1 天），視為 TWSE 同步延遲，可採用最新
			if (spread <= 1) {
				console.warn(`[TWSE] tradeDate minor mismatch (spread=${spread}d): use newest=${tradeDate}`);
				// keep tradeDate
			} else {
				const primaryDates = [fmtDate, idxRowDate, idxPayloadDate, stocksDate].filter(Boolean);
				const primaryMax = primaryDates.sort().slice(-1)[0] || '';
				const legacyAheadByOne = Boolean(legacyIdxDate && primaryMax && legacyIdxDate === addDays(primaryMax, 1));
				const finMindAheadByOne = Boolean(finMindDate && primaryMax && finMindDate === addDays(primaryMax, 1));
				const backstopConsensusAheadByOne = Boolean(primaryMax && legacyAheadByOne && finMindAheadByOne && legacyIdxDate === finMindDate);
				// 如果 STOCK_DAY_ALL 有日期且有資料量，代表「全市場快照」已就緒，優先採用其日期
				if (stocksDate && tradeDate === stocksDate && stocksCount > 0) {
					console.warn(`[TWSE] tradeDate mismatch (spread=${spread}d): prefer STOCK_DAY_ALL=${stocksDate} (FMTQIK may be stale)`);
					// keep tradeDate
				} else if (backstopConsensusAheadByOne) {
					tradeDate = legacyIdxDate;
					console.warn(`[TWSE] tradeDate advanced by backstop consensus: primaryMax=${primaryMax} legacy=${legacyIdxDate} finmind=${finMindDate}`);
				} else if (legacyAheadByOne && !finMindDate) {
					tradeDate = legacyIdxDate;
					console.warn(`[TWSE] tradeDate advanced by legacy backstop (no FinMind): primaryMax=${primaryMax} legacy=${legacyIdxDate}`);
				} else {
					console.warn(`[TWSE] tradeDate mismatch (spread=${spread}d) unresolved -> NOT READY. dates=${uniqueDates.join(',')}`);
					tradeDate = '';
				}
			}
		}
	}
	if (!tradeDate) {
		console.warn('[TWSE] trade date unresolved (FMTQIK/MI_INDEX/STOCK_DAY_ALL) -> NOT READY');
		throw new Error('trade date unresolved');
	}
	// Guard: 指數資料可能仍是上一個交易日（openapi MI_INDEX 會晚一步更新）
	const indexTradeDate = pickTradeDateFromRow(taiex);
	if (tradeDate && indexTradeDate && indexTradeDate !== tradeDate) {
		console.warn(`[TWSE] index date mismatch: tradeDate=${tradeDate} indexTradeDate=${indexTradeDate} -> omit index line`);
		idxStatus = 'STALE';
		close = NaN;
		chgPtsRaw = NaN;
		chgPct = NaN;
		sign = '';
	}
	if (!tradeDate && Array.isArray(idxRows)) {
		for (const r of idxRows as any[]) {
			const d = pickTradeDateFromRow(r);
			if (d) {
				tradeDate = d;
				break;
			}
			// 再掃一次 values（兼容欄位名被改）
			for (const v of Object.values(r || {})) {
				const s = String(v ?? '').trim();
				if (!s) continue;
				const d2 = normalizeTradeDate(s);
				if (d2) {
					tradeDate = d2;
					break;
				}
			}
			if (tradeDate) break;
		}
	}
	if (!tradeDate) {
		console.warn('[TWSE] trade date unresolved (FMTQIK/MI_INDEX) -> NOT READY');
		throw new Error('trade date unresolved');
		// 指數資料狀態：OK / STALE（日期不同步）/ MISSING（欄位未更新）
		if (idxStatus === 'OK' && !Number.isFinite(close)) idxStatus = 'MISSING';
	}
	// ⚠️ 若 tradeDate != today，代表「今天盤後資料尚未 ready」。
	// 但我們仍可用『最新交易日』資料產生明日建議 / 進行模擬成交。
	// 是否落地/推播盤後摘要，由 runDailyProcess 決定。
	const isTodayReady = tradeDate === today && !tradeDateMissing;
	const topByValue = (stocks as any[])
		.map((r) => ({
			code: getStr(r, ['證券代號', 'Code', 'code', 'StockCode']),
			name: getStr(r, ['證券名稱', 'Name', 'name', 'StockName']),
			value: getNum(r, ['成交金額', 'TradeValue', 'tradeValue', '成交值', '成交金額(元)', 'TradeValue(元)']),
			close: getNum(r, ['收盤價', 'Close', 'close', '收盤']),
			chg: getNum(r, ['漲跌價差', 'Change', 'chg', '漲跌', '漲跌價差(元)']),
			open: getNum(r, ['開盤價', 'Open', 'open', '開盤']),
			high: getNum(r, ['最高價', 'High', 'high', '最高']),
			low: getNum(r, ['最低價', 'Low', 'low', '最低']),
		}))
		.filter((x) => x.code && x.name && Number.isFinite(x.value))
		.sort((a, b) => b.value - a.value)
		.slice(0, 5);
	const topLines = topByValue.length
		? topByValue.map((x, i) => `${i + 1}. ${x.code} ${x.name}｜${formatYi(x.value)}`).join('\n')
		: '（成交排行暫時無法產生）';
	// ✅ 上漲 / 下跌 / 持平 家數（直接用 STOCK_DAY_ALL 的「漲跌價差」）
	// 兼容多種欄位名
	const getChg = (r: any): number => {
		const s = getStr(r, ['漲跌價差', 'Change', 'chg', '漲跌', '漲跌(+/-)']);
		if (!s) return NaN;
		// 有些回傳會是 "+1.2" / "-0.5" / "X0.00" / "0.00"
		// 把非數字符號清掉（保留負號、小數點）
		const cleaned = s.replace(/[^\d\.\-]/g, '');
		const v = toNumber(cleaned);
		return v;
	};
	let up = 0;
	let down = 0;
	let flat = 0;
	let valid = 0;
	for (const r of stocks as any[]) {
		const v = getChg(r);
		if (!Number.isFinite(v)) continue;
		valid++;
		if (v > 0) up++;
		else if (v < 0) down++;
		else flat++;
	}
	const breadthLine = valid < 200 ? '📈 個股：漲跌統計未齊（資料稍晚會補齊）' : `📈 個股：上漲 ${up}｜下跌 ${down}｜持平 ${flat}`;
	const totalValue = (stocks as any[]).reduce((acc, r) => {
		const v = getNum(r, ['成交金額', 'TradeValue', 'tradeValue', '成交值', '成交金額(元)', 'TradeValue(元)']);
		return acc + (Number.isFinite(v) ? v : 0);
	}, 0);
	const top5Value = topByValue.reduce((acc, x) => acc + (Number.isFinite(x.value) ? x.value : 0), 0);
	const concentration = totalValue > 0 ? top5Value / totalValue : NaN;
	// 指數資料不同步/未更新時：不要顯示點數/漲跌幅，避免「看起來像真的」
	const showIdx = idxStatus === 'OK';
	const dClose = showIdx && Number.isFinite(close) ? close.toFixed(2) : '—';
	const dDir = showIdx && Number.isFinite(close) ? dir : '—';
	const dPts = showIdx && Number.isFinite(chgPtsAbs) ? chgPtsAbs.toFixed(2) : '—';
	const dPct = showIdx && Number.isFinite(useChgPct) ? useChgPct.toFixed(2) : '—';
	const idxNote =
		idxStatus === 'OK'
			? ''
			: idxStatus === 'STALE'
				? indexTradeDate
					? `（指數資料不同步：MI_INDEX=${indexTradeDate}，已略過）`
					: '（指數資料不同步，已略過）'
				: '（指數資料尚未更新）';
	const summary =
		`📅 台股盤後總結（${tradeDate}）\n` +
		`大盤：${dClose}｜${dDir} ${dPts}點（${dPct}%）${idxNote}\n\n` +
		`💰 成交金額前 5（越前面＝今天越熱）\n` +
		`${topLines}\n\n` +
		`${breadthLine}`;
	return {
		tradeDate,
		stocksAll,
		raw: {
			tradeDate,
			isTodayReady,
			idx: { close, chgPts, chgPct: useChgPct, dir, status: idxStatus, indexTradeDate },
			breadth: { up, down, flat, valid },
			stocksCount,
			topByValue,
			totalValue,
			concentration,
		},
		summary,
		isTodayReady,
	};
}
async function runStrategyEngine(
	env: Env,
	input: {
		tradeDate: string;
		dir: string;
		up: number;
		down: number;
		flat: number;
		valid: number;
		concentration: number;
		top5: any[];
	},
): Promise<{ actionText: string; note?: string }> {
	const { tradeDate, dir, up, down, valid, concentration, top5 } = input;
	const st = await env.DB.prepare('SELECT * FROM strategy_state WHERE id=1').first<any>();
	if (!st) throw new Error('strategy_state(id=1) missing');
	const principal = Number(st.pool_principal_twd ?? 300000);
	let cash = Number(st.cash_twd ?? principal);
	let symbol = (st.current_symbol as string | null) ?? null;
	let name = (st.current_name as string | null) ?? null;
	let shares = Number(st.position_shares ?? 0);
	let entryPrice = st.entry_price != null ? Number(st.entry_price) : null;
	let mode = (st.mode as string) || 'NORMAL'; // NORMAL / SLOW
	let conLoss = Number(st.consecutive_losses ?? 0);
	let conWin = Number((st as any).consecutive_wins ?? 0);
	let tradeCount = Number(st.trade_count ?? 0);
	let winCount = Number(st.win_count ?? 0);
	let lossCount = Number(st.loss_count ?? 0);
	const stopLossPct = Number(st.stop_loss_pct ?? -0.12);
	const signal = decideSignalLevel({ dir, up, down, concentration, valid });
	const buyPct = mode === 'SLOW' ? 0.1 : signal === 'AGGRESSIVE' ? 0.3 : signal === 'TRY' ? 0.1 : 0;
	// 取得持倉收盤價（用 top5 找；找不到就當資料不足）
	const heldClose = symbol ? Number(top5.find((x) => x.code === symbol)?.close ?? NaN) : NaN;
	// ===== 1) 停損：只有這個會「清倉」 =====
	if (symbol && shares > 0 && entryPrice && Number.isFinite(heldClose)) {
		const pnlPct = heldClose / entryPrice - 1;
		if (pnlPct <= stopLossPct) {
			const exitPrice = heldClose;
			const exitValue = shares * exitPrice;
			const pnl = exitValue - shares * entryPrice;
			cash += exitValue;
			await env.DB.prepare(
				`INSERT INTO trade_log
				 (symbol, name, entry_date, entry_price, entry_shares, exit_date, exit_price, exit_shares, pnl_twd, return_pct, exit_reason)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
				.bind(symbol, name ?? '', st.entry_date ?? tradeDate, entryPrice, shares, tradeDate, exitPrice, shares, pnl, pnlPct, 'STOPLOSS')
				.run();
			tradeCount += 1;
			if (pnl > 0) {
				winCount += 1;
				conLoss = 0;
			} else {
				lossCount += 1;
				conLoss += 1;
			}
			// 連續 3 次虧損 → 慢速
			if (conLoss >= 3) mode = 'SLOW';
			// 清掉持倉
			symbol = null;
			name = null;
			shares = 0;
			entryPrice = null;
			await env.DB.prepare(
				`UPDATE strategy_state SET
				  cash_twd=?,
				  current_symbol=NULL, current_name=NULL,
				  position_shares=0,
				  entry_price=NULL, entry_date=NULL, hold_days=0,
				  mode=?, consecutive_losses=?, consecutive_wins=?,
				  trade_count=?, win_count=?, loss_count=?,
				  last_action=?, last_reason=?, updated_at=datetime('now')
				 WHERE id=1`,
			)
				.bind(cash, mode, conLoss, tradeCount, winCount, lossCount, 'EXIT', '停損：避免策略池歸零')
				.run();
			return {
				actionText:
					`🧠 明日動作：清倉（100%）\n` + `原因：浮虧觸發停損線（${Math.round(stopLossPct * 100)}%）\n` + `執行價：當日收盤（模擬）`,
				note: 'STOPLOSS_EXIT',
			};
		}
	}
	// ===== 2) 沒有持倉：AGGRESSIVE / TRY 才會買 =====
	if ((!symbol || shares <= 0) && buyPct > 0) {
		const target = pickTargetFromTop5(top5);
		if (!target) {
			await env.DB.prepare(`UPDATE strategy_state SET last_action=?, last_reason=?, updated_at=datetime('now') WHERE id=1`)
				.bind('SKIP', '資料不足：成交前5缺收盤價')
				.run();
			return { actionText: '🧠 明日動作：不動\n原因：資料不足（成交前5缺收盤價）', note: 'NO_TARGET' };
		}
		const invest = cash * buyPct;
		const px = target.close;
		const addShares = invest / px;
		cash -= invest;
		symbol = target.code;
		name = target.name;
		shares = round2(addShares);
		entryPrice = px;
		await env.DB.prepare(
			`UPDATE strategy_state SET
			  cash_twd=?,
			  current_symbol=?, current_name=?,
			  position_shares=?,
			  entry_price=?, entry_date=?, hold_days=0,
			  mode=?, consecutive_losses=?, consecutive_wins=?,
			  last_action=?, last_reason=?, updated_at=datetime('now')
			 WHERE id=1`,
		)
			.bind(
				cash,
				symbol,
				name,
				shares,
				entryPrice,
				tradeDate,
				mode,
				conLoss,
				'BUY',
				buyPct === 0.3 ? '積極布局：用現金 30% 進場' : '小幅試單：用現金 10% 進場',
			)
			.run();
		return {
			actionText:
				`🧠 明日動作：買入\n` +
				`標的：${symbol} ${name}\n` +
				`投入金額：現金 ${(buyPct * 100).toFixed(0)}% = ${Math.round(invest).toLocaleString()} 元\n` +
				`預估股數：約 ${shares} 股（零股）\n` +
				`執行價：當日收盤（模擬）`,
			note: buyPct === 0.3 ? 'BUY_30' : 'BUY_10',
		};
	}
	// ===== 3) 有持倉：只有 AGGRESSIVE 才加碼；TRY/HOLD 維持 =====
	if (symbol && shares > 0) {
		if (signal === 'AGGRESSIVE' && buyPct > 0) {
			const px = Number(top5.find((x) => x.code === symbol)?.close ?? NaN);
			if (!Number.isFinite(px)) {
				await env.DB.prepare(`UPDATE strategy_state SET last_action=?, last_reason=?, updated_at=datetime('now') WHERE id=1`)
					.bind('HOLD', '持倉股收盤價缺失，暫不加碼')
					.run();
				return { actionText: '🧠 明日動作：維持持倉\n原因：持倉股資料不足，先不加碼', note: 'HOLD_NO_PRICE' };
			}
			const invest = cash * buyPct;
			const addShares = invest / px;
			const oldCost = (entryPrice ?? px) * shares;
			const newCost = oldCost + invest;
			const newShares = round2(shares + addShares);
			const newEntry = newCost / newShares;
			cash -= invest;
			shares = newShares;
			entryPrice = newEntry;
			await env.DB.prepare(
				`UPDATE strategy_state SET
				  cash_twd=?,
				  position_shares=?,
				  entry_price=?,
				  mode=?, consecutive_losses=?, consecutive_wins=?,
				  last_action=?, last_reason=?, updated_at=datetime('now')
				 WHERE id=1`,
			)
				.bind(cash, shares, entryPrice, mode, conLoss, 'ADD', mode === 'SLOW' ? '慢速模式：加碼改用現金 10%' : '積極布局：加碼現金 30%')
				.run();
			return {
				actionText:
					`🧠 明日動作：加碼\n` +
					`標的：${symbol} ${name}\n` +
					`投入金額：現金 ${(buyPct * 100).toFixed(0)}% = ${Math.round(invest).toLocaleString()} 元\n` +
					`新增股數：約 ${round2(addShares)} 股（零股）\n` +
					`持倉總股數：約 ${shares} 股\n` +
					`執行價：當日收盤（模擬）`,
				note: buyPct === 0.3 ? 'ADD_30' : 'ADD_10',
			};
		}
		await env.DB.prepare(`UPDATE strategy_state SET last_action=?, last_reason=?, updated_at=datetime('now') WHERE id=1`)
			.bind('HOLD', signal === 'HOLD' ? '不動：不要動' : '試單：已有持倉先維持')
			.run();
		return {
			actionText: `🧠 明日動作：維持持倉\n原因：${signal === 'HOLD' ? '不動（不要動）' : '試單（先觀察，不加碼）'}`,
			note: signal === 'HOLD' ? 'HOLD' : 'TRY_HOLD',
		};
	}
	// 無持倉且 HOLD：不動
	await env.DB.prepare(`UPDATE strategy_state SET last_action=?, last_reason=?, updated_at=datetime('now') WHERE id=1`)
		.bind('HOLD', '不動：不進場')
		.run();
	return { actionText: '🧠 明日動作：不動\n原因：盤勢偏保守，先不進場', note: 'HOLD_NO_POS' };
}
async function writeDailyMark(
	env: Env,
	input: { tradeDate: string; note?: string; top5: any[] },
): Promise<{ equity: number; retPct: number; cash: number; posValue: number; symbol: string | null; shares: number }> {
	const st = await env.DB.prepare('SELECT * FROM strategy_state WHERE id=1').first<any>();
	if (!st) throw new Error('strategy_state(id=1) missing');
	const principal = Number(st.pool_principal_twd ?? 300000);
	const cash = Number(st.cash_twd ?? principal);
	const symbol = (st.current_symbol as string | null) ?? null;
	const shares = Number(st.position_shares ?? 0);
	const close = symbol ? Number(input.top5.find((x) => x.code === symbol)?.close ?? NaN) : NaN;
	const posValue = symbol && shares > 0 && Number.isFinite(close) ? shares * close : 0;
	const equity = cash + posValue;
	const retPct = equity / principal - 1;
	await env.DB.prepare(
		`INSERT OR REPLACE INTO daily_mark
		 (trade_date, symbol, close_price, cash_twd, position_shares, position_value_twd, total_equity_twd, return_pct, note)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(input.tradeDate, symbol, Number.isFinite(close) ? close : null, cash, shares, posValue, equity, retPct, input.note ?? null)
		.run();
	return { equity, retPct, cash, posValue, symbol, shares };
}
// ===== Multi-asset strategy (v1.1) =====
type MoOrderSide = 'BUY' | 'SELL';
type MoOrderStatus = 'PENDING' | 'EXECUTED' | 'SKIPPED';
type MoRecommendation = {
	symbol: string;
	name: string;
	side: MoOrderSide;
	entryLow: number;
	entryHigh: number;
	qty: number; // shares (odd-lot)
	weight: number; // 0~1
	score: number;
	reason: string;
};
type SandboxSnapshotRow = {
	id?: number;
	signal_date: string;
	exec_date: string;
	cash_before: number;
	positions_before_json: string;
	orders_before_json: string;
	applied: number;
	created_at?: string;
	reset_at?: string | null;
};
type StrategyDebugRow = {
	symbol: string;
	name: string;
	stage: string;
	reason: string;
	score?: number | null;
	chgPct?: number | null;
	valueScore?: number | null;
	momScore?: number | null;
};
async function ensureMultiAssetTables(env: Env): Promise<void> {
	const addColumnIfMissing = async (sql: string) => {
		try {
			await env.DB.prepare(sql).run();
		} catch (e: any) {
			const msg = String(e?.message || e).toLowerCase();
			if (!msg.includes('duplicate column')) throw e;
		}
	};
	// 這裡用 IF NOT EXISTS，避免你忘了跑 migration 也能先跑起來
	await env.DB.prepare(
		`CREATE TABLE IF NOT EXISTS mo_portfolio_state (
			id INTEGER PRIMARY KEY CHECK (id=1),
			principal_twd INTEGER NOT NULL DEFAULT 300000,
			cash_twd REAL NOT NULL DEFAULT 300000,
			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		);`,
	).run();
	await env.DB.prepare(`INSERT OR IGNORE INTO mo_portfolio_state (id) VALUES (1);`).run();
	await env.DB.prepare(
		`CREATE TABLE IF NOT EXISTS mo_positions (
			symbol TEXT PRIMARY KEY,
			name TEXT,
			shares REAL NOT NULL DEFAULT 0,
			avg_cost REAL NOT NULL DEFAULT 0,
			opened_date TEXT,
			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		);`,
	).run();
	await env.DB.prepare(
		`CREATE TABLE IF NOT EXISTS mo_orders (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			signal_date TEXT NOT NULL,     -- 產生建議的日期（D1）
			exec_date TEXT,               -- 實際用哪一天的 OHLC 判定（D2 或下一個交易日）
			side TEXT NOT NULL,           -- BUY / SELL
			symbol TEXT NOT NULL,
			name TEXT,
			entry_low REAL NOT NULL,
			entry_high REAL NOT NULL,
			qty REAL NOT NULL,
			status TEXT NOT NULL DEFAULT 'PENDING',
			exec_price REAL,
			reason TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);`,
	).run();
	await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mo_orders_status ON mo_orders(status, signal_date);`).run();
	await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mo_orders_symbol ON mo_orders(symbol);`).run();
	await env.DB.prepare(
		`CREATE TABLE IF NOT EXISTS mo_recommendation_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			trade_date TEXT NOT NULL,
			signal TEXT NOT NULL,
			universe_source TEXT NOT NULL,
			universe_symbols TEXT NOT NULL,
			candidate_count INTEGER NOT NULL DEFAULT 0,
			rec_count INTEGER NOT NULL DEFAULT 0,
			snapshot_count INTEGER NOT NULL DEFAULT 0,
			note TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);`,
	).run();
	await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mo_recommendation_log_date ON mo_recommendation_log(trade_date DESC);`).run();
	await addColumnIfMissing(`ALTER TABLE mo_recommendation_log ADD COLUMN trade_date TEXT;`);
	await addColumnIfMissing(`ALTER TABLE mo_recommendation_log ADD COLUMN signal TEXT;`);
	await addColumnIfMissing(`ALTER TABLE mo_recommendation_log ADD COLUMN universe_source TEXT;`);
	await addColumnIfMissing(`ALTER TABLE mo_recommendation_log ADD COLUMN universe_symbols TEXT;`);
	await addColumnIfMissing(`ALTER TABLE mo_recommendation_log ADD COLUMN candidate_count INTEGER NOT NULL DEFAULT 0;`);
	await addColumnIfMissing(`ALTER TABLE mo_recommendation_log ADD COLUMN rec_count INTEGER NOT NULL DEFAULT 0;`);
	await addColumnIfMissing(`ALTER TABLE mo_recommendation_log ADD COLUMN snapshot_count INTEGER NOT NULL DEFAULT 0;`);
	await addColumnIfMissing(`ALTER TABLE mo_recommendation_log ADD COLUMN note TEXT;`);
	await env.DB.prepare(
		`CREATE TABLE IF NOT EXISTS mo_strategy_debug (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			trade_date TEXT NOT NULL,
			symbol TEXT NOT NULL,
			name TEXT,
			stage TEXT NOT NULL,
			reason TEXT NOT NULL,
			score REAL,
			chg_pct REAL,
			value_score REAL,
			mom_score REAL,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);`,
	).run();
	await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mo_strategy_debug_trade_date ON mo_strategy_debug(trade_date DESC, id DESC);`).run();
}
async function ensureExecutionMarkTable(env: Env): Promise<void> {
	await env.DB.prepare(
		`CREATE TABLE IF NOT EXISTS mo_execution_mark (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			signal_date TEXT,
			trade_date TEXT NOT NULL,
			symbol TEXT NOT NULL,
			side TEXT NOT NULL,
			qty REAL NOT NULL,
			price REAL,
			entry_low REAL,
			entry_high REAL,
			filled INTEGER NOT NULL DEFAULT 0,
			filled_price REAL,
			filled_at TEXT,
			alpha_score REAL,
			weight REAL,
			rule_version TEXT NOT NULL DEFAULT 'ohlc_hilo_v1',
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);`,
	).run();
	await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mo_execution_mark_trade_date ON mo_execution_mark(trade_date);`).run();
	await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mo_execution_mark_symbol ON mo_execution_mark(symbol, trade_date);`).run();
}
async function ensureSandboxSnapshotTable(env: Env): Promise<void> {
	const addColumnIfMissing = async (sql: string) => {
		try {
			await env.DB.prepare(sql).run();
		} catch (e: any) {
			const msg = String(e?.message || e).toLowerCase();
			if (!msg.includes('duplicate column')) throw e;
		}
	};
	await env.DB.prepare(
		`CREATE TABLE IF NOT EXISTS mo_sandbox_snapshot (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			signal_date TEXT NOT NULL,
			exec_date TEXT NOT NULL,
			cash_before REAL NOT NULL,
			cash_after REAL,
			positions_before_json TEXT NOT NULL,
			positions_after_json TEXT,
			orders_before_json TEXT NOT NULL,
			orders_after_json TEXT,
			applied INTEGER NOT NULL DEFAULT 1,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			reset_at TEXT
		);`,
	).run();
	await addColumnIfMissing(`ALTER TABLE mo_sandbox_snapshot ADD COLUMN cash_after REAL;`);
	await addColumnIfMissing(`ALTER TABLE mo_sandbox_snapshot ADD COLUMN positions_after_json TEXT;`);
	await addColumnIfMissing(`ALTER TABLE mo_sandbox_snapshot ADD COLUMN orders_after_json TEXT;`);
	await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_mo_sandbox_snapshot_signal ON mo_sandbox_snapshot(signal_date, applied, created_at DESC);`).run();
}
async function appendExecutionMark(
	env: Env,
	args: {
		signalDate: string;
		tradeDate: string;
		symbol: string;
		side: string;
		qty: number;
		price: number | null;
		entryLow: number;
		entryHigh: number;
		filled: boolean;
		filledPrice?: number | null;
		filledAt?: string | null;
		alphaScore?: number | null;
		weight?: number | null;
		ruleVersion?: string;
	},
): Promise<void> {
	await ensureExecutionMarkTable(env);
	const exists = await env.DB.prepare(
		`SELECT id FROM mo_execution_mark
		 WHERE signal_date=? AND trade_date=? AND symbol=? AND side=? AND qty=? AND filled=?
		 ORDER BY id DESC LIMIT 1`,
	)
		.bind(args.signalDate, args.tradeDate, args.symbol, args.side, args.qty, args.filled ? 1 : 0)
		.first<any>();
	if (exists?.id) return;
	await env.DB.prepare(
		`INSERT INTO mo_execution_mark (
			signal_date, trade_date, symbol, side, qty, price, entry_low, entry_high,
			filled, filled_price, filled_at, alpha_score, weight, rule_version
		 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			args.signalDate,
			args.tradeDate,
			args.symbol,
			args.side,
			args.qty,
			args.price,
			args.entryLow,
			args.entryHigh,
			args.filled ? 1 : 0,
			args.filledPrice ?? null,
			args.filledAt ?? null,
			args.alphaScore ?? null,
			args.weight ?? null,
			args.ruleVersion ?? 'ohlc_hilo_v1',
		)
		.run();
}
function calcEntryRangeFromClose(close: number): { low: number; high: number } {
	// 避免追高：用「略低於收盤」到「略高於收盤」的區間（可後續調參）
	const low = round2(close * 0.995);
	const high = round2(close * 1.01);
	return { low, high };
}
function calcExitRangeFromClose(close: number): { low: number; high: number } {
	// 先用簡單停利區（未來可改成依波動度）
	const low = round2(close * 0.99);
	const high = round2(close * 1.01);
	return { low, high };
}
function pickTopCandidates(topByValue: any[], maxN: number): any[] {
	// 你原本避免追第一名：優先 2~4，再補 1/5
	const pool = [...topByValue];
	const pref = pool.slice(1, 4);
	const rest = pool.filter((x) => !pref.includes(x));
	return [...pref, ...rest].slice(0, maxN);
}
function clamp(n: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, n));
}
function alphaScoreCandidate(x: any): { score: number; detail: { chgPct: number; valueScore: number; momScore: number } } {
	// Alpha score（0~100）= 動能(0~70) + 流動性(0~30)
	const close = Number.isFinite(x?.close) ? Number(x.close) : NaN;
	const chg = Number.isFinite(x?.chg) ? Number(x.chg) : NaN;
	const prev = Number.isFinite(close) && Number.isFinite(chg) ? close - chg : NaN;
	const chgPct = Number.isFinite(prev) && prev !== 0 ? (chg / prev) * 100 : NaN;
	// 動能：-5%~+5% 映射到 0~70（超出就封頂）
	const mom = Number.isFinite(chgPct) ? clamp(chgPct, -5, 5) : 0;
	const momScore = round2(((mom + 5) / 10) * 70);
	// 流動性：成交金額 log scale 0~30
	const value = Number.isFinite(x?.value) ? Number(x.value) : 0;
	const valueScore = round2(clamp(Math.log10(Math.max(1, value)) * 5, 0, 30));
	const score = round2(clamp(momScore + valueScore, 0, 100));
	return { score, detail: { chgPct: Number.isFinite(chgPct) ? round2(chgPct) : NaN, valueScore, momScore } };
}
function buildStarterRecommendation(args: { signal: SignalLevel; cash: number; ranked: any[] }): MoRecommendation | null {
	const { signal, cash, ranked } = args;
	if (!ranked.length || cash <= 0) return null;
	const first = ranked.find((x) => Number.isFinite(Number(x?.close)) && Number(x.close) > 0);
	if (!first) return null;
	const close = Number(first.close);
	const rg = calcEntryRangeFromClose(close);
	const basePct = signal === 'AGGRESSIVE' ? 0.18 : 0.1;
	const budget = Math.max(10000, Math.min(cash * basePct, cash * 0.2));
	const profile = getTradeCostProfile(String(first.code ?? ''));
	const qty = Math.floor(Math.max(budget, profile.minNotionalTwd) / rg.high / profile.minQty) * profile.minQty;
	if (qty <= 0) return null;
	const guard = buildTradeGuardResult({ symbol: String(first.code ?? ''), side: 'BUY', price: rg.high, qty, signal, score: Number(first.score ?? 0) });
	if (!guard.ok) return null;
	return {
		symbol: first.code,
		name: first.name || '',
		side: 'BUY',
		entryLow: rg.low,
		entryHigh: rg.high,
		qty,
		weight: round2((qty * rg.high) / Math.max(1, cash)),
		score: Number(first.score ?? 0),
		reason: `試單 fallback｜${signal === 'AGGRESSIVE' ? '偏多進攻' : '有候選先建立觀察倉'}｜Alpha ${Number(first.score ?? 0).toFixed(1)}｜${guard.costText}`,
	};
}
function pickExecPriceForBuy(args: { open: number; low: number; high: number; entryLow: number; entryHigh: number }): number | null {
	const { open, low, high, entryLow, entryHigh } = args;
	// 進入區間才成交：區間與當日交易區間有交集
	const touched = low <= entryHigh && high >= entryLow;
	if (!touched) return null;
	// 保守：能在區間內就用 open，否則用 entryHigh（追價上限）
	if (Number.isFinite(open) && open >= entryLow && open <= entryHigh) return open;
	// 若開盤在區間上方，但低點有碰到 → 用 entryHigh
	if (Number.isFinite(low) && low <= entryHigh) return entryHigh;
	return entryHigh;
}
function pickExecPriceForSell(args: { open: number; low: number; high: number; entryLow: number; entryHigh: number }): number | null {
	const { open, low, high, entryLow, entryHigh } = args;
	const touched = low <= entryHigh && high >= entryLow;
	if (!touched) return null;
	// 保守：能在區間內就用 open，否則用 entryLow（賣出下限）
	if (Number.isFinite(open) && open >= entryLow && open <= entryHigh) return open;
	if (Number.isFinite(high) && high >= entryLow) return entryLow;
	return entryLow;
}
function getSimFillPolicy(env: Env): string {
	const raw = String((env as any).SIM_FILL_POLICY ?? '').trim().toLowerCase();
	return raw || 'range-or-close';
}
type PreviewPosition = { symbol: string; name: string; shares: number; avg_cost: number };
type PreviewRunResult = {
	signalDate: string;
	execDate: string;
	pendingCount: number;
	fillPolicy: string;
	cashBefore: number;
	cashAfter: number;
	events: string[];
	positionsAfter: PreviewPosition[];
};
function buildSyntheticTouchRow(order: any): { open: number; high: number; low: number; close: number } {
	const entryLow = Number(order?.entry_low ?? 0);
	const entryHigh = Number(order?.entry_high ?? 0);
	const safeLow = Number.isFinite(entryLow) && entryLow > 0 ? entryLow : 1;
	const safeHigh = Number.isFinite(entryHigh) && entryHigh >= safeLow ? entryHigh : safeLow;
	const mid = round2((safeLow + safeHigh) / 2);
	return {
		open: mid,
		high: round2(Math.max(mid, safeHigh)),
		low: round2(Math.min(mid, safeLow)),
		close: mid,
	};
}
async function previewSimulationForOrders(env: Env, signalDate: string, orderRows: any[]): Promise<PreviewRunResult> {
	const execDate = nextWeekday(signalDate);
	const pendingRows = Array.isArray(orderRows) ? orderRows : [];
	const pf = await env.DB.prepare('SELECT * FROM mo_portfolio_state WHERE id=1').first<any>();
	const cashBefore = Number(pf?.cash_twd ?? 300000);
	let cashAfter = cashBefore;
	const fillPolicy = getSimFillPolicy(env);
	const positions = await env.DB.prepare('SELECT * FROM mo_positions ORDER BY symbol ASC').all<any>();
	const posMap = new Map<string, PreviewPosition>();
	for (const row of positions?.results ?? []) {
		const symbol = String(row.symbol || '').trim();
		if (!symbol) continue;
		posMap.set(symbol, {
			symbol,
			name: String(row.name ?? ''),
			shares: Number(row.shares ?? 0),
			avg_cost: Number(row.avg_cost ?? 0),
		});
	}
	const events: string[] = [];
	for (const o of pendingRows) {
		const sym = String(o.symbol || '').trim();
		if (!sym) continue;
		const row = buildSyntheticTouchRow(o);
		const open = Number(row.open);
		const high = Number(row.high);
		const low = Number(row.low);
		const close = Number(row.close);
		const entryLow = Number(o.entry_low);
		const entryHigh = Number(o.entry_high);
		const qty = Number(o.qty);
		let execPrice: number | null = null;
		let fallbackMode: string | null = null;
		if (o.side === 'BUY') {
			execPrice = pickExecPriceForBuy({ open, high, low, entryLow, entryHigh });
			if (execPrice == null && fillPolicy === 'RANGE_OR_CLOSE' && Number.isFinite(close) && close > 0) {
				execPrice = close;
				fallbackMode = 'RANGE_OR_CLOSE';
			}
			if (execPrice == null && fillPolicy === 'NEXT_OPEN' && Number.isFinite(open) && open > 0) {
				execPrice = open;
				fallbackMode = 'NEXT_OPEN';
			}
			if (execPrice == null) {
				events.push(`PREVIEW BUY SKIP ${sym}（未進入區間）`);
				continue;
			}
			const guard = buildTradeGuardResult({ symbol: sym, side: 'BUY', price: execPrice, qty, signal: 'TRY', score: 0 });
			if (!guard.ok) {
				events.push(`PREVIEW BUY SKIP ${sym}（${guard.reason}）`);
				continue;
			}
			const cost = calcTradeCostEstimate({ symbol: sym, side: 'BUY', price: execPrice, qty });
			const grossCashNeed = round2(cost.notionalTwd + cost.totalTwd);
			if (grossCashNeed > cashAfter + 1e-6) {
				events.push(`PREVIEW BUY SKIP ${sym}（現金不足含成本）`);
				continue;
			}
			cashAfter -= grossCashNeed;
			const pos = posMap.get(sym) ?? { symbol: sym, name: String(o.name ?? ''), shares: 0, avg_cost: 0 };
			const newShares = round2(pos.shares + qty);
			const newAvg = newShares > 0 ? (pos.shares * pos.avg_cost + qty * execPrice) / newShares : 0;
			posMap.set(sym, { symbol: sym, name: pos.name || String(o.name ?? ''), shares: newShares, avg_cost: newAvg });
			events.push(`PREVIEW BUY ${sym} @ ${execPrice} x ${qty}${fallbackMode ? `（${fallbackMode}）` : ''}`);
			continue;
		}
		if (o.side === 'SELL') {
			execPrice = pickExecPriceForSell({ open, high, low, entryLow, entryHigh });
			if (execPrice == null && fillPolicy === 'RANGE_OR_CLOSE' && Number.isFinite(close) && close > 0) {
				execPrice = close;
				fallbackMode = 'RANGE_OR_CLOSE';
			}
			if (execPrice == null && fillPolicy === 'NEXT_OPEN' && Number.isFinite(open) && open > 0) {
				execPrice = open;
				fallbackMode = 'NEXT_OPEN';
			}
			if (execPrice == null) {
				events.push(`PREVIEW SELL SKIP ${sym}（未進入區間）`);
				continue;
			}
			const pos = posMap.get(sym);
			const have = Number(pos?.shares ?? 0);
			if (have <= 0) {
				events.push(`PREVIEW SELL SKIP ${sym}（無持倉）`);
				continue;
			}
			const sellQty = Math.min(have, qty);
			const proceeds = calcTradeCostEstimate({ symbol: sym, side: 'SELL', price: execPrice, qty: sellQty });
			cashAfter += round2(proceeds.notionalTwd - proceeds.totalTwd);
			const remain = round2(have - sellQty);
			if (remain <= 0) posMap.delete(sym);
			else posMap.set(sym, { symbol: sym, name: pos?.name || String(o.name ?? ''), shares: remain, avg_cost: Number(pos?.avg_cost ?? 0) });
			events.push(`PREVIEW SELL ${sym} @ ${execPrice} x ${sellQty}${fallbackMode ? `（${fallbackMode}）` : ''}`);
		}
	}
	return {
		signalDate,
		execDate,
		pendingCount: pendingRows.length,
		fillPolicy,
		cashBefore,
		cashAfter,
		events,
		positionsAfter: Array.from(posMap.values()).sort((a, b) => a.symbol.localeCompare(b.symbol)),
	};
}
async function previewLatestSimulation(env: Env): Promise<PreviewRunResult> {
	const latest = await env.DB.prepare("SELECT signal_date AS d FROM mo_orders WHERE status='PENDING' ORDER BY signal_date DESC LIMIT 1").first<any>();
	if (!latest?.d) {
		const pf = await env.DB.prepare('SELECT * FROM mo_portfolio_state WHERE id=1').first<any>();
		const cash = Number(pf?.cash_twd ?? 300000);
		return {
			signalDate: '',
			execDate: '',
			pendingCount: 0,
			fillPolicy: getSimFillPolicy(env),
			cashBefore: cash,
			cashAfter: cash,
			events: ['目前沒有可預演的 PENDING 訂單。'],
			positionsAfter: [],
		};
	}
	const signalDate = String(latest.d);
	const pending = await env.DB.prepare("SELECT * FROM mo_orders WHERE status='PENDING' AND signal_date=? ORDER BY id ASC").bind(signalDate).all<any>();
	return await previewSimulationForOrders(env, signalDate, pending?.results ?? []);
}
async function getLatestActiveSandboxSnapshot(env: Env): Promise<any | null> {
	await ensureSandboxSnapshotTable(env);
	return await env.DB.prepare("SELECT * FROM mo_sandbox_snapshot WHERE applied=1 ORDER BY created_at DESC, id DESC LIMIT 1").first<any>().catch(() => null);
}
async function commitLatestSimulationSandbox(env: Env): Promise<string> {
	await ensureSandboxSnapshotTable(env);
	await ensureExecutionMarkTable(env);
	const latest = await env.DB.prepare("SELECT signal_date AS d FROM mo_orders WHERE status='PENDING' ORDER BY signal_date DESC LIMIT 1").first<any>();
	if (!latest?.d) return [
		`simulation commit version=${APP_VERSION}`,
		'status=no_pending_orders',
	].join('\n');
	const signalDate = String(latest.d);
	const activeSnapshot = await env.DB.prepare("SELECT * FROM mo_sandbox_snapshot WHERE signal_date=? AND applied=1 ORDER BY created_at DESC, id DESC LIMIT 1").bind(signalDate).first<any>().catch(() => null);
	if (activeSnapshot?.id) {
		const audit = await buildExecutionAuditText(env, signalDate);
		return [
			`simulation commit version=${APP_VERSION}`,
			`signalDate=${signalDate}`,
			'status=already_committed',
			'',
			audit,
		].join('\n');
	}
	const pending = await env.DB.prepare("SELECT * FROM mo_orders WHERE status='PENDING' AND signal_date=? ORDER BY id ASC").bind(signalDate).all<any>();
	const rows = pending?.results ?? [];
	if (!rows.length) return [
		`simulation commit version=${APP_VERSION}`,
		`signalDate=${signalDate}`,
		'status=no_pending_rows',
	].join('\n');
	const execDate = nextWeekday(signalDate);
	const pf = await env.DB.prepare('SELECT * FROM mo_portfolio_state WHERE id=1').first<any>();
	const cashBefore = Number(pf?.cash_twd ?? 300000);
	const positionsBefore = await env.DB.prepare('SELECT symbol, name, shares, avg_cost, opened_date, updated_at FROM mo_positions ORDER BY symbol ASC').all<any>();
	const ordersBefore = await env.DB.prepare("SELECT id, signal_date, exec_date, side, symbol, status, exec_price, reason FROM mo_orders WHERE signal_date=? ORDER BY id ASC").bind(signalDate).all<any>();
	const insertRes = await env.DB.prepare(
		'INSERT INTO mo_sandbox_snapshot(signal_date, exec_date, cash_before, positions_before_json, orders_before_json, applied) VALUES (?,?,?,?,?,1)',
	).bind(signalDate, execDate, cashBefore, JSON.stringify(positionsBefore?.results ?? []), JSON.stringify(ordersBefore?.results ?? []),).run();
	const snapshotId = Number((insertRes as any)?.meta?.last_row_id ?? 0);
	const synthetic = new Map<string, any>();
	for (const o of rows) {
		const sym = String(o.symbol || '').trim();
		if (!sym || synthetic.has(sym)) continue;
		synthetic.set(sym, buildSyntheticTouchRow(o));
	}
	const events = await executePendingOrders(env, execDate, synthetic);
	const pfAfter = await env.DB.prepare('SELECT * FROM mo_portfolio_state WHERE id=1').first<any>().catch(() => null);
	const positionsAfter = await env.DB.prepare('SELECT symbol, name, shares, avg_cost, opened_date, updated_at FROM mo_positions ORDER BY symbol ASC').all<any>().catch(() => ({ results: [] } as any));
	const ordersAfter = await env.DB.prepare("SELECT id, signal_date, exec_date, side, symbol, status, exec_price, reason FROM mo_orders WHERE signal_date=? ORDER BY id ASC").bind(signalDate).all<any>().catch(() => ({ results: [] } as any));
	if (snapshotId > 0) {
		await env.DB.prepare('UPDATE mo_sandbox_snapshot SET cash_after=?, positions_after_json=?, orders_after_json=? WHERE id=?')
			.bind(Number(pfAfter?.cash_twd ?? cashBefore), JSON.stringify(positionsAfter?.results ?? []), JSON.stringify(ordersAfter?.results ?? []), snapshotId)
			.run();
	}
	const audit = await buildExecutionAuditText(env, signalDate);
	return [
		`simulation commit version=${APP_VERSION}`,
		`signalDate=${signalDate}`,
		`execDate=${execDate}`,
		`orders=${rows.length}`,
		`events=${events.length}`,
		'',
		'commitEvents:',
		...(events.length ? events : ['(none)']),
		'',
		audit,
	].join('\n');
}
async function resetLatestSimulationSandbox(env: Env): Promise<string> {
	await ensureSandboxSnapshotTable(env);
	const snapshot = await getLatestActiveSandboxSnapshot(env);
	if (!snapshot?.id) return [
		`simulation reset version=${APP_VERSION}`,
		'status=no_active_snapshot',
	].join('\n');
	const signalDate = String(snapshot.signal_date || '');
	const execDate = String(snapshot.exec_date || '');
	const cashBefore = Number(snapshot.cash_before ?? 300000);
	let positionsBefore: any[] = [];
	let ordersBefore: any[] = [];
	try {
		positionsBefore = JSON.parse(String(snapshot.positions_before_json || '[]'));
	} catch {}
	try {
		ordersBefore = JSON.parse(String(snapshot.orders_before_json || '[]'));
	} catch {}
	await env.DB.prepare('DELETE FROM mo_execution_mark WHERE signal_date=?').bind(signalDate).run();
	await env.DB.prepare('DELETE FROM mo_positions').run();
	for (const row of positionsBefore) {
		await env.DB.prepare("INSERT INTO mo_positions(symbol,name,shares,avg_cost,opened_date,updated_at) VALUES (?,?,?,?,?,COALESCE(?, datetime('now')))").bind(String(row.symbol || ''), String(row.name || ''), Number(row.shares || 0), Number(row.avg_cost || 0), row.opened_date ?? null, row.updated_at ?? null).run();
	}
	await env.DB.prepare("UPDATE mo_portfolio_state SET cash_twd=?, updated_at=datetime('now') WHERE id=1").bind(cashBefore).run();
	for (const row of ordersBefore) {
		await env.DB.prepare("UPDATE mo_orders SET status=?, exec_date=?, exec_price=?, reason=? WHERE id=?").bind(String(row.status || 'PENDING'), row.exec_date ?? null, row.exec_price ?? null, row.reason ?? null, Number(row.id)).run();
	}
	await env.DB.prepare("UPDATE mo_sandbox_snapshot SET applied=0, reset_at=datetime('now') WHERE id=?").bind(Number(snapshot.id)).run();
	const audit = await buildExecutionAuditText(env, signalDate);
	return [
		`simulation reset version=${APP_VERSION}`,
		`signalDate=${signalDate || '-'}`,
		`execDate=${execDate || '-'}`,
		`restoredPositions=${positionsBefore.length}`,
		`restoredOrders=${ordersBefore.length}`,
		`cashRestored=${Math.round(cashBefore).toLocaleString()}`,
		'',
		audit,
	].join('\n');
}
type ExitSandboxCandidate = {
	symbol: string;
	name: string;
	shares: number;
	avgCost: number;
	lastPrice: number;
	pnlPct: number;
	action: 'SELL_ALL' | 'TRIM_HALF' | 'HOLD';
	qty: number;
	entryLow: number;
	entryHigh: number;
	reason: string;
};
async function buildExitSandboxCandidates(env: Env): Promise<ExitSandboxCandidate[]> {
	await ensureMultiAssetTables(env);
	await ensureSandboxSnapshotTable(env);
	const sandbox = await getLatestActiveSandboxSnapshot(env);
	let rows: any[] = [];
	try {
		rows = sandbox?.positions_after_json ? JSON.parse(String(sandbox.positions_after_json || '[]')) : [];
	} catch {
		rows = [];
	}
	if (!rows.length) {
		const rs = await env.DB.prepare('SELECT symbol, name, shares, avg_cost, last_price FROM mo_positions ORDER BY symbol ASC').all<any>().catch(() => ({ results: [] } as any));
		rows = rs?.results ?? [];
	}
	const out: ExitSandboxCandidate[] = [];
	for (const row of rows) {
		const symbol = String(row.symbol || '').trim();
		const shares = Number(row.shares ?? 0);
		const avgCost = Number(row.avg_cost ?? 0);
		if (!symbol || shares <= 0 || avgCost <= 0) continue;
		const seededLast = Number(row.last_price ?? NaN);
		const syntheticLast = round2(avgCost * 1.08);
		const lastPrice = Number.isFinite(seededLast) && seededLast > 0 ? seededLast : syntheticLast;
		const pnlPct = avgCost > 0 ? round2(((lastPrice - avgCost) / avgCost) * 100) : 0;
		let action: ExitSandboxCandidate['action'] = 'HOLD';
		let qty = 0;
		let reason = '持有觀察';
		if (pnlPct <= -5) {
			action = 'SELL_ALL';
			qty = shares;
			reason = `停損沙盒：報酬 ${pnlPct}% ≤ -5%`;
		} else if (pnlPct >= 8) {
			action = 'SELL_ALL';
			qty = shares;
			reason = `停利沙盒：報酬 ${pnlPct}% ≥ +8%`;
		} else if (pnlPct >= 4) {
			action = 'TRIM_HALF';
			qty = Math.max(1, Math.floor(shares / 2));
			reason = `減碼沙盒：報酬 ${pnlPct}% ≥ +4%`;
		}
		const entryHigh = round2(lastPrice);
		const entryLow = round2(Math.max(0.01, lastPrice * 0.997));
		out.push({ symbol, name: String(row.name || ''), shares, avgCost, lastPrice, pnlPct, action, qty, entryLow, entryHigh, reason });
	}
	return out;
}
async function buildExitSandboxPreviewText(env: Env): Promise<string> {
	const sandbox = await getLatestActiveSandboxSnapshot(env);
	const pf = await env.DB.prepare('SELECT * FROM mo_portfolio_state WHERE id=1').first<any>().catch(() => null);
	const cashBefore = Number(sandbox?.cash_after ?? pf?.cash_twd ?? 300000);
	const candidates = await buildExitSandboxCandidates(env);
	const actionable = candidates.filter((x) => x.action !== 'HOLD' && x.qty > 0);
	if (!candidates.length) {
		return [
			`exit sandbox preview version=${APP_VERSION}`,
			'positions=0',
			`cashBefore=${Math.round(cashBefore).toLocaleString()}`,
			'status=no_positions',
		].join('\n');
	}
	const pseudoOrders = actionable.map((x) => ({
		signal_date: twTodayString(),
		side: 'SELL',
		symbol: x.symbol,
		name: x.name,
		entry_low: x.entryLow,
		entry_high: x.entryHigh,
		qty: x.qty,
		status: 'PENDING',
	}));
	const preview = await previewSimulationForOrders(env, twTodayString(), pseudoOrders as any[]);
	const lines = [
		`exit sandbox preview version=${APP_VERSION}`,
		`positions=${candidates.length}`,
		`actionable=${actionable.length}`,
		`cashBefore=${Math.round(cashBefore).toLocaleString()}`,
		`cashAfter=${Math.round(preview.cashAfter).toLocaleString()}`,
		'',
		'candidates:',
		...candidates.map((x) => `${x.symbol} shares=${round2(x.shares)} avg=${round2(x.avgCost)} last=${round2(x.lastPrice)} pnl=${round2(x.pnlPct)}% action=${x.action} qty=${round2(x.qty)} reason=${x.reason}`),
		'',
		'preview:',
		...(preview.events.length ? preview.events : ['(none)']),
	];
	return lines.join('\n');
}
async function buildExecutionAuditText(env: Env, preferredSignalDate?: string): Promise<string> {
	await ensureExecutionMarkTable(env);
	const latestSignal = await env.DB.prepare("SELECT signal_date FROM mo_orders ORDER BY signal_date DESC, id DESC LIMIT 1").first<any>().catch(() => null);
	const signalDate = String(preferredSignalDate || latestSignal?.signal_date || '').trim();
	if (!signalDate) return ['execution audit version=' + APP_VERSION, 'signalDate=-', 'status=no_orders'].join('\n');
	const latestExecutedForSignal = await env.DB.prepare("SELECT exec_date FROM mo_orders WHERE signal_date=? AND status='EXECUTED' ORDER BY exec_date DESC, id DESC LIMIT 1").bind(signalDate).first<any>().catch(() => null);
	const execDate = String(latestExecutedForSignal?.exec_date || nextWeekday(signalDate));
	const allOrders = await env.DB.prepare("SELECT * FROM mo_orders WHERE signal_date=? ORDER BY id ASC").bind(signalDate).all<any>();
	const rows = allOrders?.results ?? [];
	const preview = await previewSimulationForOrders(env, signalDate, rows);
	const marks = await env.DB.prepare("SELECT symbol, side, qty, filled, filled_price, trade_date FROM mo_execution_mark WHERE signal_date=? ORDER BY id ASC").bind(signalDate).all<any>().catch(() => ({ results: [] } as any));
	const actualBySymbol = new Map<string, any>();
	for (const row of rows) actualBySymbol.set(`${String(row.side)}:${String(row.symbol)}`, row);
	const previewBySymbol = new Map<string, string>();
	for (const event of preview.events) {
		const m = String(event).match(/^PREVIEW\s+(BUY|SELL)(?:\s+SKIP)?\s+([^\s]+)/);
		if (!m) continue;
		previewBySymbol.set(`${m[1]}:${m[2]}`, event);
	}
	const diff: string[] = [];
	for (const row of rows) {
		const key = `${String(row.side)}:${String(row.symbol)}`;
		const previewEvent = previewBySymbol.get(key) || 'PREVIEW (missing)';
		const actualStatus = String(row.status || '-');
		const actualPrice = Number(row.exec_price ?? NaN);
		const actualText = actualStatus === 'EXECUTED'
			? `ACTUAL ${String(row.side)} ${String(row.symbol)} @ ${Number.isFinite(actualPrice) ? round2(actualPrice) : '-'} x ${Number(row.qty)}`
			: `ACTUAL ${String(row.side)} ${String(row.symbol)} status=${actualStatus}`;
		const mismatch = previewEvent.includes('SKIP') !== (actualStatus !== 'EXECUTED') || (previewEvent.includes('PREVIEW BUY') || previewEvent.includes('PREVIEW SELL')) && actualStatus !== 'EXECUTED';
		diff.push(`${mismatch ? 'DIFF' : 'MATCH'} ${key} | ${previewEvent} | ${actualText}`);
	}
	const lines = [
		`execution audit version=${APP_VERSION}`,
		`signalDate=${signalDate}`,
		`execDate=${execDate}`,
		`orders=${rows.length}`,
		`previewEvents=${preview.events.length}`,
		`executionMarks=${Number(marks?.results?.length || 0)}`,
		'',
		'preview:',
		...(preview.events.length ? preview.events : ['(none)']),
		'',
		'actual:',
		...(rows.length ? rows.map((row: any) => `${String(row.side)} ${String(row.symbol)} status=${String(row.status || '-')} execDate=${String(row.exec_date || '-')} execPrice=${row.exec_price == null ? '-' : round2(Number(row.exec_price))}`) : ['(none)']),
		'',
		'diff:',
		...(diff.length ? diff : ['(none)']),
	];
	return lines.join('\n');
}
async function buildAdminStatusText(env: Env): Promise<string> {
	await ensureTickMarksTable(env);
	await ensureTickAuditTable(env);
	await ensureCycleStateTable(env);
	const today = twTodayString();
	const cycle = await getLatestOpenCycle(env);
	const latestCycle = cycle ?? await env.DB.prepare("SELECT trade_date, status, data_ready, summary_ready, recommendation_ready, simulation_seeded, actionable, report_pushed, attempt_count, note, updated_at FROM mo_cycle_state ORDER BY trade_date DESC LIMIT 1").first<any>().catch(() => null);
	const latestSummary = await env.DB.prepare("SELECT date FROM twse_daily_summary ORDER BY date DESC LIMIT 1").first<any>().catch(() => null);
	const latestPending = await env.DB.prepare("SELECT signal_date AS signal_date, COUNT(*) AS c FROM mo_orders WHERE status='PENDING' GROUP BY signal_date ORDER BY signal_date DESC LIMIT 1").first<any>().catch(() => null);
	const latestExecuted = await env.DB.prepare("SELECT exec_date AS exec_date, COUNT(*) AS c FROM mo_orders WHERE status='EXECUTED' GROUP BY exec_date ORDER BY exec_date DESC LIMIT 1").first<any>().catch(() => null);
	const latestSignal = await env.DB.prepare("SELECT signal_date AS signal_date, COUNT(*) AS total_count, SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) AS pending_count, SUM(CASE WHEN status='EXECUTED' THEN 1 ELSE 0 END) AS executed_count, SUM(CASE WHEN status='SKIPPED' THEN 1 ELSE 0 END) AS skipped_count FROM mo_orders GROUP BY signal_date ORDER BY signal_date DESC LIMIT 1").first<any>().catch(() => null);
	const pf = await env.DB.prepare('SELECT * FROM mo_portfolio_state WHERE id=1').first<any>().catch(() => null);
	const positionCount = await env.DB.prepare('SELECT COUNT(*) AS c FROM mo_positions').first<any>().catch(() => null);
	const tickMark = await getTickMark(env, today);
	const tickAudit = await env.DB.prepare("SELECT tick_id, jobs_done, jobs_failed, summary, updated_at FROM mo_tick_audit ORDER BY updated_at DESC LIMIT 1").first<any>().catch(() => null);
	const preview = await previewLatestSimulation(env);
	const sandbox = await getLatestActiveSandboxSnapshot(env);
	const reviewReferenceTradeDate = safeText(latestSignal?.signal_date || latestCycle?.trade_date || latestSummary?.date || today);
	const reviewAuditLines = await buildReviewAdminAuditLines(env, reviewReferenceTradeDate);
	const lines = [
		`market-observer status version=${APP_VERSION}`,
		`today=${today}`,
		`latestSummary=${String(latestSummary?.date || '-')}`,
		`latestCycle=${String(latestCycle?.trade_date || '-')} status=${String(latestCycle?.status || '-')}`,
		`cycleReady=data:${Number(latestCycle?.data_ready || 0) ? 'Y' : 'N'} summary:${Number(latestCycle?.summary_ready || 0) ? 'Y' : 'N'} rec:${Number(latestCycle?.recommendation_ready || 0) ? 'Y' : 'N'} sim:${Number(latestCycle?.simulation_seeded || 0) ? 'Y' : 'N'} actionable:${Number(latestCycle?.actionable || 0) ? 'Y' : 'N'} pushed:${Number(latestCycle?.report_pushed || 0) ? 'Y' : 'N'}`,
		`latestPending=${String(latestPending?.signal_date || '-')} count=${Number(latestPending?.c || 0)}`,
		`latestPendingExecDate=${latestPending?.signal_date ? nextWeekday(String(latestPending.signal_date)) : '-'}`,
		`latestExecuted=${String(latestExecuted?.exec_date || '-')} count=${Number(latestExecuted?.c || 0)}`,
		`latestSignal=${String(latestSignal?.signal_date || '-')} total=${Number(latestSignal?.total_count || 0)} pending=${Number(latestSignal?.pending_count || 0)} executed=${Number(latestSignal?.executed_count || 0)} skipped=${Number(latestSignal?.skipped_count || 0)}`,
		`portfolio=cash:${Math.round(Number(pf?.cash_twd ?? 300000)).toLocaleString()} positions:${Number(positionCount?.c || 0)}`,
		`tickMark=today:${today} postCloseDone:${Number(tickMark?.post_close_done || 0) ? 'Y' : 'N'} pushOnlyDone:${Number(tickMark?.push_only_done || 0) ? 'Y' : 'N'}`,
		`lastTick=${String(tickAudit?.tick_id || '-')} jobsDone=${Number(tickAudit?.jobs_done || 0)} jobsFailed=${Number(tickAudit?.jobs_failed || 0)}`,
		`simulationPreview=signalDate:${preview.signalDate || '-'} execDate:${preview.execDate || '-'} pending:${preview.pendingCount} cashAfter:${Math.round(preview.cashAfter).toLocaleString()}`,
		`sandboxSnapshot=${sandbox?.signal_date ? `signalDate:${String(sandbox.signal_date)} execDate:${String(sandbox.exec_date || '-')} active:Y positions:${(() => { try { return JSON.parse(String(sandbox.positions_after_json || '[]')).length; } catch { return 0; } })()} cashAfter:${Math.round(Number(sandbox.cash_after ?? sandbox.cash_before ?? 0)).toLocaleString()}` : 'none'}`,
		...reviewAuditLines,
	];
	if (latestCycle?.note) lines.push(`cycleNote=${String(latestCycle.note)}`);
	if (tickAudit?.summary) lines.push(`lastTickSummary=${String(tickAudit.summary)}`);
	return lines.join('\n');
}
async function executePendingOrders(env: Env, tradeDate: string, priceByCode: Map<string, any>): Promise<string[]> {
	await ensureExecutionMarkTable(env);
	const pending = await env.DB.prepare("SELECT * FROM mo_orders WHERE status='PENDING' ORDER BY id ASC").all<any>();
	const events: string[] = [];
	if (!pending?.results?.length) return events;
	const pf = await env.DB.prepare('SELECT * FROM mo_portfolio_state WHERE id=1').first<any>();
	let cash = Number(pf?.cash_twd ?? 300000);
	const fillPolicy = getSimFillPolicy(env);
	for (const o of pending.results) {
		const sym = String(o.symbol);
		const row = priceByCode.get(sym);
		if (!row) continue;
		const open = Number(row.open);
		const high = Number(row.high);
		const low = Number(row.low);
		const close = Number(row.close);
		const entryLow = Number(o.entry_low);
		const entryHigh = Number(o.entry_high);
		const qty = Number(o.qty);
		let execPrice: number | null = null;
		if (o.side === 'BUY') {
			execPrice = pickExecPriceForBuy({ open, high, low, entryLow, entryHigh });
			let fillReason = '成交（模擬） close=' + close + '｜含成本';
			let fallbackMode: string | null = null;
			if (execPrice == null && fillPolicy === 'RANGE_OR_CLOSE' && Number.isFinite(close) && close > 0) {
				execPrice = close;
				fallbackMode = 'RANGE_OR_CLOSE';
				fillReason = `成交（模擬 fallback=${fallbackMode} close=${close}）｜含成本`;
			}
			if (execPrice == null && fillPolicy === 'NEXT_OPEN' && Number.isFinite(open) && open > 0) {
				execPrice = open;
				fallbackMode = 'NEXT_OPEN';
				fillReason = `成交（模擬 fallback=${fallbackMode} open=${open}）｜含成本`;
			}
			if (execPrice == null) {
				await env.DB.prepare("UPDATE mo_orders SET status='SKIPPED', exec_date=?, reason=? WHERE id=?")
					.bind(tradeDate, '價格未進入買入區間 → 跳過', o.id)
					.run();
				await appendExecutionMark(env, { signalDate: String(o.signal_date ?? ''), tradeDate, symbol: sym, side: 'BUY', qty, price: null, entryLow, entryHigh, filled: false });
				events.push(`⏭️ BUY SKIP ${sym}（未進入區間）`);
				continue;
			}
			const guard = buildTradeGuardResult({ symbol: sym, side: 'BUY', price: execPrice, qty, signal: 'TRY', score: 0 });
			if (!guard.ok) {
				await env.DB.prepare("UPDATE mo_orders SET status='SKIPPED', exec_date=?, reason=? WHERE id=?")
					.bind(tradeDate, `交易門檻未通過 → ${guard.reason}`, o.id)
					.run();
				await appendExecutionMark(env, { signalDate: String(o.signal_date ?? ''), tradeDate, symbol: sym, side: 'BUY', qty, price: execPrice, entryLow, entryHigh, filled: false });
				events.push(`⏭️ BUY SKIP ${sym}（${guard.reason}）`);
				continue;
			}
			const cost = calcTradeCostEstimate({ symbol: sym, side: 'BUY', price: execPrice, qty });
			const grossCashNeed = round2(cost.notionalTwd + cost.totalTwd);
			if (grossCashNeed > cash + 1e-6) {
				await env.DB.prepare("UPDATE mo_orders SET status='SKIPPED', exec_date=?, reason=? WHERE id=?")
					.bind(tradeDate, '現金不足（含成本） → 跳過', o.id)
					.run();
				await appendExecutionMark(env, { signalDate: String(o.signal_date ?? ''), tradeDate, symbol: sym, side: 'BUY', qty, price: execPrice, entryLow, entryHigh, filled: false });
				events.push(`⏭️ BUY SKIP ${sym}（現金不足含成本）`);
				continue;
			}
			cash -= grossCashNeed;
			const pos = await env.DB.prepare('SELECT * FROM mo_positions WHERE symbol=?').bind(sym).first<any>();
			const oldShares = Number(pos?.shares ?? 0);
			const oldAvg = Number(pos?.avg_cost ?? 0);
			const newShares = round2(oldShares + qty);
			const newAvg = newShares > 0 ? (oldShares * oldAvg + qty * execPrice) / newShares : 0;
			if (pos) {
				await env.DB.prepare("UPDATE mo_positions SET shares=?, avg_cost=?, updated_at=datetime('now') WHERE symbol=?")
					.bind(newShares, newAvg, sym)
					.run();
			} else {
				await env.DB.prepare('INSERT INTO mo_positions(symbol,name,shares,avg_cost,opened_date) VALUES (?,?,?,?,?)')
					.bind(sym, o.name ?? '', newShares, newAvg, tradeDate)
					.run();
			}
			await env.DB.prepare("UPDATE mo_orders SET status='EXECUTED', exec_date=?, exec_price=?, reason=? WHERE id=?")
				.bind(tradeDate, execPrice, fillReason, o.id)
				.run();
			await appendExecutionMark(env, { signalDate: String(o.signal_date ?? ''), tradeDate, symbol: sym, side: 'BUY', qty, price: execPrice, entryLow, entryHigh, filled: true, filledPrice: execPrice, filledAt: tradeDate });
			events.push(`✅ BUY ${sym} @ ${execPrice} x ${qty}${fallbackMode ? `（${fallbackMode}）` : ''}`);
			continue;
		}
		if (o.side === 'SELL') {
			execPrice = pickExecPriceForSell({ open, high, low, entryLow, entryHigh });
			let fillReason = '成交（模擬） close=' + close + '｜含成本';
			let fallbackMode: string | null = null;
			if (execPrice == null && fillPolicy === 'RANGE_OR_CLOSE' && Number.isFinite(close) && close > 0) {
				execPrice = close;
				fallbackMode = 'RANGE_OR_CLOSE';
				fillReason = `成交（模擬 fallback=${fallbackMode} close=${close}）｜含成本`;
			}
			if (execPrice == null && fillPolicy === 'NEXT_OPEN' && Number.isFinite(open) && open > 0) {
				execPrice = open;
				fallbackMode = 'NEXT_OPEN';
				fillReason = `成交（模擬 fallback=${fallbackMode} open=${open}）｜含成本`;
			}
			if (execPrice == null) {
				await env.DB.prepare("UPDATE mo_orders SET status='SKIPPED', exec_date=?, reason=? WHERE id=?")
					.bind(tradeDate, '價格未進入賣出區間 → 跳過', o.id)
					.run();
				await appendExecutionMark(env, { signalDate: String(o.signal_date ?? ''), tradeDate, symbol: sym, side: 'SELL', qty, price: null, entryLow, entryHigh, filled: false });
				events.push(`⏭️ SELL SKIP ${sym}（未進入區間）`);
				continue;
			}
			const pos = await env.DB.prepare('SELECT * FROM mo_positions WHERE symbol=?').bind(sym).first<any>();
			const have = Number(pos?.shares ?? 0);
			if (have <= 0) {
				await env.DB.prepare("UPDATE mo_orders SET status='SKIPPED', exec_date=?, reason=? WHERE id=?")
					.bind(tradeDate, '無持倉 → 跳過', o.id)
					.run();
				await appendExecutionMark(env, { signalDate: String(o.signal_date ?? ''), tradeDate, symbol: sym, side: 'SELL', qty, price: execPrice, entryLow, entryHigh, filled: false });
				events.push(`⏭️ SELL SKIP ${sym}（無持倉）`);
				continue;
			}
			const sellQty = Math.min(have, qty);
			const proceeds = calcTradeCostEstimate({ symbol: sym, side: 'SELL', price: execPrice, qty: sellQty });
			cash += round2(proceeds.notionalTwd - proceeds.totalTwd);
			const remain = round2(have - sellQty);
			if (remain <= 0) {
				await env.DB.prepare('DELETE FROM mo_positions WHERE symbol=?').bind(sym).run();
			} else {
				await env.DB.prepare("UPDATE mo_positions SET shares=?, updated_at=datetime('now') WHERE symbol=?").bind(remain, sym).run();
			}
			await env.DB.prepare("UPDATE mo_orders SET status='EXECUTED', exec_date=?, exec_price=?, reason=? WHERE id=?")
				.bind(tradeDate, execPrice, fillReason, o.id)
				.run();
			await appendExecutionMark(env, { signalDate: String(o.signal_date ?? ''), tradeDate, symbol: sym, side: 'SELL', qty: sellQty, price: execPrice, entryLow, entryHigh, filled: true, filledPrice: execPrice, filledAt: tradeDate });
			events.push(`✅ SELL ${sym} @ ${execPrice} x ${sellQty}${fallbackMode ? `（${fallbackMode}）` : ''}`);
			continue;
		}
	}
	await env.DB.prepare("UPDATE mo_portfolio_state SET cash_twd=?, updated_at=datetime('now') WHERE id=1").bind(cash).run();
	return events;
}
async function generateRecommendationsMulti(
	env: Env,
	args: {
		tradeDate: string;
		signal: SignalLevel;
		topByValue: any[];
		snapshotCandidates: any[];
		priceByCode: Map<string, any>;
		activeUniverse: { symbols: string[]; source: UniverseSource };
	},
): Promise<{ recs: MoRecommendation[]; debugRows: StrategyDebugRow[] }> {
	const { tradeDate, signal, topByValue, snapshotCandidates, priceByCode, activeUniverse } = args;
	const pf = await env.DB.prepare('SELECT * FROM mo_portfolio_state WHERE id=1').first<any>();
	const principal = Number(pf?.principal_twd ?? 300000);
	let cash = Number(pf?.cash_twd ?? principal);
	const positions = await env.DB.prepare('SELECT * FROM mo_positions').all<any>();
	const posList = positions?.results ?? [];
	const recs: MoRecommendation[] = [];
	const debugRows: StrategyDebugRow[] = [];
	// 1) 先看既有持倉：簡單停損（以收盤對比均價）
	for (const p of posList) {
		const sym = String(p.symbol);
		const row = priceByCode.get(sym);
		if (!row) continue;
		const close = Number(row.close);
		const avg = Number(p.avg_cost ?? 0);
		const sh = Number(p.shares ?? 0);
		if (sh <= 0 || !Number.isFinite(close) || !Number.isFinite(avg) || avg <= 0) continue;
		const pnlPct = close / avg - 1;
		if (pnlPct <= -0.12) {
			const rg = calcExitRangeFromClose(close);
			debugRows.push({ symbol: sym, name: String(p.name ?? ''), stage: 'selected', reason: `stop_loss ${Math.round(pnlPct * 100)}%`, score: 99 });
			recs.push({
				symbol: sym,
				name: String(p.name ?? ''),
				side: 'SELL',
				entryLow: rg.low,
				entryHigh: rg.high,
				qty: sh, // 全出
				weight: 0,
				score: 99,
				reason: `停損（浮虧 ${Math.round(pnlPct * 100)}%）`,
			});
		}
	}
	// 2) 沒有要買就返回（HOLD）
	if (signal === 'HOLD') {
		for (const x of snapshotCandidates.slice(0, 5)) debugRows.push({ symbol: x.code, name: x.name || '', stage: 'rejected', reason: 'signal_hold' });
		return { recs, debugRows };
	}
	// 3) 買入：優先從 universe 挑標的；若 universe 當日完全沒有快照，才回退到成交值排行
	const maxNames = signal === 'AGGRESSIVE' ? 4 : 3;
	const universeRows = snapshotCandidates.length ? snapshotCandidates : filterUniverseCandidates(topByValue, activeUniverse.symbols);
	const basePool = universeRows.length ? universeRows : topByValue;
	const ranked = pickTopCandidates(basePool, 6)
		.map((x) => {
			const a = alphaScoreCandidate(x);
			const px = priceByCode.get(String(x?.code ?? '')) ?? null;
			const resolved = Number.isFinite(Number(x?.close)) && Number(x.close) > 0 ? { close: Number(x.close), source: String(x?.closeSource ?? 'candidate.close') } : resolveCandidateClose({ raw: null, px, top: x });
			return { ...x, score: a.score, alpha: a.detail, close: resolved.close, closeSource: resolved.source };
		})
		.sort((a, b) => b.score - a.score);
	const picks = ranked.slice(0, maxNames);
	for (const x of picks) {
		debugRows.push({
			symbol: x.code,
			name: x.name || '',
			stage: 'candidate',
			reason: `alpha=${x.score} chg=${Number.isFinite(x.alpha?.chgPct) ? x.alpha.chgPct : '—'}% px=${String(x.closeSource ?? 'n/a')}`,
			score: x.score,
			chgPct: x.alpha?.chgPct,
			valueScore: x.alpha?.valueScore,
			momScore: x.alpha?.momScore,
		});
	}
	for (const x of ranked.slice(maxNames)) {
		debugRows.push({ symbol: x.code, name: x.name || '', stage: 'rejected', reason: 'cut_by_rank', score: x.score, chgPct: x.alpha?.chgPct, valueScore: x.alpha?.valueScore, momScore: x.alpha?.momScore });
	}
	for (const x of ranked.filter((x) => !Number.isFinite(Number(x?.close)) || Number(x.close) <= 0)) {
		debugRows.push({ symbol: x.code, name: x.name || '', stage: 'rejected', reason: `missing_close ${String(x.closeSource ?? 'n/a')}`, score: x.score, chgPct: x.alpha?.chgPct, valueScore: x.alpha?.valueScore, momScore: x.alpha?.momScore });
	}
	if (!picks.length) {
		const starter = buildStarterRecommendation({ signal, cash, ranked });
		if (starter) {
			debugRows.push({ symbol: starter.symbol, name: starter.name, stage: 'selected', reason: `starter_fallback qty=${starter.qty}`, score: starter.score });
			recs.push(starter);
		}
		return { recs, debugRows };
	}
	const sizing = buildPositionSizing({
		signal,
		cash,
		picks: picks.map((x: any) => {
			const profile = getTradeCostProfile(String(x.code ?? ''));
			return {
				code: String(x.code ?? ''),
				close: Number(x.close),
				score: Number(x.score),
				minQty: profile.minQty,
				minNotionalTwd: profile.minNotionalTwd,
			};
		}),
	});
	const sizingMap = new Map(sizing.decisions.map((d) => [d.code, d]));
	for (let i = 0; i < picks.length; i++) {
		const x = picks[i];
		const decision = sizingMap.get(String(x.code ?? ''));
		if (!decision || decision.targetBudget <= 0) {
			debugRows.push({ symbol: x.code, name: x.name || '', stage: 'rejected', reason: 'budget_zero', score: x.score, chgPct: x.alpha?.chgPct, valueScore: x.alpha?.valueScore, momScore: x.alpha?.momScore });
			continue;
		}
		const close = Number(x.close);
		if (!Number.isFinite(close) || close <= 0) {
			debugRows.push({ symbol: x.code, name: x.name || '', stage: 'rejected', reason: `invalid_close ${String(x.closeSource ?? 'n/a')}`, score: x.score, chgPct: x.alpha?.chgPct, valueScore: x.alpha?.valueScore, momScore: x.alpha?.momScore });
			continue;
		}
		const rg = calcEntryRangeFromClose(close);
		const qty = decision.qty;
		const guard = buildTradeGuardResult({ symbol: String(x.code ?? ''), side: 'BUY', price: rg.high, qty, signal, score: x.score });
		if (!guard.ok) {
			debugRows.push({ symbol: x.code, name: x.name || '', stage: 'rejected', reason: `${guard.reason}｜${guard.costText ?? ''}`.replace(/｜$/, ''), score: x.score, chgPct: x.alpha?.chgPct, valueScore: x.alpha?.valueScore, momScore: x.alpha?.momScore });
			continue;
		}
		debugRows.push({ symbol: x.code, name: x.name || '', stage: 'selected', reason: `${decision.sizingReason}｜${guard.costText}`, score: x.score, chgPct: x.alpha?.chgPct, valueScore: x.alpha?.valueScore, momScore: x.alpha?.momScore });
		recs.push({
			symbol: x.code,
			name: x.name,
			side: 'BUY',
			entryLow: rg.low,
			entryHigh: rg.high,
			qty,
			weight: round2(decision.weight),
			score: x.score,
			reason: (() => {
				const chgPct = Number.isFinite(x.alpha?.chgPct) ? `${x.alpha.chgPct > 0 ? '+' : ''}${x.alpha.chgPct}%` : '—';
				const why = signal === 'AGGRESSIVE' ? '積極：行情偏多，分散布局' : '試單：盤面分歧，小額先試';
				const poolTag = universeRows.length ? 'ETF池' : '成交值回退';
				return `${why}｜${poolTag}｜Alpha ${x.score}｜動能 ${chgPct}｜${decision.sizingReason}`;
			})(),
		});
	}
	if (!recs.length) {
		const starter = buildStarterRecommendation({ signal, cash, ranked: picks });
		if (starter) {
			debugRows.push({ symbol: starter.symbol, name: starter.name, stage: 'selected', reason: `starter_fallback qty=${starter.qty}`, score: starter.score });
			recs.push(starter);
		}
	}
	return { recs, debugRows };
}
async function persistRecommendations(env: Env, tradeDate: string, recs: MoRecommendation[]): Promise<{ inserted: number; deduped: number }> {
	let inserted = 0;
	let deduped = 0;
	for (const r of recs) {
		const canonical = canonicalSymbol(r.symbol);
		const legacyBare = bareSymbol(canonical);
		await env.DB.prepare(`DELETE FROM mo_orders WHERE signal_date=? AND side=? AND symbol=?`).bind(tradeDate, r.side, legacyBare).run();
		const exists = await env.DB.prepare(
			`SELECT id, status FROM mo_orders WHERE signal_date=? AND side=? AND symbol=? ORDER BY id DESC LIMIT 1`,
		)
			.bind(tradeDate, r.side, canonical)
			.first<any>();
		if (exists?.id) {
			deduped += 1;
			continue;
		}
		await env.DB.prepare(
			'INSERT INTO mo_orders(signal_date, side, symbol, name, entry_low, entry_high, qty, status, reason) VALUES (?,?,?,?,?,?,?,?,?)',
		)
			.bind(tradeDate, r.side, canonical, r.name, r.entryLow, r.entryHigh, r.qty, 'PENDING', r.reason)
			.run();
		inserted += 1;
	}
	return { inserted, deduped };
}
async function persistRecommendationLog(
	env: Env,
	args: {
		tradeDate: string;
		signal: SignalLevel;
		activeUniverse: { symbols: string[]; source: UniverseSource };
		candidateCount: number;
		recCount: number;
		snapshotCount: number;
		note?: string;
	},
): Promise<void> {
	await env.DB.prepare(
		`INSERT INTO mo_recommendation_log (trade_date, signal, universe_source, universe_symbols, candidate_count, rec_count, snapshot_count, note)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			args.tradeDate,
			args.signal,
			args.activeUniverse.source,
			args.activeUniverse.symbols.map((s) => canonicalSymbol(s)).join(','),
			args.candidateCount,
			args.recCount,
			args.snapshotCount,
			args.note ?? null,
		)
		.run();
}
async function replaceStrategyDebugRows(env: Env, tradeDate: string, rows: StrategyDebugRow[]): Promise<void> {
	await env.DB.prepare('DELETE FROM mo_strategy_debug WHERE trade_date=?').bind(tradeDate).run();
	for (const r of rows) {
		await env.DB.prepare(
			`INSERT INTO mo_strategy_debug (trade_date, symbol, name, stage, reason, score, chg_pct, value_score, mom_score)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
			.bind(
				tradeDate,
				r.symbol,
				r.name || null,
				r.stage,
				r.reason,
				r.score ?? null,
				r.chgPct ?? null,
				r.valueScore ?? null,
				r.momScore ?? null,
			)
			.run();
	}
}
async function buildStrategyDebugText(env: Env): Promise<string> {
	await ensureMultiAssetTables(env);
	const recLog = await getLatestRecommendationLog(env);
	if (!recLog) return '目前尚無策略 debug 資料。';
	const tradeDate = String(recLog.trade_date || '');
	const rows = await env.DB.prepare(
		`SELECT symbol, name, stage, reason, score, chg_pct, value_score, mom_score
		 FROM mo_strategy_debug
		 WHERE trade_date=?
		 ORDER BY CASE stage WHEN 'selected' THEN 1 WHEN 'candidate' THEN 2 ELSE 9 END, score DESC, id ASC
		 LIMIT 12`,
	).bind(tradeDate).all<any>();
	const rs = rows?.results ?? [];
	const lines: string[] = [];
	lines.push(`🧪 MO Debug（${tradeDate || 'n/a'}）`);
	lines.push(`source：${recLog.universe_source}｜signal：${recLog.signal}`);
	lines.push(`candidates：${recLog.candidate_count}｜recs：${recLog.rec_count}`);
	if (recLog.note) lines.push(`note：${String(recLog.note).slice(0, 120)}`);
	if (!rs.length) return lines.join('\n');
	const selected = rs.filter((r: any) => String(r.stage) === 'selected');
	const candidates = rs.filter((r: any) => String(r.stage) === 'candidate').slice(0, 3);
	const rejected = rs.filter((r: any) => String(r.stage) !== 'selected' && String(r.stage) !== 'candidate').slice(0, 5);
	if (selected.length) {
		lines.push('');
		lines.push('✅ Selected');
		for (const r of selected.slice(0, 5)) lines.push(`${r.symbol}｜score ${Number(r.score ?? 0).toFixed(1)}｜${r.reason}`);
	}
	if (candidates.length) {
		lines.push('');
		lines.push('📈 Top candidates');
		for (const r of candidates) lines.push(`${r.symbol}｜score ${Number(r.score ?? 0).toFixed(1)}｜${r.reason}`);
	}
	if (rejected.length) {
		lines.push('');
		lines.push('⛔ Rejected');
		for (const r of rejected) lines.push(`${r.symbol}｜${r.reason}`);
	}
	return lines.join('\n');
}
function formatRecsForLine(recs: MoRecommendation[]): string {
	if (!recs.length) return '🧠 明日建議：不動（無明顯機會）';
	const lines: string[] = [];
	lines.push('🧠 明日建議（多標的）');
	for (const [i, r] of recs.entries()) {
		const side = r.side === 'BUY' ? 'BUY' : 'SELL';
		lines.push(`${i + 1}. ${side} ${r.symbol} ${r.name}`.trim());
		lines.push(`   價格區間：${r.entryLow} – ${r.entryHigh}`);
		lines.push(`   數量：${r.qty} 股｜權重：${Math.round(r.weight * 100)}%｜Score：${r.score}`);
		lines.push(`   原因：${r.reason}`);
	}
	return lines.join('\n');
}
async function buildPriceByCode(stocksAll: any[]): Promise<Map<string, any>> {
	const m = new Map<string, any>();
	for (const r of stocksAll) {
		const code = normalizeUniverseSymbol(getStr(r, ['證券代號', 'Code', 'code', 'StockCode']));
		if (!code) continue;
		m.set(code, {
			code,
			open: getNum(r, ['開盤價', 'Open', 'open', '開盤']),
			high: getNum(r, ['最高價', 'High', 'high', '最高']),
			low: getNum(r, ['最低價', 'Low', 'low', '最低']),
			close: getNum(r, ['收盤價', 'Close', 'close', '收盤']),
			chg: getNum(r, ['漲跌價差', 'Change', 'chg', '漲跌', '漲跌價差(元)']),
		});
	}
	return m;
}
async function ensurePricesDailyTable(env: Env): Promise<void> {
	await env.DB.prepare(`
		CREATE TABLE IF NOT EXISTS prices_daily (
			symbol TEXT,
			date TEXT,
			close REAL,
			created_at TEXT,
			PRIMARY KEY (symbol, date)
		)
	`).run();
}
async function upsertPricesDailyFromSnapshot(env: Env, tradeDate: string, stocksAll: any[], activeUniverseSymbols: string[]): Promise<{ inserted: number; skipped: number }> {
	await ensurePricesDailyTable(env);
	if (!Array.isArray(stocksAll) || !stocksAll.length) return { inserted: 0, skipped: 0 };
	const wanted = new Set((activeUniverseSymbols || []).map((s) => canonicalSymbol(s)).filter(Boolean));
	let inserted = 0;
	let skipped = 0;
	for (const row of stocksAll) {
		const rawCode = getStr(row, ['證券代號', 'Code', 'code', 'StockCode']);
		const symbol = canonicalSymbol(rawCode);
		if (!symbol || (wanted.size && !wanted.has(symbol))) {
			skipped += 1;
			continue;
		}
		const close = getNum(row, ['收盤價', 'Close', 'close', '收盤', 'ClosingPrice', 'lastPrice', 'LastPrice']);
		if (!Number.isFinite(close) || close <= 0) {
			skipped += 1;
			continue;
		}
		await env.DB.prepare('INSERT OR REPLACE INTO prices_daily(symbol, date, close, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
			.bind(symbol, tradeDate, close)
			.run();
		inserted += 1;
	}
	return { inserted, skipped };
}
type PushOnlyResult = { ok: boolean; pushed: boolean; reason: string; message: string };
async function adminPushOnly(env: Env, tradeDate: string): Promise<PushOnlyResult> {
	if (!tradeDate || isWeekend(tradeDate)) {
		return { ok: true, pushed: false, reason: 'non_trading_day', message: `SKIP push-only. tradeDate=${tradeDate || 'n/a'} reason=non_trading_day` };
	}
	await ensureTickMarksTable(env);
	const existingMark = await getTickMark(env, tradeDate);
	if (existingMark?.push_only_done === 1) {
		return { ok: true, pushed: false, reason: 'already_pushed', message: `SKIP push-only. tradeDate=${tradeDate} reason=already_pushed` };
	}
	const completedTradeDate = latestCompletedTradingDate();
	if (tradeDate !== completedTradeDate) {
		return { ok: true, pushed: false, reason: 'not_latest_completed_trade_date', message: `SKIP push-only. tradeDate=${tradeDate} reason=not_latest_completed_trade_date latest=${completedTradeDate}` };
	}
	const summary = await env.DB.prepare('SELECT summary_text FROM twse_daily_summary WHERE date=? LIMIT 1').bind(tradeDate).first<any>();
	if (!safeText(summary?.summary_text).includes(`台股盤後總結（${tradeDate}）`)) {
		return { ok: true, pushed: false, reason: 'summary_missing_or_misaligned', message: `SKIP push-only. tradeDate=${tradeDate} reason=summary_missing_or_misaligned` };
	}
	const mark = await env.DB.prepare(
		'SELECT trade_date, symbol, close_price, cash_twd, position_shares, position_value_twd, total_equity_twd, return_pct, note FROM daily_mark WHERE trade_date=? LIMIT 1',
	)
		.bind(tradeDate)
		.first<any>();
	const st = await env.DB.prepare(
		'SELECT mode, consecutive_losses, COALESCE(consecutive_wins,0) AS consecutive_wins FROM strategy_state WHERE id=1',
	).first<any>();
	const lines: string[] = [];
	lines.push('📊 Market Observer');
	lines.push(`日期：${tradeDate}`);
	lines.push('');
	if (summary?.summary_text) {
		lines.push(summary.summary_text);
	} else {
		lines.push('（今日尚無盤後摘要 summary_text）');
	}
	lines.push('');
	lines.push('📌 策略池狀態（30萬）');
	if (mark) {
		lines.push(`總資產：${Math.round(Number(mark.total_equity_twd)).toLocaleString()} 元`);
		lines.push(`現金：${Math.round(Number(mark.cash_twd)).toLocaleString()} 元`);
		lines.push(`持倉市值：${Math.round(Number(mark.position_value_twd)).toLocaleString()} 元`);
		lines.push(`累積報酬：${(Number(mark.return_pct) * 100).toFixed(2)}%`);
		if (mark.symbol) {
			const px = Number(mark.close_price);
			const sh = Number(mark.position_shares);
			lines.push(`持倉：${mark.symbol}｜${sh}${Number.isFinite(px) ? ` 股｜收盤 ${px}` : ' 股'}`);
		} else {
			lines.push('持倉：無');
		}
		if (mark.note) lines.push(`備註：${mark.note}`);
	} else {
		lines.push('（今日尚無 daily_mark）');
	}
	if (st) {
		const mode = st.mode || 'NORMAL';
		const conLoss = Number(st.consecutive_losses ?? 0);
		const conWin = Number(st.consecutive_wins ?? 0);
		lines.push(`模式：${mode}（連跌 ${conLoss} / 連漲 ${conWin}）`);
	}
	if (envFlag(env, 'FEATURE_MULTI_ASSET', false)) {
		await ensureMultiAssetTables(env);
		const pf = await env.DB.prepare('SELECT principal_twd, cash_twd FROM mo_portfolio_state WHERE id=1').first<any>();
		const positions = await env.DB.prepare('SELECT symbol, name, shares, avg_cost FROM mo_positions').all<any>();
		lines.push('');
		lines.push('📌 多標的策略池（30萬）');
		if (pf) {
			lines.push(`現金：${Math.round(Number(pf.cash_twd)).toLocaleString()} 元`);
		}
		const ps = positions?.results ?? [];
		if (!ps.length) lines.push('持倉：無');
		else {
			for (const p of ps) {
				lines.push(`持倉：${p.symbol} ${p.name}｜${p.shares} 股｜均價 ${round2(Number(p.avg_cost))}`);
			}
		}
	}
	const msg = lines.join('\n');
	await linePush(env, msg);
	await upsertTickMark(env, tradeDate, { pushOnlyDone: true });
	return { ok: true, pushed: true, reason: 'push_only', message: `OK push-only. tradeDate=${tradeDate} pushed=true reason=push_only` };
}
type DailyProcessResult = { tradeDate: string; pushed: boolean; reason?: string; summaryReady: boolean; recommendationReady: boolean; simulationSeeded: boolean; actionable: boolean; note?: string; reportStatus: ReportStatus; recStatus: RecommendationStatus; execDate: string };
async function runDailyProcess(env: Env, opts?: { force?: boolean }): Promise<DailyProcessResult> {
	const force = Boolean(opts?.force);
	FORCE_NO_STORE = force;
	// 先拿到「交易日」，後面 DB key / 防重複都用這個
	let tradeDate: string;
	let raw: any;
	let summary: string;
	let stocksAll: any[];
	let isTodayReady = false;
	try {
		({ tradeDate, raw, summary, stocksAll, isTodayReady } = await buildDailySummary(env, { noStore: force }));
		await upsertDailyMark(env, tradeDate, isTodayReady ? 'FULL' : 'PARTIAL', isTodayReady ? undefined : `latest_trade_date=${tradeDate}`);
	} catch (e: any) {
		const today = twTodayString();
		const msg = String(e?.message || e);
		// 盤後資料未就緒 / TWSE 格式變動時，不視為錯誤：記錄後直接跳過，等下一次 tick
		const fatal = msg.includes('trade date unresolved') || msg.includes('fetch timeout') || msg.includes('fetch failed');
		if (fatal) {
			console.warn('[TWSE] ABORT:', msg);
			await upsertDailyMark(env, today, 'NONE', `ABORT: ${msg}`);
			return { tradeDate: today, pushed: false, reason: `ABORT: ${msg}`, summaryReady: false, recommendationReady: false, simulationSeeded: false, actionable: false, note: msg, reportStatus: 'MO_ERROR', recStatus: 'ERROR', execDate: nextWeekday(today) };
		}
		console.warn('[TWSE] not ready:', msg);
		const readyLevel: 'NONE' | 'PARTIAL' = msg.includes('stocksCount=') ? 'NONE' : 'PARTIAL';
		await upsertDailyMark(env, today, readyLevel, msg);
		tradeDate = today;
		raw = null;
		summary = '';
		stocksAll = [];
		isTodayReady = false;
		// 不 return：讓後續策略/明日建議仍可嘗試（例如已有人手動 seed / 或使用其他市場）
	}
	// ✅ 盤後摘要落地：只有在「今天盤後資料 ready」時才落地/推播
	// 但策略引擎/明日建議可以用「最新交易日」資料運作（例如隔天早上）。
	let summaryInserted = false;
	let summaryReady = false;
	if (isTodayReady || force) {
		if (!force) {
			const exists = await env.DB.prepare('SELECT 1 FROM twse_daily_summary WHERE date = ? LIMIT 1').bind(tradeDate).first();
			if (!exists) {
				await env.DB.prepare('INSERT INTO twse_daily_raw (date, payload_json) VALUES (?, ?)').bind(tradeDate, JSON.stringify(raw)).run();
				await env.DB.prepare('INSERT INTO twse_daily_summary (date, summary_text) VALUES (?, ?)').bind(tradeDate, summary).run();
				summaryInserted = true;
			}
		} else {
			// force: overwrite
			await env.DB.prepare('INSERT OR REPLACE INTO twse_daily_raw (date, payload_json) VALUES (?, ?)')
				.bind(tradeDate, JSON.stringify(raw))
				.run();
			await env.DB.prepare('INSERT OR REPLACE INTO twse_daily_summary (date, summary_text) VALUES (?, ?)').bind(tradeDate, summary).run();
			summaryInserted = true;
		}
	}
	summaryReady = summaryInserted || (await hasDailySummary(env, tradeDate));
	const reportCheck = validateReportStatus({ tradeDate, isTodayReady, raw, stocksAll, summaryReady });
	const reportStatus = reportCheck.reportStatus;
	console.log(`[REPORT] status=${reportStatus}${reportCheck.reason ? ` reason=${reportCheck.reason}` : ''}`);
	// --- 策略引擎 + 每日快照（策略池 30 萬） ---
	const top5 = raw?.topByValue ?? [];
	const dir = raw?.idx?.dir ?? '持平';
	const concentration = Number(raw?.concentration ?? NaN);
	const up = Number(raw?.breadth?.up ?? 0);
	const down = Number(raw?.breadth?.down ?? 0);
	const flat = Number(raw?.breadth?.flat ?? 0);
	const valid = Number(raw?.breadth?.valid ?? 0);
	// === 多標的推薦 / 模擬成交（FEATURE_MULTI_ASSET） ===
	if (envFlag(env, 'FEATURE_MULTI_ASSET', true)) {
		await ensureMultiAssetTables(env);
		const priceByCode = await buildPriceByCode(stocksAll);
		const activeUniverse = await getActiveUniverse(env);
		const canonicalUniverse = activeUniverse.symbols.map((s) => canonicalSymbol(s)).filter(Boolean);
		if (Array.isArray(stocksAll) && stocksAll.length) {
			const priceWrite = await upsertPricesDailyFromSnapshot(env, tradeDate, stocksAll, canonicalUniverse);
			console.log(`[MO] prices_daily upsert tradeDate=${tradeDate} inserted=${priceWrite.inserted} skipped=${priceWrite.skipped}`);
		}
		let recs: MoRecommendation[] = [];
		const hasSnapshot = Array.isArray(stocksAll) && stocksAll.length > 0;
		if (!hasSnapshot) {
			console.warn('[MO] skip recommendations: no TWSE stock snapshot (orders will not be regenerated).');
		}
		// 先把「前一天的 pending 訂單」用今天 OHLC 嘗試成交（FEATURE_SIM 才做）
		const simOn = envFlag(env, 'FEATURE_SIM', true);
		const execEvents = simOn ? await executePendingOrders(env, tradeDate, priceByCode) : [];
		// 今日產生明日建議（多標的）
		if (hasSnapshot) {
			const signal = decideSignalLevel({ dir, up, down, concentration, valid });
			const universeRows = buildUniverseSnapshotCandidates(stocksAll, activeUniverse.symbols, priceByCode, top5);
			const { recs: nextRecs, debugRows } = await generateRecommendationsMulti(env, {
				tradeDate,
				signal,
				topByValue: top5,
				snapshotCandidates: universeRows,
				priceByCode,
				activeUniverse,
			});
			recs = nextRecs;
			// 只有在有 snapshot 時才會覆寫 PENDING（避免 not-ready 時把既有 seed 清空）
			const persistStats = await persistRecommendations(env, tradeDate, recs);
			await replaceStrategyDebugRows(env, tradeDate, debugRows);
			await persistRecommendationLog(env, {
				tradeDate,
				signal,
				activeUniverse,
				candidateCount: universeRows.length || top5.length,
				recCount: recs.length,
				snapshotCount: stocksAll.length,
				note: `${universeRows.length ? `use_universe ${activeUniverse.source}` : 'fallback_top_by_value'}|inserted=${persistStats.inserted}|deduped=${persistStats.deduped}`,
			});
		}
		// 計算今日資產快照（用收盤）
		const pf = await env.DB.prepare('SELECT * FROM mo_portfolio_state WHERE id=1').first<any>();
		const principal = Number(pf?.principal_twd ?? 300000);
		const cash = Number(pf?.cash_twd ?? principal);
		const positions = await env.DB.prepare('SELECT * FROM mo_positions').all<any>();
		let posValue = 0;
		for (const p of positions?.results ?? []) {
			const row = priceByCode.get(String(p.symbol));
			const close = Number(row?.close);
			if (Number.isFinite(close)) posValue += Number(p.shares) * close;
		}
		const equity = cash + posValue;
		const retPct = principal > 0 ? equity / principal - 1 : 0;
		// 同步寫入你既有 daily_mark（用 symbol 留空，避免破壞既有表）
		await env.DB.prepare(
			`INSERT OR REPLACE INTO daily_mark
			 (trade_date, symbol, close_price, cash_twd, position_shares, position_value_twd, total_equity_twd, return_pct, note)
			 VALUES (?, NULL, NULL, ?, 0, ?, ?, ?, ?)`,
		)
			.bind(
				tradeDate,
				cash,
				posValue,
				equity,
				retPct,
				`${recs.length ? 'multi_asset' : 'multi_asset_no_rec'}|universe=${activeUniverse.symbols.join(',')}|recs=${recs.length}`
			)
			.run();
		// streak/mode（沿用你原本的 strategy_state 來記 streak，方便既有 UI；不影響交易）
		const streak = await updateStreaksAndMode(env, tradeDate, equity);
		const execBlock = execEvents.length
			? `\n\n📌 今日模擬成交\n${execEvents.join('\n')}`
			: simOn
				? `\n\n📌 今日模擬成交\n（無成交 / 無待成交訂單）`
				: `\n\n📌 模擬成交\n（FEATURE_SIM=0，僅產出建議）`;
		const poolBlock =
			`\n\n📊 策略池狀態（30萬｜多標的）\n` +
			`總資產：${Math.round(equity).toLocaleString()} 元\n` +
			`現金：${Math.round(cash).toLocaleString()} 元\n` +
			`持倉市值：${Math.round(posValue).toLocaleString()} 元\n` +
			`累積報酬：${(retPct * 100).toFixed(2)}%\n` +
			`模式：${streak.mode}（連跌 ${streak.conLoss} / 連漲 ${streak.conWin}）`;
		const pendingCountRow = await env.DB.prepare("SELECT COUNT(*) AS c FROM mo_orders WHERE signal_date=? AND status='PENDING'").bind(tradeDate).first<any>();
		const rawRecommendationReady = Number(pendingCountRow?.c ?? 0) > 0;
		const simulationSeeded = execEvents.length > 0 || rawRecommendationReady;
		const execDate = nextWeekday(tradeDate);
		let recommendationReady = false;
		let actionable = false;
		let recStatus: RecommendationStatus = 'NO_CANDIDATE';
		if (reportStatus !== 'VALID') {
			console.log(`[REC] blocked report incomplete tradeDate=${tradeDate}`);
			recStatus = 'BLOCKED_REPORT_INCOMPLETE';
		} else if (rawRecommendationReady) {
			recommendationReady = true;
			actionable = true;
			recStatus = 'READY';
			console.log(`[REC] status=${recStatus} tradeDate=${tradeDate} execDate=${execDate}`);
		} else {
			console.log(`[REC] status=NO_CANDIDATE tradeDate=${tradeDate}`);
		}
		const recText = recommendationReady ? formatRecsForLine(recs) : '';
		if (reportStatus === 'VALID' && (isTodayReady || force)) {
			await linePush(env, `${summary}${execBlock}${recText ? `\n\n${recText}` : ''}${poolBlock}`);
			return { tradeDate, pushed: true, summaryReady, recommendationReady, simulationSeeded, actionable, note: recommendationReady ? 'core_ready_with_report' : 'report_ready_no_recommendation', reportStatus, recStatus, execDate };
		}
		console.log(`[PUSH] skipped report incomplete tradeDate=${tradeDate}`);
		return { tradeDate, pushed: false, reason: reportCheck.reason || 'report_incomplete', summaryReady, recommendationReady, simulationSeeded, actionable, note: recommendationReady ? 'core_ready_report_pending' : 'waiting_recommendation', reportStatus, recStatus, execDate };
	}
	// === 單一標的（舊 v1） ===
	const { actionText, note } = await runStrategyEngine(env, {
		tradeDate,
		dir,
		up,
		down,
		flat,
		valid,
		concentration,
		top5,
	});
	const mark = await writeDailyMark(env, { tradeDate, note, top5 });
	// ✅ streak/mode 更新（避免 streak is not defined）
	const streak = await updateStreaksAndMode(env, tradeDate, mark.equity);
	const poolBlock =
		`\n\n📊 策略池狀態（只看 30 萬）\n` +
		`總資產：${Math.round(mark.equity).toLocaleString()} 元\n` +
		`現金：${Math.round(mark.cash).toLocaleString()} 元\n` +
		`持倉市值：${Math.round(mark.posValue).toLocaleString()} 元\n` +
		`累積報酬：${(mark.retPct * 100).toFixed(2)}%\n` +
		`模式：${streak.mode}（連跌 ${streak.conLoss} / 連漲 ${streak.conWin}）\n` +
		(mark.symbol ? `目前持倉：${mark.symbol}｜約 ${mark.shares} 股（零股）` : `目前持倉：無`);
	const execDate = nextWeekday(tradeDate);
	if (reportStatus === 'VALID' && (isTodayReady || force)) {
		await linePush(env, `${summary}\n\n${actionText}${poolBlock}`);
		return { tradeDate, pushed: true, summaryReady, recommendationReady: true, simulationSeeded: true, actionable: true, note, reportStatus, recStatus: 'READY', execDate };
	}
	console.log(`[PUSH] skipped report incomplete tradeDate=${tradeDate}`);
	console.log(`[REC] blocked report incomplete tradeDate=${tradeDate}`);
	return { tradeDate, pushed: false, reason: reportCheck.reason || 'report_incomplete', summaryReady, recommendationReady: false, simulationSeeded: true, actionable: false, note, reportStatus, recStatus: 'BLOCKED_REPORT_INCOMPLETE', execDate };
}
async function updateStreaksAndMode(
	env: Env,
	tradeDate: string,
	equity: number,
): Promise<{ mode: string; conLoss: number; conWin: number }> {
	const prev = await env.DB.prepare(
		'SELECT trade_date, total_equity_twd FROM daily_mark WHERE trade_date < ? ORDER BY trade_date DESC LIMIT 1',
	)
		.bind(tradeDate)
		.first<any>();
	const st = await env.DB.prepare(
		'SELECT mode, consecutive_losses, COALESCE(consecutive_wins,0) AS consecutive_wins FROM strategy_state WHERE id=1',
	).first<any>();
	let mode = st?.mode || 'NORMAL';
	let conLoss = Number(st?.consecutive_losses ?? 0);
	let conWin = Number(st?.consecutive_wins ?? 0);
	if (prev && Number.isFinite(Number(prev.total_equity_twd))) {
		const prevEq = Number(prev.total_equity_twd);
		if (equity > prevEq) {
			conWin += 1;
			conLoss = 0;
		} else if (equity < prevEq) {
			conLoss += 1;
			conWin = 0;
		}
	}
	if (conLoss >= 3) mode = 'SLOW';
	if (mode === 'SLOW' && conWin >= 2) mode = 'NORMAL';
	await env.DB.prepare("UPDATE strategy_state SET mode=?, consecutive_losses=?, consecutive_wins=?, updated_at=datetime('now') WHERE id=1")
		.bind(mode, conLoss, conWin)
		.run();
	return { mode, conLoss, conWin };
}
type DailyPipelineResult = {
	tradeDate: string;
	pushed: boolean;
	reason: 'normal_pipeline' | 'already_exists' | 'latest_only' | 'push_only' | 'error';
	message?: string;
	summaryReady: boolean;
	recommendationReady: boolean;
	simulationSeeded: boolean;
	actionable: boolean;
	note?: string;
	reportStatus: ReportStatus;
	recStatus: RecommendationStatus;
	execDate: string;
};
// ============================
// Tick dispatcher (15-min cron)
// - 讓 cron 變成「事件分派器」，避免重複推播/重複跑重任務
// - 不靠 migration：用 CREATE TABLE IF NOT EXISTS 確保可直接上線
// ============================
type TickMarkRow = {
	trade_date: string;
	post_close_done: number;
	push_only_done: number;
	updated_at: string;
} | null;
type TickAuditRow = {
	tick_id: string;
	triggered_at: string;
	finished_at: string | null;
	duration_ms: number | null;
	lock_status: string;
	jobs_planned: number;
	jobs_done: number;
	jobs_failed: number;
	summary: string | null;
	error: string | null;
} | null;
type CycleStatus =
	| 'waiting_data'
	| 'core_ready'
	| 'report_ready'
	| 'actionable_ready'
	| 'report_only'
	| 'completed'
	| 'expired';
type MoCycleStateRow = {
	trade_date: string;
	status: CycleStatus;
	data_ready: number;
	summary_ready: number;
	recommendation_ready: number;
	simulation_seeded: number;
	actionable: number;
	report_pushed: number;
	attempt_count: number;
	last_checked_at: string | null;
	deadline_at: string;
	note: string | null;
	updated_at: string;
} | null;
async function ensureCycleStateTable(env: Env): Promise<void> {
	await env.DB.prepare(
		`CREATE TABLE IF NOT EXISTS mo_cycle_state (
			trade_date TEXT PRIMARY KEY,
			status TEXT NOT NULL DEFAULT 'waiting_data',
			data_ready INTEGER NOT NULL DEFAULT 0,
			summary_ready INTEGER NOT NULL DEFAULT 0,
			recommendation_ready INTEGER NOT NULL DEFAULT 0,
			simulation_seeded INTEGER NOT NULL DEFAULT 0,
			actionable INTEGER NOT NULL DEFAULT 0,
			report_pushed INTEGER NOT NULL DEFAULT 0,
			attempt_count INTEGER NOT NULL DEFAULT 0,
			last_checked_at TEXT,
			deadline_at TEXT NOT NULL,
			note TEXT,
			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`
	).run();
	await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_mo_cycle_state_status ON mo_cycle_state(status, trade_date DESC)').run();
}
async function getCycleState(env: Env, tradeDate: string): Promise<MoCycleStateRow> {
	const row = await env.DB.prepare(
		'SELECT trade_date, status, data_ready, summary_ready, recommendation_ready, simulation_seeded, actionable, report_pushed, attempt_count, last_checked_at, deadline_at, note, updated_at FROM mo_cycle_state WHERE trade_date=? LIMIT 1',
	).bind(tradeDate).first<any>();
	if (!row) return null;
	return {
		trade_date: String(row.trade_date),
		status: String(row.status || 'waiting_data') as CycleStatus,
		data_ready: Number(row.data_ready || 0),
		summary_ready: Number(row.summary_ready || 0),
		recommendation_ready: Number(row.recommendation_ready || 0),
		simulation_seeded: Number(row.simulation_seeded || 0),
		actionable: Number(row.actionable || 0),
		report_pushed: Number(row.report_pushed || 0),
		attempt_count: Number(row.attempt_count || 0),
		last_checked_at: row.last_checked_at ? String(row.last_checked_at) : null,
		deadline_at: String(row.deadline_at || cycleDeadlineForTradeDate(tradeDate)),
		note: row.note == null ? null : String(row.note),
		updated_at: String(row.updated_at || ''),
	};
}
async function getLatestOpenCycle(env: Env): Promise<MoCycleStateRow> {
	const row = await env.DB.prepare(
		"SELECT trade_date, status, data_ready, summary_ready, recommendation_ready, simulation_seeded, actionable, report_pushed, attempt_count, last_checked_at, deadline_at, note, updated_at FROM mo_cycle_state WHERE status NOT IN ('completed','expired') ORDER BY trade_date DESC LIMIT 1",
	).first<any>();
	if (!row) return null;
	return {
		trade_date: String(row.trade_date),
		status: String(row.status || 'waiting_data') as CycleStatus,
		data_ready: Number(row.data_ready || 0),
		summary_ready: Number(row.summary_ready || 0),
		recommendation_ready: Number(row.recommendation_ready || 0),
		simulation_seeded: Number(row.simulation_seeded || 0),
		actionable: Number(row.actionable || 0),
		report_pushed: Number(row.report_pushed || 0),
		attempt_count: Number(row.attempt_count || 0),
		last_checked_at: row.last_checked_at ? String(row.last_checked_at) : null,
		deadline_at: String(row.deadline_at || cycleDeadlineForTradeDate(String(row.trade_date))),
		note: row.note == null ? null : String(row.note),
		updated_at: String(row.updated_at || ''),
	};
}
async function upsertCycleState(
	env: Env,
	tradeDate: string,
	patch: Partial<Omit<NonNullable<MoCycleStateRow>, 'trade_date' | 'updated_at'>> & { incrementAttempt?: boolean },
): Promise<void> {
	const existing = await getCycleState(env, tradeDate);
	const next = {
		status: patch.status ?? existing?.status ?? ('waiting_data' as CycleStatus),
		data_ready: patch.data_ready ?? existing?.data_ready ?? 0,
		summary_ready: patch.summary_ready ?? existing?.summary_ready ?? 0,
		recommendation_ready: patch.recommendation_ready ?? existing?.recommendation_ready ?? 0,
		simulation_seeded: patch.simulation_seeded ?? existing?.simulation_seeded ?? 0,
		actionable: patch.actionable ?? existing?.actionable ?? 0,
		report_pushed: patch.report_pushed ?? existing?.report_pushed ?? 0,
		attempt_count: (existing?.attempt_count ?? 0) + (patch.incrementAttempt ? 1 : 0),
		last_checked_at: patch.last_checked_at ?? isoNowTaipei(),
		deadline_at: patch.deadline_at ?? existing?.deadline_at ?? cycleDeadlineForTradeDate(tradeDate),
		note: patch.note ?? existing?.note ?? null,
	};
	await env.DB.prepare(
		`INSERT INTO mo_cycle_state (trade_date, status, data_ready, summary_ready, recommendation_ready, simulation_seeded, actionable, report_pushed, attempt_count, last_checked_at, deadline_at, note, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
		 ON CONFLICT(trade_date) DO UPDATE SET
		   status=excluded.status,
		   data_ready=excluded.data_ready,
		   summary_ready=excluded.summary_ready,
		   recommendation_ready=excluded.recommendation_ready,
		   simulation_seeded=excluded.simulation_seeded,
		   actionable=excluded.actionable,
		   report_pushed=excluded.report_pushed,
		   attempt_count=excluded.attempt_count,
		   last_checked_at=excluded.last_checked_at,
		   deadline_at=excluded.deadline_at,
		   note=excluded.note,
		   updated_at=datetime('now')`
	).bind(
		tradeDate,
		next.status,
		next.data_ready,
		next.summary_ready,
		next.recommendation_ready,
		next.simulation_seeded,
		next.actionable,
		next.report_pushed,
		next.attempt_count,
		next.last_checked_at,
		next.deadline_at,
		next.note,
	).run();
}
async function expireOverdueCycles(env: Env): Promise<void> {
	const now = isoNowTaipei();
	await env.DB.prepare(
		"UPDATE mo_cycle_state SET status=CASE WHEN summary_ready=1 OR recommendation_ready=1 THEN 'report_only' ELSE 'expired' END, note=COALESCE(note,'deadline_reached'), updated_at=datetime('now') WHERE status NOT IN ('completed','expired','report_only') AND deadline_at < ?",
	).bind(now).run();
}
async function ensureTickMarksTable(env: Env): Promise<void> {
	await env.DB.prepare(
		"CREATE TABLE IF NOT EXISTS mo_tick_marks (trade_date TEXT PRIMARY KEY, post_close_done INTEGER NOT NULL DEFAULT 0, push_only_done INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')))",
	).run();
}
async function ensureTickAuditTable(env: Env): Promise<void> {
	await env.DB.prepare(
		"CREATE TABLE IF NOT EXISTS mo_tick_audit (tick_id TEXT PRIMARY KEY, triggered_at TEXT NOT NULL DEFAULT (datetime('now')), finished_at TEXT, duration_ms INTEGER, lock_status TEXT NOT NULL DEFAULT 'unknown', jobs_planned INTEGER NOT NULL DEFAULT 0, jobs_done INTEGER NOT NULL DEFAULT 0, jobs_failed INTEGER NOT NULL DEFAULT 0, summary TEXT, error TEXT)",
	).run();
	await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_mo_tick_audit_triggered_at ON mo_tick_audit(triggered_at)').run();
}
function tickId15m(tradeDate: string, hh: number, mm: number): string {
	const m15 = Math.floor(mm / 15) * 15;
	return `${tradeDate.replace(/-/g, '')}-${String(hh).padStart(2, '0')}${String(m15).padStart(2, '0')}`;
}
async function tryAcquireTickLock(env: Env, tickId: string, jobsPlanned: number, summary: string): Promise<boolean> {
	try {
		await env.DB.prepare("INSERT INTO mo_tick_audit (tick_id, lock_status, jobs_planned, summary) VALUES (?, 'acquired', ?, ?)")
			.bind(tickId, jobsPlanned, summary)
			.run();
		return true;
	} catch (e: any) {
		const msg = String(e?.message || e).toLowerCase();
		if (msg.includes('unique') || msg.includes('constraint')) {
			// Duplicate tick: mark once and exit fast.
			await env.DB.prepare("UPDATE mo_tick_audit SET lock_status='skipped_duplicate', summary=COALESCE(summary,'') WHERE tick_id=?")
				.bind(tickId)
				.run();
			return false;
		}
		throw e;
	}
}
async function finishTickAudit(
	env: Env,
	tickId: string,
	patch: { durationMs: number; jobsDone: number; jobsFailed: number; summary: string; error?: string | null },
): Promise<void> {
	await env.DB.prepare(
		"UPDATE mo_tick_audit SET finished_at=datetime('now'), duration_ms=?, jobs_done=?, jobs_failed=?, summary=?, error=?, lock_status=CASE WHEN lock_status='acquired' THEN 'finished' ELSE lock_status END WHERE tick_id=?",
	)
		.bind(patch.durationMs, patch.jobsDone, patch.jobsFailed, patch.summary, patch.error || null, tickId)
		.run();
}
async function getTickMark(env: Env, tradeDate: string): Promise<TickMarkRow> {
	const row = await env.DB.prepare(
		'SELECT trade_date, post_close_done, push_only_done, updated_at FROM mo_tick_marks WHERE trade_date=? LIMIT 1',
	)
		.bind(tradeDate)
		.first<any>();
	if (!row) return null;
	return {
		trade_date: String(row.trade_date),
		post_close_done: Number(row.post_close_done || 0),
		push_only_done: Number(row.push_only_done || 0),
		updated_at: String(row.updated_at || ''),
	};
}
async function upsertTickMark(env: Env, tradeDate: string, patch: { postCloseDone?: boolean; pushOnlyDone?: boolean }): Promise<void> {
	const existing = await getTickMark(env, tradeDate);
	const postCloseDone = patch.postCloseDone != null ? (patch.postCloseDone ? 1 : 0) : (existing?.post_close_done ?? 0);
	const pushOnlyDone = patch.pushOnlyDone != null ? (patch.pushOnlyDone ? 1 : 0) : (existing?.push_only_done ?? 0);
	await env.DB.prepare(
		"INSERT INTO mo_tick_marks (trade_date, post_close_done, push_only_done, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(trade_date) DO UPDATE SET post_close_done=excluded.post_close_done, push_only_done=excluded.push_only_done, updated_at=datetime('now')",
	)
		.bind(tradeDate, postCloseDone, pushOnlyDone)
		.run();
}
/**
 * Tick (每 15 分鐘) 的唯一入口：判斷「現在該做什麼」，只做一次。
 * - Cycle window：14:30 ~ 隔日 09:00 前持續重試，直到 core data / recommendation ready 或 deadline reached
 * - Push-only：16:00–23:30（一天只重推播一次，避免 spam）
 */
async function dispatchTick(env: Env): Promise<void> {
	const tradeDate = twTodayString();
	const { hh, mm } = twNowHM();
	const startedAt = Date.now();
	await ensureTickMarksTable(env);
	await ensureTickAuditTable(env);
	await ensureCycleStateTable(env);
	await expireOverdueCycles(env);
	const mark = await getTickMark(env, tradeDate);
	const inCycleWindow = inExtendedCycleWindow(hh, mm);
	const inPushOnly = !isWeekend(tradeDate) && inWindow(hh, mm, 16, 0, 23, 30);
	const jobsPlanned = (inCycleWindow ? 1 : 0) + (inPushOnly ? 1 : 0);
	const tickId = tickId15m(tradeDate, hh, mm);
	const lockSummary = `tick=${tickId} t=${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} cycle=${inCycleWindow ? 'Y' : 'N'} pushOnly=${inPushOnly ? 'Y' : 'N'}`;
	const acquired = await tryAcquireTickLock(env, tickId, jobsPlanned, lockSummary);
	if (!acquired) {
		console.log(`tick: skipped duplicate tickId=${tickId}`);
		return;
	}
	let jobsDone = 0;
	let jobsFailed = 0;
	let finalSummary = lockSummary;
	let finalError: string | null = null;
	if (inCycleWindow) {
		try {
			const result = await runDailyPipeline(env, tradeDate);
			if (result.reason === 'error') {
				jobsFailed += 1;
				finalError = `cycle_err: ${result.message || 'unknown'}`;
				finalSummary += ` | cycle=error`;
				console.log(`tick: cycle error. tradeDate=${tradeDate} err=${result.message || ''}`);
			} else if (result.reason === 'latest_only') {
				finalSummary += ` | cycle=waiting(summary=${result.summaryReady ? 'Y' : 'N'},rec=${result.recommendationReady ? 'Y' : 'N'},sim=${result.simulationSeeded ? 'Y' : 'N'})`;
				console.log(`tick: cycle waiting. tradeDate=${result.tradeDate}`);
			} else {
				if (result.summaryReady) await upsertTickMark(env, result.tradeDate, { postCloseDone: true });
				jobsDone += 1;
				finalSummary += ` | cycle=done(summary=${result.summaryReady ? 'Y' : 'N'},rec=${result.recommendationReady ? 'Y' : 'N'},sim=${result.simulationSeeded ? 'Y' : 'N'},actionable=${result.actionable ? 'Y' : 'N'},reason=${result.reason})`;
				console.log(`tick: cycle done. tradeDate=${result.tradeDate} actionable=${result.actionable} reason=${result.reason}`);
			}
		} catch (e: any) {
			jobsFailed += 1;
			finalError = `cycle_err: ${String(e?.message || e)}`;
			finalSummary += ` | cycle=error`;
			console.log(`tick: cycle error. tradeDate=${tradeDate} err=${String(e?.message || e)}`);
		}
	}
	if (inPushOnly && !(mark?.push_only_done === 1)) {
		try {
			const pushResult = await adminPushOnly(env, tradeDate);
			jobsDone += 1;
			if (pushResult.pushed) {
				finalSummary += ` | push_only=done`;
				console.log(`tick: push_only done. tradeDate=${tradeDate}`);
			} else {
				finalSummary += ` | push_only=skip(reason=${pushResult.reason})`;
				console.log(`tick: push_only skipped. tradeDate=${tradeDate} reason=${pushResult.reason}`);
			}
		} catch (e: any) {
			jobsFailed += 1;
			finalError = finalError || `push_only_err: ${String(e?.message || e)}`;
			finalSummary += ` | push_only=error`;
			console.log(`tick: push_only error. tradeDate=${tradeDate} err=${String(e?.message || e)}`);
		}
	}
	console.log(`tick: heartbeat tradeDate=${tradeDate} time=${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
	await finishTickAudit(env, tickId, {
		durationMs: Date.now() - startedAt,
		jobsDone,
		jobsFailed,
		summary: finalSummary,
		error: finalError,
	});
}
/**
 * 這個函式要做的事很單純：
 * - 直接呼叫正常 daily process
 * - 每次 tick 都可以重試，但會把 cycle state 寫進 D1
 */
async function runDailyPipeline(env: Env, tradeDate: string): Promise<DailyPipelineResult> {
	try {
		const out = await runDailyProcess(env, { force: false });
		const status: CycleStatus = out.actionable
			? 'actionable_ready'
			: out.summaryReady && out.recommendationReady
				? 'core_ready'
				: out.summaryReady
					? 'report_ready'
					: out.recommendationReady
						? 'core_ready'
						: 'waiting_data';
		await upsertCycleState(env, out.tradeDate, {
			status,
			data_ready: out.summaryReady || out.recommendationReady ? 1 : 0,
			summary_ready: out.summaryReady ? 1 : 0,
			recommendation_ready: out.recommendationReady ? 1 : 0,
			simulation_seeded: out.simulationSeeded ? 1 : 0,
			actionable: out.actionable ? 1 : 0,
			report_pushed: out.pushed ? 1 : 0,
			deadline_at: cycleDeadlineForTradeDate(out.tradeDate),
			note: out.note ?? out.reason ?? null,
			incrementAttempt: true,
		});
		if (out.reason === 'latest_only') {
			return { tradeDate: out.tradeDate, pushed: false, reason: 'latest_only', summaryReady: out.summaryReady, recommendationReady: out.recommendationReady, simulationSeeded: out.simulationSeeded, actionable: out.actionable, note: out.note, reportStatus: out.reportStatus, recStatus: out.recStatus, execDate: out.execDate };
		}
		const reason = out.reason === 'already_exists' ? 'already_exists' : 'normal_pipeline';
		return { tradeDate: out.tradeDate, pushed: out.pushed, reason, summaryReady: out.summaryReady, recommendationReady: out.recommendationReady, simulationSeeded: out.simulationSeeded, actionable: out.actionable, note: out.note, reportStatus: out.reportStatus, recStatus: out.recStatus, execDate: out.execDate };
	} catch (e: any) {
		await upsertCycleState(env, tradeDate, {
			status: 'waiting_data',
			deadline_at: cycleDeadlineForTradeDate(tradeDate),
			note: String(e?.message || e),
			incrementAttempt: true,
		});
		return { tradeDate, pushed: false, reason: 'error', message: String(e?.message || e), summaryReady: false, recommendationReady: false, simulationSeeded: false, actionable: false, reportStatus: 'MO_ERROR', recStatus: 'ERROR', execDate: nextWeekday(tradeDate) };
	}
}
async function hasDailySummary(env: Env, tradeDate: string): Promise<boolean> {
	const r = await env.DB.prepare(
		`
    SELECT summary_text
    FROM twse_daily_summary
    WHERE date = ?
    LIMIT 1
  `,
	)
		.bind(tradeDate)
		.first<any>();
	if (!r) return false;
	const txt = String(r.summary_text || '').trim();
	return txt.length > 0;
}
export default {
	async fetch(req: Request, env: Env) {
		const url = new URL(req.url);
		// LINE webhook
		if (url.pathname === '/webhook') {
			let body: any;
			try {
				body = await req.json();
			} catch (e) {
				console.warn('[LINE] invalid json');
				return new Response('OK');
			}
			const events: any[] = Array.isArray(body?.events) ? body.events : [];
			console.log(`[LINE] webhook events=${events.length}`);
			// 只做「快速 reply」：避免 replyToken 超時
			for (const ev of events) {
				const replyToken = String(ev?.replyToken || '');
				const type = String(ev?.type || '');
				const msgType = String(ev?.message?.type || '');
				const text = safeText(ev?.message?.text);
				console.log(`[LINE] event type=${type} msgType=${msgType} hasReplyToken=${Boolean(replyToken)}`);
				if (!replyToken || type !== 'message' || msgType !== 'text') continue;
				try {
					const t = text.toLowerCase().replace(/\s+/g, ' ').trim();
					let out = '';
					if (t === 'status' || t === 'mo status' || t === '狀態' || t === 'mo狀態' || t === 'mo 狀態') {
						out = await buildStatusText(env);
					} else if (t === 'report' || t === 'mo report' || t === '最新報告' || t === '報告' || t === 'mo報告' || t === 'mo 報告' || t === '本週報告' || t === '昨日' || t === 'yesterday' || t === '盤後') {
						out = await buildYesterdayReport(env);
					} else if (t === 'signals' || t === 'signal' || t === 'recommend' || t === 'recs' || t === '建議' || t === '推薦' || t === '明日建議' || t === '明日' || t === 'mo 建議' || t === 'mo建議') {
						out = await buildLatestRecs(env);
					} else if (t === 'portfolio' || t === '持倉' || t === '持股' || t === '倉位' || t === '部位' || t === 'mo 持倉' || t === 'mo持倉') {
						out = await buildPortfolioText(env);
					} else if (t === 'help' || t === 'mo help' || t === '幫助' || t === '說明' || t === '?') {
						out = ['MO 指令（LINE）', '1) 狀態 / status', '2) 報告 / 最新報告 / report', '3) 建議 / 推薦 / signals', '4) 持倉 / portfolio', '5) 幫助 / help', '', '狀態會顯示盤後資料預估與分析/推薦預估時間。'].join('\n');
					} else {
						out = '可用指令：狀態 / 報告 / 建議 / 持倉 / help';
					}
					await lineReply(env, replyToken, out.slice(0, 4900));
					console.log('[LINE] reply ok');
				} catch (e: any) {
					console.error('[LINE] reply failed:', e?.message || e);
				}
			}
			return new Response('OK');
		}
		if (url.pathname === '/admin/status') {
			const token = url.searchParams.get('token') || '';
			if (!env.ADMIN_TOKEN) return new Response('ADMIN_TOKEN not set', { status: 500 });
			if (token !== env.ADMIN_TOKEN) return new Response('Forbidden', { status: 403 });
			try {
				return new Response(await buildAdminStatusText(env));
			} catch (e) {
				return new Response('ERR: ' + String(e), { status: 500 });
			}
		}
		if (url.pathname === '/admin/review/status') {
			const token = url.searchParams.get('token') || '';
			if (!env.ADMIN_TOKEN) return new Response('ADMIN_TOKEN not set', { status: 500 });
			if (token !== env.ADMIN_TOKEN) return new Response('Forbidden', { status: 403 });
			try {
				const referenceTradeDate = safeText(url.searchParams.get('trade_date')) || (await resolveEffectiveTradeDate(env));
				const lines = await buildReviewAdminAuditLines(env, referenceTradeDate);
				return new Response([`market-observer review status version=${APP_VERSION}`, ...lines].join('\n'));
			} catch (e) {
				return new Response('ERR: ' + String(e), { status: 500 });
			}
		}
		if (url.pathname === '/admin/simulation/preview') {
			const token = url.searchParams.get('token') || '';
			if (!env.ADMIN_TOKEN) return new Response('ADMIN_TOKEN not set', { status: 500 });
			if (token !== env.ADMIN_TOKEN) return new Response('Forbidden', { status: 403 });
			try {
				const preview = await previewLatestSimulation(env);
				const lines = [
					`simulation preview version=${APP_VERSION}`,
					`signalDate=${preview.signalDate || '-'}`,
					`execDate=${preview.execDate || '-'}`,
					`pendingCount=${preview.pendingCount}`,
					`fillPolicy=${preview.fillPolicy}`,
					`cashBefore=${Math.round(preview.cashBefore).toLocaleString()}`,
					`cashAfter=${Math.round(preview.cashAfter).toLocaleString()}`,
					'',
					'events:',
					...(preview.events.length ? preview.events : ['(none)']),
					'',
					'positionsAfter:',
					...(preview.positionsAfter.length
						? preview.positionsAfter.map((p) => `${p.symbol} shares=${p.shares} avg=${round2(p.avg_cost)}`)
						: ['(empty)']),
				];
				return new Response(lines.join('\n'));
			} catch (e) {
				return new Response('ERR: ' + String(e), { status: 500 });
			}
		}
		if (url.pathname === '/admin/execution/audit') {
			const token = url.searchParams.get('token') || '';
			if (!env.ADMIN_TOKEN) return new Response('ADMIN_TOKEN not set', { status: 500 });
			if (token !== env.ADMIN_TOKEN) return new Response('Forbidden', { status: 403 });
			try {
				return new Response(await buildExecutionAuditText(env));
			} catch (e) {
				return new Response('ERR: ' + String(e), { status: 500 });
			}
		}
		if (url.pathname === '/admin/simulation/commit') {
			const token = url.searchParams.get('token') || '';
			if (!env.ADMIN_TOKEN) return new Response('ADMIN_TOKEN not set', { status: 500 });
			if (token !== env.ADMIN_TOKEN) return new Response('Forbidden', { status: 403 });
			try {
				return new Response(await commitLatestSimulationSandbox(env));
			} catch (e) {
				return new Response('ERR: ' + String(e), { status: 500 });
			}
		}
		if (url.pathname === '/admin/simulation/reset') {
			const token = url.searchParams.get('token') || '';
			if (!env.ADMIN_TOKEN) return new Response('ADMIN_TOKEN not set', { status: 500 });
			if (token !== env.ADMIN_TOKEN) return new Response('Forbidden', { status: 403 });
			try {
				return new Response(await resetLatestSimulationSandbox(env));
			} catch (e) {
				return new Response('ERR: ' + String(e), { status: 500 });
			}
		}
		if (url.pathname === '/admin/exit/sandbox/preview') {
			const token = url.searchParams.get('token') || '';
			if (!env.ADMIN_TOKEN) return new Response('ADMIN_TOKEN not set', { status: 500 });
			if (token !== env.ADMIN_TOKEN) return new Response('Forbidden', { status: 403 });
			try {
				return new Response(await buildExitSandboxPreviewText(env));
			} catch (e) {
				return new Response('ERR: ' + String(e), { status: 500 });
			}
		}
		if (url.pathname === '/admin/version') {
			const token = url.searchParams.get('token') || '';
			if (env.ADMIN_TOKEN && token && token !== env.ADMIN_TOKEN) return new Response('Forbidden', { status: 403 });
			return new Response(`market-observer version=${APP_VERSION}`);
		}
		// 手動觸發：/admin/run?token=XXX&force=1
		if (url.pathname === '/admin/run') {
			const token = url.searchParams.get('token') || '';
			if (!env.ADMIN_TOKEN) return new Response('ADMIN_TOKEN not set', { status: 500 });
			if (token !== env.ADMIN_TOKEN) return new Response('Forbidden', { status: 403 });
			const tradeDate = url.searchParams.get('date') || twTodayString();
			const pushOnly = url.searchParams.get('push') === '1';
			if (pushOnly) {
				const result = await adminPushOnly(env, tradeDate);
				return new Response(result.message, { status: 200 });
			}
			const force = url.searchParams.get('force') === '1' || url.searchParams.get('force') === 'true';
			try {
				const r = await runDailyProcess(env, { force });
				return new Response(`OK admin run. version=${APP_VERSION} tradeDate=${r.tradeDate} pushed=${r.pushed}${r.reason ? ' reason=' + r.reason : ''} summary=${r.summaryReady ? 'Y' : 'N'} rec=${r.recommendationReady ? 'Y' : 'N'} sim=${r.simulationSeeded ? 'Y' : 'N'} actionable=${r.actionable ? 'Y' : 'N'} reportStatus=${r.reportStatus} recStatus=${r.recStatus} execDate=${r.execDate}`);
			} catch (e) {
				return new Response('ERR: ' + String(e), { status: 500 });
			}
		}
		if (url.pathname === '/health') return new Response('ok');
		return new Response(`market-observer running v${APP_VERSION}`);
	},
	async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
		try {
			await dispatchTick(env);
		} catch (e: any) {
			console.error('scheduled error:', e?.stack || e);
		}
	},
};
