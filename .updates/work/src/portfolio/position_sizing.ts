export type PositionSizingSignal = 'TRY' | 'AGGRESSIVE' | 'HOLD';

export type PositionSizingPick = {
  code: string;
  close: number;
  score: number;
  minQty: number;
  minNotionalTwd: number;
};

export type PositionSizingDecision = {
  code: string;
  score: number;
  weight: number;
  targetBudget: number;
  qty: number;
  entryRefPrice: number;
  sizingReason: string;
};

export type PositionSizingResult = {
  deployRatio: number;
  totalBudget: number;
  decisions: PositionSizingDecision[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeWeightsCapped(items: { score: number }[], cap: number): number[] {
  if (!items.length) return [];
  const rawSum = items.reduce((a, x) => a + Math.max(0, Number(x.score) || 0), 0);
  let weights = rawSum > 0 ? items.map((x) => Math.max(0, Number(x.score) || 0) / rawSum) : items.map(() => 1 / items.length);
  weights = weights.map((x) => Math.min(cap, x));
  const cappedSum = weights.reduce((a, x) => a + x, 0);
  return cappedSum > 0 ? weights.map((x) => x / cappedSum) : items.map(() => 1 / items.length);
}

export function getDeployRatio(signal: PositionSizingSignal): number {
  switch (signal) {
    case 'AGGRESSIVE':
      return 0.3;
    case 'TRY':
      return 0.15;
    default:
      return 0;
  }
}

export function buildPositionSizing(args: {
  signal: PositionSizingSignal;
  cash: number;
  picks: PositionSizingPick[];
  maxSingleWeight?: number;
}): PositionSizingResult {
  const { signal, cash } = args;
  const picks = Array.isArray(args.picks) ? args.picks.filter((x) => Number.isFinite(x.close) && x.close > 0) : [];
  const deployRatio = getDeployRatio(signal);
  const totalBudget = round2(Math.max(0, cash * deployRatio));
  if (!picks.length || totalBudget <= 0) return { deployRatio, totalBudget, decisions: [] };

  const maxSingleWeight = clamp(Number(args.maxSingleWeight ?? 0.4), 0.05, 1);
  const initialWeights = normalizeWeightsCapped(picks, maxSingleWeight);
  let rawBudgets = picks.map((pick, idx) => round2(totalBudget * initialWeights[idx]));
  let keep = rawBudgets.map((budget, idx) => budget >= Math.max(Number(picks[idx].minNotionalTwd || 0), Number(picks[idx].close || 0) * Number(picks[idx].minQty || 1)));
  if (keep.some(Boolean) && keep.some((x) => !x)) {
    const kept = picks.filter((_, idx) => keep[idx]);
    const keptWeights = normalizeWeightsCapped(kept, maxSingleWeight);
    const budgetMap = new Map<string, number>();
    kept.forEach((pick, idx) => budgetMap.set(pick.code, round2(totalBudget * keptWeights[idx])));
    rawBudgets = picks.map((pick) => round2(budgetMap.get(pick.code) ?? 0));
  }

  const decisions: PositionSizingDecision[] = [];
  for (let idx = 0; idx < picks.length; idx += 1) {
    const pick = picks[idx];
    const entryRefPrice = Number(pick.close);
    const targetBudget = Number(rawBudgets[idx] || 0);
    if (!Number.isFinite(entryRefPrice) || entryRefPrice <= 0 || targetBudget <= 0) continue;
    const minQty = Math.max(1, Number(pick.minQty || 1));
    const qty = Math.floor(targetBudget / entryRefPrice / minQty) * minQty;
    if (qty <= 0) continue;
    const actualNotional = round2(qty * entryRefPrice);
    const weight = totalBudget > 0 ? round2(targetBudget / totalBudget) : 0;
    decisions.push({
      code: pick.code,
      score: Number(pick.score || 0),
      weight,
      targetBudget,
      qty,
      entryRefPrice,
      sizingReason: `Sizing：deploy ${Math.round(deployRatio * 100)}%｜target ${Math.round(targetBudget).toLocaleString()}｜weight ${Math.round(weight * 100)}%｜ref ${round2(entryRefPrice)}｜qty ${qty}｜notional ${Math.round(actualNotional).toLocaleString()}`,
    });
  }
  return { deployRatio, totalBudget, decisions };
}
