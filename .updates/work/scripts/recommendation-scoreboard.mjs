#!/usr/bin/env node
import { fmtPct, runQuery } from './_recommendation_review_lib.mjs';

const mode = (process.argv[2] || 'remote').trim().toLowerCase();
const remote = mode !== 'local';

console.log(`MO Recommendation Scoreboard (${remote ? 'remote' : 'local'})`);

const batchRows = runQuery(`
SELECT trade_date, review_universe, available_trade_dates, max_review_horizon, review_generated_at
FROM mo_recommendation_review_batches
ORDER BY review_generated_at DESC, trade_date DESC
` , remote);

const itemRows = runQuery(`
SELECT trade_date, symbol, order_status, review_note, d0_return, d5_return, d10_return, d20_return
FROM mo_recommendation_review_items
ORDER BY reviewed_at DESC, trade_date DESC, symbol ASC
`, remote);

const totalBatches = batchRows.length;
const totalSymbols = itemRows.length;
const filledOrders = itemRows.filter((r) => String(r.order_status || '').toUpperCase() === 'EXECUTED').length;
const skippedOrders = itemRows.filter((r) => String(r.order_status || '').toUpperCase() === 'SKIPPED').length;
const pendingOrders = itemRows.filter((r) => String(r.order_status || '').toUpperCase() === 'PENDING').length;
const skipRatio = totalSymbols > 0 ? (skippedOrders / totalSymbols) * 100 : 0;
const filledRatio = totalSymbols > 0 ? (filledOrders / totalSymbols) * 100 : 0;

console.log('');
console.log(`total_batches=${totalBatches}`);
console.log(`total_symbols=${totalSymbols}`);
console.log(`filled_orders=${filledOrders}`);
console.log(`skipped_orders=${skippedOrders}`);
console.log(`pending_orders=${pendingOrders}`);
console.log('');
console.log(`skip_ratio=${skipRatio.toFixed(2)}%`);
console.log(`filled_ratio=${filledRatio.toFixed(2)}%`);

if (totalBatches > 0) {
  const latest = batchRows[0];
  console.log('');
  console.log(`latest_batch=${latest.trade_date}`);
  console.log(`latest_universe=${latest.review_universe}`);
  console.log(`latest_horizon=D${latest.max_review_horizon}`);
  console.log(`latest_available_trade_dates=${latest.available_trade_dates}`);
}

const checkpoints = [
  { label: 'D0', key: 'd0_return' },
  { label: 'D5', key: 'd5_return' },
  { label: 'D10', key: 'd10_return' },
  { label: 'D20', key: 'd20_return' },
];

const statuses = ['EXECUTED', 'SKIPPED', 'PENDING'];
const normalizedItems = itemRows.map((row) => ({
  ...row,
  order_status: String(row?.order_status || '').trim().toUpperCase() || 'UNKNOWN',
}));

const avg = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
const fmtMaybePct = (values) => values.length ? fmtPct(avg(values)) : '—';
const ratio = (num, den) => den > 0 ? `${((num / den) * 100).toFixed(2)}%` : '0.00%';
const windows = [1, 3, 5];
const latestTradeDates = [...new Set(batchRows.map((row) => String(row.trade_date || '')))].filter(Boolean);
const diagnosisRecords = [];

function buildStatusSummary(rows, key, totalEvaluable) {
  const values = rows.map((row) => Number(row?.[key])).filter((value) => Number.isFinite(value));
  const win = values.filter((value) => value > 0).length;
  const loss = values.filter((value) => value < 0).length;
  const flat = values.filter((value) => value === 0).length;
  const decisive = win + loss;
  return {
    evaluable: values.length,
    shareOfEvaluable: ratio(values.length, totalEvaluable),
    averageReturn: fmtMaybePct(values),
    positiveRate: ratio(win, values.length),
    winRate: ratio(win, values.length),
    lossRate: ratio(loss, values.length),
    flatRate: ratio(flat, values.length),
    expectancy: fmtMaybePct(values),
    decisiveRate: ratio(decisive, values.length),
  };
}


function buildDiagnosis(checkpointLabel, evaluableRows, key, totalEvaluable) {
  const values = evaluableRows.map((row) => Number(row?.[key])).filter((value) => Number.isFinite(value));
  const averageValue = values.length ? avg(values) : NaN;
  const positive = values.filter((value) => value > 0).length;
  const win = positive;
  const loss = values.filter((value) => value < 0).length;
  const flat = values.filter((value) => value === 0).length;
  const decisive = win + loss;
  const statusCounts = {
    executed: evaluableRows.filter((row) => row.order_status === 'EXECUTED').length,
    skipped: evaluableRows.filter((row) => row.order_status === 'SKIPPED').length,
    pending: evaluableRows.filter((row) => row.order_status === 'PENDING').length,
  };
  const dominantEntry = Object.entries(statusCounts).sort((a, b) => b[1] - a[1])[0] || ['none', 0];
  const [dominantStatus, dominantCount] = dominantEntry;
  const dominantShare = evaluableRows.length > 0 ? (dominantCount / evaluableRows.length) * 100 : 0;

  let gatePressure = 'LOW';
  if (statusCounts.skipped >= Math.max(1, evaluableRows.length * 0.6)) gatePressure = 'HIGH';
  else if (statusCounts.skipped >= Math.max(1, evaluableRows.length * 0.3)) gatePressure = 'MEDIUM';

  let edgeState = 'NO_DATA';
  if (values.length > 0) {
    if (decisive === 0) edgeState = 'FLAT_SAMPLE';
    else if (averageValue > 0 && positive >= loss) edgeState = 'POSITIVE_EDGE';
    else if (averageValue < 0 && loss > positive) edgeState = 'NEGATIVE_EDGE';
    else edgeState = 'MIXED_EDGE';
  }

  let horizonSignalStrength = 'NONE';
  if (values.length > 0) {
    const decisiveShare = decisive / values.length;
    if (decisiveShare === 0) horizonSignalStrength = 'INERT';
    else if (decisiveShare < 0.34) horizonSignalStrength = 'WEAK';
    else if (decisiveShare < 0.67) horizonSignalStrength = 'MODERATE';
    else horizonSignalStrength = 'STRONG';
  }

  const interpretationParts = [];
  if (gatePressure === 'HIGH') interpretationParts.push('execution-gate-dominant');
  else if (gatePressure === 'MEDIUM') interpretationParts.push('mixed-gate-influence');
  else interpretationParts.push('execution-gate-light');

  if (edgeState === 'FLAT_SAMPLE') interpretationParts.push('flat-sample');
  else if (edgeState === 'POSITIVE_EDGE') interpretationParts.push('positive-edge');
  else if (edgeState === 'NEGATIVE_EDGE') interpretationParts.push('negative-edge');
  else if (edgeState === 'MIXED_EDGE') interpretationParts.push('mixed-edge');
  else interpretationParts.push('no-data');

  interpretationParts.push(`${checkpointLabel.toLowerCase()}-${horizonSignalStrength.toLowerCase()}`);

  return {
    dominantStatus,
    dominantStatusShare: `${dominantShare.toFixed(2)}%`,
    gatePressure,
    edgeState,
    horizonSignalStrength,
    executionCoverageGap: ratio(totalEvaluable - statusCounts.executed, totalEvaluable),
    interpretation: interpretationParts.join('-'),
  };
}

console.log('');
console.log('checkpoint_outcomes:');
for (const checkpoint of checkpoints) {
  const evaluableRows = normalizedItems.filter((row) => Number.isFinite(Number(row?.[checkpoint.key])));
  const values = evaluableRows.map((row) => Number(row?.[checkpoint.key]));
  const evaluable = values.length;
  const coverage = totalSymbols > 0 ? (evaluable / totalSymbols) * 100 : 0;
  const positive = values.filter((value) => value > 0).length;
  const positiveRate = evaluable > 0 ? (positive / evaluable) * 100 : 0;
  const average = evaluable > 0 ? avg(values) : NaN;

  console.log(`${checkpoint.label}_evaluable=${evaluable}`);
  console.log(`${checkpoint.label}_coverage=${coverage.toFixed(2)}%`);
  console.log(`${checkpoint.label}_positive=${positive}`);
  console.log(`${checkpoint.label}_positive_rate=${positiveRate.toFixed(2)}%`);
  console.log(`${checkpoint.label}_average_return=${fmtPct(average)}`);
  console.log('');

  const winRows = evaluableRows.filter((row) => Number(row?.[checkpoint.key]) > 0);
  const lossRows = evaluableRows.filter((row) => Number(row?.[checkpoint.key]) < 0);
  const flatRows = evaluableRows.filter((row) => Number(row?.[checkpoint.key]) === 0);
  const win = winRows.length;
  const loss = lossRows.length;
  const flat = flatRows.length;
  const avgOfRows = (rows) => rows.length
    ? fmtPct(rows.reduce((sum, row) => sum + Number(row?.[checkpoint.key]), 0) / rows.length)
    : '—';

  console.log(`${checkpoint.label}_classification:`);
  console.log(`win=${win}`);
  console.log(`loss=${loss}`);
  console.log(`flat=${flat}`);
  console.log(`win_rate=${ratio(win, evaluable)}`);
  console.log(`loss_rate=${ratio(loss, evaluable)}`);
  console.log(`flat_rate=${ratio(flat, evaluable)}`);

  for (const status of statuses) {
    const rows = evaluableRows.filter((row) => row.order_status === status);
    const key = status.toLowerCase();
    console.log(`${key}_evaluable=${rows.length}`);
    console.log(`${key}_average_return=${avgOfRows(rows)}`);
  }
  console.log('');

  const decisive = win + loss;
  const avgWin = avg(winRows.map((row) => Number(row?.[checkpoint.key])));
  const avgLoss = avg(lossRows.map((row) => Number(row?.[checkpoint.key])));
  const edgeRatio = Number.isFinite(avgWin) && Number.isFinite(avgLoss) && avgLoss !== 0
    ? `${Math.abs(avgWin / avgLoss).toFixed(2)}x`
    : '—';

  console.log(`${checkpoint.label}_performance:`);
  console.log(`expectancy=${fmtPct(average)}`);
  console.log(`avg_win_return=${fmtPct(avgWin)}`);
  console.log(`avg_loss_return=${fmtPct(avgLoss)}`);
  console.log(`edge_ratio=${edgeRatio}`);
  console.log(`nonflat_evaluable=${decisive}`);
  console.log(`decisive_rate=${ratio(decisive, evaluable)}`);
  console.log('');

  console.log(`${checkpoint.label}_rolling:`);
  for (const window of windows) {
    const chosenDates = latestTradeDates.slice(0, window);
    const rows = evaluableRows.filter((row) => chosenDates.includes(String(row.trade_date || '')));
    const rowValues = rows.map((row) => Number(row?.[checkpoint.key])).filter((value) => Number.isFinite(value));
    const label = `last_${window}_batch`;
    console.log(`${label}_count=${Math.min(window, latestTradeDates.length)}`);
    console.log(`${label}_evaluable=${rows.length}`);
    console.log(`${label}_average_return=${fmtMaybePct(rowValues)}`);
    console.log(`${label}_positive_rate=${ratio(rowValues.filter((value) => value > 0).length, rowValues.length)}`);
  }
  console.log('');

  const statusGroups = {
    overall: evaluableRows,
    executed: evaluableRows.filter((row) => row.order_status === 'EXECUTED'),
    skipped: evaluableRows.filter((row) => row.order_status === 'SKIPPED'),
    pending: evaluableRows.filter((row) => row.order_status === 'PENDING'),
  };

  console.log(`${checkpoint.label}_execution_summary:`);
  for (const [name, rows] of Object.entries(statusGroups)) {
    const summary = buildStatusSummary(rows, checkpoint.key, evaluable);
    console.log(`${name}_evaluable=${summary.evaluable}`);
    console.log(`${name}_share_of_evaluable=${summary.shareOfEvaluable}`);
    console.log(`${name}_average_return=${summary.averageReturn}`);
    console.log(`${name}_positive_rate=${summary.positiveRate}`);
    console.log(`${name}_win_rate=${summary.winRate}`);
    console.log(`${name}_loss_rate=${summary.lossRate}`);
    console.log(`${name}_flat_rate=${summary.flatRate}`);
    console.log(`${name}_expectancy=${summary.expectancy}`);
    console.log(`${name}_decisive_rate=${summary.decisiveRate}`);
  }
  console.log('');

  const diagnosis = buildDiagnosis(checkpoint.label, evaluableRows, checkpoint.key, evaluable);
  console.log(`${checkpoint.label}_diagnosis:`);
  console.log(`dominant_status=${diagnosis.dominantStatus}`);
  console.log(`dominant_status_share=${diagnosis.dominantStatusShare}`);
  console.log(`gate_pressure=${diagnosis.gatePressure}`);
  console.log(`edge_state=${diagnosis.edgeState}`);
  console.log(`horizon_signal_strength=${diagnosis.horizonSignalStrength}`);
  console.log(`execution_coverage_gap=${diagnosis.executionCoverageGap}`);
  console.log(`interpretation=${diagnosis.interpretation}`);
  console.log('');

  diagnosisRecords.push({
    checkpoint: checkpoint.label,
    evaluable,
    executedEvaluable: statusGroups.executed.length,
    skippedEvaluable: statusGroups.skipped.length,
    pendingEvaluable: statusGroups.pending.length,
    positive,
    positiveRate,
    average,
    decisiveRate: evaluable > 0 ? (decisive / evaluable) * 100 : 0,
    nonflatEvaluable: decisive,
    diagnosis,
  });
}

function mostCommon(records, getter, fallback = '—') {
  const counts = new Map();
  for (const record of records) {
    const value = getter(record);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  return sorted[0]?.[0] ?? fallback;
}

function uniqueFindings(items) {
  return [...new Set(items.filter(Boolean))];
}


function buildActionableRecommendations(records, batchSummary) {
  const recommendations = [];
  const avgExecutedShare = batchSummary.avgExecutedShare;
  const avgPositiveRate = batchSummary.avgPositiveRate;
  const maxGap = batchSummary.maxExecutionCoverageGap;

  if (avgExecutedShare < 10) {
    recommendations.push('collect-executed-samples-before-judging-strategy-edge');
  }

  if (batchSummary.gatePressureConsensus === 'HIGH' || maxGap >= 50) {
    recommendations.push('audit-skip-gates-and-rejected-reasons-before-tuning-ranking');
  }

  if (batchSummary.edgeStateConsensus === 'FLAT_SAMPLE') {
    recommendations.push('avoid-edge-optimization-until-nonflat-samples-appear');
  } else if (batchSummary.edgeStateConsensus === 'NEGATIVE_EDGE') {
    recommendations.push('tighten-candidate-quality-or-risk-filters-before-expanding-execution');
  } else if (batchSummary.edgeStateConsensus === 'POSITIVE_EDGE' && avgExecutedShare < 50) {
    recommendations.push('consider-careful-gate-relaxation-to-capture-positive-edge');
  }

  if (batchSummary.horizonSignalConsensus === 'INERT' || batchSummary.strongestHorizonSignal === 'INERT') {
    recommendations.push('defer-horizon-selection-until-signal-strength-exceeds-inert');
  }

  if (avgPositiveRate === 0 && avgExecutedShare === 0) {
    recommendations.push('prioritize-data-coverage-over-performance-interpretation');
  }

  if (recommendations.length === 0) {
    recommendations.push('current-batch-ready-for-next-layer-comparison-and-ranking');
  }

  return [...new Set(recommendations)].slice(0, 7);
}



function extractStructuredReasonMarks(note) {
  const raw = String(note || '').trim();
  if (!raw || raw.toLowerCase() === 'ok') return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split('|')[0].trim())
    .filter(Boolean)
    .map((mark) => {
      const m = String(mark || '').trim().match(/^(D\d+)\s*:(.+)$/i);
      if (m) {
        return { checkpoint: m[1].toUpperCase(), rawMark: String(m[2] || '').trim() };
      }
      return { checkpoint: 'UNSCOPED', rawMark: String(mark || '').trim() };
    });
}

