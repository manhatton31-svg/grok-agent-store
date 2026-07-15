import type { Env } from "./types";
import { getAgentByKey, saveAgent } from "./auth";

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

export type CreditPackId = "starter" | "pro" | "scale";

export const CREDIT_PACKS: Record<
	CreditPackId,
	{ credits: number; amount_cents: number; label: string }
> = {
	starter: { credits: 100, amount_cents: 500, label: "Starter 100 credits" },
	pro: { credits: 500, amount_cents: 2000, label: "Pro 500 credits" },
	scale: { credits: 2000, amount_cents: 6000, label: "Scale 2000 credits" },
};

export function listPacks() {
	return Object.entries(CREDIT_PACKS).map(([id, p]) => ({
		pack: id,
		credits: p.credits,
		price_usd: (p.amount_cents / 100).toFixed(2),
		label: p.label,
	}));
}

/** Create Stripe Checkout Session for credit purchase. */
export async function createCheckoutSession(
	env: Env,
	request: Request,
	apiKey: string,
	packId: string,
): Promise<{ ok: true; checkout_url: string; session_id: string; pack: string; credits: number } | { ok: false; error: string }> {
	if (!env.STRIPE_SECRET_KEY) {
		return {
			ok: false,
			error:
				"Stripe not configured. Operator must set STRIPE_SECRET_KEY (and STRIPE_WEBHOOK_SECRET) secrets.",
		};
	}
	const pack = CREDIT_PACKS[packId as CreditPackId];
	if (!pack) {
		return {
			ok: false,
			error: `Unknown pack. Use one of: ${Object.keys(CREDIT_PACKS).join(", ")}`,
		};
	}
	const agent = await getAgentByKey(env, apiKey);
	if (!agent) {
		return { ok: false, error: "Invalid API key" };
	}

	const base = publicBase(env, request);
	const body = new URLSearchParams();
	body.set("mode", "payment");
	body.set("success_url", `${base}/pay/success?session_id={CHECKOUT_SESSION_ID}`);
	body.set("cancel_url", `${base}/pay/cancel`);
	body.set("client_reference_id", agent.agent_id);
	body.set("metadata[agent_id]", agent.agent_id);
	body.set("metadata[credits]", String(pack.credits));
	body.set("metadata[pack]", packId);
	body.set("line_items[0][price_data][currency]", "usd");
	body.set("line_items[0][price_data][unit_amount]", String(pack.amount_cents));
	body.set("line_items[0][price_data][product_data][name]", pack.label);
	body.set(
		"line_items[0][price_data][product_data][description]",
		`${pack.credits} Grok Agent Store credits for ${agent.name}`,
	);
	body.set("line_items[0][quantity]", "1");

	const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body,
	});
	const data = (await res.json()) as {
		id?: string;
		url?: string;
		error?: { message?: string };
	};
	if (!res.ok || !data.url || !data.id) {
		return {
			ok: false,
			error: data.error?.message || `Stripe error ${res.status}`,
		};
	}

	// Remember pending session → credits for webhook redundancy
	await env.STORE.put(
		`stripe_session:${data.id}`,
		JSON.stringify({
			agent_id: agent.agent_id,
			credits: pack.credits,
			pack: packId,
			created_at: new Date().toISOString(),
		}),
		{ expirationTtl: 60 * 60 * 24 },
	);

	return {
		ok: true,
		checkout_url: data.url,
		session_id: data.id,
		pack: packId,
		credits: pack.credits,
	};
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let out = 0;
	for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return out === 0;
}

/** Verify Stripe webhook signature (v1). */
export async function verifyStripeSignature(
	payload: string,
	sigHeader: string | null,
	secret: string,
): Promise<boolean> {
	if (!sigHeader || !secret) return false;
	const parts = Object.fromEntries(
		sigHeader.split(",").map((p) => {
			const [k, v] = p.split("=");
			return [k.trim(), v];
		}),
	);
	const timestamp = parts.t;
	const signature = parts.v1;
	if (!timestamp || !signature) return false;
	// Reject old timestamps (>5 min)
	const ts = Number(timestamp);
	if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
		return false;
	}
	const signed = `${timestamp}.${payload}`;
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const mac = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(signed),
	);
	const hex = [...new Uint8Array(mac)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return timingSafeEqual(hex, signature);
}

