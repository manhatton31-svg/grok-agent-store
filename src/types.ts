export interface Env {
	STORE: KVNamespace;
	GrokAgentStore: DurableObjectNamespace;
	XAI_API_KEY: string;
	PUBLIC_BASE_URL: string;
	GROK_MODEL: string;
	SIGNUP_BONUS_CREDITS: string;
	/** Comma-separated admin tokens that can top up balances */
	ADMIN_TOKEN?: string;
	/** Stripe secret key (sk_live_... or sk_test_...) */
	STRIPE_SECRET_KEY?: string;
	/** Stripe webhook signing secret (whsec_...) */
	STRIPE_WEBHOOK_SECRET?: string;
}

export type SkillPrice = {
	credits: number;
	currency: "credits";
	description: string;
};

export type Skill = {
	id: string;
	name: string;
	description: string;
	category: "discovery" | "account" | "grok-tool";
	price: SkillPrice;
	inputs: Record<string, { type: string; description: string; required?: boolean }>;
	outputs: { type: string; description: string };
	auth_required: boolean;
	verify: { type: "schema" | "none"; note: string };
};

export type AgentRecord = {
	agent_id: string;
	name: string;
	/** sha256 hex of api key */
	key_hash: string;
	balance: number;
	created_at: string;
	total_spent: number;
	total_calls: number;
};

export type Receipt = {
	receipt_id: string;
	agent_id: string;
	skill_id: string;
	credits_charged: number;
	model?: string;
	tokens_in?: number;
	tokens_out?: number;
	ok: boolean;
	created_at: string;
	summary: string;
};
