import type { Env } from "./types";
import { invokeSkill, publicBase } from "./catalog";
import {
	agentCard,
	aiPlugin,
	aiTxt,
	agentsMd,
	discoveryIndex,
	faviconSvg,
	homeHtml,
	llmsTxt,
	mcpClientConfig,
	openApi,
	robotsTxt,
	serverJson,
	sitemapXml,
} from "./discovery";
import { skillGraphPublic } from "./skills";
import { GrokAgentStore } from "./mcp";
import { extractBearer, getAgentByKey, saveAgent } from "./auth";
import {
	handleStripeWebhook,
	payCancelHtml,
	paySuccessHtml,
} from "./payments";

export { GrokAgentStore };

const mcpHandler = GrokAgentStore.serve("/mcp", {
	binding: "GrokAgentStore",
});

function json(
	data: unknown,
	status = 200,
	extra?: Record<string, string>,
): Response {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"access-control-allow-origin": "*",
			"access-control-allow-headers": "Authorization, Content-Type",
			"access-control-allow-methods": "GET, POST, OPTIONS",
			...(extra || {}),
		},
	});
}

function corsOptions(): Response {
	return new Response(null, {
		status: 204,
		headers: {
			"access-control-allow-origin": "*",
			"access-control-allow-headers": "Authorization, Content-Type",
			"access-control-allow-methods": "GET, POST, OPTIONS",
			"access-control-max-age": "86400",
		},
	});
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		if (request.method === "OPTIONS") return corsOptions();

		const url = new URL(request.url);
		const path = url.pathname.replace(/\/$/, "") || "/";

		// --- Discovery (no auth) — maximize agent crawler surface ---
		if (request.method === "GET" && path === "/") {
			const accept = request.headers.get("accept") || "";
			if (accept.includes("application/json") || url.searchParams.has("json")) {
				return json(discoveryIndex(env, request));
			}
			return new Response(homeHtml(env, request), {
				headers: {
					"content-type": "text/html; charset=utf-8",
					"access-control-allow-origin": "*",
				},
			});
		}

		if (request.method === "GET" && path === "/discovery.json") {
			return json(discoveryIndex(env, request));
		}

		if (
			request.method === "GET" &&
			(path === "/skills.json" || path === "/.well-known/skills.json")
		) {
			return json(skillGraphPublic());
		}

		if (
			request.method === "GET" &&
			(path === "/.well-known/agent.json" || path === "/agent.json")
		) {
			return json(agentCard(env, request));
		}

		if (
			request.method === "GET" &&
			(path === "/server.json" || path === "/.well-known/mcp.json")
		) {
			return json(serverJson(env, request));
		}

		if (request.method === "GET" && path === "/mcp.json") {
			return json(mcpClientConfig(env, request));
		}

		if (
			request.method === "GET" &&
			(path === "/.well-known/ai-plugin.json" || path === "/ai-plugin.json")
		) {
			return json(aiPlugin(env, request));
		}

		if (request.method === "GET" && path === "/openapi.json") {
			return json(openApi(env, request));
		}

		if (request.method === "GET" && path === "/llms.txt") {
			return new Response(llmsTxt(env, request), {
				headers: {
					"content-type": "text/plain; charset=utf-8",
					"access-control-allow-origin": "*",
				},
			});
		}

		if (request.method === "GET" && path === "/ai.txt") {
			return new Response(aiTxt(env, request), {
				headers: {
					"content-type": "text/plain; charset=utf-8",
					"access-control-allow-origin": "*",
				},
			});
		}

		if (
			request.method === "GET" &&
			(path === "/AGENTS.md" || path === "/agents.md")
		) {
			return new Response(agentsMd(env, request), {
				headers: {
					"content-type": "text/markdown; charset=utf-8",
					"access-control-allow-origin": "*",
				},
			});
		}

		if (request.method === "GET" && path === "/robots.txt") {
			return new Response(robotsTxt(env, request), {
				headers: {
					"content-type": "text/plain; charset=utf-8",
					"access-control-allow-origin": "*",
				},
			});
		}

		if (request.method === "GET" && path === "/sitemap.xml") {
			return new Response(sitemapXml(env, request), {
				headers: {
					"content-type": "application/xml; charset=utf-8",
					"access-control-allow-origin": "*",
				},
			});
		}

		if (request.method === "GET" && path === "/favicon.svg") {
			return new Response(faviconSvg(), {
				headers: {
					"content-type": "image/svg+xml",
					"access-control-allow-origin": "*",
					"cache-control": "public, max-age=86400",
				},
			});
		}

		if (request.method === "GET" && path === "/health") {
			return json({
				ok: true,
				service: "grok-agent-store",
				grok_configured: Boolean(env.XAI_API_KEY),
				model: env.GROK_MODEL || "grok-4",
				discovery: `${publicBase(env, request)}/discovery.json`,
				mcp: `${publicBase(env, request)}/mcp`,
				github: "https://github.com/manhatton31-svg/grok-agent-store",
			});
		}

		// --- REST invoke ---
		if (request.method === "POST" && path === "/v1/invoke") {
			let body: { skill_id?: string; input?: Record<string, unknown> };
			try {
				body = (await request.json()) as typeof body;
			} catch {
				return json({ ok: false, error: "Invalid JSON body" }, 400);
			}
			if (!body.skill_id || typeof body.skill_id !== "string") {
				return json({ ok: false, error: "skill_id required" }, 400);
			}
			const result = await invokeSkill(
				env,
				body.skill_id,
				body.input || {},
				request,
			);
			const status = result.ok
				? 200
				: result.error?.includes("Insufficient credits")
					? 402
					: result.error?.includes("Authorization") ||
						  result.error?.includes("Invalid API")
						? 401
						: 400;
			return json(result, status);
		}

		// Stripe webhook (public; signature verified)
		if (request.method === "POST" && path === "/v1/webhooks/stripe") {
			return handleStripeWebhook(env, request);
		}

		if (request.method === "GET" && path === "/pay/success") {
			return new Response(paySuccessHtml(publicBase(env, request)), {
				headers: { "content-type": "text/html; charset=utf-8" },
			});
		}
		if (request.method === "GET" && path === "/pay/cancel") {
			return new Response(payCancelHtml(publicBase(env, request)), {
				headers: { "content-type": "text/html; charset=utf-8" },
			});
		}

		// Admin top-up (optional)
		if (request.method === "POST" && path === "/v1/admin/topup") {
			const admin = env.ADMIN_TOKEN;
			const token = request.headers.get("x-admin-token");
			if (!admin || token !== admin) {
				return json({ ok: false, error: "Unauthorized" }, 401);
			}
			const body = (await request.json()) as {
				api_key?: string;
				credits?: number;
			};
			if (!body.api_key || !body.credits) {
				return json({ ok: false, error: "api_key and credits required" }, 400);
			}
			const agent = await getAgentByKey(env, body.api_key);
			if (!agent) return json({ ok: false, error: "Agent not found" }, 404);
			agent.balance += body.credits;
			await saveAgent(env, agent);
			return json({ ok: true, agent_id: agent.agent_id, balance: agent.balance });
		}

		// --- MCP (Streamable HTTP) ---
		if (path === "/mcp" || path.startsWith("/mcp/")) {
			// Pass bearer into DO props when possible
			const apiKey = extractBearer(request) || undefined;
			if (apiKey) {
				// McpAgent.serve uses the request as-is; catalog tools rebuild auth from props.
				// Also keep Authorization on the request for any middleware.
			}
			return mcpHandler.fetch(request, env, ctx as ExecutionContext);
		}

		return json(
			{
				ok: false,
				error: "Not found",
				path,
				method: request.method,
				hint: "GET /discovery.json or /skills.json or POST /v1/invoke",
			},
			404,
		);
	},
};
