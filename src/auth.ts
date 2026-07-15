import type { AgentRecord, Env } from "./types";

const encoder = new TextEncoder();

export async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export function randomToken(bytes = 24): string {
	const arr = new Uint8Array(bytes);
	crypto.getRandomValues(arr);
	return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function extractBearer(request: Request): string | null {
	const h = request.headers.get("Authorization") || "";
	const m = /^Bearer\s+(.+)$/i.exec(h.trim());
	return m?.[1]?.trim() || null;
}

export async function getAgentByKey(
	env: Env,
	apiKey: string,
): Promise<AgentRecord | null> {
	const hash = await sha256Hex(apiKey);
	const raw = await env.STORE.get(`key:${hash}`);
	if (!raw) return null;
	return JSON.parse(raw) as AgentRecord;
}

export async function saveAgent(env: Env, agent: AgentRecord): Promise<void> {
	await env.STORE.put(`agent:${agent.agent_id}`, JSON.stringify(agent));
	await env.STORE.put(`key:${agent.key_hash}`, JSON.stringify(agent));
}

export async function registerAgent(
	env: Env,
	name: string,
): Promise<{ agent: AgentRecord; api_key: string }> {
	const api_key = `gas_${randomToken(24)}`;
	const agent_id = `agt_${randomToken(12)}`;
	const bonus = Number(env.SIGNUP_BONUS_CREDITS || "100");
	const agent: AgentRecord = {
		agent_id,
		name: name.slice(0, 120),
		key_hash: await sha256Hex(api_key),
		balance: Number.isFinite(bonus) ? bonus : 100,
		created_at: new Date().toISOString(),
		total_spent: 0,
		total_calls: 0,
	};
	await saveAgent(env, agent);
	return { agent, api_key };
}

export async function chargeAgent(
	env: Env,
	agent: AgentRecord,
	credits: number,
): Promise<AgentRecord> {
	if (credits <= 0) return agent;
	if (agent.balance < credits) {
		const err = new Error(
			`Insufficient credits: need ${credits}, have ${agent.balance}. Call register_agent or top up.`,
		);
		(err as Error & { code: string }).code = "INSUFFICIENT_CREDITS";
		throw err;
	}
	const next: AgentRecord = {
		...agent,
		balance: agent.balance - credits,
		total_spent: agent.total_spent + credits,
		total_calls: agent.total_calls + 1,
	};
	await saveAgent(env, next);
	return next;
}
