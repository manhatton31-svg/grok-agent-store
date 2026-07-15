import type { Env, Receipt } from "./types";
import { getSkill, skillGraphPublic, SKILLS } from "./skills";
import {
	chargeAgent,
	extractBearer,
	getAgentByKey,
	registerAgent,
	saveAgent,
} from "./auth";
import { callGrok, parseJsonLoose } from "./grok";
import { randomToken } from "./auth";
import { createCheckoutSession, listPacks } from "./payments";

export type InvokeInput = Record<string, unknown>;

export type InvokeResult = {
	ok: boolean;
	skill_id: string;
	result: unknown;
	receipt?: Receipt;
	error?: string;
	credits_charged?: number;
	balance?: number;
};

async function saveReceipt(env: Env, receipt: Receipt): Promise<void> {
	await env.STORE.put(
		`receipt:${receipt.receipt_id}`,
		JSON.stringify(receipt),
		{ expirationTtl: 60 * 60 * 24 * 90 },
	);
}

function requireString(input: InvokeInput, key: string): string {
	const v = input[key];
	if (typeof v !== "string" || !v.trim()) {
		throw new Error(`Missing required string field: ${key}`);
	}
	return v;
}

export async function invokeSkill(
	env: Env,
	skillId: string,
	input: InvokeInput,
	request?: Request,
	/** Optional API key override (MCP tool arg when Authorization header is unavailable). */
	apiKeyOverride?: string | null,
): Promise<InvokeResult> {
	const skill = getSkill(skillId);
	if (!skill) {
		return {
			ok: false,
			skill_id: skillId,
			result: null,
			error: `Unknown skill: ${skillId}`,
		};
	}

	try {
		// Free discovery tools
		if (skillId === "list_skills") {
			return {
				ok: true,
				skill_id: skillId,
				result: skillGraphPublic(),
				credits_charged: 0,
			};
		}

		if (skillId === "get_skill") {
			const id = requireString(input, "skill_id");
			const s = getSkill(id);
			if (!s) {
				return {
					ok: false,
					skill_id: skillId,
					result: null,
					error: `Skill not found: ${id}`,
				};
			}
			return { ok: true, skill_id: skillId, result: s, credits_charged: 0 };
		}

		if (skillId === "quote") {
			const id = requireString(input, "skill_id");
			const s = getSkill(id);
			if (!s) {
				return {
					ok: false,
					skill_id: skillId,
					result: null,
					error: `Skill not found: ${id}`,
				};
			}
			let balance: number | undefined;
			let balance_ok: boolean | undefined;
			if (request) {
				const key = extractBearer(request);
				if (key) {
					const agent = await getAgentByKey(env, key);
					if (agent) {
						balance = agent.balance;
						balance_ok = agent.balance >= s.price.credits;
					}
				}
			}
			return {
				ok: true,
				skill_id: skillId,
				result: {
					skill_id: s.id,
					price: s.price,
					auth_required: s.auth_required,
					verify: s.verify,
					balance,
					balance_ok,
				},
				credits_charged: 0,
			};
		}

		if (skillId === "list_credit_packs") {
			return {
				ok: true,
				skill_id: skillId,
				result: {
					packs: listPacks(),
					currency: "USD",
					payment: "stripe_checkout",
					next: "Call purchase_credits with pack id after register_agent",
				},
				credits_charged: 0,
			};
		}

		if (skillId === "register_agent") {
			const name = requireString(input, "name");
			const { agent, api_key } = await registerAgent(env, name);
			const base = publicBase(env, request);
			return {
				ok: true,
				skill_id: skillId,
				result: {
					agent_id: agent.agent_id,
					name: agent.name,
					api_key,
					balance: agent.balance,
					auth_header: `Authorization: Bearer ${api_key}`,
					mcp_url: `${base}/mcp`,
					rest_invoke: `${base}/v1/invoke`,
					skills_url: `${base}/skills.json`,
					agent_card_url: `${base}/.well-known/agent.json`,
					buy_credits: "skill:purchase_credits",
					note: "Store api_key securely. It is shown only once.",
				},
				credits_charged: 0,
				balance: agent.balance,
			};
		}

		// Auth-required tools
		const apiKey =
			apiKeyOverride ||
			(typeof input.api_key === "string" ? input.api_key : null) ||
			(request ? extractBearer(request) : null);
		if (!apiKey) {
			return {
				ok: false,
				skill_id: skillId,
				result: null,
				error:
					"Authorization required. Register via register_agent, then send Authorization: Bearer <api_key> (REST) or pass api_key on the tool call (MCP).",
			};
		}
		let agent = await getAgentByKey(env, apiKey);
		if (!agent) {
			return {
				ok: false,
				skill_id: skillId,
				result: null,
				error: "Invalid API key",
			};
		}

		if (skillId === "balance") {
			return {
				ok: true,
				skill_id: skillId,
				result: {
					agent_id: agent.agent_id,
					name: agent.name,
					balance: agent.balance,
					total_spent: agent.total_spent,
					total_calls: agent.total_calls,
				},
				credits_charged: 0,
				balance: agent.balance,
			};
		}

		if (skillId === "purchase_credits") {
			const pack =
				typeof input.pack === "string" ? input.pack : "starter";
			const checkout = await createCheckoutSession(
				env,
				request || new Request("https://localhost/"),
				apiKey,
				pack,
			);
			if (!checkout.ok) {
				return {
					ok: false,
					skill_id: skillId,
					result: null,
					error: checkout.error,
				};
			}
			return {
				ok: true,
				skill_id: skillId,
				result: {
					...checkout,
					instructions:
						"Open checkout_url in a browser (or hand to principal). After payment, call balance to confirm credits.",
				},
				credits_charged: 0,
				balance: agent.balance,
			};
		}

		const cost = skill.price.credits;
		agent = await chargeAgent(env, agent, cost);

		let payload: unknown;
		let model: string | undefined;
		let tokens_in = 0;
		let tokens_out = 0;
		let summary = "";

		if (skillId === "agent_brief") {
			const goal = requireString(input, "goal");
			const context =
				typeof input.context === "string" ? input.context : "";
			const grok = await callGrok(
				env,
				`You are a planning copilot for AI agents. Return ONLY valid JSON with keys:
objective (string), constraints (string[]), success_metrics (string[]), risks (string[]), next_actions (string[]), open_questions (string[]).
Be concrete and machine-usable.`,
				`Goal:\n${goal}\n\nContext:\n${context || "(none)"}`,
				{ json: true },
			);
			payload = parseJsonLoose(grok.text);
			model = grok.model;
			tokens_in = grok.tokens_in;
			tokens_out = grok.tokens_out;
			summary = "Structured agent brief generated";
		} else if (skillId === "structured_extract") {
			const text = requireString(input, "text");
			const schema_hint = requireString(input, "schema_hint");
			const grok = await callGrok(
				env,
				`Extract structured data from the user text. Return ONLY a JSON object matching the schema hint. If a field is unknown, use null. No markdown.`,
				`Schema hint:\n${schema_hint}\n\nText:\n${text.slice(0, 12000)}`,
				{ json: true },
			);
			payload = parseJsonLoose(grok.text);
			model = grok.model;
			tokens_in = grok.tokens_in;
			tokens_out = grok.tokens_out;
			summary = "Structured extraction complete";
		} else if (skillId === "code_review") {
			const diff_or_code = requireString(input, "diff_or_code");
			const focus =
				typeof input.focus === "string" ? input.focus : "all";
			const grok = await callGrok(
				env,
				`You are a senior code reviewer for agent-built software. Return ONLY JSON:
{ "summary": string, "findings": [ { "severity": "critical"|"high"|"medium"|"low", "title": string, "detail": string, "suggestion": string } ], "ship_ready": boolean }
Focus area: ${focus}. Prefer concrete, fixable findings.`,
				diff_or_code.slice(0, 14000),
				{ json: true },
			);
			payload = parseJsonLoose(grok.text);
			model = grok.model;
			tokens_in = grok.tokens_in;
			tokens_out = grok.tokens_out;
			summary = "Code review complete";
		} else if (skillId === "skill_match") {
			const intent = requireString(input, "intent");
			const catalog = SKILLS.map((s) => ({
				id: s.id,
				description: s.description,
				price: s.price.credits,
				category: s.category,
			}));
			const grok = await callGrok(
				env,
				`You help buyer agents pick skills from a fixed catalog. Return ONLY JSON:
{ "recommended": [ { "skill_id": string, "why": string, "order": number } ], "plan": string[], "notes": string }
Only recommend skill_ids from the catalog. Prefer free discovery first, then paid tools.`,
				`Buyer intent:\n${intent}\n\nCatalog:\n${JSON.stringify(catalog)}`,
				{ json: true },
			);
			payload = parseJsonLoose(grok.text);
			model = grok.model;
			tokens_in = grok.tokens_in;
			tokens_out = grok.tokens_out;
			summary = "Skill match recommendations generated";
		} else {
			// refund unused charge for unknown path
			agent = {
				...agent,
				balance: agent.balance + cost,
				total_spent: agent.total_spent - cost,
				total_calls: agent.total_calls - 1,
			};
			await saveAgent(env, agent);
			return {
				ok: false,
				skill_id: skillId,
				result: null,
				error: `Skill not implemented: ${skillId}`,
			};
		}

		const receipt: Receipt = {
			receipt_id: `rcpt_${randomToken(12)}`,
			agent_id: agent.agent_id,
			skill_id: skillId,
			credits_charged: cost,
			model,
			tokens_in,
			tokens_out,
			ok: true,
			created_at: new Date().toISOString(),
			summary,
		};
		await saveReceipt(env, receipt);

		return {
			ok: true,
			skill_id: skillId,
			result: payload,
			receipt,
			credits_charged: cost,
			balance: agent.balance,
		};
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return {
			ok: false,
			skill_id: skillId,
			result: null,
			error: msg,
		};
	}
}

function publicBase(env: Env, request?: Request): string {
	const configured = env.PUBLIC_BASE_URL || "";
	if (configured && !configured.includes("<your-subdomain>")) {
		return configured.replace(/\/$/, "");
	}
	if (request) {
		const u = new URL(request.url);
		return `${u.protocol}//${u.host}`;
	}
	return "http://localhost:8787";
}

export { publicBase };
