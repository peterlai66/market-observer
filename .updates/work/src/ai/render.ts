import type { Env } from '../index';
import { getLatestReviewBatchExact, getLatestReviewItemsExactLimited } from '../review/runtime';

function safeText(v: unknown): string {
	return String(v ?? '').replace(/\s+/g, ' ').trim();
}

export async function buildAiStatusPayload(env: Env): Promise<Record<string, unknown>> {
	const tick = await env.DB.prepare(
		'SELECT tick_id, triggered_at, lock_status, jobs_done, jobs_failed, duration_ms, summary, error FROM mo_tick_audit ORDER BY triggered_at DESC LIMIT 1',
	).first<any>();
	const daily = await env.DB.prepare(
		'SELECT trade_date, ready_level, pushed_at, note, updated_at FROM mo_daily_mark ORDER BY updated_at DESC LIMIT 1',
	).first<any>();
	const cycle = await env.DB.prepare(
		"SELECT trade_date, status, data_ready, summary_ready, recommendation_ready, simulation_seeded, actionable, attempt_count, deadline_at, note FROM mo_cycle_state ORDER BY trade_date DESC LIMIT 1",
	).first<any>().catch(() => null);
	const recLog = await env.DB.prepare(
		"SELECT trade_date, signal, candidate_count, rec_count, universe_source, universe_symbols, note FROM mo_recommendation_log ORDER BY id DESC LIMIT 1",
	).first<any>().catch(() => null);
	const orderStats = await env.DB.prepare(
		"SELECT status, COUNT(*) AS c FROM mo_orders WHERE signal_date=(SELECT MAX(signal_date) FROM mo_orders) GROUP BY status",
	).all<any>().catch(() => ({ results: [] }));
	const portfolio = await env.DB.prepare(
		'SELECT cash_twd, nav_twd FROM mo_portfolio_state ORDER BY id DESC LIMIT 1',
	).first<any>().catch(() => null);
	const posCount = await env.DB.prepare('SELECT COUNT(*) AS c FROM mo_positions').first<any>().catch(() => null);
	const aiAudit = await env.DB.prepare(
		'SELECT called_at, kind, model, enabled, ok, status_code, duration_ms, response_chars, error, request_id FROM mo_ai_audit ORDER BY id DESC LIMIT 1',
	).first<any>().catch(() => null);

	const stats: Record<string, number> = {};
	for (const row of orderStats?.results ?? []) {
		stats[String(row?.status ?? 'UNKNOWN')] = Number(row?.c ?? 0);
	}

	return {
		tick: tick
			? {
				tick_id: safeText(tick.tick_id),
				lock_status: safeText(tick.lock_status),
				jobs_done: Number(tick.jobs_done ?? 0),
				jobs_failed: Number(tick.jobs_failed ?? 0),
				duration_ms: Number(tick.duration_ms ?? 0),
				error: safeText(tick.error),
			}
			: null,
		daily: daily
			? {
				trade_date: safeText(daily.trade_date),
				ready_level: safeText(daily.ready_level),
				pushed: Boolean(daily.pushed_at),
				note: safeText(daily.note),
			}
			: null,
		cycle: cycle
			? {
				trade_date: safeText(cycle.trade_date),
				status: safeText(cycle.status),
				data_ready: Number(cycle.data_ready ?? 0),
				summary_ready: Number(cycle.summary_ready ?? 0),
				recommendation_ready: Number(cycle.recommendation_ready ?? 0),
				simulation_seeded: Number(cycle.simulation_seeded ?? 0),
				actionable: Number(cycle.actionable ?? 0),
				attempt_count: Number(cycle.attempt_count ?? 0),
				deadline_at: safeText(cycle.deadline_at),
				note: safeText(cycle.note),
			}
			: null,
		recommendation: recLog
			? {
				trade_date: safeText(recLog.trade_date),
				signal: safeText(recLog.signal),
				candidate_count: Number(recLog.candidate_count ?? 0),
				rec_count: Number(recLog.rec_count ?? 0),
				universe_source: safeText(recLog.universe_source),
				universe_symbols: safeText(recLog.universe_symbols),
				note: safeText(recLog.note),
			}
			: null,
		orders: stats,
		ai: aiAudit
			? {
				called_at: safeText(aiAudit.called_at),
				kind: safeText(aiAudit.kind),
				model: safeText(aiAudit.model),
				enabled: Number(aiAudit.enabled ?? 0),
				ok: Number(aiAudit.ok ?? 0),
				status_code: aiAudit.status_code == null ? null : Number(aiAudit.status_code),
				duration_ms: aiAudit.duration_ms == null ? null : Number(aiAudit.duration_ms),
				response_chars: aiAudit.response_chars == null ? null : Number(aiAudit.response_chars),
				error: safeText(aiAudit.error),
				request_id: safeText(aiAudit.request_id),
			}
			: null,
		portfolio: {
			cash_twd: Number(portfolio?.cash_twd ?? 0),
			nav_twd: Number(portfolio?.nav_twd ?? 0),
			position_count: Number(posCount?.c ?? 0),
		},
	};
}

