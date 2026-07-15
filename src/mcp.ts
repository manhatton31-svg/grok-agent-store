import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env } from "./types";
import { invokeSkill } from "./catalog";
import { skillGraphPublic } from "./skills";

type Props = {
	apiKey?: string;
};

/**
 * MCP surface for buyer agents (Claude Desktop, Cursor, custom MCP clients).
 * Paid tools use Authorization: Bearer from the MCP session headers when present.
 */
export class GrokAgentStore extends McpAgent<Env, unknown, Props> {
	server = new McpServer({
		name: "grok-agent-store",
		version: "1.0.0",
	});

	private getEnv(): Env {
		// Agent base class provides env; typing is loose across agents package versions.
		return (this as unknown as { env: Env }).env;
	}

	private getProps(): Props {
		return ((this as unknown as { props?: Props }).props || {}) as Props;
	}

	async init() {
		this.server.tool(
			"list_skills",
			"List all skills in the Grok Agent Store skill graph (free).",
			{},
			async () => {
				const out = await invokeSkill(this.getEnv(), "list_skills", {}, this.asRequest());
				return textResult(out);
			},
		);

		this.server.tool(
			"get_skill",
			"Get one skill card by id (free).",
			{ skill_id: z.string() },
			async ({ skill_id }) => {
				const out = await invokeSkill(
					this.getEnv(),
					"get_skill",
					{ skill_id },
					this.asRequest(),
				);
				return textResult(out);
			},
		);

		this.server.tool(
			"quote",
			"Quote price for a skill before purchase (free).",
			{ skill_id: z.string() },
			async ({ skill_id }) => {
				const out = await invokeSkill(
					this.getEnv(),
					"quote",
					{ skill_id },
					this.asRequest(),
				);
				return textResult(out);
			},
		);

		this.server.tool(
			"register_agent",
			"Register and receive API key + bonus credits (free). Store the key.",
			{ name: z.string() },
			async ({ name }) => {
				const out = await invokeSkill(
					this.getEnv(),
					"register_agent",
					{ name },
					this.asRequest(),
				);
				return textResult(out);
			},
		);

		this.server.tool(
			"balance",
			"Check credit balance (auth required).",
			{ api_key: z.string().describe("API key from register_agent") },
			async ({ api_key }) => {
				const out = await invokeSkill(
					this.getEnv(),
					"balance",
					{ api_key },
					this.asRequest(api_key),
					api_key,
				);
				return textResult(out);
			},
		);

		this.server.tool(
			"list_credit_packs",
			"List Stripe credit packs and USD prices (free).",
			{},
			async () => {
				const out = await invokeSkill(
					this.getEnv(),
					"list_credit_packs",
					{},
					this.asRequest(),
				);
				return textResult(out);
			},
		);

		this.server.tool(
			"purchase_credits",
			"Create Stripe Checkout URL to buy credits (auth).",
			{
				api_key: z.string().describe("API key from register_agent"),
				pack: z
					.string()
					.optional()
					.describe("starter | pro | scale"),
			},
			async ({ api_key, pack }) => {
				const out = await invokeSkill(
					this.getEnv(),
					"purchase_credits",
					{ pack: pack || "starter", api_key },
					this.asRequest(api_key),
					api_key,
				);
				return textResult(out);
			},
		);

		this.server.tool(
			"agent_brief",
			"Grok: turn a messy goal into a structured brief (10 credits).",
			{
				api_key: z.string().describe("API key from register_agent"),
				goal: z.string(),
				context: z.string().optional(),
			},
			async ({ api_key, goal, context }) => {
				const out = await invokeSkill(
					this.getEnv(),
					"agent_brief",
					{ goal, context, api_key },
					this.asRequest(api_key),
					api_key,
				);
				return textResult(out);
			},
		);

		this.server.tool(
			"structured_extract",
			"Grok: extract JSON from text using a schema hint (15 credits).",
			{
				api_key: z.string().describe("API key from register_agent"),
				text: z.string(),
				schema_hint: z.string(),
			},
			async ({ api_key, text, schema_hint }) => {
				const out = await invokeSkill(
					this.getEnv(),
					"structured_extract",
					{ text, schema_hint, api_key },
					this.asRequest(api_key),
					api_key,
				);
				return textResult(out);
			},
		);

		this.server.tool(
			"code_review",
			"Grok: review code/diff for bugs and risks (25 credits).",
			{
				api_key: z.string().describe("API key from register_agent"),
				diff_or_code: z.string(),
				focus: z.string().optional(),
			},
			async ({ api_key, diff_or_code, focus }) => {
				const out = await invokeSkill(
					this.getEnv(),
					"code_review",
					{ diff_or_code, focus, api_key },
					this.asRequest(api_key),
					api_key,
				);
				return textResult(out);
			},
		);

		this.server.tool(
			"skill_match",
			"Grok: recommend skills from this catalog for a buyer intent (5 credits).",
			{
				api_key: z.string().describe("API key from register_agent"),
				intent: z.string(),
			},
			async ({ api_key, intent }) => {
				const out = await invokeSkill(
					this.getEnv(),
					"skill_match",
					{ intent, api_key },
					this.asRequest(api_key),
					api_key,
				);
				return textResult(out);
			},
		);

		this.server.resource("skills", "gas://skills", async () => ({
			contents: [
				{
					uri: "gas://skills",
					mimeType: "application/json",
					text: JSON.stringify(skillGraphPublic(), null, 2),
				},
			],
		}));
	}

	/** Reconstruct a Request carrying bearer auth from MCP props / tool api_key. */
	private asRequest(apiKey?: string): Request {
		const headers = new Headers({ "content-type": "application/json" });
		const key = apiKey || this.getProps().apiKey;
		if (key) headers.set("Authorization", `Bearer ${key}`);
		const base = this.getEnv().PUBLIC_BASE_URL || "http://localhost:8787";
		return new Request(`${base}/mcp`, { headers });
	}
}

function textResult(out: unknown) {
	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify(out, null, 2),
			},
		],
	};
}
