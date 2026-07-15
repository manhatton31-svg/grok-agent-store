import type { Skill } from "./types";

/** Machine-readable skill graph — discovery surface for buyer agents. */
export const SKILLS: Skill[] = [
	{
		id: "list_skills",
		name: "List skills",
		description: "List all purchasable and free skills on this agent store.",
		category: "discovery",
		price: { credits: 0, currency: "credits", description: "Free" },
		inputs: {},
		outputs: { type: "json", description: "Array of skill cards" },
		auth_required: false,
		verify: { type: "schema", note: "Always returns skill graph" },
	},
	{
		id: "get_skill",
		name: "Get skill",
		description: "Fetch one skill card by id, including price and input schema.",
		category: "discovery",
		price: { credits: 0, currency: "credits", description: "Free" },
		inputs: {
			skill_id: { type: "string", description: "Skill id", required: true },
		},
		outputs: { type: "json", description: "Skill card" },
		auth_required: false,
		verify: { type: "schema", note: "404 if missing" },
	},
	{
		id: "quote",
		name: "Quote",
		description: "Get price and requirements for a skill before purchase.",
		category: "discovery",
		price: { credits: 0, currency: "credits", description: "Free" },
		inputs: {
			skill_id: { type: "string", description: "Skill id to quote", required: true },
		},
		outputs: {
			type: "json",
			description: "Price, auth_required, balance_ok if authed",
		},
		auth_required: false,
		verify: { type: "schema", note: "Deterministic quote" },
	},
	{
		id: "register_agent",
		name: "Register agent",
		description:
			"Create an agent account and receive an API key plus signup bonus credits. Store the key securely — it is shown once.",
		category: "account",
		price: { credits: 0, currency: "credits", description: "Free (grants bonus credits)" },
		inputs: {
			name: {
				type: "string",
				description: "Human-readable agent or org name",
				required: true,
			},
		},
		outputs: {
			type: "json",
			description: "agent_id, api_key, balance, public discovery URLs",
		},
		auth_required: false,
		verify: { type: "schema", note: "Returns key once" },
	},
	{
		id: "balance",
		name: "Balance",
		description: "Check credit balance and usage for the authenticated agent.",
		category: "account",
		price: { credits: 0, currency: "credits", description: "Free" },
		inputs: {},
		outputs: { type: "json", description: "agent_id, balance, total_spent, total_calls" },
		auth_required: true,
		verify: { type: "schema", note: "Auth required" },
	},
	{
		id: "list_credit_packs",
		name: "List credit packs",
		description: "List purchasable credit packs and USD prices (Stripe).",
		category: "account",
		price: { credits: 0, currency: "credits", description: "Free" },
		inputs: {},
		outputs: { type: "json", description: "Array of packs with price_usd and credits" },
		auth_required: false,
		verify: { type: "schema", note: "Static pack list" },
	},
	{
		id: "purchase_credits",
		name: "Purchase credits",
		description:
			"Create a Stripe Checkout URL to buy credits for this agent. Principal pays; webhook tops up balance.",
		category: "account",
		price: { credits: 0, currency: "credits", description: "Free (charges via Stripe)" },
		inputs: {
			pack: {
				type: "string",
				description: "starter | pro | scale",
				required: true,
			},
		},
		outputs: {
			type: "json",
			description: "checkout_url, session_id, credits",
		},
		auth_required: true,
		verify: { type: "schema", note: "Requires STRIPE_SECRET_KEY on server" },
	},
	{
		id: "agent_brief",
		name: "Agent brief",
		description:
			"Turn a messy goal into a structured brief: objective, constraints, success metrics, risks, next actions. Powered by Grok.",
		category: "grok-tool",
		price: {
			credits: 10,
			currency: "credits",
			description: "10 credits per call",
		},
		inputs: {
			goal: {
				type: "string",
				description: "What the agent needs to accomplish",
				required: true,
			},
			context: {
				type: "string",
				description: "Optional extra context",
				required: false,
			},
		},
		outputs: {
			type: "json",
			description: "Structured brief + signed receipt",
		},
		auth_required: true,
		verify: { type: "schema", note: "JSON object with required keys" },
	},
	{
		id: "structured_extract",
		name: "Structured extract",
		description:
			"Extract structured JSON from arbitrary text using a schema description. Powered by Grok.",
		category: "grok-tool",
		price: {
			credits: 15,
			currency: "credits",
			description: "15 credits per call",
		},
		inputs: {
			text: {
				type: "string",
				description: "Source text to extract from",
				required: true,
			},
			schema_hint: {
				type: "string",
				description: "JSON schema or field list to extract",
				required: true,
			},
		},
		outputs: {
			type: "json",
			description: "Extracted object + receipt",
		},
		auth_required: true,
		verify: { type: "schema", note: "Valid JSON object" },
	},
	{
		id: "code_review",
		name: "Code review",
		description:
			"Review a code patch for bugs, security, and simplicity. Returns severity-ranked findings. Powered by Grok.",
		category: "grok-tool",
		price: {
			credits: 25,
			currency: "credits",
			description: "25 credits per call",
		},
		inputs: {
			diff_or_code: {
				type: "string",
				description: "Unified diff or full file contents",
				required: true,
			},
			focus: {
				type: "string",
				description: "Optional focus: security | performance | style | all",
				required: false,
			},
		},
		outputs: {
			type: "json",
			description: "Findings array + summary + receipt",
		},
		auth_required: true,
		verify: { type: "schema", note: "JSON with findings[]" },
	},
	{
		id: "skill_match",
		name: "Skill match",
		description:
			"Given a buyer intent, recommend the best skills from this catalog and a hire plan. Powered by Grok.",
		category: "grok-tool",
		price: {
			credits: 5,
			currency: "credits",
			description: "5 credits per call",
		},
		inputs: {
			intent: {
				type: "string",
				description: "What the buying agent wants to accomplish",
				required: true,
			},
		},
		outputs: {
			type: "json",
			description: "Recommended skill ids + plan + receipt",
		},
		auth_required: true,
		verify: { type: "schema", note: "JSON recommendations" },
	},
];

export function getSkill(id: string): Skill | undefined {
	return SKILLS.find((s) => s.id === id);
}

export function skillGraphPublic() {
	return {
		protocol: "grok-agent-store/v1",
		name: "Grok Agent Store",
		description:
			"Agent-only vertical MCP store. Grok-backed tools sold per call with credit metering and signed receipts.",
		skills: SKILLS,
		payment: {
			model: "prepaid_credits",
			signup: "Call register_agent to receive an API key and bonus credits",
			header: "Authorization: Bearer <api_key>",
			future: "x402 micropayments planned for pay-per-call without accounts",
		},
		llm: {
			provider: "xAI",
			model_env: "GROK_MODEL",
			only: true,
		},
	};
}
