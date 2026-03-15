export interface AiEnvLike {
  AI_ENABLED?: string;
  OPENAI_MODEL?: string;
  OPENAI_API_KEY?: string;
}

export type AiExplainMode = 'status' | 'report' | 'recs';

function envFlag(v: unknown, def = false): boolean {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

export function isAiEnabled(env: AiEnvLike): boolean {
  return envFlag(env.AI_ENABLED, false) && Boolean(String(env.OPENAI_API_KEY || '').trim());
}

function getModel(env: AiEnvLike): string {
  return String(env.OPENAI_MODEL || 'gpt-4o-mini').trim() || 'gpt-4o-mini';
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function buildInstruction(mode: AiExplainMode): string {
  switch (mode) {
    case 'status':
      return '請用自然、好懂的繁體中文，說明系統今天是否正常運作、目前策略狀態、是否有掛單或成交、以及使用者接下來應注意什麼。';
    case 'report':
      return '請用自然、好懂的繁體中文，整理今天市場發生了什麼、系統怎麼看、以及為什麼現在可能不動作或維持觀望。';
    case 'recs':
      return '請用自然、好懂的繁體中文，解釋目前推薦標的、它們為何被選中、目前是在等待成交還是已可行動，並提醒使用者這只是系統解釋不是投資建議。';
  }
}

function extractOutputText(payload: any): string {
  const direct = String(payload?.output_text || '').trim();
  if (direct) return direct;

  const out = Array.isArray(payload?.output) ? payload.output : [];
  const parts: string[] = [];
  for (const item of out) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      const txt = String(c?.text || c?.output_text || '').trim();
      if (txt) parts.push(txt);
    }
  }
  return parts.join('\n').trim();
}

export async function generateAiExplanation(env: AiEnvLike, mode: AiExplainMode, sourceText: string): Promise<string> {
  if (!isAiEnabled(env)) return 'AI 解釋層目前未啟用';

  const apiKey = String(env.OPENAI_API_KEY || '').trim();
  const model = getModel(env);
  const prompt = [
    '你是 MO（Market Observer）的解釋層助手。',
    '任務：把量化系統已經產生的結果，改寫成自然、簡潔、好懂的繁體中文。',
    '限制：',
    '- 不可捏造資料',
    '- 不可新增不存在的數字',
    '- 不可替系統做買賣決策',
    '- 不可寫成制式官腔，要自然但精簡',
    '- 優先回答：系統有沒有正常運作、今天有沒有變化、如果沒變化是因為什麼',
    buildInstruction(mode),
    '',
    '以下是系統原始輸出：',
    clip(sourceText || '（空）', 8000),
  ].join('\n');

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort('openai-timeout'), 2200);
  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: prompt,
        max_output_tokens: 420,
      }),
      signal: ac.signal,
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    throw new Error(msg.includes('openai-timeout') || msg.includes('aborted') ? 'OpenAI timeout' : msg);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status} ${clip(body, 300)}`);
  }

  const payload: any = await res.json();
  const text = extractOutputText(payload);
  if (!text) throw new Error('OpenAI empty output');
  return clip(text, 4500);
}
