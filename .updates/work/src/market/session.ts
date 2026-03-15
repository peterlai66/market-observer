export type MarketId = 'TW' | 'US' | 'CRYPTO' | string;

export type MarketSessionConfig = {
	/** e.g. TW, US */
	id: MarketId;
	/** IANA timezone, e.g. Asia/Taipei */
	tz: string;
	/**
	 * Post-close window (local time). Used for heavy tasks.
	 * e.g. TW: 14:30–18:30
	 */
	postClose?: { startHH: number; startMM: number; endHH: number; endMM: number };
	/**
	 * Push-only window (local time). Used for re-push / lightweight notifications.
	 */
	pushOnly?: { startHH: number; startMM: number; endHH: number; endMM: number };
};

export type MarketTickContext = {
	marketId: MarketId;
	/** local date in YYYY-MM-DD */
	tradeDate: string;
	/** local hh/mm */
	hh: number;
	mm: number;
	inPostClose: boolean;
	inPushOnly: boolean;
};

function hmToMin(hh: number, mm: number): number {
	return hh * 60 + mm;
}

function inWindow(hh: number, mm: number, w?: { startHH: number; startMM: number; endHH: number; endMM: number }): boolean {
	if (!w) return false;
	const t = hmToMin(hh, mm);
	const a = hmToMin(w.startHH, w.startMM);
	const b = hmToMin(w.endHH, w.endMM);
	return t >= a && t <= b;
}

export function dateStringInTZ(tz: string, d: Date = new Date()): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: tz,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(d);
}

export function hmInTZ(tz: string, d: Date = new Date()): { hh: number; mm: number } {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: tz,
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	}).formatToParts(d);
	const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
	const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
	return { hh, mm };
}

export function buildMarketTickContext(cfg: MarketSessionConfig, now: Date = new Date()): MarketTickContext {
	const tradeDate = dateStringInTZ(cfg.tz, now);
	const { hh, mm } = hmInTZ(cfg.tz, now);
	return {
		marketId: cfg.id,
		tradeDate,
		hh,
		mm,
		inPostClose: inWindow(hh, mm, cfg.postClose),
		inPushOnly: inWindow(hh, mm, cfg.pushOnly),
	};
}

export function parseMarketsList(s: string | null | undefined): string[] {
	const raw = String(s || '').trim();
	if (!raw) return [];
	return raw
		.split(/[\s,;]+/)
		.map((x) => x.trim())
		.filter(Boolean);
}

export function defaultMarketConfigs(): MarketSessionConfig[] {
	return [
		{
			id: 'TW',
			tz: 'Asia/Taipei',
			postClose: { startHH: 14, startMM: 30, endHH: 18, endMM: 30 },
			pushOnly: { startHH: 16, startMM: 0, endHH: 23, endMM: 30 },
		},
		{
			id: 'US',
			tz: 'America/New_York',
			// NYSE close 16:00 ET. Give a wide window to tolerate data delays.
			postClose: { startHH: 16, startMM: 0, endHH: 20, endMM: 30 },
			pushOnly: { startHH: 17, startMM: 0, endHH: 23, endMM: 30 },
		},
	];
}
