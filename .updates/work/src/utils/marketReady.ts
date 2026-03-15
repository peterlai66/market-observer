export type MarketReadyLevel = 'NONE' | 'PARTIAL' | 'FULL';

export interface MarketReadyInput {
  /** 以 YYYY-MM-DD 表示的交易日（Asia/Taipei） */
  tradeDate: string;
  /** 資料實際抓到的 trade_date（若資料源有提供） */
  dataTradeDate?: string | null;
  /** 盤後必要欄位（你可以依資料源再擴充） */
  close?: number | null;
  volume?: number | null;
  /** 其他你想納入完整度判斷的欄位 */
  extras?: Record<string, unknown>;
}

export interface MarketReadyResult {
  level: MarketReadyLevel;
  reason: string;
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/**
 * 判斷「盤後資料是否就緒」的最小實用版本。
 *
 * - NONE：連 trade_date 都還不是今天
 * - PARTIAL：trade_date 是今天，但盤後必要欄位（close/volume）不齊
 * - FULL：trade_date 是今天，且 close/volume 都齊
 */
export function assessMarketReady(input: MarketReadyInput): MarketReadyResult {
  const expected = input.tradeDate;
  const got = (input.dataTradeDate || '').trim();

  if (!got || got !== expected) {
    return {
      level: 'NONE',
      reason: got ? `trade_date=${got}（等待 ${expected}）` : `尚未取得 trade_date（等待 ${expected}）`,
    };
  }

  const hasClose = isFiniteNumber(input.close);
  const hasVol = isFiniteNumber(input.volume);

  if (hasClose && hasVol) {
    return { level: 'FULL', reason: 'trade_date 正確且 close/volume 已齊' };
  }

  const missing = [!hasClose ? 'close' : null, !hasVol ? 'volume' : null].filter(Boolean).join(', ');
  return {
    level: 'PARTIAL',
    reason: `trade_date 正確但欄位未齊（缺：${missing || 'unknown'}）`,
  };
}