export async function buildAiReportPayload(env: Env): Promise<Record<string, unknown>> {
	const [summary, cycle, recLog] = await Promise.all([
		env.DB.prepare('SELECT date, summary_text FROM twse_daily_summary ORDER BY date DESC LIMIT 1').first<any>().catch(() => null),
		env.DB.prepare(
			"SELECT trade_date, status, deadline_at, note, summary_ready, recommendation_ready, simulation_seeded, actionable FROM mo_cycle_state ORDER BY trade_date DESC LIMIT 1",
		).first<any>().catch(() => null),
		env.DB.prepare(
			"SELECT trade_date, signal, candidate_count, rec_count, universe_source, note FROM mo_recommendation_log ORDER BY id DESC LIMIT 1",
		).first<any>().catch(() => null),
	]);
	const reviewTradeDate = safeText(recLog?.trade_date);
	const [reviewBatch, reviewItems] = await Promise.all([
		reviewTradeDate ? getLatestReviewBatchExact(env, reviewTradeDate) : Promise.resolve(null),
		reviewTradeDate ? getLatestReviewItemsExactLimited(env, reviewTradeDate, 5) : Promise.resolve([]),
	]);
	return {
		cycle: cycle
			? {
				trade_date: safeText(cycle.trade_date),
				status: safeText(cycle.status),
				deadline_at: safeText(cycle.deadline_at),
				note: safeText(cycle.note),
				summary_ready: Number(cycle.summary_ready ?? 0),
				recommendation_ready: Number(cycle.recommendation_ready ?? 0),
				simulation_seeded: Number(cycle.simulation_seeded ?? 0),
				actionable: Number(cycle.actionable ?? 0),
			}
			: null,
		report: summary
			? {
				date: safeText(summary.date),
				summary_text: safeText(summary.summary_text),
			}
			: null,
		review_batch: reviewBatch
			? {
				trade_date: safeText(reviewBatch.trade_date),
				review_generated_at: safeText(reviewBatch.review_generated_at),
				review_universe: Number(reviewBatch.review_universe ?? 0),
				available_trade_dates: Number(reviewBatch.available_trade_dates ?? 0),
				max_review_horizon: Number(reviewBatch.max_review_horizon ?? 0),
				available_checkpoints: safeText(reviewBatch.available_checkpoints),
				pending_checkpoints: safeText(reviewBatch.pending_checkpoints),
				summary_note: safeText(reviewBatch.summary_note),
			}
			: null,
		review_items: reviewItems.map((row: any) => ({
			trade_date: safeText(row.trade_date),
			symbol: safeText(row.symbol),
			name: safeText(row.name),
			order_status: safeText(row.order_status),
			d0_return: row.d0_return == null ? null : Number(row.d0_return),
			d5_return: row.d5_return == null ? null : Number(row.d5_return),
			d10_return: row.d10_return == null ? null : Number(row.d10_return),
			d20_return: row.d20_return == null ? null : Number(row.d20_return),
			review_note: safeText(row.review_note),
		})),
		recommendation: recLog
			? {
				trade_date: safeText(recLog.trade_date),
				signal: safeText(recLog.signal),
				candidate_count: Number(recLog.candidate_count ?? 0),
				rec_count: Number(recLog.rec_count ?? 0),
				universe_source: safeText(recLog.universe_source),
				note: safeText(recLog.note),
			}
			: null,
	};
}

export async function buildAiRecommendationPayload(env: Env): Promise<Record<string, unknown>> {
	const latest = await env.DB.prepare(
		"SELECT signal_date AS d FROM mo_orders WHERE status='PENDING' ORDER BY signal_date DESC LIMIT 1",
	).first<any>();
	const cycle = await env.DB.prepare(
		"SELECT trade_date, status, deadline_at, note FROM mo_cycle_state ORDER BY trade_date DESC LIMIT 1",
	).first<any>().catch(() => null);
	if (!latest?.d) return { signal_date: null, cycle: cycle ? { trade_date: safeText(cycle.trade_date), status: safeText(cycle.status), deadline_at: safeText(cycle.deadline_at), note: safeText(cycle.note) } : null, recommendations: [] };
	const rows = await env.DB.prepare(
		"SELECT side, symbol, name, entry_low, entry_high, qty, reason, weight_pct, score FROM mo_orders WHERE status='PENDING' AND signal_date=? ORDER BY rowid ASC",
	)
		.bind(latest.d)
		.all<any>();
	return {
		signal_date: safeText(latest.d),
		cycle: cycle ? { trade_date: safeText(cycle.trade_date), status: safeText(cycle.status), deadline_at: safeText(cycle.deadline_at), note: safeText(cycle.note) } : null,
		recommendations: (rows?.results ?? []).map((r: any) => ({
			side: safeText(r.side),
			symbol: safeText(r.symbol),
			name: safeText(r.name),
			entry_low: Number(r.entry_low ?? 0),
			entry_high: Number(r.entry_high ?? 0),
			qty: Number(r.qty ?? 0),
			weight_pct: Number(r.weight_pct ?? 0),
			score: Number(r.score ?? 0),
			reason: safeText(r.reason),
		})),
	};
}
