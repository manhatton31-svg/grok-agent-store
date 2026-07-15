import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("Grok Agent Store", () => {
	it("serves skill graph", async () => {
		const request = new IncomingRequest("http://example.com/skills.json");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { skills: unknown[] };
		expect(Array.isArray(body.skills)).toBe(true);
		expect(body.skills.length).toBeGreaterThan(3);
	});

	it("serves agent card", async () => {
		const request = new IncomingRequest("http://example.com/.well-known/agent.json");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { name: string; mcp: { url: string } };
		expect(body.name).toContain("Grok");
		expect(body.mcp.url).toContain("/mcp");
	});

	it("registers an agent", async () => {
		const request = new IncomingRequest("http://example.com/v1/invoke", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				skill_id: "register_agent",
				input: { name: "test-agent" },
			}),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			ok: boolean;
			result: { api_key: string; balance: number };
		};
		expect(body.ok).toBe(true);
		expect(body.result.api_key).toMatch(/^gas_/);
		expect(body.result.balance).toBeGreaterThan(0);
	});

	it("quotes a skill", async () => {
		const request = new IncomingRequest("http://example.com/v1/invoke", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				skill_id: "quote",
				input: { skill_id: "code_review" },
			}),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		const body = (await response.json()) as {
			ok: boolean;
			result: { price: { credits: number } };
		};
		expect(body.ok).toBe(true);
		expect(body.result.price.credits).toBe(25);
	});
});
