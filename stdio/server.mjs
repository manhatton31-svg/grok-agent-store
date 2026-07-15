#!/usr/bin/env node
/**
 * Stdio MCP server for Glama / local clients.
 * Proxies tool calls to the hosted Grok Agent Store REST API.
 * Starts instantly and answers list_tools without secrets (Glama check).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE =
	process.env.GROK_AGENT_STORE_URL ||
	"https://grok-agent-store.manhatton31.workers.dev";

const TOOLS = [
	{
		name: "list_skills",
		description: "List all skills on Grok Agent Store (free).",
		inputSchema: { type: "object", properties: {} },
	},
	{
		name: "get_skill",
		description: "Get one skill card by id (free).",
		inputSchema: {
			type: "object",
			properties: { skill_id: { type: "string" } },
			required: ["skill_id"],
		},
	},
	{
		name: "quote",
		description: "Quote price for a skill (free).",
		inputSchema: {
			type: "object",
			properties: { skill_id: { type: "string" } },
			required: ["skill_id"],
		},
	},
	{
		name: "register_agent",
		description: "Register and receive API key + bonus credits (free).",
		inputSchema: {
			type: "object",
			properties: { name: { type: "string" } },
			required: ["name"],
		},
	},
	{
		name: "balance",
		description: "Check credit balance (auth).",
		inputSchema: {
			type: "object",
			properties: { api_key: { type: "string" } },
			required: ["api_key"],
		},
	},
	{
		name: "purchase_credits",
		description:
			"Create a Stripe Checkout session to buy credit packs (returns payment URL).",
		inputSchema: {
			type: "object",
			properties: {
				api_key: { type: "string" },
				pack: {
					type: "string",
					description: "starter | pro | scale (100 / 500 / 2000 credits)",
				},
			},
			required: ["api_key"],
		},
	},
	{
		name: "agent_brief",
		description: "Grok: structured brief from a goal (10 credits).",
		inputSchema: {
			type: "object",
			properties: {
				api_key: { type: "string" },
				goal: { type: "string" },
				context: { type: "string" },
			},
			required: ["api_key", "goal"],
		},
	},
	{
		name: "structured_extract",
		description: "Grok: extract JSON from text (15 credits).",
		inputSchema: {
			type: "object",
			properties: {
				api_key: { type: "string" },
				text: { type: "string" },
				schema_hint: { type: "string" },
			},
			required: ["api_key", "text", "schema_hint"],
		},
	},
	{
		name: "code_review",
		description: "Grok: code/diff review (25 credits).",
		inputSchema: {
			type: "object",
			properties: {
				api_key: { type: "string" },
				diff_or_code: { type: "string" },
				focus: { type: "string" },
			},
			required: ["api_key", "diff_or_code"],
		},
	},
	{
		name: "skill_match",
		description: "Grok: recommend skills for an intent (5 credits).",
		inputSchema: {
			type: "object",
			properties: {
				api_key: { type: "string" },
				intent: { type: "string" },
			},
			required: ["api_key", "intent"],
		},
	},
];

async function invoke(skillId, input, apiKey) {
	const headers = { "content-type": "application/json" };
	if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
	const res = await fetch(`${BASE}/v1/invoke`, {
		method: "POST",
		headers,
		body: JSON.stringify({ skill_id: skillId, input: input || {} }),
	});
	const text = await res.text();
	return { status: res.status, body: text };
}

const server = new Server(
	{ name: "grok-agent-store", version: "1.0.0" },
	{ capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const name = request.params.name;
	const args = request.params.arguments || {};
	const apiKey = typeof args.api_key === "string" ? args.api_key : undefined;
	const input = { ...args };
	delete input.api_key;

	try {
		const { status, body } = await invoke(name, input, apiKey);
		return {
			content: [
				{
					type: "text",
					text: status === 200 ? body : `HTTP ${status}: ${body}`,
				},
			],
			isError: status >= 400,
		};
	} catch (e) {
		return {
			content: [
				{
					type: "text",
					text: `Error: ${e instanceof Error ? e.message : String(e)}`,
				},
			],
			isError: true,
		};
	}
});

const transport = new StdioServerTransport();
await server.connect(transport);