function extractReasonMarks(note) {
  return extractStructuredReasonMarks(note).map((entry) => entry.checkpoint !== 'UNSCOPED' ? `${entry.checkpoint}:${entry.rawMark}` : entry.rawMark);
}

function normalizeReasonMark(mark) {
  const raw = String(mark || '').trim();
  if (!raw) return { normalized: 'unknown', family: 'other' };
  const withoutCheckpoint = raw.replace(/^D\d+\s*:/i, '').trim();
  const t = withoutCheckpoint.toLowerCase();

  if (t === 'signal-generated-but-not-filled') {
    return { normalized: 'signal-generated-but-not-filled', family: 'execution_gate' };
  }
  if (t.startsWith('execution:')) {
    const detail = t.slice('execution:'.length).trim() || 'unknown';
    return { normalized: `execution:${detail}`, family: 'execution_gate' };
  }
  if (t === 'not-enough-trade-days') {
    return { normalized: 'not-enough-trade-days', family: 'data_coverage' };
  }
  if (t === 'missing-close') {
    return { normalized: 'missing-close', family: 'data_gap' };
  }
  if (t.includes('notional') || t.includes('budget') || t.includes('qty')) {
    return { normalized: 'sizing-or-notional-constraint', family: 'sizing_liquidity' };
  }
  if (t.includes('liquidity') || t.includes('spread') || t.includes('volume')) {
    return { normalized: 'liquidity-constraint', family: 'sizing_liquidity' };
  }
  if (t.includes('risk') || t.includes('volatility') || t.includes('drawdown')) {
    return { normalized: 'risk-constraint', family: 'risk_guard' };
  }
  if (t.includes('price')) {
    return { normalized: 'price-constraint', family: 'price_guard' };
  }
  if (t.includes('rank') || t.includes('ranking') || t.includes('selection')) {
    return { normalized: 'ranking-filter', family: 'ranking_filter' };
  }
  if (t.includes('invalid') || t.includes('bad-data')) {
    return { normalized: 'invalid-data', family: 'data_quality' };
  }
  if (t.includes('missing')) {
    return { normalized: 'missing-data', family: 'data_gap' };
  }
  return { normalized: t || 'unknown', family: 'other' };
}


