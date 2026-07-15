import type { Env } from "./types";

export type GrokResult = {
	text: string;
	model: string;
	tokens_in: number;
	tokens_out: number;
};

/**
 * Call xAI Grok via the OpenAI-compatible chat completions API.
 * Only Grok models are used — no other providers.
 */
export async function callGrok(
	env: Env,
	system: string,
	user: string,
	options?: { json?: boolean; max_tokens?: number },
): Promise<GrokResult> {
	const key = env.XAI_API_KEY;
	if (!key) {
		throw new Error(
			"XAI_API_KEY is not configured on the server. Operator must set the secret.",
		);
	}

	const model = env.GROK_MODEL || "grok-4";
	const body: Record<string, unknown> = {
		model,
		messages: [
			{ role: "system", content: system },
			{ role: "user", content: user },
		],
		temperature: 0.2,
		max_tokens: options?.max_tokens ?? 2048,
	};
	if (options?.json) {
		body.response_format = { type: "json_object" };
	}

	const res = await fetch("https://api.x.ai/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		const errText = await res.text();
		throw new Error(`Grok API error ${res.status}: ${errText.slice(0, 500)}`);
	}

	const data = (await res.json()) as {
		choices?: { message?: { content?: string } }[];
		usage?: { prompt_tokens?: number; completion_tokens?: number };
		model?: string;
	};

	const text = data.choices?.[0]?.message?.content ?? "";
	return {
		text,
		model: data.model ?? model,
		tokens_in: data.usage?.prompt_tokens ?? 0,
		tokens_out: data.usage?.completion_tokens ?? 0,
	};
}

export function parseJsonLoose(text: string): unknown {
	const trimmed = text.trim();
	try {
		return JSON.parse(trimmed);
	} catch {
		const start = trimmed.indexOf("{");
		const end = trimmed.lastIndexOf("}");
		if (start >= 0 && end > start) {
			return JSON.parse(trimmed.slice(start, end + 1));
		}
		throw new Error("Model did not return valid JSON");
	}
}
