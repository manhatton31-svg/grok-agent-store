/// <reference types="@cloudflare/workers-types" />

interface Env {
	STORE: KVNamespace;
	GrokAgentStore: DurableObjectNamespace;
	XAI_API_KEY: string;
	PUBLIC_BASE_URL: string;
	GROK_MODEL: string;
	SIGNUP_BONUS_CREDITS: string;
	ADMIN_TOKEN?: string;
	STRIPE_SECRET_KEY?: string;
	STRIPE_WEBHOOK_SECRET?: string;
}