export async function handleStripeWebhook(
	env: Env,
	request: Request,
): Promise<Response> {
	const secret = env.STRIPE_WEBHOOK_SECRET;
	if (!secret || !env.STRIPE_SECRET_KEY) {
		return new Response("Stripe webhook not configured", { status: 503 });
	}
	const payload = await request.text();
	const sig = request.headers.get("stripe-signature");
	const ok = await verifyStripeSignature(payload, sig, secret);
	if (!ok) {
		return new Response("Invalid signature", { status: 400 });
	}

	const event = JSON.parse(payload) as {
		type: string;
		data: { object: Record<string, unknown> };
	};

	if (event.type === "checkout.session.completed") {
		const session = event.data.object as {
			id: string;
			payment_status?: string;
			client_reference_id?: string;
			metadata?: { agent_id?: string; credits?: string; pack?: string };
		};
		if (session.payment_status && session.payment_status !== "paid") {
			return new Response(JSON.stringify({ received: true, skipped: "unpaid" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}

		// Idempotency
		const doneKey = `stripe_paid:${session.id}`;
		if (await env.STORE.get(doneKey)) {
			return new Response(JSON.stringify({ received: true, duplicate: true }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}

		const pendingRaw = await env.STORE.get(`stripe_session:${session.id}`);
		const pending = pendingRaw
			? (JSON.parse(pendingRaw) as {
					agent_id: string;
					credits: number;
					pack: string;
				})
			: null;

		const agentId =
			session.metadata?.agent_id ||
			session.client_reference_id ||
			pending?.agent_id;
		const credits = Number(
			session.metadata?.credits || pending?.credits || 0,
		);
		if (!agentId || !credits) {
			return new Response(JSON.stringify({ received: true, error: "missing meta" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}

		const agentRaw = await env.STORE.get(`agent:${agentId}`);
		if (!agentRaw) {
			return new Response(JSON.stringify({ received: true, error: "agent missing" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}
		const agent = JSON.parse(agentRaw) as {
			agent_id: string;
			name: string;
			key_hash: string;
			balance: number;
			created_at: string;
			total_spent: number;
			total_calls: number;
		};
		agent.balance += credits;
		await saveAgent(env, agent);
		await env.STORE.put(
			doneKey,
			JSON.stringify({
				agent_id: agentId,
				credits,
				at: new Date().toISOString(),
			}),
			{ expirationTtl: 60 * 60 * 24 * 90 },
		);
	}

	return new Response(JSON.stringify({ received: true }), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

export function paySuccessHtml(base: string): string {
	return `<!doctype html><html><head><meta charset="utf-8"/><title>Payment success</title>
<style>body{font-family:system-ui;max-width:40rem;margin:3rem auto;background:#0b0c10;color:#e8eaed;padding:1rem}
a{color:#7aa2ff}</style></head><body>
<h1>Payment received</h1>
<p>Credits were added to your agent balance (Stripe webhook). Agents can call <code>balance</code> to confirm.</p>
<p><a href="${base}/discovery.json">Back to discovery</a></p>
</body></html>`;
}

export function payCancelHtml(base: string): string {
	return `<!doctype html><html><head><meta charset="utf-8"/><title>Payment canceled</title>
<style>body{font-family:system-ui;max-width:40rem;margin:3rem auto;background:#0b0c10;color:#e8eaed;padding:1rem}
a{color:#7aa2ff}</style></head><body>
<h1>Checkout canceled</h1>
<p>No charges. Call <code>purchase_credits</code> again when ready.</p>
<p><a href="${base}/discovery.json">Back to discovery</a></p>
</body></html>`;
}
