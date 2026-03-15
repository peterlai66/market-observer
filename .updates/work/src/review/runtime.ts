import type { Env } from '../index';

export type ReviewProgressView = {
	tradeDate: string;
	availableTradeDates: number;
	maxReviewHorizon: number;
	availableCheckpoints: string;
	pendingCheckpoints: string;
	summaryNote: string;
	source: 'snapshot' | 'live_projection';
	needsRefresh: boolean;
	projectedThroughDate: string;
	savedReviewTradeDate: string;
	savedReviewHorizon: number;
};

export const REVIEW_CHECKPOINTS = [0, 5, 10, 20] as const;

function safeText(v: unknown): string {
	return String(v ?? '').replace(/\s+/g, ' ').trim();
}

export function formatCheckpointLabels(maxReviewHorizon: number): { available: string; pending: string } {
	return {
		available: REVIEW_CHECKPOINTS.filter((cp) => cp <= maxReviewHorizon).map((cp) => `D${cp}`).join(', '),
		pending: REVIEW_CHECKPOINTS.filter((cp) => cp > maxReviewHorizon).map((cp) => `D${cp}`).join(', '),
	};
}

export async function getLatestReviewBatchExact(env: Env, tradeDate: string): Promise<any | null> {
	const normalizedTradeDate = safeText(tradeDate);
	if (!normalizedTradeDate) return null;
	try {
		return await env.DB.prepare(
			"SELECT trade_date, review_generated_at, review_universe, available_trade_dates, max_review_horizon, available_checkpoints, pending_checkpoints, summary_note FROM mo_recommendation_review_batches WHERE trade_date = ? ORDER BY review_generated_at DESC LIMIT 1",
		).bind(normalizedTradeDate).first<any>();
	} catch {
		return null;
	}
}

export async function getLatestReviewBatchAny(env: Env): Promise<any | null> {
	try {
		return await env.DB.prepare(
			"SELECT trade_date, review_generated_at, review_universe, available_trade_dates, max_review_horizon, available_checkpoints, pending_checkpoints, summary_note FROM mo_recommendation_review_batches ORDER BY trade_date DESC, review_generated_at DESC LIMIT 1",
		).first<any>();
	} catch {
		return null;
	}
}

export async function getLatestReviewItemsExact(env: Env, tradeDate: string): Promise<any[]> {
	const normalizedTradeDate = safeText(tradeDate);
	if (!normalizedTradeDate) return [];
	try {
		const rows = await env.DB.prepare(
			"SELECT symbol, name, order_status, d0_return, d5_return, d10_return, d20_return, review_note, reviewed_at FROM mo_recommendation_review_items WHERE trade_date=? ORDER BY symbol ASC",
		)
			.bind(normalizedTradeDate)
			.all<any>();
		return rows?.results ?? [];
	} catch {
		return [];
	}
}

export async function getLatestReviewItemsExactLimited(env: Env, tradeDate: string, limit: number): Promise<any[]> {
	const normalizedTradeDate = safeText(tradeDate);
	if (!normalizedTradeDate) return [];
	try {
		const rows = await env.DB.prepare(
			"SELECT trade_date, symbol, name, order_status, d0_return, d5_return, d10_return, d20_return, review_note FROM mo_recommendation_review_items WHERE trade_date = ? ORDER BY reviewed_at DESC LIMIT ?",
		)
			.bind(normalizedTradeDate, limit)
			.all<any>();
		return rows?.results ?? [];
	} catch {
		return [];
	}
}