function buildExecutionReasonBreakdown(rows) {
  const executionMarks = [];
  for (const row of rows) {
    const marks = extractStructuredReasonMarks(row.review_note)
      .map((entry) => normalizeReasonMark(entry.rawMark))
      .filter((entry) => entry.family === 'execution_gate');
    for (const mark of marks) executionMarks.push(mark.normalized);
  }
  const counts = new Map();
  for (const mark of executionMarks) counts.set(mark, (counts.get(mark) || 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  const total = sorted.reduce((sum, [, count]) => sum + count, 0);
  const topReason = sorted[0]?.[0] ?? 'none';
  const topCount = sorted[0]?.[1] ?? 0;
  return {
    totalMarks: total,
    topReason,
    topReasonShare: total > 0 ? `${((topCount / total) * 100).toFixed(2)}%` : '0.00%',
    sorted,
  };
}

function buildSkipReasonBreakdown(rows) {
  const skippedRows = rows.filter((row) => row.order_status === 'SKIPPED');
  const reasonCounts = new Map();
  const familyCounts = new Map();

  for (const row of skippedRows) {
    const marks = extractStructuredReasonMarks(row.review_note);
    const usable = marks.length ? marks : [{ checkpoint: 'UNSCOPED', rawMark: 'unknown' }];
    for (const mark of usable) {
      const normalized = normalizeReasonMark(mark.rawMark);
      reasonCounts.set(normalized.normalized, (reasonCounts.get(normalized.normalized) || 0) + 1);
      familyCounts.set(normalized.family, (familyCounts.get(normalized.family) || 0) + 1);
    }
  }

  const sortDesc = (entries) => [...entries].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  const sortedReasons = sortDesc(reasonCounts.entries());
  const sortedFamilies = sortDesc(familyCounts.entries());
  const totalMarks = sortedReasons.reduce((sum, [, count]) => sum + count, 0);
  const topReason = sortedReasons[0]?.[0] ?? '—';
  const topReasonCount = sortedReasons[0]?.[1] ?? 0;
  const topFamily = sortedFamilies[0]?.[0] ?? '—';
  const topFamilyCount = sortedFamilies[0]?.[1] ?? 0;

  return {
    skippedRows: skippedRows.length,
    totalReasonMarks: totalMarks,
    topReason,
    topReasonShare: totalMarks > 0 ? ((topReasonCount / totalMarks) * 100).toFixed(2) + '%' : '0.00%',
    topFamily,
    topFamilyShare: totalMarks > 0 ? ((topFamilyCount / totalMarks) * 100).toFixed(2) + '%' : '0.00%',
    sortedReasons,
    sortedFamilies,
  };
}



function buildDataQualitySummary(skipBreakdown) {
  const familyMap = new Map(skipBreakdown.sortedFamilies);
  const reasonMap = new Map(skipBreakdown.sortedReasons);
  const total = skipBreakdown.totalReasonMarks || 0;
  const dataGapCount = familyMap.get('data_gap') || 0;
  const dataCoverageCount = familyMap.get('data_coverage') || 0;
  const dataQualityCount = familyMap.get('data_quality') || 0;
  const executionGateCount = familyMap.get('execution_gate') || 0;
  const dataRelatedCount = dataGapCount + dataCoverageCount + dataQualityCount;
  const dominantDataIssueEntry = [...reasonMap.entries()]
    .filter(([reason]) => ['missing-close', 'missing-data', 'not-enough-trade-days', 'invalid-data'].includes(reason))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || ['—', 0];
  const [dominantDataIssue, dominantDataIssueCount] = dominantDataIssueEntry;

  let severity = 'LOW';
  const dataShare = total > 0 ? (dataRelatedCount / total) * 100 : 0;
  const missingShare = total > 0 ? (dataGapCount / total) * 100 : 0;
  if (dataShare >= 70 || missingShare >= 50) severity = 'CRITICAL';
  else if (dataShare >= 50) severity = 'HIGH';
  else if (dataShare >= 20) severity = 'MEDIUM';

  return {
    dataRelatedShare: total > 0 ? `${dataShare.toFixed(2)}%` : '0.00%',
    dominantDataIssue,
    dominantDataIssueShare: dataRelatedCount > 0 ? `${((dominantDataIssueCount / dataRelatedCount) * 100).toFixed(2)}%` : '0.00%',
    coverageIssueShare: total > 0 ? `${((dataCoverageCount / total) * 100).toFixed(2)}%` : '0.00%',
    missingDataIssueShare: total > 0 ? `${((dataGapCount / total) * 100).toFixed(2)}%` : '0.00%',
    dataQualityIssueShare: total > 0 ? `${((dataQualityCount / total) * 100).toFixed(2)}%` : '0.00%',
    executionGateShare: total > 0 ? `${((executionGateCount / total) * 100).toFixed(2)}%` : '0.00%',
    dataBlockingSeverity: severity,
    counts: {
      total,
      dataRelatedCount,
      dataGapCount,
      dataCoverageCount,
      dataQualityCount,
      executionGateCount,
      dominantDataIssueCount,
    },
  };
}

function buildDataQualityFindings(summary) {
  const findings = [];
  const counts = summary.counts;
  if (counts.dataRelatedCount > 0 && counts.dataRelatedCount >= counts.executionGateCount) {
    findings.push('data-issues-dominate-skip-pressure');
  }
  if (summary.dominantDataIssue === 'missing-close') {
    findings.push('missing-close-is-primary-data-failure');
  }
  if (summary.dominantDataIssue === 'not-enough-trade-days' || counts.dataCoverageCount > 0) {
    findings.push('trade-date-coverage-insufficient-for-some-checkpoints');
  }
  if (counts.executionGateCount > 0 && counts.dataRelatedCount > counts.executionGateCount) {
    findings.push('execution-gate-secondary-to-data-issues');
  }
  if (summary.dataBlockingSeverity === 'CRITICAL') {
    findings.push('data-blocking-severity-critical');
  }
  if (!findings.length) findings.push('no-material-data-quality-findings');
  return [...new Set(findings)].slice(0, 7);
}

function buildDataQualityActionables(summary) {
  const actions = [];
  const counts = summary.counts;
  if (summary.dominantDataIssue === 'missing-close') {
    actions.push('backfill-missing-close-series-before-adjusting-gates');
  }
  if (counts.dataCoverageCount > 0) {
    actions.push('continue-trade-date-coverage-accumulation-before-judging-longer-horizons');
  }
  if (counts.dataRelatedCount > counts.executionGateCount) {
    actions.push('fix-data-pipeline-before-relaxing-execution-thresholds');
  }
  if (counts.dataQualityCount > 0) {
    actions.push('validate-price-integrity-and-bad-data-filters');
  }
  if (summary.dataBlockingSeverity === 'CRITICAL') {
    actions.push('treat-data-repair-as-release-blocker-for-strategy-evaluation');
  }
  if (!actions.length) {
    actions.push('no-material-data-quality-action-required');
  }
  return [...new Set(actions)].slice(0, 7);
}


function buildEvaluationReadiness(dataQualitySummary, diagnosisRecords) {
  const parsePct = (value) => {
    const n = Number.parseFloat(String(value || '0').replace('%', ''));
    return Number.isFinite(n) ? n : 0;
  };

  const totalExecutedEvaluable = diagnosisRecords.reduce((sum, record) => sum + (record.executedEvaluable || 0), 0);
  const totalNonflatEvaluable = diagnosisRecords.reduce((sum, record) => sum + (record.nonflatEvaluable || 0), 0);
  const dataRelatedShare = parsePct(dataQualitySummary.dataRelatedShare);
  const coverageShare = parsePct(dataQualitySummary.coverageIssueShare);
  const missingShare = parsePct(dataQualitySummary.missingDataIssueShare);
  const dataQualityShare = parsePct(dataQualitySummary.dataQualityIssueShare);
  const dominantIssue = String(dataQualitySummary.dominantDataIssue || '').trim() || 'none';
  const coverageOnlyWait = dominantIssue === 'not-enough-trade-days' && coverageShare > 0 && missingShare === 0 && dataQualityShare == 0;

  const strategyEvaluable = totalExecutedEvaluable > 0;
  const releaseBlocker = coverageOnlyWait ? false : dataQualitySummary.dataBlockingSeverity === 'CRITICAL';

  let primaryBlocker = 'none';
  if (coverageOnlyWait) primaryBlocker = 'coverage_wait';
  else if (dataRelatedShare >= 50 || dataQualitySummary.dataBlockingSeverity === 'CRITICAL') primaryBlocker = 'data_gap';
  else if (!strategyEvaluable) primaryBlocker = 'execution_samples';
  else if (totalNonflatEvaluable < 10) primaryBlocker = 'sample_depth';

  const blockerReason = primaryBlocker === 'data_gap'
    ? (dominantIssue || 'missing-close')
    : (primaryBlocker === 'coverage_wait'
      ? 'awaiting-future-trade-days'
      : (primaryBlocker === 'execution_samples' ? 'no-executed-samples' : (primaryBlocker === 'sample_depth' ? 'insufficient-nonflat-samples' : 'none')));

  const dataSufficiency = coverageOnlyWait
    ? 'ACCUMULATING'
    : (dataRelatedShare > 50 ? 'INSUFFICIENT' : (dataRelatedShare >= 20 ? 'PARTIAL' : 'SUFFICIENT'));
  const executionSampleStatus = totalExecutedEvaluable === 0 ? 'EMPTY' : (totalExecutedEvaluable < 5 ? 'SPARSE' : 'READY');
  const strategyEdgeAssessable = totalNonflatEvaluable >= 10 && strategyEvaluable && dataSufficiency === 'SUFFICIENT';

  let recommendedNextPhase = 'STRATEGY_TUNING';
  if (primaryBlocker === 'coverage_wait') recommendedNextPhase = 'COVERAGE_ACCUMULATION';
  else if (releaseBlocker || primaryBlocker === 'data_gap') recommendedNextPhase = 'DATA_REPAIR';
  else if (!strategyEvaluable) recommendedNextPhase = 'EXECUTION_COLLECTION';
  else if (!strategyEdgeAssessable) recommendedNextPhase = 'EDGE_COLLECTION';

  return {
    strategyEvaluable,
    releaseBlocker,
    primaryBlocker,
    blockerReason,
    dataSufficiency,
    executionSampleStatus,
    strategyEdgeAssessable,
    recommendedNextPhase,
    coverageOnlyWait,
  };
}



function buildCoverageAccumulationSummary(latestBatch, evaluationReadiness) {
  const availableTradeDates = Number(latestBatch?.available_trade_dates || 0);
  const horizonTargets = [
    { label: 'D0', requiredTradeDates: 1 },
    { label: 'D5', requiredTradeDates: 6 },
    { label: 'D10', requiredTradeDates: 11 },
    { label: 'D20', requiredTradeDates: 21 },
  ];
  const unlocked = horizonTargets.filter((entry) => availableTradeDates >= entry.requiredTradeDates);
  const waiting = horizonTargets.filter((entry) => availableTradeDates < entry.requiredTradeDates);
  const latestActionableCheckpoint = unlocked.length ? unlocked[unlocked.length - 1].label : 'none';
  const nextUnlock = waiting[0] || null;
  const futureTradeDaysNeeded = nextUnlock ? Math.max(0, nextUnlock.requiredTradeDates - availableTradeDates) : 0;
  const coverageMode = evaluationReadiness.coverageOnlyWait ? 'ACCUMULATING' : 'REPAIR_OR_UNKNOWN';
  const coverageState = evaluationReadiness.coverageOnlyWait
    ? (nextUnlock ? 'WAITING_FUTURE_TRADE_DAYS' : 'READY_FULL_COVERAGE')
    : 'NOT_IN_COVERAGE_WAIT';
  return {
    availableTradeDates,
    latestActionableCheckpoint,
    nextUnlockCheckpoint: nextUnlock?.label || 'none',
    futureTradeDaysNeeded,
    unlockedCheckpoints: unlocked.map((entry) => entry.label).join(', ') || 'none',
    waitingCheckpoints: waiting.map((entry) => entry.label).join(', ') || 'none',
    coverageMode,
    coverageState,
  };
}

function buildDataCoverageMap(rows) {
  const skippedRows = rows.filter((row) => row.order_status === 'SKIPPED');
  const symbolMap = new Map();

  const ensureSymbol = (symbol) => {
    if (!symbolMap.has(symbol)) {
      symbolMap.set(symbol, {
        symbol,
        skippedRows: 0,
        totalReasonMarks: 0,
        dataRelatedMarks: 0,
        missingCloseMarks: 0,
        notEnoughTradeDaysMarks: 0,
        invalidDataMarks: 0,
        executionGateMarks: 0,
        checkpointCounts: new Map(),
        reasonCounts: new Map(),
        familyCounts: new Map(),
      });
    }
    return symbolMap.get(symbol);
  };

  for (const row of skippedRows) {
    const symbol = String(row.symbol || 'UNKNOWN').trim() || 'UNKNOWN';
    const entry = ensureSymbol(symbol);
    entry.skippedRows += 1;
    const marks = extractStructuredReasonMarks(row.review_note);
    const usable = marks.length ? marks : [{ checkpoint: 'UNSCOPED', rawMark: 'unknown' }];
    for (const mark of usable) {
      const normalized = normalizeReasonMark(mark.rawMark);
      entry.totalReasonMarks += 1;
      entry.reasonCounts.set(normalized.normalized, (entry.reasonCounts.get(normalized.normalized) || 0) + 1);
      entry.familyCounts.set(normalized.family, (entry.familyCounts.get(normalized.family) || 0) + 1);
      entry.checkpointCounts.set(mark.checkpoint, (entry.checkpointCounts.get(mark.checkpoint) || 0) + 1);
      if (['data_gap', 'data_coverage', 'data_quality'].includes(normalized.family)) entry.dataRelatedMarks += 1;
      if (normalized.normalized === 'missing-close') entry.missingCloseMarks += 1;
      if (normalized.normalized === 'not-enough-trade-days') entry.notEnoughTradeDaysMarks += 1;
      if (normalized.normalized === 'invalid-data') entry.invalidDataMarks += 1;
      if (normalized.family === 'execution_gate') entry.executionGateMarks += 1;
    }
  }

  const severityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
  const results = [...symbolMap.values()].map((entry) => {
    const topReason = [...entry.reasonCounts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0] || ['—', 0];
    const topCheckpoint = [...entry.checkpointCounts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0] || ['UNSCOPED', 0];
    const dataRelatedShare = entry.totalReasonMarks > 0 ? (entry.dataRelatedMarks / entry.totalReasonMarks) * 100 : 0;
    let severity = 'LOW';
    if (entry.missingCloseMarks > 0 || dataRelatedShare >= 70) severity = 'CRITICAL';
    else if (entry.notEnoughTradeDaysMarks > 0 || dataRelatedShare >= 50) severity = entry.missingCloseMarks === 0 && entry.notEnoughTradeDaysMarks > 0 ? 'MEDIUM' : 'HIGH';
    else if (entry.dataRelatedMarks > 0 || entry.executionGateMarks > 0) severity = 'MEDIUM';
    const primaryIssue = topReason[0];
    let repairAction = 'review-symbol-skip-notes';
    if (primaryIssue === 'missing-close') repairAction = 'backfill-close-series';
    else if (primaryIssue === 'not-enough-trade-days') repairAction = 'await-trade-date-coverage-accumulation';
    else if (primaryIssue === 'invalid-data') repairAction = 'repair-invalid-price-data';
    else if (entry.executionGateMarks > entry.dataRelatedMarks) repairAction = 'inspect-execution-path';

    return {
      symbol: entry.symbol,
      skippedRows: entry.skippedRows,
      totalReasonMarks: entry.totalReasonMarks,
      dataRelatedMarks: entry.dataRelatedMarks,
      dataRelatedShare,
      missingCloseMarks: entry.missingCloseMarks,
      notEnoughTradeDaysMarks: entry.notEnoughTradeDaysMarks,
      invalidDataMarks: entry.invalidDataMarks,
      executionGateMarks: entry.executionGateMarks,
      primaryIssue,
      primaryIssueCount: topReason[1],
      primaryIssueShare: entry.totalReasonMarks > 0 ? (topReason[1] / entry.totalReasonMarks) * 100 : 0,
      primaryCheckpoint: topCheckpoint[0],
      primaryCheckpointCount: topCheckpoint[1],
      blockerSeverity: severity,
      repairAction,
    };
  }).sort((a, b) => {
    const sev = (severityOrder[b.blockerSeverity] || 0) - (severityOrder[a.blockerSeverity] || 0);
    if (sev !== 0) return sev;
    const mc = b.missingCloseMarks - a.missingCloseMarks;
    if (mc !== 0) return mc;
    const dr = b.dataRelatedShare - a.dataRelatedShare;
    if (dr !== 0) return dr;
    return a.symbol.localeCompare(b.symbol);
  });

  return {
    symbols: results,
    repairTargets: results.filter((entry) => entry.blockerSeverity !== 'LOW' || entry.primaryIssue !== 'unknown').slice(0, 7),
  };
}

function buildGateRecommendations(skipBreakdown, executionBreakdown) {
  const recommendations = [];
  const topFamily = skipBreakdown.topFamily;
  if (topFamily === 'execution_gate') recommendations.push('inspect-execution-gate-thresholds-before-model-tuning');
  if (topFamily === 'data_coverage') recommendations.push('improve-review-data-coverage-before-attributing-skip-pressure-to-ranking');
  if (topFamily === 'sizing_liquidity') recommendations.push('review-budget-min-qty-and-notional-constraints');
  if (topFamily === 'ranking_filter') recommendations.push('audit-ranking-cutoffs-and-selection-thresholds');
  if (topFamily === 'data_quality') recommendations.push('repair-price-and-close-data-quality-issues-before-expanding-universe');
  if (skipBreakdown.topReason === 'signal-generated-but-not-filled') recommendations.push('trace-unfilled-orders-from-signal-to-order-fill-gates');
  if (executionBreakdown.topReason === 'execution:buy-range-not-hit' || executionBreakdown.topReason === 'execution:sell-range-not-hit') recommendations.push('inspect-entry-range-width-and-fill-price-policy');
  if (executionBreakdown.topReason === 'execution:insufficient-cash') recommendations.push('review-cash-allocation-and-order-sizing-before-relaxing-filters');
  if (executionBreakdown.topReason === 'execution:trade-guard-blocked') recommendations.push('audit-trade-guard-thresholds-before-expanding-signal-volume');
  if (!recommendations.length && skipBreakdown.skippedRows > 0) recommendations.push('review-dominant-skip-reason-before-changing-strategy-logic');
  return [...new Set(recommendations)].slice(0, 5);
}




function statusFromSeverity(severity) {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'BLOCKED';
  if (severity === 'MEDIUM') return 'WARNING';
  return 'CLEARED';
}

function transitionGateForEntry(entry) {
  if (entry.primaryIssue === 'missing-close') return 'close-series-backfill-complete';
  if (entry.primaryIssue === 'not-enough-trade-days') return 'future-trade-days-accumulated';
  if (entry.primaryIssue === 'invalid-data') return 'invalid-price-data-repaired';
  if (entry.executionGateMarks > entry.dataRelatedMarks) return 'execution-path-validated';
  return 'repair-notes-reviewed';
}

function buildSymbolRepairTransitions(coverageMap, evaluationReadiness) {
  const symbols = (coverageMap.symbols || []).map((entry, index) => {
    const currentStatus = statusFromSeverity(entry.blockerSeverity);
    const targetStatus = currentStatus === 'BLOCKED' ? 'WARNING' : (currentStatus === 'WARNING' ? 'CLEARED' : 'CLEARED');
    const transitionGate = transitionGateForEntry(entry);
    const readinessAfterTransition = targetStatus === 'CLEARED'
      ? (evaluationReadiness.strategyEvaluable ? 'STRATEGY_EVALUATION' : 'VALIDATE_EXECUTION_AFTER_REPAIR')
      : 'VALIDATE_REPAIRED_DATA';
    return {
      ...entry,
      priority: `P${Math.min(index + 1, 9)}`,
      currentStatus,
      targetStatus,
      transitionGate,
      readinessAfterTransition,
    };
  });

  const blockedToWarning = symbols.filter((entry) => entry.currentStatus === 'BLOCKED').length;
  const warningToCleared = symbols.filter((entry) => entry.currentStatus === 'WARNING').length;
  const alreadyCleared = symbols.filter((entry) => entry.currentStatus === 'CLEARED').length;
  const gateCounts = {}
  for (const entry of symbols) {
    gateCounts[entry.transitionGate] = (gateCounts[entry.transitionGate] || 0) + 1;
  }
  const dominantTransitionGate = Object.entries(gateCounts).sort((a,b)=> b[1]-a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || '—';
  const nextTransitionPhase = blockedToWarning > 0
    ? 'REPAIR_BLOCKERS'
    : (warningToCleared > 0 ? 'VALIDATE_REPAIRED_DATA' : 'STRATEGY_EVALUATION');

  return {
    symbols,
    summary: {
      trackedSymbols: symbols.length,
      blockedToWarningCandidates: blockedToWarning,
      warningToClearedCandidates: warningToCleared,
      alreadyCleared,
      dominantTransitionGate,
      nextTransitionPhase,
    },
  };
}

function buildSymbolRepairTransitionActions(transitions, evaluationReadiness) {
  const actions = [];
  if ((transitions.summary.blockedToWarningCandidates || 0) > 0) {
    actions.push('promote-blocked-symbols-to-warning-by-closing-primary-repair-gates');
  }
  if ((transitions.summary.warningToClearedCandidates || 0) > 0) {
    actions.push('validate-warning-symbols-and-clear-them-after-repair-checks');
  }
  if ((evaluationReadiness.executionSampleStatus || 'EMPTY') === 'EMPTY') {
    actions.push('collect-executed-samples-after-symbols-exit-blocked-state');
  }
  if ((transitions.summary.alreadyCleared || 0) > 0) {
    actions.push('advance-cleared-symbols-to-strategy-evaluation');
  }
  if (!actions.length) actions.push('maintain-current-symbol-transition-state');
  return [...new Set(actions)].slice(0, 7);
}


function buildWarningClearance(symbolTransitions, evaluationReadiness) {
  const warningSymbols = (symbolTransitions.symbols || []).filter((entry) => entry.currentStatus === 'WARNING').map((entry) => {
    let executionRequirement = 'executed-sample-ready';
    let sampleRequirement = 'minimal-evaluable-threshold-met';
    let clearanceStatus = 'READY_FOR_CLEARED';
    let readinessAfterClearance = 'STRATEGY_EVALUATION';

    if (evaluationReadiness.executionSampleStatus === 'EMPTY') {
      executionRequirement = 'first-executed-sample-observed';
      sampleRequirement = 'minimal-evaluable-threshold-pending';
      clearanceStatus = 'WAITING_EXECUTION';
      readinessAfterClearance = 'EXECUTION_COLLECTION';
    } else if (evaluationReadiness.executionSampleStatus === 'SPARSE') {
      executionRequirement = 'executed-sample-depth-improved';
      sampleRequirement = evaluationReadiness.strategyEdgeAssessable ? 'minimal-evaluable-threshold-met' : 'minimal-evaluable-threshold-pending';
      clearanceStatus = evaluationReadiness.strategyEdgeAssessable ? 'WAITING_RECHECK' : 'WAITING_SAMPLE_DEPTH';
      readinessAfterClearance = evaluationReadiness.strategyEdgeAssessable ? 'VALIDATE_REPAIRED_DATA' : 'EDGE_COLLECTION';
    } else if (!evaluationReadiness.strategyEdgeAssessable) {
      sampleRequirement = 'minimal-evaluable-threshold-pending';
      clearanceStatus = 'WAITING_SAMPLE_DEPTH';
      readinessAfterClearance = 'EDGE_COLLECTION';
    }

    return {
      ...entry,
      targetStatus: 'CLEARED',
      clearanceGate: 'repaired-data-recheck-pass',
      executionRequirement,
      sampleRequirement,
      clearanceStatus,
      readinessAfterClearance,
    };
  });

  const warningReadyForClearance = warningSymbols.filter((entry) => entry.clearanceStatus === 'READY_FOR_CLEARED').length;
  const warningBlockedByExecution = warningSymbols.filter((entry) => entry.clearanceStatus === 'WAITING_EXECUTION').length;
  const warningBlockedBySampleDepth = warningSymbols.filter((entry) => entry.clearanceStatus === 'WAITING_SAMPLE_DEPTH').length;
  const warningWaitingRecheck = warningSymbols.filter((entry) => entry.clearanceStatus === 'WAITING_RECHECK').length;
  const gateCounts = new Map();
  for (const entry of warningSymbols) {
    gateCounts.set(entry.clearanceGate, (gateCounts.get(entry.clearanceGate) || 0) + 1);
  }
  const dominantClearanceGate = [...gateCounts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || 'none';

  let nextClearancePhase = 'STRATEGY_EVALUATION';
  if (warningSymbols.length === 0) {
    nextClearancePhase = (symbolTransitions.summary.blockedToWarningCandidates || 0) > 0 ? 'REPAIR_BLOCKERS' : 'VALIDATE_REPAIRED_DATA';
  } else if (warningBlockedByExecution > 0) {
    nextClearancePhase = 'EXECUTION_COLLECTION';
  } else if (warningBlockedBySampleDepth > 0) {
    nextClearancePhase = 'EDGE_COLLECTION';
  } else if (warningWaitingRecheck > 0) {
    nextClearancePhase = 'VALIDATE_REPAIRED_DATA';
  }

  return {
    symbols: warningSymbols,
    summary: {
      warningSymbols: warningSymbols.length,
      warningReadyForClearance,
      warningBlockedByExecution,
      warningBlockedBySampleDepth,
      warningWaitingRecheck,
      clearedCandidates: warningReadyForClearance,
      dominantClearanceGate,
      nextClearancePhase,
    },
  };
}

function buildWarningClearanceActions(warningClearance, symbolTransitions, evaluationReadiness) {
  const actions = [];
  if ((warningClearance.summary.warningSymbols || 0) === 0) {
    if ((symbolTransitions.summary.blockedToWarningCandidates || 0) > 0) {
      actions.push('move-blocked-symbols-into-warning-state-before-cleared-validation');
    } else {
      actions.push('maintain-cleared-validation-watchlist');
    }
  }
  if ((warningClearance.summary.warningBlockedByExecution || 0) > 0) {
    actions.push('collect-executed-samples-for-warning-symbols-before-clearing');
  }
  if ((warningClearance.summary.warningBlockedBySampleDepth || 0) > 0) {
    actions.push('increase-evaluable-depth-before-promoting-warning-symbols-to-cleared');
  }
  if ((warningClearance.summary.warningWaitingRecheck || 0) > 0 || (warningClearance.summary.warningReadyForClearance || 0) > 0) {
    actions.push('rerun-repaired-data-checks-before-setting-warning-symbols-to-cleared');
  }
  if ((warningClearance.summary.clearedCandidates || 0) > 0) {
    actions.push('promote-cleared-candidates-into-strategy-evaluation');
  }
  if (actions.length === 0) actions.push('no-warning-clearance-actions-required');
  return [...new Set(actions)].slice(0, 7);
}


function blockedRequiredDataFix(entry) {
  if (entry.primaryIssue === 'missing-close') return 'backfill-close-series';
  if (entry.primaryIssue === 'not-enough-trade-days') return 'await-trade-date-coverage-accumulation';
  if (entry.primaryIssue === 'invalid-data') return 'repair-invalid-price-data';
  if (entry.executionGateMarks > entry.dataRelatedMarks) return 'inspect-execution-path';
  return 'review-repair-notes';
}

function buildBlockedRepairCompletion(symbolTransitions) {
  const blockedSymbols = (symbolTransitions.symbols || []).filter((entry) => entry.currentStatus === 'BLOCKED').map((entry) => ({
    ...entry,
    completionGate: entry.transitionGate,
    requiredDataFix: blockedRequiredDataFix(entry),
    requiredRecheck: 'rerun-scoreboard-after-repair',
    completionStatus: 'OPEN',
    nextStatusAfterCompletion: 'WARNING',
    readinessAfterCompletion: 'VALIDATE_REPAIRED_DATA',
  }));

  const gateCounts = new Map();
  for (const entry of blockedSymbols) {
    gateCounts.set(entry.completionGate, (gateCounts.get(entry.completionGate) || 0) + 1);
  }
  const dominantCompletionGate = [...gateCounts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || 'none';

  return {
    symbols: blockedSymbols,
    summary: {
      blockedSymbols: blockedSymbols.length,
      blockedReadyForCompletion: 0,
      blockedWaitingDataFix: blockedSymbols.length,
      blockedWaitingRecheck: 0,
      dominantCompletionGate,
      nextBlockedPhase: blockedSymbols.length > 0 ? 'DATA_REPAIR' : 'WARNING_VALIDATION',
    },
  };
}

function buildBlockedRepairCompletionActions(blockedCompletion) {
  const actions = [];
  if ((blockedCompletion.summary.blockedSymbols || 0) > 0) {
    actions.push('close-primary-data-gaps-for-blocked-symbols');
    actions.push('rerun-scoreboard-once-blocked-completion-gates-close');
    actions.push('promote-completed-blocked-symbols-into-warning-validation');
  } else {
    actions.push('no-blocked-repair-completion-actions-required');
  }
  return [...new Set(actions)].slice(0, 7);
}


function buildPostRepairRecheckOutcomes(blockedCompletion, warningClearance, evaluationReadiness) {
  const candidates = (blockedCompletion.symbols || []).filter((entry) => entry.completionStatus !== 'OPEN').map((entry) => {
    let recheckStatus = 'READY_FOR_RECHECK';
    let nextStatus = 'WARNING';
    let recheckGate = 'repaired-data-recheck-pass';
    let readinessAfterRecheck = 'VALIDATE_REPAIRED_DATA';

    if (evaluationReadiness.executionSampleStatus === 'EMPTY') {
      recheckStatus = 'WAITING_EXECUTION';
      readinessAfterRecheck = 'EXECUTION_COLLECTION';
    } else if (!evaluationReadiness.strategyEdgeAssessable) {
      recheckStatus = 'WAITING_SAMPLE_DEPTH';
      readinessAfterRecheck = 'EDGE_COLLECTION';
    }

    return {
      symbol: entry.symbol,
      priority: entry.priority,
      currentStatus: entry.currentStatus,
      targetStatus: nextStatus,
      recheckGate,
      recheckStatus,
      readinessAfterRecheck,
    };
  });

  const recheckReadySymbols = candidates.filter((entry) => entry.recheckStatus === 'READY_FOR_RECHECK').length;
  const recheckWaitingExecution = candidates.filter((entry) => entry.recheckStatus === 'WAITING_EXECUTION').length;
  const recheckWaitingSampleDepth = candidates.filter((entry) => entry.recheckStatus === 'WAITING_SAMPLE_DEPTH').length;
  const gateCounts = new Map();
  for (const entry of candidates) {
    gateCounts.set(entry.recheckGate, (gateCounts.get(entry.recheckGate) || 0) + 1);
  }
  const dominantRecheckGate = [...gateCounts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || 'none';

  let nextRecheckPhase = 'STRATEGY_EVALUATION';
  if (candidates.length === 0) {
    nextRecheckPhase = (blockedCompletion.summary.blockedSymbols || 0) > 0 ? 'DATA_REPAIR' : ((warningClearance.summary.warningSymbols || 0) > 0 ? 'VALIDATE_REPAIRED_DATA' : 'STRATEGY_EVALUATION');
  } else if (recheckWaitingExecution > 0) {
    nextRecheckPhase = 'EXECUTION_COLLECTION';
  } else if (recheckWaitingSampleDepth > 0) {
    nextRecheckPhase = 'EDGE_COLLECTION';
  } else {
    nextRecheckPhase = 'VALIDATE_REPAIRED_DATA';
  }

  return {
    symbols: candidates,
    summary: {
      trackedRecheckSymbols: candidates.length,
      recheckReadySymbols,
      recheckPassedSymbols: 0,
      recheckFailedSymbols: 0,
      recheckWaitingExecution,
      recheckWaitingSampleDepth,
      dominantRecheckGate,
      nextRecheckPhase,
    },
  };
}


function buildRepairPromotionReadiness(postRepairRecheck, blockedCompletion, warningClearance) {
  const candidates = (postRepairRecheck.symbols || []).filter((entry) => entry.recheckStatus === 'READY_FOR_RECHECK').map((entry) => ({
    ...entry,
    promotionGate: 'post-repair-recheck-pass',
    promotionStatus: 'READY_FOR_PROMOTION',
    promotedStatus: 'WARNING',
    nextReadinessPhase: 'VALIDATE_REPAIRED_DATA',
  }));

  const gateCounts = new Map();
  for (const entry of candidates) {
    gateCounts.set(entry.promotionGate, (gateCounts.get(entry.promotionGate) || 0) + 1);
  }
  const dominantPromotionGate = [...gateCounts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || 'none';

  let nextPromotionPhase = 'STRATEGY_EVALUATION';
  if (candidates.length === 0) {
    if ((blockedCompletion.summary.blockedSymbols || 0) > 0) nextPromotionPhase = 'DATA_REPAIR';
    else if ((warningClearance.summary.warningSymbols || 0) > 0) nextPromotionPhase = 'WARNING_VALIDATION';
    else nextPromotionPhase = 'VALIDATE_REPAIRED_DATA';
  } else {
    nextPromotionPhase = 'VALIDATE_REPAIRED_DATA';
  }

  return {
    symbols: candidates,
    summary: {
      trackedPromotionSymbols: candidates.length,
      promotionReadySymbols: candidates.length,
      promotionBlockedByRecheck: 0,
      promotionBlockedByExecution: 0,
      promotionBlockedBySampleDepth: 0,
      dominantPromotionGate,
      nextPromotionPhase,
    },
  };
}

function buildRepairPromotionActions(promotionReadiness, postRepairRecheck, blockedCompletion) {
  const actions = [];
  if ((promotionReadiness.summary.trackedPromotionSymbols || 0) === 0) {
    if ((postRepairRecheck.summary.trackedRecheckSymbols || 0) === 0) {
      if ((blockedCompletion.summary.blockedSymbols || 0) > 0) actions.push('complete-data-repair-before-promotion-readiness');
      else actions.push('wait-for-recheck-ready-symbols-before-promotion');
    } else {
      actions.push('complete-post-repair-recheck-before-promotion');
    }
  }
  if ((promotionReadiness.summary.promotionReadySymbols || 0) > 0) {
    actions.push('promote-recheck-ready-symbols-into-warning-state');
  }
  if (!actions.length) actions.push('no-repair-promotion-actions-required');
  return [...new Set(actions)].slice(0, 7);
}
function buildPostRepairRecheckActions(postRepairRecheck, blockedCompletion, warningClearance) {
  const actions = [];
  if ((postRepairRecheck.summary.trackedRecheckSymbols || 0) === 0) {
    if ((blockedCompletion.summary.blockedSymbols || 0) > 0) {
      actions.push('complete-blocked-repair-gates-before-post-repair-recheck');
    } else if ((warningClearance.summary.warningSymbols || 0) > 0) {
      actions.push('promote-warning-symbols-into-post-repair-recheck-candidate-state');
    } else {
      actions.push('maintain-post-repair-watchlist-for-newly-repaired-symbols');
    }
  }
  if ((postRepairRecheck.summary.recheckWaitingExecution || 0) > 0) {
    actions.push('collect-executed-samples-before-running-post-repair-recheck');
  }
  if ((postRepairRecheck.summary.recheckWaitingSampleDepth || 0) > 0) {
    actions.push('increase-sample-depth-before-accepting-post-repair-recheck');
  }
  if ((postRepairRecheck.summary.recheckReadySymbols || 0) > 0) {
    actions.push('run-post-repair-recheck-and-promote-passing-symbols-to-warning');
  }
  if (!actions.length) actions.push('no-post-repair-recheck-actions-required');
  return [...new Set(actions)].slice(0, 7);
}

function buildRepairReadiness(coverageMap, evaluationReadiness) {
  const severityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
  const symbols = coverageMap.symbols || [];
  const blockedSymbols = symbols.filter((entry) => (severityOrder[entry.blockerSeverity] || 0) >= 3);
  const warningSymbols = symbols.filter((entry) => entry.blockerSeverity === 'MEDIUM');
  const clearedSymbols = symbols.filter((entry) => (severityOrder[entry.blockerSeverity] || 0) <= 1);
  const repairActionCounts = new Map();
  for (const entry of coverageMap.repairTargets || []) {
    repairActionCounts.set(entry.repairAction, (repairActionCounts.get(entry.repairAction) || 0) + 1);
  }
  const dominantRepairAction = [...repairActionCounts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || '—';
  let blockerClearanceStatus = 'CLEARED';
  if (evaluationReadiness.releaseBlocker || blockedSymbols.length > 0) blockerClearanceStatus = 'BLOCKED';
  else if (warningSymbols.length > 0 || !evaluationReadiness.strategyEvaluable) blockerClearanceStatus = 'PARTIAL';

  let repairProgressStage = 'READY_FOR_STRATEGY_EVALUATION';
  if (blockerClearanceStatus === 'BLOCKED') repairProgressStage = 'DATA_REPAIR_REQUIRED';
  else if (!evaluationReadiness.strategyEvaluable || !evaluationReadiness.strategyEdgeAssessable) repairProgressStage = 'POST_REPAIR_VALIDATION';

  const readyForStrategyEvaluation = blockerClearanceStatus === 'CLEARED'
    && evaluationReadiness.strategyEvaluable
    && evaluationReadiness.strategyEdgeAssessable;

  const postRepairNextPhase = readyForStrategyEvaluation
    ? 'STRATEGY_EVALUATION'
    : (blockerClearanceStatus === 'BLOCKED' ? 'DATA_REPAIR' : 'VALIDATE_REPAIRED_DATA');

  return {
    trackedSymbols: symbols.length,
    blockedSymbols: blockedSymbols.length,
    warningSymbols: warningSymbols.length,
    clearedSymbols: clearedSymbols.length,
    criticalTargets: symbols.filter((entry) => entry.blockerSeverity === 'CRITICAL').length,
    highTargets: symbols.filter((entry) => entry.blockerSeverity === 'HIGH').length,
    mediumTargets: warningSymbols.length,
    dominantRepairAction,
    blockerClearanceStatus,
    repairProgressStage,
    readyForStrategyEvaluation,
    postRepairNextPhase,
  };
}

function buildRepairProgressFindings(repairReadiness, coverageMap, evaluationReadiness) {
  const findings = [];
  if (repairReadiness.blockerClearanceStatus === 'BLOCKED') findings.push('repair-blockers-still-open');
  if ((repairReadiness.criticalTargets || 0) > 0) findings.push('critical-symbol-repair-targets-remain');
  if ((repairReadiness.dominantRepairAction || '—') === 'backfill-close-series') findings.push('close-series-backfill-remains-primary-repair-path');
  if (evaluationReadiness.executionSampleStatus === 'EMPTY') findings.push('post-repair-execution-validation-still-pending');
  if (repairReadiness.readyForStrategyEvaluation) findings.push('repair-state-ready-for-strategy-evaluation');
  if (!findings.length) findings.push('repair-readiness-stable-no-new-findings');
  return findings.slice(0, 7);
}

function buildRepairProgressActions(repairReadiness, coverageMap, evaluationReadiness) {
  const actions = [];
  if (repairReadiness.blockerClearanceStatus === 'BLOCKED') actions.push('close-open-repair-targets-before-promoting-strategy-work');
  if ((repairReadiness.dominantRepairAction || '—') === 'backfill-close-series') actions.push('complete-close-series-backfill-for-priority-symbols');
  if ((repairReadiness.highTargets || 0) > 0 || (repairReadiness.mediumTargets || 0) > 0) actions.push('rerun-scoreboard-after-data-backfill-to-check-blocker-clearance');
  if (evaluationReadiness.executionSampleStatus === 'EMPTY') actions.push('collect-first-executed-samples-after-data-repair');
  if (repairReadiness.readyForStrategyEvaluation) actions.push('advance-to-strategy-evaluation-and-edge-validation');
  if (!actions.length) actions.push('maintain-current-repair-state-and-monitor-new-blockers');
  return [...new Set(actions)].slice(0, 7);
}


if (diagnosisRecords.length > 0) {
  const dominantStatusConsensus = mostCommon(diagnosisRecords, (record) => record.diagnosis.dominantStatus);
  const gatePressureConsensus = mostCommon(diagnosisRecords, (record) => record.diagnosis.gatePressure);
  const edgeStateConsensus = mostCommon(diagnosisRecords, (record) => record.diagnosis.edgeState);
  const horizonSignalConsensus = mostCommon(diagnosisRecords, (record) => record.diagnosis.horizonSignalStrength);

  const strongestSignalOrder = { STRONG: 4, MODERATE: 3, WEAK: 2, INERT: 1, NONE: 0 };
  const strongestSignalRecord = [...diagnosisRecords].sort((a, b) => {
    const scoreDiff = (strongestSignalOrder[b.diagnosis.horizonSignalStrength] ?? -1) - (strongestSignalOrder[a.diagnosis.horizonSignalStrength] ?? -1);
    if (scoreDiff !== 0) return scoreDiff;
    const decisiveDiff = b.decisiveRate - a.decisiveRate;
    if (decisiveDiff !== 0) return decisiveDiff;
    return a.checkpoint.localeCompare(b.checkpoint);
  })[0];

  const maxGapRecord = [...diagnosisRecords].sort((a, b) => {
    const aGap = Number.parseFloat(String(a.diagnosis.executionCoverageGap).replace('%', '')) || 0;
    const bGap = Number.parseFloat(String(b.diagnosis.executionCoverageGap).replace('%', '')) || 0;
    return bGap - aGap || a.checkpoint.localeCompare(b.checkpoint);
  })[0];

  const avgPositiveRate = diagnosisRecords.length
    ? diagnosisRecords.reduce((sum, record) => sum + record.positiveRate, 0) / diagnosisRecords.length
    : NaN;
  const avgExecutedShare = diagnosisRecords.length
    ? diagnosisRecords.reduce((sum, record) => sum + (record.evaluable > 0 ? (record.executedEvaluable / record.evaluable) * 100 : 0), 0) / diagnosisRecords.length
    : NaN;
  const maxExecutionCoverageGap = Number.parseFloat(String(maxGapRecord?.diagnosis.executionCoverageGap ?? '0').replace('%', '')) || 0;
  const batchSummary = {
    dominantStatusConsensus,
    gatePressureConsensus,
    edgeStateConsensus,
    horizonSignalConsensus,
    strongestHorizonCheckpoint: strongestSignalRecord?.checkpoint ?? '—',
    strongestHorizonSignal: strongestSignalRecord?.diagnosis.horizonSignalStrength ?? '—',
    maxExecutionCoverageGap,
    maxExecutionCoverageGapCheckpoint: maxGapRecord?.checkpoint ?? '—',
    avgPositiveRate: Number.isFinite(avgPositiveRate) ? avgPositiveRate : NaN,
    avgExecutedShare: Number.isFinite(avgExecutedShare) ? avgExecutedShare : NaN,
  };

  console.log('batch_level_summary:');
  console.log(`evaluated_checkpoints=${diagnosisRecords.length}`);
  console.log(`dominant_status_consensus=${dominantStatusConsensus}`);
  console.log(`gate_pressure_consensus=${gatePressureConsensus}`);
  console.log(`edge_state_consensus=${edgeStateConsensus}`);
  console.log(`horizon_signal_consensus=${horizonSignalConsensus}`);
  console.log(`strongest_horizon_checkpoint=${batchSummary.strongestHorizonCheckpoint}`);
  console.log(`strongest_horizon_signal=${batchSummary.strongestHorizonSignal}`);
  console.log(`max_execution_coverage_gap=${Number.isFinite(batchSummary.maxExecutionCoverageGap) ? `${batchSummary.maxExecutionCoverageGap.toFixed(2)}%` : '0.00%'}`);
  console.log(`max_execution_coverage_gap_checkpoint=${batchSummary.maxExecutionCoverageGapCheckpoint}`);
  console.log(`average_positive_rate=${Number.isFinite(batchSummary.avgPositiveRate) ? `${batchSummary.avgPositiveRate.toFixed(2)}%` : '—'}`);
  console.log(`average_executed_share=${Number.isFinite(batchSummary.avgExecutedShare) ? `${batchSummary.avgExecutedShare.toFixed(2)}%` : '—'}`);
  console.log('');

  const findings = uniqueFindings([
    diagnosisRecords.every((record) => record.diagnosis.dominantStatus === 'skipped') ? 'skipped-dominates-all-checkpoints' : '',
    diagnosisRecords.every((record) => record.executedEvaluable === 0) ? 'no-executed-samples-observed' : '',
    diagnosisRecords.every((record) => record.diagnosis.gatePressure === 'HIGH') ? 'execution-gate-pressure-high-across-checkpoints' : '',
    diagnosisRecords.every((record) => record.diagnosis.edgeState === 'FLAT_SAMPLE') ? 'all-checkpoints-flat-sample' : '',
    diagnosisRecords.every((record) => record.diagnosis.horizonSignalStrength === 'INERT') ? 'horizon-signal-inert-across-checkpoints' : '',
    diagnosisRecords.some((record) => (Number.parseFloat(String(record.diagnosis.executionCoverageGap).replace('%', '')) || 0) >= 50) ? 'execution-coverage-gap-material' : '',
    strongestSignalRecord ? `strongest-horizon-${strongestSignalRecord.checkpoint.toLowerCase()}-${String(strongestSignalRecord.diagnosis.horizonSignalStrength || '').toLowerCase()}` : '',
  ]);

  console.log('top_findings:');
  findings.forEach((finding, index) => {
    console.log(`${index + 1}=${finding}`);
  });
  if (findings.length === 0) console.log('1=no-material-findings');
  console.log('');

  const recommendations = buildActionableRecommendations(diagnosisRecords, batchSummary);
  console.log('actionable_recommendations:');
  recommendations.forEach((recommendation, index) => {
    console.log(`${index + 1}=${recommendation}`);
  });
  if (recommendations.length === 0) console.log('1=no-action-required');
  console.log('');

  const skipBreakdown = buildSkipReasonBreakdown(normalizedItems);
const executionBreakdown = buildExecutionReasonBreakdown(normalizedItems);
  console.log('skip_reason_breakdown:');
  console.log(`skipped_rows=${skipBreakdown.skippedRows}`);
  console.log(`total_reason_marks=${skipBreakdown.totalReasonMarks}`);
  console.log(`top_reason=${skipBreakdown.topReason}`);
  console.log(`top_reason_share=${skipBreakdown.topReasonShare}`);
  console.log(`top_gate_family=${skipBreakdown.topFamily}`);
  console.log(`top_gate_family_share=${skipBreakdown.topFamilyShare}`);
  console.log('');

  console.log('gate_attribution:');
  if (skipBreakdown.sortedFamilies.length) {
    skipBreakdown.sortedFamilies.forEach(([family, count], index) => {
      const share = skipBreakdown.totalReasonMarks > 0 ? ((count / skipBreakdown.totalReasonMarks) * 100).toFixed(2) + '%' : '0.00%';
      console.log(`${index + 1}=${family}|count=${count}|share=${share}`);
    });
  } else {
    console.log('1=no-skip-gate-data');
  }
  console.log('');

  console.log('top_skip_reasons:');
  if (skipBreakdown.sortedReasons.length) {
    skipBreakdown.sortedReasons.slice(0, 7).forEach(([reason, count], index) => {
      const share = skipBreakdown.totalReasonMarks > 0 ? ((count / skipBreakdown.totalReasonMarks) * 100).toFixed(2) + '%' : '0.00%';
      console.log(`${index + 1}=${reason}|count=${count}|share=${share}`);
    });
  } else {
    console.log('1=no-skip-reasons-observed');
  }
  console.log('');

  const gateRecommendations = buildGateRecommendations(skipBreakdown, executionBreakdown);
  console.log('gate_actionables:');
  gateRecommendations.forEach((recommendation, index) => {
    console.log(`${index + 1}=${recommendation}`);
  });
  if (gateRecommendations.length === 0) console.log('1=no-gate-action-required');
  console.log('');

  const dataQualitySummary = buildDataQualitySummary(skipBreakdown);
  console.log('data_quality_summary:');
  console.log(`data_related_reason_share=${dataQualitySummary.dataRelatedShare}`);
  console.log(`dominant_data_issue=${dataQualitySummary.dominantDataIssue}`);
  console.log(`dominant_data_issue_share=${dataQualitySummary.dominantDataIssueShare}`);
  console.log(`coverage_issue_share=${dataQualitySummary.coverageIssueShare}`);
  console.log(`missing_data_issue_share=${dataQualitySummary.missingDataIssueShare}`);
  console.log(`data_quality_issue_share=${dataQualitySummary.dataQualityIssueShare}`);
  console.log(`execution_gate_share=${dataQualitySummary.executionGateShare}`);
  console.log(`data_blocking_severity=${dataQualitySummary.dataBlockingSeverity}`);
  console.log('');

  const dataQualityFindings = buildDataQualityFindings(dataQualitySummary);
  console.log('data_quality_findings:');
  dataQualityFindings.forEach((finding, index) => {
    console.log(`${index + 1}=${finding}`);
  });
  if (dataQualityFindings.length === 0) console.log('1=no-material-data-quality-findings');
  console.log('');

  const dataQualityActions = buildDataQualityActionables(dataQualitySummary);
  console.log('data_quality_actionables:');
  dataQualityActions.forEach((action, index) => {
    console.log(`${index + 1}=${action}`);
  });
  if (dataQualityActions.length === 0) console.log('1=no-material-data-quality-action-required');
  console.log('');

  const evaluationReadiness = buildEvaluationReadiness(dataQualitySummary, diagnosisRecords);
  console.log('evaluation_readiness:');
  console.log(`strategy_evaluable=${evaluationReadiness.strategyEvaluable ? 'true' : 'false'}`);
  console.log(`release_blocker=${evaluationReadiness.releaseBlocker ? 'true' : 'false'}`);
  console.log(`primary_blocker=${evaluationReadiness.primaryBlocker}`);
  console.log(`blocker_reason=${evaluationReadiness.blockerReason}`);
  console.log(`data_sufficiency=${evaluationReadiness.dataSufficiency}`);
  console.log(`execution_sample_status=${evaluationReadiness.executionSampleStatus}`);
  console.log(`strategy_edge_assessable=${evaluationReadiness.strategyEdgeAssessable ? 'true' : 'false'}`);
  console.log(`recommended_next_phase=${evaluationReadiness.recommendedNextPhase}`);
  console.log('');

  const coverageAccumulation = buildCoverageAccumulationSummary(batchRows[0] || null, evaluationReadiness);
  console.log('coverage_accumulation_summary:');
  console.log(`coverage_mode=${coverageAccumulation.coverageMode}`);
  console.log(`coverage_state=${coverageAccumulation.coverageState}`);
  console.log(`available_trade_dates=${coverageAccumulation.availableTradeDates}`);
  console.log(`latest_actionable_checkpoint=${coverageAccumulation.latestActionableCheckpoint}`);
  console.log(`next_unlock_checkpoint=${coverageAccumulation.nextUnlockCheckpoint}`);
  console.log(`future_trade_days_needed=${coverageAccumulation.futureTradeDaysNeeded}`);
  console.log(`unlocked_checkpoints=${coverageAccumulation.unlockedCheckpoints}`);
  console.log(`waiting_checkpoints=${coverageAccumulation.waitingCheckpoints}`);
  console.log('');

  const coverageMap = buildDataCoverageMap(normalizedItems);
  console.log('data_coverage_map:');
  if (coverageMap.symbols.length) {
    coverageMap.symbols.forEach((entry, index) => {
      console.log(`${index + 1}=${entry.symbol}|skipped_rows=${entry.skippedRows}|reason_marks=${entry.totalReasonMarks}|data_related_share=${entry.dataRelatedShare.toFixed(2)}%|missing_close=${entry.missingCloseMarks}|not_enough_trade_days=${entry.notEnoughTradeDaysMarks}|execution_gate=${entry.executionGateMarks}|primary_issue=${entry.primaryIssue}|primary_checkpoint=${entry.primaryCheckpoint}|blocker_severity=${entry.blockerSeverity}`);
    });
  } else {
    console.log('1=no-symbol-level-coverage-issues');
  }
  console.log('');

  console.log('repair_targets:');
  if (coverageMap.repairTargets.length) {
    coverageMap.repairTargets.forEach((entry, index) => {
      console.log(`${index + 1}=${entry.symbol}|priority=P${Math.min(index + 1, 9)}|issue=${entry.primaryIssue}|checkpoint=${entry.primaryCheckpoint}|severity=${entry.blockerSeverity}|action=${entry.repairAction}`);
    });
  } else {
    console.log('1=no-priority-repair-targets');
  }
  console.log('');

  const repairReadiness = buildRepairReadiness(coverageMap, evaluationReadiness);
  console.log('repair_readiness_summary:');
  console.log(`tracked_symbols=${repairReadiness.trackedSymbols}`);
  console.log(`blocked_symbols=${repairReadiness.blockedSymbols}`);
  console.log(`warning_symbols=${repairReadiness.warningSymbols}`);
  console.log(`cleared_symbols=${repairReadiness.clearedSymbols}`);
  console.log(`critical_targets=${repairReadiness.criticalTargets}`);
  console.log(`high_targets=${repairReadiness.highTargets}`);
  console.log(`medium_targets=${repairReadiness.mediumTargets}`);
  console.log(`dominant_repair_action=${repairReadiness.dominantRepairAction}`);
  console.log(`blocker_clearance_status=${repairReadiness.blockerClearanceStatus}`);
  console.log(`repair_progress_stage=${repairReadiness.repairProgressStage}`);
  console.log(`ready_for_strategy_evaluation=${repairReadiness.readyForStrategyEvaluation ? 'true' : 'false'}`);
  console.log(`post_repair_next_phase=${repairReadiness.postRepairNextPhase}`);
  console.log('');

  const repairProgressFindings = buildRepairProgressFindings(repairReadiness, coverageMap, evaluationReadiness);
  console.log('repair_progress_findings:');
  repairProgressFindings.forEach((finding, index) => {
    console.log(`${index + 1}=${finding}`);
  });
  if (repairProgressFindings.length === 0) console.log('1=no-repair-progress-findings');
  console.log('');

  const repairProgressActions = buildRepairProgressActions(repairReadiness, coverageMap, evaluationReadiness);
  console.log('repair_progress_actions:');
  repairProgressActions.forEach((action, index) => {
    console.log(`${index + 1}=${action}`);
  });
  if (repairProgressActions.length === 0) console.log('1=no-repair-progress-actions');
  console.log('');

  const symbolTransitions = buildSymbolRepairTransitions(coverageMap, evaluationReadiness);
  console.log('symbol_repair_status_transitions:');
  if (symbolTransitions.symbols.length) {
    symbolTransitions.symbols.forEach((entry, index) => {
      console.log(`${index + 1}=${entry.symbol}|priority=${entry.priority}|current_status=${entry.currentStatus}|target_status=${entry.targetStatus}|transition_gate=${entry.transitionGate}|readiness_after_transition=${entry.readinessAfterTransition}`);
    });
  } else {
    console.log('1=no-symbol-repair-transitions');
  }
  console.log('');

  console.log('repair_transition_summary:');
  console.log(`tracked_symbols=${symbolTransitions.summary.trackedSymbols}`);
  console.log(`blocked_to_warning_candidates=${symbolTransitions.summary.blockedToWarningCandidates}`);
  console.log(`warning_to_cleared_candidates=${symbolTransitions.summary.warningToClearedCandidates}`);
  console.log(`already_cleared=${symbolTransitions.summary.alreadyCleared}`);
  console.log(`dominant_transition_gate=${symbolTransitions.summary.dominantTransitionGate}`);
  console.log(`next_transition_phase=${symbolTransitions.summary.nextTransitionPhase}`);
  console.log('');

  const symbolTransitionActions = buildSymbolRepairTransitionActions(symbolTransitions, evaluationReadiness);
  console.log('repair_transition_actions:');
  symbolTransitionActions.forEach((action, index) => {
    console.log(`${index + 1}=${action}`);
  });
  if (symbolTransitionActions.length === 0) console.log('1=no-repair-transition-actions');
  console.log('');

  const warningClearance = buildWarningClearance(symbolTransitions, evaluationReadiness);
  console.log('symbol_warning_clearance_requirements:');
  if (warningClearance.symbols.length) {
    warningClearance.symbols.forEach((entry, index) => {
      console.log(`${index + 1}=${entry.symbol}|priority=${entry.priority}|current_status=${entry.currentStatus}|target_status=${entry.targetStatus}|clearance_gate=${entry.clearanceGate}|execution_requirement=${entry.executionRequirement}|sample_requirement=${entry.sampleRequirement}|clearance_status=${entry.clearanceStatus}|readiness_after_clearance=${entry.readinessAfterClearance}`);
    });
  } else {
    console.log('1=no-warning-symbols-awaiting-clearance');
  }
  console.log('');

  console.log('warning_clearance_summary:');
  console.log(`warning_symbols=${warningClearance.summary.warningSymbols}`);
  console.log(`warning_ready_for_clearance=${warningClearance.summary.warningReadyForClearance}`);
  console.log(`warning_blocked_by_execution=${warningClearance.summary.warningBlockedByExecution}`);
  console.log(`warning_blocked_by_sample_depth=${warningClearance.summary.warningBlockedBySampleDepth}`);
  console.log(`warning_waiting_recheck=${warningClearance.summary.warningWaitingRecheck}`);
  console.log(`cleared_candidates=${warningClearance.summary.clearedCandidates}`);
  console.log(`dominant_clearance_gate=${warningClearance.summary.dominantClearanceGate}`);
  console.log(`next_clearance_phase=${warningClearance.summary.nextClearancePhase}`);
  console.log('');

  const warningClearanceActions = buildWarningClearanceActions(warningClearance, symbolTransitions, evaluationReadiness);
  console.log('warning_clearance_actions:');
  warningClearanceActions.forEach((action, index) => {
    console.log(`${index + 1}=${action}`);
  });
  if (warningClearanceActions.length === 0) console.log('1=no-warning-clearance-actions');
  console.log('');


  const blockedRepairCompletion = buildBlockedRepairCompletion(symbolTransitions);
  console.log('symbol_blocked_repair_completion_criteria:');
  if (blockedRepairCompletion.symbols.length) {
    blockedRepairCompletion.symbols.forEach((entry, index) => {
      console.log(`${index + 1}=${entry.symbol}|priority=${entry.priority}|current_status=${entry.currentStatus}|target_status=${entry.nextStatusAfterCompletion}|completion_gate=${entry.completionGate}|required_data_fix=${entry.requiredDataFix}|required_recheck=${entry.requiredRecheck}|completion_status=${entry.completionStatus}|readiness_after_completion=${entry.readinessAfterCompletion}`);
    });
  } else {
    console.log('1=no-blocked-symbols-awaiting-completion');
  }
  console.log('');

  console.log('blocked_repair_completion_summary:');
  console.log(`blocked_symbols=${blockedRepairCompletion.summary.blockedSymbols}`);
  console.log(`blocked_ready_for_completion=${blockedRepairCompletion.summary.blockedReadyForCompletion}`);
  console.log(`blocked_waiting_data_fix=${blockedRepairCompletion.summary.blockedWaitingDataFix}`);
  console.log(`blocked_waiting_recheck=${blockedRepairCompletion.summary.blockedWaitingRecheck}`);
  console.log(`dominant_completion_gate=${blockedRepairCompletion.summary.dominantCompletionGate}`);
  console.log(`next_blocked_phase=${blockedRepairCompletion.summary.nextBlockedPhase}`);
  console.log('');

  const blockedRepairCompletionActions = buildBlockedRepairCompletionActions(blockedRepairCompletion);
  console.log('blocked_repair_completion_actions:');
  blockedRepairCompletionActions.forEach((action, index) => {
    console.log(`${index + 1}=${action}`);
  });
  if (blockedRepairCompletionActions.length === 0) console.log('1=no-blocked-repair-completion-actions');
  console.log('');

  const postRepairRecheck = buildPostRepairRecheckOutcomes(blockedRepairCompletion, warningClearance, evaluationReadiness);
  console.log('symbol_post_repair_recheck_outcomes:');
  if (postRepairRecheck.symbols.length) {
    postRepairRecheck.symbols.forEach((entry, index) => {
      console.log(`${index + 1}=${entry.symbol}|priority=${entry.priority}|current_status=${entry.currentStatus}|target_status=${entry.targetStatus}|recheck_gate=${entry.recheckGate}|recheck_status=${entry.recheckStatus}|readiness_after_recheck=${entry.readinessAfterRecheck}`);
    });
  } else {
    console.log('1=no-symbols-ready-for-post-repair-recheck');
  }
  console.log('');

  console.log('post_repair_recheck_summary:');
  console.log(`tracked_recheck_symbols=${postRepairRecheck.summary.trackedRecheckSymbols}`);
  console.log(`recheck_ready_symbols=${postRepairRecheck.summary.recheckReadySymbols}`);
  console.log(`recheck_passed_symbols=${postRepairRecheck.summary.recheckPassedSymbols}`);
  console.log(`recheck_failed_symbols=${postRepairRecheck.summary.recheckFailedSymbols}`);
  console.log(`recheck_waiting_execution=${postRepairRecheck.summary.recheckWaitingExecution}`);
  console.log(`recheck_waiting_sample_depth=${postRepairRecheck.summary.recheckWaitingSampleDepth}`);
  console.log(`dominant_recheck_gate=${postRepairRecheck.summary.dominantRecheckGate}`);
  console.log(`next_recheck_phase=${postRepairRecheck.summary.nextRecheckPhase}`);
  console.log('');

  const postRepairRecheckActions = buildPostRepairRecheckActions(postRepairRecheck, blockedRepairCompletion, warningClearance);
  console.log('post_repair_recheck_actions:');
  postRepairRecheckActions.forEach((action, index) => {
    console.log(`${index + 1}=${action}`);
  });
  if (postRepairRecheckActions.length === 0) console.log('1=no-post-repair-recheck-actions');
  console.log('');

  const repairPromotionReadiness = buildRepairPromotionReadiness(postRepairRecheck, blockedRepairCompletion, warningClearance);
  console.log('symbol_repair_promotion_readiness:');
  if (repairPromotionReadiness.symbols.length) {
    repairPromotionReadiness.symbols.forEach((entry, index) => {
      console.log(`${index + 1}=${entry.symbol}|priority=${entry.priority}|current_status=${entry.currentStatus}|target_status=${entry.promotedStatus}|promotion_gate=${entry.promotionGate}|promotion_status=${entry.promotionStatus}|next_readiness_phase=${entry.nextReadinessPhase}`);
    });
  } else {
    console.log('1=no-symbols-ready-for-repair-promotion');
  }
  console.log('');

  console.log('repair_promotion_summary:');
  console.log(`tracked_promotion_symbols=${repairPromotionReadiness.summary.trackedPromotionSymbols}`);
  console.log(`promotion_ready_symbols=${repairPromotionReadiness.summary.promotionReadySymbols}`);
  console.log(`promotion_blocked_by_recheck=${repairPromotionReadiness.summary.promotionBlockedByRecheck}`);
  console.log(`promotion_blocked_by_execution=${repairPromotionReadiness.summary.promotionBlockedByExecution}`);
  console.log(`promotion_blocked_by_sample_depth=${repairPromotionReadiness.summary.promotionBlockedBySampleDepth}`);
  console.log(`dominant_promotion_gate=${repairPromotionReadiness.summary.dominantPromotionGate}`);
  console.log(`next_promotion_phase=${repairPromotionReadiness.summary.nextPromotionPhase}`);
  console.log('');

  const repairPromotionActions = buildRepairPromotionActions(repairPromotionReadiness, postRepairRecheck, blockedRepairCompletion);
  console.log('repair_promotion_actions:');
  repairPromotionActions.forEach((action, index) => {
    console.log(`${index + 1}=${action}`);
  });
  if (repairPromotionActions.length === 0) console.log('1=no-repair-promotion-actions');
  console.log('');

  const strategyEvaluationUnlock = buildStrategyEvaluationUnlock(repairPromotionReadiness, evaluationReadiness);
  console.log('symbol_strategy_evaluation_unlock:');
  if (strategyEvaluationUnlock.symbols.length) {
    strategyEvaluationUnlock.symbols.forEach((entry, index) => {
      console.log(`${index + 1}=${entry.symbol}|priority=${entry.priority}|current_status=${entry.currentStatus}|target_status=${entry.targetStatus}|unlock_gate=${entry.unlockGate}|unlock_status=${entry.unlockStatus}|required_execution=${entry.requiredExecution}|required_sample_depth=${entry.requiredSampleDepth}|strategy_phase_after_unlock=${entry.strategyPhaseAfterUnlock}`);
    });
  } else {
    console.log('1=no-symbols-ready-for-strategy-evaluation-unlock');
  }
  console.log('');

  console.log('strategy_evaluation_unlock_summary:');
  console.log(`tracked_unlock_symbols=${strategyEvaluationUnlock.summary.trackedUnlockSymbols}`);
  console.log(`unlock_ready_symbols=${strategyEvaluationUnlock.summary.unlockReadySymbols}`);
  console.log(`unlock_blocked_by_promotion=${strategyEvaluationUnlock.summary.unlockBlockedByPromotion}`);
  console.log(`unlock_blocked_by_execution=${strategyEvaluationUnlock.summary.unlockBlockedByExecution}`);
  console.log(`unlock_blocked_by_sample_depth=${strategyEvaluationUnlock.summary.unlockBlockedBySampleDepth}`);
  console.log(`strategy_evaluation_ready_symbols=${strategyEvaluationUnlock.summary.strategyEvaluationReadySymbols}`);
  console.log(`dominant_unlock_gate=${strategyEvaluationUnlock.summary.dominantUnlockGate}`);
  console.log(`next_unlock_phase=${strategyEvaluationUnlock.summary.nextUnlockPhase}`);
  console.log('');

  const strategyEvaluationUnlockActions = buildStrategyEvaluationUnlockActions(strategyEvaluationUnlock, repairPromotionReadiness);
  console.log('strategy_evaluation_unlock_actions:');
  strategyEvaluationUnlockActions.forEach((action, index) => {
    console.log(`${index + 1}=${action}`);
  });
  if (strategyEvaluationUnlockActions.length === 0) console.log('1=no-strategy-evaluation-unlock-actions');
  console.log('');

  const pipelineReadiness = buildPipelineReadinessSummary({
    repairReadiness,
    warningClearance,
    blockedRepairCompletion,
    postRepairRecheck,
    repairPromotionReadiness,
    strategyEvaluationUnlock,
    evaluationReadiness,
    totalSymbols,
  });
  console.log('pipeline_readiness_summary:');
  console.log(`total_tracked_symbols=${pipelineReadiness.summary.totalTrackedSymbols}`);
  console.log(`pipeline_ready_symbols=${pipelineReadiness.summary.pipelineReadySymbols}`);
  console.log(`pipeline_blocked_symbols=${pipelineReadiness.summary.pipelineBlockedSymbols}`);
  console.log(`blocked_symbols=${pipelineReadiness.summary.blockedSymbols}`);
  console.log(`warning_symbols=${pipelineReadiness.summary.warningSymbols}`);
  console.log(`recheck_symbols=${pipelineReadiness.summary.recheckSymbols}`);
  console.log(`promotion_symbols=${pipelineReadiness.summary.promotionSymbols}`);
  console.log(`unlock_ready_symbols=${pipelineReadiness.summary.unlockReadySymbols}`);
  console.log(`strategy_evaluation_ready_symbols=${pipelineReadiness.summary.strategyEvaluationReadySymbols}`);
  console.log(`pipeline_stage=${pipelineReadiness.summary.pipelineStage}`);
  console.log(`pipeline_blocker=${pipelineReadiness.summary.pipelineBlocker}`);
  console.log(`next_pipeline_phase=${pipelineReadiness.summary.nextPipelinePhase}`);
  console.log('');

  const pipelineReadinessFindings = buildPipelineReadinessFindings(pipelineReadiness);
  console.log('pipeline_readiness_findings:');
  pipelineReadinessFindings.forEach((finding, index) => {
    console.log(`${index + 1}=${finding}`);
  });
  if (pipelineReadinessFindings.length === 0) console.log('1=no-pipeline-readiness-findings');
  console.log('');

  const pipelineReadinessActions = buildPipelineReadinessActions(pipelineReadiness);
  console.log('pipeline_readiness_actions:');
  pipelineReadinessActions.forEach((action, index) => {
    console.log(`${index + 1}=${action}`);
  });
  if (pipelineReadinessActions.length === 0) console.log('1=no-pipeline-readiness-actions');
  console.log('');
  const pipelineAdvancementCriteria = buildPipelineAdvancementCriteria({
    pipelineReadiness,
    blockedRepairCompletion,
    warningClearance,
    postRepairRecheck,
    repairPromotionReadiness,
    strategyEvaluationUnlock,
  });
  console.log('pipeline_advancement_criteria:');
  if (pipelineAdvancementCriteria.stages.length) {
    pipelineAdvancementCriteria.stages.forEach((entry, index) => {
      console.log(`${index + 1}=${entry.stage}|current_status=${entry.currentStatus}|advancement_gate=${entry.advancementGate}|advancement_status=${entry.advancementStatus}|next_stage=${entry.nextStage}`);
    });
  } else {
    console.log('1=no-pipeline-advancement-criteria');
  }
  console.log('');

  console.log('pipeline_advancement_summary:');
  console.log(`tracked_stages=${pipelineAdvancementCriteria.summary.trackedStages}`);
  console.log(`ready_stages=${pipelineAdvancementCriteria.summary.readyStages}`);
  console.log(`blocked_stages=${pipelineAdvancementCriteria.summary.blockedStages}`);
  console.log(`current_pipeline_stage=${pipelineAdvancementCriteria.summary.currentPipelineStage}`);
  console.log(`dominant_advancement_gate=${pipelineAdvancementCriteria.summary.dominantAdvancementGate}`);
  console.log(`next_advancement_stage=${pipelineAdvancementCriteria.summary.nextAdvancementStage}`);
  console.log('');

  const pipelineAdvancementActions = buildPipelineAdvancementActions(pipelineAdvancementCriteria);
  console.log('pipeline_advancement_actions:');
  pipelineAdvancementActions.forEach((action, index) => {
    console.log(`${index + 1}=${action}`);
  });
  if (pipelineAdvancementActions.length === 0) console.log('1=no-pipeline-advancement-actions');
  console.log('');

  const operatorSummary = buildOperatorFinalDecisionSummary({
    pipelineReadiness,
    pipelineAdvancementCriteria,
    evaluationReadiness,
    repairReadiness,
  });
  console.log('operator_final_decision_summary:');
  console.log(`current_pipeline_stage=${operatorSummary.summary.currentPipelineStage}`);
  console.log(`final_decision=${operatorSummary.summary.finalDecision}`);
  console.log(`release_blocker=${operatorSummary.summary.releaseBlocker}`);
  console.log(`dominant_gate=${operatorSummary.summary.dominantGate}`);
  console.log(`operator_priority=${operatorSummary.summary.operatorPriority}`);
  console.log(`ready_symbols=${operatorSummary.summary.readySymbols}`);
  console.log(`blocked_symbols=${operatorSummary.summary.blockedSymbols}`);
  console.log(`immediate_next_action=${operatorSummary.summary.immediateNextAction}`);
  console.log('');

  const operatorFindings = buildOperatorFinalDecisionFindings(operatorSummary);
  console.log('operator_final_decision_findings:');
  operatorFindings.forEach((finding, index) => {
    console.log(`${index + 1}=${finding}`);
  });
  if (operatorFindings.length === 0) console.log('1=no-operator-final-decision-findings');
  console.log('');

  const operatorActions = buildOperatorFinalDecisionActions(operatorSummary);
  console.log('operator_final_decision_actions:');
  operatorActions.forEach((action, index) => {
    console.log(`${index + 1}=${action}`);
  });
  if (operatorActions.length === 0) console.log('1=no-operator-final-decision-actions');
  console.log('');

const weeklyRunGating = buildWeeklyRunGatingSummary({
  operatorSummary,
  evaluationReadiness,
  pipelineReadiness,
  latestBatch: batchRows[0] || null,
});
console.log('weekly_run_gating_summary:');
console.log(`report_mode=${weeklyRunGating.summary.reportMode}`);
console.log(`weekly_report_gate=${weeklyRunGating.summary.weeklyReportGate}`);
console.log(`weekly_simulation_gate=${weeklyRunGating.summary.weeklySimulationGate}`);
console.log(`should_publish_report=${weeklyRunGating.summary.shouldPublishReport}`);
console.log(`should_publish_simulation=${weeklyRunGating.summary.shouldPublishSimulation}`);
console.log(`gating_reason=${weeklyRunGating.summary.gatingReason}`);
console.log(`operator_weekly_decision=${weeklyRunGating.summary.operatorWeeklyDecision}`);
console.log('');

const weeklyRunGatingFindings = buildWeeklyRunGatingFindings(weeklyRunGating);
console.log('weekly_run_gating_findings:');
weeklyRunGatingFindings.forEach((finding, index) => {
  console.log(`${index + 1}=${finding}`);
});
if (weeklyRunGatingFindings.length === 0) console.log('1=no-weekly-run-gating-findings');
console.log('');

const weeklyRunGatingActions = buildWeeklyRunGatingActions(weeklyRunGating);
console.log('weekly_run_gating_actions:');
weeklyRunGatingActions.forEach((action, index) => {
  console.log(`${index + 1}=${action}`);
});
if (weeklyRunGatingActions.length === 0) console.log('1=no-weekly-run-gating-actions');
console.log('');


const weeklyOperatorMessage = buildWeeklyOperatorMessage(weeklyRunGating, operatorSummary, pipelineReadiness);
console.log('weekly_operator_message_summary:');
console.log(`headline=${weeklyOperatorMessage.summary.headline}`);
console.log(`operator_message=${weeklyOperatorMessage.summary.operatorMessage}`);
console.log(`publish_report=${weeklyOperatorMessage.summary.publishReport}`);
console.log(`publish_simulation=${weeklyOperatorMessage.summary.publishSimulation}`);
console.log(`payload_line=${weeklyOperatorMessage.summary.payloadLine}`);
console.log(`disclaimer=${weeklyOperatorMessage.summary.disclaimer}`);
console.log('');

console.log('weekly_operator_message_payload:');
weeklyOperatorMessage.payload.forEach((line, index) => {
  console.log(`${index + 1}=${line}`);
});
if (weeklyOperatorMessage.payload.length === 0) console.log('1=no-weekly-operator-message-payload');
console.log('');

const weeklyOperatorMessageActions = buildWeeklyOperatorMessageActions(weeklyOperatorMessage);
console.log('weekly_operator_message_actions:');
weeklyOperatorMessageActions.forEach((action, index) => {
  console.log(`${index + 1}=${action}`);
});
if (weeklyOperatorMessageActions.length === 0) console.log('1=no-weekly-operator-message-actions');
console.log('');

const deliveryFormatting = buildWeeklyDeliveryFormatting(weeklyOperatorMessage, weeklyRunGating, operatorSummary);
console.log('weekly_delivery_formatting_summary:');
console.log(`line_format=${deliveryFormatting.summary.lineFormat}`);
console.log(`email_format=${deliveryFormatting.summary.emailFormat}`);
console.log(`log_format=${deliveryFormatting.summary.logFormat}`);
console.log(`delivery_mode=${deliveryFormatting.summary.deliveryMode}`);
console.log(`message_title=${deliveryFormatting.summary.messageTitle}`);
console.log(`delivery_disclaimer=${deliveryFormatting.summary.deliveryDisclaimer}`);
console.log('');

console.log('weekly_delivery_formatting_blocks:');
deliveryFormatting.blocks.forEach((line, index) => {
  console.log(`${index + 1}=${line}`);
});
if (deliveryFormatting.blocks.length === 0) console.log('1=no-weekly-delivery-formatting-blocks');
console.log('');

const deliveryFormattingActions = buildWeeklyDeliveryFormattingActions(deliveryFormatting);
console.log('weekly_delivery_formatting_actions:');
deliveryFormattingActions.forEach((action, index) => {
  console.log(`${index + 1}=${action}`);
});
if (deliveryFormattingActions.length === 0) console.log('1=no-weekly-delivery-formatting-actions');
console.log('');
}

console.log('Recommendation scoreboard OK');
function buildStrategyEvaluationUnlock(promotionReadiness, evaluationReadiness) {
  const symbols = (promotionReadiness.symbols || []).map((entry) => {
    const unlockReady = entry.promotionStatus === 'READY' && entry.nextReadinessPhase === 'STRATEGY_EVALUATION';
    return {
      symbol: entry.symbol,
      priority: entry.priority,
      currentStatus: entry.currentStatus,
      targetStatus: 'STRATEGY_EVALUATION',
      unlockGate: entry.promotionGate || 'promotion-gate-complete',
      unlockStatus: unlockReady ? 'READY' : 'BLOCKED',
      requiredExecution: unlockReady ? 'executed-samples-observed' : 'promotion-gate-not-yet-complete',
      requiredSampleDepth: unlockReady ? 'minimum-nonflat-threshold-met' : 'sample-depth-not-yet-available',
      strategyPhaseAfterUnlock: unlockReady ? 'STRATEGY_EVALUATION' : 'PROMOTION_PENDING',
    };
  });

  const unlockReadySymbols = symbols.filter((entry) => entry.unlockStatus === 'READY').length;
  const unlockBlockedByPromotion = symbols.filter((entry) => entry.unlockStatus !== 'READY').length;
  const unlockBlockedByExecution = unlockReadySymbols === 0 && !evaluationReadiness.strategyEvaluable ? symbols.length : 0;
  const unlockBlockedBySampleDepth = unlockReadySymbols === 0 && !evaluationReadiness.strategyEdgeAssessable ? symbols.length : 0;

  return {
    symbols,
    summary: {
      trackedUnlockSymbols: symbols.length,
      unlockReadySymbols,
      unlockBlockedByPromotion,
      unlockBlockedByExecution,
      unlockBlockedBySampleDepth,
      strategyEvaluationReadySymbols: unlockReadySymbols,
      dominantUnlockGate: symbols[0]?.unlockGate || 'none',
      nextUnlockPhase: unlockReadySymbols > 0 ? 'STRATEGY_EVALUATION' : (promotionReadiness.summary?.nextPromotionPhase || evaluationReadiness.recommendedNextPhase || 'DATA_REPAIR'),
    },
  };
}

function buildStrategyEvaluationUnlockActions(unlockLayer, promotionReadiness) {
  const actions = [];
  if (!unlockLayer.symbols.length) {
    actions.push('complete-promotion-gates-before-strategy-evaluation-unlock');
  }
  if (unlockLayer.summary.unlockBlockedByPromotion > 0) {
    actions.push('advance-symbols-through-repair-promotion-before-strategy-evaluation');
  }
  if (unlockLayer.summary.unlockReadySymbols > 0) {
    actions.push('start-strategy-evaluation-for-ready-symbols-only');
  }
  if (!actions.length) actions.push('no-strategy-evaluation-unlock-actions');
  return [...new Set(actions)].slice(0, 7);
}




function buildPipelineReadinessSummary({
  repairReadiness,
  warningClearance,
  blockedRepairCompletion,
  postRepairRecheck,
  repairPromotionReadiness,
  strategyEvaluationUnlock,
  evaluationReadiness,
  totalSymbols,
}) {
  const blockedSymbols = Number(repairReadiness?.summary?.blockedSymbols || blockedRepairCompletion?.summary?.blockedSymbols || 0);
  const warningSymbols = Number(repairReadiness?.summary?.warningSymbols || warningClearance?.summary?.warningSymbols || 0);
  const recheckSymbols = Number(postRepairRecheck?.summary?.trackedRecheckSymbols || 0);
  const promotionSymbols = Number(repairPromotionReadiness?.summary?.trackedPromotionSymbols || 0);
  const unlockReadySymbols = Number(strategyEvaluationUnlock?.summary?.unlockReadySymbols || 0);
  const strategyEvaluationReadySymbols = Number(strategyEvaluationUnlock?.summary?.strategyEvaluationReadySymbols || 0);
  const pipelineReadySymbols = strategyEvaluationReadySymbols;
  const totalTrackedSymbols = Number(totalSymbols || 0);
  const pipelineBlockedSymbols = Math.max(totalTrackedSymbols - pipelineReadySymbols, 0);

  let pipelineStage = 'DATA_REPAIR';
  if (strategyEvaluationReadySymbols > 0) {
    pipelineStage = 'STRATEGY_EVALUATION';
  } else if (promotionSymbols > 0) {
    pipelineStage = 'PROMOTION';
  } else if (recheckSymbols > 0) {
    pipelineStage = 'RECHECK';
  } else if (warningSymbols > 0) {
    pipelineStage = 'WARNING';
  }

  const pipelineBlocker = pipelineStage === 'STRATEGY_EVALUATION'
    ? 'none'
    : String(evaluationReadiness?.primaryBlocker || repairReadiness?.summary?.dominantRepairAction || strategyEvaluationUnlock?.summary?.dominantUnlockGate || 'data_gap');
  const nextPipelinePhase = strategyEvaluationReadySymbols > 0
    ? 'STRATEGY_EVALUATION'
    : String(strategyEvaluationUnlock?.summary?.nextUnlockPhase || repairPromotionReadiness?.summary?.nextPromotionPhase || postRepairRecheck?.summary?.nextRecheckPhase || warningClearance?.summary?.nextClearancePhase || blockedRepairCompletion?.summary?.nextBlockedPhase || evaluationReadiness?.recommendedNextPhase || 'DATA_REPAIR');

  return {
    summary: {
      totalTrackedSymbols,
      pipelineReadySymbols,
      pipelineBlockedSymbols,
      blockedSymbols,
      warningSymbols,
      recheckSymbols,
      promotionSymbols,
      unlockReadySymbols,
      strategyEvaluationReadySymbols,
      pipelineStage,
      pipelineBlocker,
      nextPipelinePhase,
    },
  };
}

function buildPipelineReadinessFindings(pipelineReadiness) {
  const s = pipelineReadiness.summary;
  const findings = [];
  if (s.pipelineStage === 'DATA_REPAIR') findings.push('pipeline-still-anchored-in-data-repair');
  if (s.blockedSymbols > 0) findings.push('blocked-symbols-still-dominate-pipeline');
  if (s.warningSymbols === 0) findings.push('no-symbols-have-reached-warning-state');
  if (s.recheckSymbols === 0) findings.push('post-repair-recheck-has-not-started');
  if (s.promotionSymbols === 0) findings.push('promotion-readiness-has-not-started');
  if (s.strategyEvaluationReadySymbols === 0) findings.push('strategy-evaluation-remains-locked');
  return [...new Set(findings)].slice(0, 7);
}

function buildPipelineReadinessActions(pipelineReadiness) {
  const s = pipelineReadiness.summary;
  const actions = [];
  if (s.blockedSymbols > 0) actions.push('close-blocked-repair-gates-before-advancing-pipeline');
  if (s.warningSymbols === 0) actions.push('promote-first-symbol-into-warning-state-after-data-repair');
  if (s.recheckSymbols === 0) actions.push('trigger-post-repair-recheck-once-warning-symbols-exist');
  if (s.promotionSymbols === 0) actions.push('advance-symbols-through-promotion-after-successful-recheck');
  if (s.strategyEvaluationReadySymbols === 0) actions.push('unlock-strategy-evaluation-only-after-full-pipeline-clearance');
  return [...new Set(actions)].slice(0, 7);
}


function buildPipelineAdvancementCriteria({
  pipelineReadiness,
  blockedRepairCompletion,
  warningClearance,
  postRepairRecheck,
  repairPromotionReadiness,
  strategyEvaluationUnlock,
}) {
  const currentStage = String(pipelineReadiness?.summary?.pipelineStage || 'DATA_REPAIR');
  const stages = [
    {
      stage: 'DATA_REPAIR',
      currentStatus: currentStage === 'DATA_REPAIR' ? 'ACTIVE' : 'PASSED',
      advancementGate: String(blockedRepairCompletion?.summary?.dominantCompletionGate || 'close-series-backfill-complete'),
      advancementStatus: Number(blockedRepairCompletion?.summary?.blockedReadyForCompletion || 0) > 0 ? 'READY' : 'BLOCKED',
      nextStage: 'WARNING',
    },
    {
      stage: 'WARNING',
      currentStatus: currentStage === 'WARNING' ? 'ACTIVE' : (Number(warningClearance?.summary?.warningSymbols || 0) > 0 ? 'AVAILABLE' : 'PENDING'),
      advancementGate: String(warningClearance?.summary?.dominantClearanceGate || 'warning-clearance-validation'),
      advancementStatus: Number(warningClearance?.summary?.warningReadyForClearance || 0) > 0 ? 'READY' : 'BLOCKED',
      nextStage: 'RECHECK',
    },
    {
      stage: 'RECHECK',
      currentStatus: currentStage === 'RECHECK' ? 'ACTIVE' : (Number(postRepairRecheck?.summary?.trackedRecheckSymbols || 0) > 0 ? 'AVAILABLE' : 'PENDING'),
      advancementGate: String(postRepairRecheck?.summary?.dominantRecheckGate || 'post-repair-recheck-pass'),
      advancementStatus: Number(postRepairRecheck?.summary?.recheckPassedSymbols || 0) > 0 ? 'READY' : 'BLOCKED',
      nextStage: 'PROMOTION',
    },
    {
      stage: 'PROMOTION',
      currentStatus: currentStage === 'PROMOTION' ? 'ACTIVE' : (Number(repairPromotionReadiness?.summary?.trackedPromotionSymbols || 0) > 0 ? 'AVAILABLE' : 'PENDING'),
      advancementGate: String(repairPromotionReadiness?.summary?.dominantPromotionGate || 'promotion-gate-complete'),
      advancementStatus: Number(repairPromotionReadiness?.summary?.promotionReadySymbols || 0) > 0 ? 'READY' : 'BLOCKED',
      nextStage: 'STRATEGY_EVALUATION_UNLOCK',
    },
    {
      stage: 'STRATEGY_EVALUATION_UNLOCK',
      currentStatus: currentStage === 'STRATEGY_EVALUATION' ? 'ACTIVE' : (Number(strategyEvaluationUnlock?.summary?.trackedUnlockSymbols || 0) > 0 ? 'AVAILABLE' : 'PENDING'),
      advancementGate: String(strategyEvaluationUnlock?.summary?.dominantUnlockGate || 'strategy-evaluation-unlock'),
      advancementStatus: Number(strategyEvaluationUnlock?.summary?.unlockReadySymbols || 0) > 0 ? 'READY' : 'BLOCKED',
      nextStage: 'STRATEGY_EVALUATION',
    },
  ];

  const blockedEntry = stages.find((entry) => entry.advancementStatus !== 'READY');
  return {
    stages,
    summary: {
      trackedStages: stages.length,
      readyStages: stages.filter((entry) => entry.advancementStatus === 'READY').length,
      blockedStages: stages.filter((entry) => entry.advancementStatus !== 'READY').length,
      currentPipelineStage: currentStage,
      dominantAdvancementGate: blockedEntry?.advancementGate || 'none',
      nextAdvancementStage: blockedEntry?.nextStage || 'STRATEGY_EVALUATION',
    },
  };
}

function buildPipelineAdvancementActions(criteria) {
  const s = criteria.summary;
  const actions = [];
  if (s.currentPipelineStage === 'DATA_REPAIR') actions.push('complete-data-repair-gates-before-advancing-pipeline-stage');
  if (s.nextAdvancementStage === 'WARNING') actions.push('promote-symbols-into-warning-after-blocked-completion');
  if (s.nextAdvancementStage === 'RECHECK') actions.push('clear-warning-validation-before-entering-recheck');
  if (s.nextAdvancementStage === 'PROMOTION') actions.push('pass-post-repair-recheck-before-promotion');
  if (s.nextAdvancementStage === 'STRATEGY_EVALUATION_UNLOCK') actions.push('complete-promotion-gates-before-strategy-unlock');
  if (s.nextAdvancementStage === 'STRATEGY_EVALUATION') actions.push('begin-strategy-evaluation-for-unlocked-symbols');
  return [...new Set(actions)].slice(0, 7);
}


function buildOperatorFinalDecisionSummary({
  pipelineReadiness,
  pipelineAdvancementCriteria,
  evaluationReadiness,
  repairReadiness,
}) {
  const readiness = pipelineReadiness?.summary || {};
  const advancement = pipelineAdvancementCriteria?.summary || {};
  const blockedEntry = (pipelineAdvancementCriteria?.stages || []).find((entry) => entry.advancementStatus !== 'READY');
  const currentPipelineStage = String(readiness.pipelineStage || advancement.currentPipelineStage || 'DATA_REPAIR');
  const releaseBlocker = String(evaluationReadiness?.primaryBlocker || readiness.pipelineBlocker || 'none');
  const dominantGate = String(advancement.dominantAdvancementGate || blockedEntry?.advancementGate || 'none');
  const readySymbols = Number(readiness.pipelineReadySymbols || 0);
  const blockedSymbols = Number(readiness.pipelineBlockedSymbols || 0);
  const blockerClearanceStatus = String(repairReadiness?.summary?.blockerClearanceStatus || 'BLOCKED');

  let finalDecision = 'HOLD_DATA_REPAIR';
  let operatorPriority = 'DATA_REPAIR';
  let immediateNextAction = 'close-series-backfill-complete';

  if (currentPipelineStage === 'STRATEGY_EVALUATION' && readySymbols > 0) {
    finalDecision = 'START_STRATEGY_EVALUATION';
    operatorPriority = 'STRATEGY_EVALUATION';
    immediateNextAction = 'begin-strategy-evaluation-for-ready-symbols';
  } else if (currentPipelineStage === 'PROMOTION' && blockedSymbols === 0) {
    finalDecision = 'UNLOCK_STRATEGY_EVALUATION';
    operatorPriority = 'PROMOTION';
    immediateNextAction = 'complete-promotion-gates';
  } else if (currentPipelineStage === 'RECHECK') {
    finalDecision = 'PROCEED_RECHECK';
    operatorPriority = 'RECHECK';
    immediateNextAction = 'complete-post-repair-recheck';
  } else if (currentPipelineStage === 'WARNING') {
    finalDecision = 'PROCEED_WARNING_VALIDATION';
    operatorPriority = 'WARNING';
    immediateNextAction = 'clear-warning-validation';
  } else if (blockerClearanceStatus === 'BLOCKED') {
    finalDecision = 'HOLD_DATA_REPAIR';
    operatorPriority = 'DATA_REPAIR';
    immediateNextAction = dominantGate;
  }

  return {
    summary: {
      currentPipelineStage,
      finalDecision,
      releaseBlocker,
      dominantGate,
      operatorPriority,
      readySymbols,
      blockedSymbols,
      immediateNextAction,
    },
  };
}

function buildOperatorFinalDecisionFindings(operatorSummary) {
  const s = operatorSummary.summary;
  const findings = [];
  findings.push(`final-decision-${String(s.finalDecision).toLowerCase()}`);
  findings.push(`operator-priority-${String(s.operatorPriority).toLowerCase()}`);
  if (s.releaseBlocker && s.releaseBlocker !== 'none') findings.push(`release-blocker-${String(s.releaseBlocker).toLowerCase()}`);
  if (s.currentPipelineStage === 'DATA_REPAIR') findings.push('strategy-work-remains-deferred-until-repair-completes');
  if (Number(s.blockedSymbols || 0) > 0) findings.push('blocked-symbols-still-prevent-final-pipeline-advancement');
  if (Number(s.readySymbols || 0) === 0) findings.push('no-ready-symbols-available-for-final-decision-promotion');
  return [...new Set(findings)].slice(0, 7);
}

function buildOperatorFinalDecisionActions(operatorSummary) {
  const s = operatorSummary.summary;
  const actions = [];
  if (s.finalDecision === 'HOLD_DATA_REPAIR') actions.push('hold-strategy-work-until-primary-repair-gate-closes');
  if (s.operatorPriority === 'DATA_REPAIR') actions.push('complete-dominant-data-repair-gate-first');
  if (s.operatorPriority === 'WARNING') actions.push('finish-warning-validation-before-recheck');
  if (s.operatorPriority === 'RECHECK') actions.push('finish-post-repair-recheck-before-promotion');
  if (s.operatorPriority === 'PROMOTION') actions.push('complete-promotion-gates-before-strategy-unlock');
  if (s.finalDecision === 'START_STRATEGY_EVALUATION') actions.push('start-strategy-evaluation-for-ready-symbols');
  actions.push(`execute-immediate-next-action-${String(s.immediateNextAction).toLowerCase()}`);
  return [...new Set(actions)].slice(0, 7);
}


function buildWeeklyRunGatingSummary({ operatorSummary, evaluationReadiness, pipelineReadiness, latestBatch }) {
  const operator = operatorSummary?.summary || {};
  const evaluation = evaluationReadiness?.summary || {};
  const pipeline = pipelineReadiness?.summary || {};
  const releaseBlocker = String(operator.releaseBlocker || evaluation.primaryBlocker || pipeline.pipelineBlocker || 'none');
  const pipelineStage = String(operator.currentPipelineStage || pipeline.pipelineStage || 'DATA_REPAIR');
  const hasReadySymbols = Number(operator.readySymbols || 0) > 0;
  const strategyReady = String(evaluation.strategyEvaluable || 'false') === 'true';

  let reportMode = 'DIAGNOSTIC_ONLY';
  let weeklyReportGate = 'READY_DIAGNOSTIC';
  let weeklySimulationGate = 'BLOCKED';
  let shouldPublishReport = 'true';
  let shouldPublishSimulation = 'false';
  let gatingReason = `${String(releaseBlocker).toLowerCase()}-${String(pipelineStage).toLowerCase()}`;
  let operatorWeeklyDecision = 'PUBLISH_DIAGNOSTIC_REPORT_ONLY';

  if (releaseBlocker === 'none' && hasReadySymbols && strategyReady) {
    reportMode = 'FULL_EVALUATION';
    weeklyReportGate = 'READY_FULL';
    weeklySimulationGate = 'READY';
    shouldPublishSimulation = 'true';
    gatingReason = 'strategy-evaluation-unlocked';
    operatorWeeklyDecision = 'PUBLISH_FULL_REPORT_AND_SIMULATION';
  } else if (releaseBlocker === 'none') {
    reportMode = 'PARTIAL_DIAGNOSTIC';
    weeklyReportGate = 'READY_PARTIAL';
    gatingReason = 'no-release-blocker-but-symbols-not-ready';
    operatorWeeklyDecision = 'PUBLISH_REPORT_HOLD_SIMULATION';
  }

  return {
    summary: {
      reportMode,
      weeklyReportGate,
      weeklySimulationGate,
      shouldPublishReport,
      shouldPublishSimulation,
      gatingReason,
      operatorWeeklyDecision,
    },
  };
}



function buildWeeklyDeliveryFormatting(messageSummary, weeklyRunGating, operatorSummary) {
  const s = messageSummary.summary || {};
  const gating = weeklyRunGating.summary || {};
  const operator = operatorSummary.summary || {};
  const lineFormat = String(s.payloadLine || '未產生摘要訊息');
  const messageTitle = String(s.headline || '週報通知');
  const emailBody = [
    messageTitle,
    String(s.operatorMessage || ''),
    `決策=${String(gating.operatorWeeklyDecision || 'PUBLISH_DIAGNOSTIC_REPORT_ONLY')}`,
    `階段=${String(operator.currentPipelineStage || 'DATA_REPAIR')}`,
    `阻塞=${String(operator.releaseBlocker || 'none')}`,
    String(s.disclaimer || ''),
  ].filter(Boolean).join('｜');
  const logFormat = [
    `title:${messageTitle}`,
    `report:${String(s.publishReport)}`,
    `simulation:${String(s.publishSimulation)}`,
    `stage:${String(operator.currentPipelineStage || 'DATA_REPAIR')}`,
    `decision:${String(gating.operatorWeeklyDecision || 'PUBLISH_DIAGNOSTIC_REPORT_ONLY')}`,
  ].join(' ');
  return {
    summary: {
      lineFormat,
      emailFormat: emailBody,
      logFormat,
      deliveryMode: String(s.publishSimulation) === 'true' ? 'FULL' : 'DIAGNOSTIC_ONLY',
      messageTitle,
      deliveryDisclaimer: String(s.disclaimer || '此訊息僅供系統診斷。'),
    },
    blocks: [
      `line=${lineFormat}`,
      `email_subject=${messageTitle}`,
      `email_body=${emailBody}`,
      `log_entry=${logFormat}`,
      `decision=${String(gating.operatorWeeklyDecision || 'PUBLISH_DIAGNOSTIC_REPORT_ONLY')}`,
      `delivery_mode=${String(s.publishSimulation) === 'true' ? 'FULL' : 'DIAGNOSTIC_ONLY'}`,
      `disclaimer=${String(s.disclaimer || '此訊息僅供系統診斷。')}`,
    ],
  };
}

function buildWeeklyDeliveryFormattingActions(deliveryFormatting) {
  const s = deliveryFormatting.summary || {};
  const actions = [];
  actions.push('prepare-line-message-block-for-line-delivery');
  actions.push('prepare-email-block-for-email-delivery');
  actions.push('prepare-log-block-for-audit-delivery');
  if (String(s.deliveryMode) === 'DIAGNOSTIC_ONLY') actions.push('keep-diagnostic-disclaimer-in-all-delivery-channels');
  return [...new Set(actions)].slice(0, 7);
}

function buildWeeklyOperatorMessage(weeklyRunGating, operatorSummary, pipelineReadiness) {
  const gating = weeklyRunGating.summary || {};
  const operator = operatorSummary.summary || {};
  const pipeline = pipelineReadiness.summary || {};
  const diagnosticOnly = String(gating.reportMode || '') === 'DIAGNOSTIC_ONLY';
  const publishReport = String(gating.shouldPublishReport) === 'true';
  const publishSimulation = String(gating.shouldPublishSimulation) === 'true';
  const headline = publishSimulation
    ? '週報與模擬購買已解鎖'
    : diagnosticOnly
      ? '本週僅發布診斷型週報'
      : '本週發布部分診斷週報';
  const operatorMessage = publishSimulation
    ? '可發布完整週報與模擬購買結果。'
    : `目前仍以 ${String(operator.operatorPriority || 'DATA_REPAIR')} 為優先，模擬購買暫停發布。`;
  const reportLabel = publishReport ? '發布週報' : '暫停週報';
  const simulationLabel = publishSimulation ? '發布模擬購買' : '暫停模擬購買';
  const payloadLine = `${reportLabel}｜${simulationLabel}｜階段=${String(operator.currentPipelineStage || pipeline.pipelineStage || 'DATA_REPAIR')}`;
  const disclaimer = publishSimulation
    ? '此週報含完整模擬購買輸出。'
    : '此週報為診斷用途，非模擬購買指令。';

  return {
    summary: {
      headline,
      operatorMessage,
      publishReport: publishReport ? 'true' : 'false',
      publishSimulation: publishSimulation ? 'true' : 'false',
      payloadLine,
      disclaimer,
    },
    payload: [
      `headline=${headline}`,
      `operator_message=${operatorMessage}`,
      `decision=${String(gating.operatorWeeklyDecision || 'PUBLISH_DIAGNOSTIC_REPORT_ONLY')}`,
      `pipeline_stage=${String(operator.currentPipelineStage || pipeline.pipelineStage || 'DATA_REPAIR')}`,
      `release_blocker=${String(operator.releaseBlocker || pipeline.pipelineBlocker || 'none')}`,
      `report_publish=${publishReport ? 'YES' : 'NO'}`,
      `simulation_publish=${publishSimulation ? 'YES' : 'NO'}`,
      `payload_line=${payloadLine}`,
      `disclaimer=${disclaimer}`,
    ],
  };
}

function buildWeeklyOperatorMessageActions(messageSummary) {
  const s = messageSummary.summary || {};
  const actions = [];
  if (String(s.publishReport) === 'true') actions.push('send-weekly-operator-report-message');
  if (String(s.publishSimulation) !== 'true') actions.push('omit-simulation-section-from-operator-message');
  actions.push('include-clear-diagnostic-disclaimer-when-simulation-blocked');
  return [...new Set(actions)].slice(0, 7);
}

function buildWeeklyRunGatingFindings(weeklyRunGating) {
  const s = weeklyRunGating.summary;
  const findings = [];
  findings.push(`report-mode-${String(s.reportMode).toLowerCase()}`);
  findings.push(`weekly-report-gate-${String(s.weeklyReportGate).toLowerCase()}`);
  findings.push(`weekly-simulation-gate-${String(s.weeklySimulationGate).toLowerCase()}`);
  if (String(s.shouldPublishSimulation) !== 'true') findings.push('simulation-remains-blocked-until-pipeline-clears');
  if (String(s.shouldPublishReport) === 'true') findings.push('report-can-still-publish-in-current-gating-mode');
  findings.push(`gating-reason-${String(s.gatingReason).toLowerCase()}`);
  return [...new Set(findings)].slice(0, 7);
}

function buildWeeklyRunGatingActions(weeklyRunGating) {
  const s = weeklyRunGating.summary;
  const actions = [];
  if (String(s.shouldPublishReport) === 'true') actions.push('publish-weekly-report-with-current-gating-mode');
  if (String(s.shouldPublishSimulation) !== 'true') actions.push('hold-weekly-simulation-until-release-blockers-clear');
  if (String(s.reportMode) === 'DIAGNOSTIC_ONLY') actions.push('label-report-as-diagnostic-only-while-data-repair-remains-open');
  if (String(s.reportMode) === 'FULL_EVALUATION') actions.push('publish-full-simulation-results-for-ready-symbols');
  actions.push(`follow-operator-weekly-decision-${String(s.operatorWeeklyDecision).toLowerCase()}`);
  return [...new Set(actions)].slice(0, 7);
}
