import type { Env } from '../index';
import { buildAiSystemPrompt, buildAiUserPrompt, type AiExplainKind } from './prompt';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

function pickModel(env: Env): string {
	const raw = String(env.OPENAI_MODEL ?? '').trim();
	return raw || 'gpt-4o-mini';
}

function isAiEnabled(env: Env): boolean {
	const raw = String(env.AI_ENABLED ?? '1').trim().toLowerCase();
	return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function extractOutputText(data: any): string {
	if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
	const output = Array.isArray(data?.output) ? data.output : [];
	const texts: string[] = [];
	for (const item of output) {
		const content = Array.isArray(item?.content) ? item.content : [];
		for (const part of content) {
			if (typeof part?.text === 'string' && part.text.trim()) texts.push(part.text.trim());
			if (typeof part?.output_text === 'string' && part.output_text.trim()) texts.push(part.output_text.trim());
		}
	}
	return texts.join('\n').trim();
}

export async function generateAiExplanation(
	env: Env,
	kind: AiExplainKind,
	payload: Record<string, unknown>,
): Promise<string> {
	const model = pickModel(env);
	const enabled = isAiEnabled(env);
	const startedAt = Date.now();
	if (!enabled) {
		console.log(`[AI] call skipped kind=${kind} enabled=0 model=${model}`);
		throw new Error('AI disabled by AI_ENABLED');
	}
	if (!env.OPENAI_API_KEY) {
		console.log(`[AI] call fail kind=${kind} model=${model} error=OPENAI_API_KEY not set`);
		throw new Error('OPENAI_API_KEY not set');
	}

	const timeoutMs = 1200;
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(`timeout ${timeoutMs}ms`), timeoutMs);

	try {
		console.log(`[AI] call start kind=${kind} model=${model}`);
		const res = await fetch(OPENAI_RESPONSES_URL, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${env.OPENAI_API_KEY}`,
			},
			body: JSON.stringify({
				model,
				input: [
					{
						role: 'system',
						content: [{ type: 'input_text', text: buildAiSystemPrompt() }],
					},
					{
						role: 'user',
						content: [{ type: 'input_text', text: buildAiUserPrompt(kind, payload) }],
					},
				],
				text: {
					format: { type: 'text' },
				},
			}),
			signal: ac.signal,
		});

		if (!res.ok) {
			const body = await res.text();
			const durationMs = Date.now() - startedAt;
			console.log(`[AI] call fail kind=${kind} model=${model} status=${res.status} duration_ms=${durationMs}`);
			throw new Error(`OpenAI responses failed: ${res.status} ${body.slice(0, 240)}`);
		}

		const data = (await res.json()) as any;
		const text = extractOutputText(data);
		if (!text) {
			const durationMs = Date.now() - startedAt;
			console.log(`[AI] call fail kind=${kind} model=${model} status=${res.status} duration_ms=${durationMs} error=empty_output`);
			throw new Error('OpenAI responses returned empty text');
		}
		const durationMs = Date.now() - startedAt;
		const requestId = String(res.headers.get('x-request-id') || res.headers.get('openai-request-id') || '').trim();
		console.log(`[AI] call ok kind=${kind} model=${model} status=${res.status} duration_ms=${durationMs} response_chars=${text.length}${requestId ? ` request_id=${requestId}` : ''}`);
		return text;
	} catch (e: any) {
		const isAbort = String(e?.name || '') === 'AbortError' || String(e?.message || '').includes('timeout');
		const durationMs = Date.now() - startedAt;
		if (isAbort) {
			console.log(`[AI] call fail kind=${kind} model=${model} status=timeout duration_ms=${durationMs}`);
			throw new Error(`OpenAI responses timeout after ${timeoutMs}ms`);
		}
		console.log(`[AI] call fail kind=${kind} model=${model} duration_ms=${durationMs} error=${String(e?.message || e).slice(0, 180)}`);
		throw e;
	} finally {
		clearTimeout(timer);
	}
}
