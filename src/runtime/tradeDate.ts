export async function resolveEffectiveTradeDate(env: any, today: string): Promise<string> {
  try {
    const row = (await env.DB
      .prepare("SELECT MAX(trade_date) as d FROM mo_daily_mark WHERE ready_level='FULL'")
      .first()) as { d?: string } | null
    if (!row || !row.d) return today
    if (row.d > today) return today
    return row.d
  } catch {
    return today
  }
}