export async function buildReviewProgressView(env: Env, tradeDate: string, reviewBatch: any | null): Promise<ReviewProgressView | null> {
	const baseTradeDate = safeText(tradeDate) || safeText(reviewBatch?.trade_date);
	if (!baseTradeDate) return null;
	const snapshotTradeDate = safeText(reviewBatch?.trade_date);
	const snapshotHorizon = Math.max(0, Number(reviewBatch?.max_review_horizon ?? 0));
	let liveTradeDates: string[] = [];
	try {
		const rows = await env.DB.prepare(
			`SELECT date FROM (
			SELECT date FROM twse_daily_raw WHERE date >= ?
			UNION
			SELECT date FROM prices_daily WHERE date >= ? AND symbol LIKE '%.TW'
		) ORDER BY date ASC`,
		)
			.bind(baseTradeDate, baseTradeDate)
			.all<any>();
		liveTradeDates = (rows?.results ?? []).map((row: any) => safeText(row.date)).filter(Boolean);
	} catch {
		liveTradeDates = [];
	}
	const liveAvailableTradeDates = liveTradeDates.length;
	const liveMaxReviewHorizon = Math.max(0, liveAvailableTradeDates - 1);
	const liveCheckpointLabels = formatCheckpointLabels(liveMaxReviewHorizon);
	const snapshotOlderThanBase = Boolean(snapshotTradeDate) && snapshotTradeDate !== baseTradeDate;
	const liveHasNewerCoverage = liveAvailableTradeDates > 0 && liveMaxReviewHorizon > snapshotHorizon;
	const useLiveProjection = liveAvailableTradeDates > 0 && (!reviewBatch || snapshotOlderThanBase || liveHasNewerCoverage);
	if (useLiveProjection) {
		const latestDate = liveTradeDates[liveTradeDates.length - 1] || baseTradeDate;
		const refreshReason = snapshotTradeDate
			? `saved review 仍停在 ${snapshotTradeDate}｜D${snapshotHorizon}`
			: '尚未建立 saved review';
		return {
			tradeDate: baseTradeDate,
			availableTradeDates: liveAvailableTradeDates,
			maxReviewHorizon: liveMaxReviewHorizon,
			availableCheckpoints: liveCheckpointLabels.available,
			pendingCheckpoints: liveCheckpointLabels.pending,
			summaryNote: `目前以市場資料自動推估 review horizon（through ${latestDate}）；${refreshReason}`,
			source: 'live_projection',
			needsRefresh: true,
			projectedThroughDate: latestDate,
			savedReviewTradeDate: snapshotTradeDate,
			savedReviewHorizon: snapshotHorizon,
		};
	}
	if (reviewBatch) {
		return {
			tradeDate: snapshotTradeDate,
			availableTradeDates: Number(reviewBatch.available_trade_dates ?? 0),
			maxReviewHorizon: snapshotHorizon,
			availableCheckpoints: safeText(reviewBatch.available_checkpoints),
			pendingCheckpoints: safeText(reviewBatch.pending_checkpoints),
			summaryNote: safeText(reviewBatch.summary_note),
			source: 'snapshot',
			needsRefresh: false,
			projectedThroughDate: snapshotTradeDate,
			savedReviewTradeDate: snapshotTradeDate,
			savedReviewHorizon: snapshotHorizon,
		};
	}
	if (!liveAvailableTradeDates) return null;
	const latestDate = liveTradeDates[liveTradeDates.length - 1] || baseTradeDate;
	return {
		tradeDate: baseTradeDate,
		availableTradeDates: liveAvailableTradeDates,
		maxReviewHorizon: liveMaxReviewHorizon,
		availableCheckpoints: liveCheckpointLabels.available,
		pendingCheckpoints: liveCheckpointLabels.pending,
		summaryNote: `目前以市場資料自動推估 review horizon（through ${latestDate}）；尚未建立 saved review`,
		source: 'live_projection',
		needsRefresh: true,
		projectedThroughDate: latestDate,
		savedReviewTradeDate: '',
		savedReviewHorizon: 0,
	};
}

export function pushReviewProgressLines(lines: string[], reviewView: ReviewProgressView): void {
	const horizon = Math.max(0, Number(reviewView.maxReviewHorizon ?? 0));
	lines.push(`- 目前可觀察 ${Number(reviewView.availableTradeDates ?? 0)} 個交易日，進度到 D${horizon}`);
	lines.push(`- 已解鎖：${safeText(reviewView.availableCheckpoints) || '—'}`);
	if (safeText(reviewView.pendingCheckpoints)) lines.push(`- 待解鎖：${safeText(reviewView.pendingCheckpoints)}`);
	if (reviewView.source === 'live_projection') {
		if (reviewView.savedReviewTradeDate) {
			lines.push(`- 最新 saved review：${reviewView.savedReviewTradeDate}｜D${Math.max(0, reviewView.savedReviewHorizon)}`);
		} else {
			lines.push('- 最新 saved review：尚未建立');
		}
		lines.push(`- 目前顯示：依市場交易日自動推估至 ${safeText(reviewView.projectedThroughDate) || reviewView.tradeDate}｜D${horizon}`);
		lines.push('- 逐檔明細：仍以 saved review 為準；如需刷新逐檔結果，請再執行 review-save。');
	} else {
		lines.push(`- 最新 saved review：${reviewView.tradeDate}｜D${horizon}`);
	}
	if (reviewView.summaryNote) lines.push(`- 補充：${safeText(reviewView.summaryNote)}`);
}

export async function buildReviewAdminAuditLines(env: Env, referenceTradeDate: string): Promise<string[]> {
	const normalizedReference = safeText(referenceTradeDate);
	const [exactBatch, anyBatch] = await Promise.all([
		getLatestReviewBatchExact(env, normalizedReference),
		getLatestReviewBatchAny(env),
	]);
	const reviewView = await buildReviewProgressView(env, normalizedReference, exactBatch);
	const exactItems = exactBatch ? await getLatestReviewItemsExact(env, normalizedReference) : [];
	const lines = [
		`reviewReferenceTradeDate=${normalizedReference || '-'}`,
		`reviewExactSaved=${exactBatch ? `${safeText(exactBatch.trade_date)} horizon=D${Math.max(0, Number(exactBatch.max_review_horizon ?? 0))}` : 'none'}`,
		`reviewLatestAnySaved=${anyBatch ? `${safeText(anyBatch.trade_date)} horizon=D${Math.max(0, Number(anyBatch.max_review_horizon ?? 0))}` : 'none'}`,
		`reviewExactItems=${exactItems.length}`,
	];
	if (reviewView) {
		lines.push(`reviewDisplayMode=${reviewView.source}`);
		lines.push(`reviewProjectedThrough=${safeText(reviewView.projectedThroughDate) || '-'}`);
		lines.push(`reviewObservedTradeDates=${Number(reviewView.availableTradeDates ?? 0)}`);
		lines.push(`reviewHorizon=D${Math.max(0, Number(reviewView.maxReviewHorizon ?? 0))}`);
		lines.push(`reviewNeedsRefresh=${reviewView.needsRefresh ? 'Y' : 'N'}`);
		lines.push(`reviewCheckpoints=available:${safeText(reviewView.availableCheckpoints) || '—'} pending:${safeText(reviewView.pendingCheckpoints) || '—'}`);
		if (reviewView.summaryNote) lines.push(`reviewNote=${safeText(reviewView.summaryNote)}`);
	}
	return lines;
}
