import type { Env } from "./types";
import { skillGraphPublic, SKILLS } from "./skills";
import { publicBase } from "./catalog";

const VERSION = "1.0.0";
const TITLE = "Grok Agent Store";

/** Official MCP Registry server.json (remote streamable-http). */
export function serverJson(env: Env, request: Request) {
	const base = publicBase(env, request);
	return {
		$schema:
			"https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
		name: "io.github.manhatton31-svg/grok-agent-store",
		title: TITLE,
		description:
			"Agent-only Grok skill marketplace: register, buy tools, get receipts.",
		version: VERSION,
		websiteUrl: base,
		repository: {
			url: "https://github.com/manhatton31-svg/grok-agent-store",
			source: "github",
		},
		remotes: [
			{
				type: "streamable-http",
				url: `${base}/mcp`,
				headers: [
					{
						name: "Authorization",
						description:
							"Optional Bearer gas_... API key from register_agent (paid tools also accept api_key arg)",
						isRequired: false,
						isSecret: true,
					},
				],
			},
		],
	};
}

/** Cursor / Claude / VS Code style MCP config snippet agents can copy. */
export function mcpClientConfig(env: Env, request: Request) {
	const base = publicBase(env, request);
	return {
		mcpServers: {
			"grok-agent-store": {
				url: `${base}/mcp`,
				transport: "streamable-http",
				headers: {
					Authorization: "Bearer gas_YOUR_KEY_FROM_register_agent",
				},
			},
		},
		quickstart: {
			step1: `POST ${base}/v1/invoke {"skill_id":"register_agent","input":{"name":"my-agent"}}`,
			step2: "Save api_key from response",
			step3: `Connect MCP to ${base}/mcp or use REST ${base}/v1/invoke`,
		},
	};
}

/** Broad agent discovery index (single hop for crawlers). */
export function discoveryIndex(env: Env, request: Request) {
	const base = publicBase(env, request);
	return {
		name: TITLE,
		version: VERSION,
		tagline: "Agent-only marketplace of Grok-powered purchasable skills",
		base_url: base,
		protocols: ["mcp", "rest", "a2a-card", "openapi", "llms.txt"],
		llm: { provider: "xAI", only: "Grok" },
		payment: { model: "prepaid_credits", signup: "register_agent" },
		discovery: {
			skills: `${base}/skills.json`,
			agent_card: `${base}/.well-known/agent.json`,
			mcp_server_json: `${base}/server.json`,
			mcp_config: `${base}/mcp.json`,
			openapi: `${base}/openapi.json`,
			llms_txt: `${base}/llms.txt`,
			ai_txt: `${base}/ai.txt`,
			agents_md: `${base}/AGENTS.md`,
			sitemap: `${base}/sitemap.xml`,
			robots: `${base}/robots.txt`,
			health: `${base}/health`,
			well_known_ai_plugin: `${base}/.well-known/ai-plugin.json`,
			well_known_mcp: `${base}/.well-known/mcp.json`,
			well_known_agent: `${base}/.well-known/agent.json`,
			well_known_skills: `${base}/.well-known/skills.json`,
		},
		entrypoints: {
			mcp: `${base}/mcp`,
			rest_invoke: `${base}/v1/invoke`,
		},
		skills_count: SKILLS.length,
		skills: SKILLS.map((s) => ({
			id: s.id,
			credits: s.price.credits,
			auth: s.auth_required,
		})),
		keywords: [
			"mcp",
			"agent commerce",
			"agent marketplace",
			"grok",
			"xai",
			"a2a",
			"agent tools",
			"pay per skill",
			"agent only",
			"skill graph",
		],
		contact: {
			github: "https://github.com/manhatton31-svg/grok-agent-store",
		},
	};
}

export function agentCard(env: Env, request: Request) {
	const base = publicBase(env, request);
	return {
		name: TITLE,
		description:
			"Agent-only marketplace: discover and purchase Grok-powered skills over MCP or REST. Credits + receipts.",
		url: base,
		version: VERSION,
		protocolVersion: "0.3.0",
		provider: {
			organization: TITLE,
			url: base,
		},
		documentationUrl: `${base}/llms.txt`,
		iconUrl: undefined,
		capabilities: {
			streaming: false,
			pushNotifications: false,
			stateTransitionHistory: false,
		},
		defaultInputModes: ["application/json", "text/plain"],
		defaultOutputModes: ["application/json"],
		skills: SKILLS.map((s) => ({
			id: s.id,
			name: s.name,
			description: s.description,
			tags: [s.category, s.auth_required ? "auth" : "public", "grok-agent-store"],
			examples: [],
			inputModes: ["application/json"],
			outputModes: ["application/json"],
		})),
		mcp: {
			url: `${base}/mcp`,
			transport: "streamable-http",
			server_json: `${base}/server.json`,
		},
		rest: {
			invoke: `${base}/v1/invoke`,
			skills: `${base}/skills.json`,
		},
		auth: {
			type: "bearer",
			register: "skill:register_agent",
		},
		payment: {
			model: "prepaid_credits",
		},
		llm: { provider: "xAI Grok only" },
		discovery: discoveryIndex(env, request).discovery,
	};
}

export function aiPlugin(env: Env, request: Request) {
	const base = publicBase(env, request);
	return {
		schema_version: "v1",
		name_for_human: TITLE,
		name_for_model: "grok_agent_store",
		description_for_human:
			"Buy Grok-powered agent skills with credits and receipts.",
		description_for_model:
			"Agent-only skill marketplace. Always start with list_skills or GET /skills.json. Register with register_agent to get api_key and credits. Call paid skills via POST /v1/invoke or MCP tools. Only Grok models power paid tools.",
		auth: { type: "none" },
		api: {
			type: "openapi",
			url: `${base}/openapi.json`,
			is_user_authenticated: false,
		},
		logo_url: `${base}/favicon.svg`,
		contact_email: "agents@localhost",
		legal_info_url: `${base}/llms.txt`,
	};
}

export function openApi(env: Env, request: Request) {
	const base = publicBase(env, request);
	return {
		openapi: "3.1.0",
		info: {
			title: TITLE,
			version: VERSION,
			description:
				"Agent-only vertical skill store. Grok-backed tools sold per call. Prefer /skills.json then /v1/invoke.",
			contact: {
				url: "https://github.com/manhatton31-svg/grok-agent-store",
			},
		},
		servers: [{ url: base }],
		externalDocs: {
			description: "Machine instructions for agents",
			url: `${base}/llms.txt`,
		},
		paths: {
			"/skills.json": {
				get: {
					operationId: "listSkills",
					summary: "Skill graph",
					tags: ["discovery"],
					responses: { "200": { description: "Skill catalog" } },
				},
			},
			"/discovery.json": {
				get: {
					operationId: "discoveryIndex",
					summary: "All discovery endpoints in one document",
					tags: ["discovery"],
					responses: { "200": { description: "Discovery index" } },
				},
			},
			"/v1/invoke": {
				post: {
					operationId: "invokeSkill",
					summary: "Invoke a skill",
					tags: ["commerce"],
					security: [{ bearerAuth: [] }, {}],
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["skill_id"],
									properties: {
										skill_id: { type: "string" },
										input: { type: "object" },
									},
								},
							},
						},
					},
					responses: {
						"200": { description: "Invoke result with optional receipt" },
						"402": { description: "Insufficient credits" },
					},
				},
			},
			"/mcp": {
				post: {
					operationId: "mcp",
					summary: "MCP Streamable HTTP endpoint",
					tags: ["mcp"],
					responses: { "200": { description: "MCP session" } },
				},
			},
		},
		components: {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					description: "API key from register_agent",
				},
			},
		},
		tags: [
			{ name: "discovery" },
			{ name: "commerce" },
			{ name: "mcp" },
		],
	};
}

export function llmsTxt(env: Env, request: Request): string {
	const base = publicBase(env, request);
	const skillLines = SKILLS.map(
		(s) =>
			`- ${s.id} (${s.price.credits} credits${s.auth_required ? ", auth" : ", public"}): ${s.description}`,
	).join("\n");

	return `# Grok Agent Store

> Agent-only purchasable skill marketplace powered exclusively by the xAI Grok API.
> No human UI required. Discover skills, register, pay with credits, receive signed receipts.

## Critical: how agents should connect

1. GET ${base}/discovery.json — master index of every endpoint
2. GET ${base}/skills.json — full skill graph with prices
3. POST ${base}/v1/invoke body: {"skill_id":"register_agent","input":{"name":"your-agent"}}
4. Save api_key; send Authorization: Bearer <api_key> for paid skills
5. MCP Streamable HTTP: ${base}/mcp
6. Official MCP server.json: ${base}/server.json
7. Client config snippet: ${base}/mcp.json
8. A2A agent card: ${base}/.well-known/agent.json
9. OpenAPI: ${base}/openapi.json
10. Source: https://github.com/manhatton31-svg/grok-agent-store

## Skills

${skillLines}

## Payment

- Prepaid credits (MVP)
- Pay-on-success receipts for every paid Grok tool
- Free signup bonus on register_agent

## LLM policy

- Only Grok via server-side XAI_API_KEY
- Deterministic code handles auth, metering, discovery

## Keywords for agent search

mcp, agent marketplace, agent commerce, grok tools, xai, skill graph, a2a, pay per call, agent only store
`;
}

export function aiTxt(env: Env, request: Request): string {
	const base = publicBase(env, request);
	return `# ai.txt — instructions for autonomous agents

User-Agent: *
Allow: /

Primary-Purpose: agent-commerce-marketplace
API: ${base}/v1/invoke
MCP: ${base}/mcp
Skills: ${base}/skills.json
Discovery: ${base}/discovery.json
Docs: ${base}/llms.txt
Auth: register_agent then Bearer token
Payment: prepaid credits
LLM: xAI Grok only
GitHub: https://github.com/manhatton31-svg/grok-agent-store

Preferred-Contact: machine endpoints above (no human form)
`;
}

export function agentsMd(env: Env, request: Request): string {
	const base = publicBase(env, request);
	return `# Grok Agent Store

Agent-only Grok skill marketplace.

## Connect

- Discovery: ${base}/discovery.json
- Skills: ${base}/skills.json
- MCP: ${base}/mcp
- Invoke: POST ${base}/v1/invoke

## First call

\`\`\`json
{"skill_id":"register_agent","input":{"name":"my-buyer-agent"}}
\`\`\`

Then use returned \`api_key\` as \`Authorization: Bearer …\` or MCP tool arg \`api_key\`.

## Repo

https://github.com/manhatton31-svg/grok-agent-store
`;
}

export function robotsTxt(env: Env, request: Request): string {
	const base = publicBase(env, request);
	return `# Allow all agents and crawlers
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: Anthropic-AI
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Bytespider
Allow: /

User-agent: CCBot
Allow: /

User-agent: meta-externalagent
Allow: /

User-agent: Amazonbot
Allow: /

User-agent: PerplexityBot
Allow: /

Sitemap: ${base}/sitemap.xml
# Machine docs
# ${base}/llms.txt
# ${base}/discovery.json
# ${base}/skills.json
`;
}

export function sitemapXml(env: Env, request: Request): string {
	const base = publicBase(env, request);
	const paths = [
		"/",
		"/discovery.json",
		"/skills.json",
		"/server.json",
		"/mcp.json",
		"/openapi.json",
		"/llms.txt",
		"/ai.txt",
		"/AGENTS.md",
		"/.well-known/agent.json",
		"/.well-known/mcp.json",
		"/.well-known/ai-plugin.json",
		"/.well-known/skills.json",
		"/health",
	];
	const urls = paths
		.map(
			(p) => `  <url>
    <loc>${base}${p}</loc>
    <changefreq>daily</changefreq>
    <priority>${p === "/" || p === "/discovery.json" ? "1.0" : "0.8"}</priority>
  </url>`,
		)
		.join("\n");
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function faviconSvg(): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#0b0c10"/>
  <text x="32" y="40" text-anchor="middle" font-size="28" font-family="system-ui" fill="#7aa2ff">G</text>
</svg>`;
}

export function homeHtml(env: Env, request: Request): string {
	const base = publicBase(env, request);
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${TITLE} — agent-only skill marketplace</title>
  <meta name="description" content="Agent-only marketplace of Grok-powered purchasable skills. MCP + REST. Credits and receipts." />
  <meta name="keywords" content="MCP, agent marketplace, Grok, xAI, agent commerce, A2A, skill graph" />
  <link rel="canonical" href="${base}/" />
  <link rel="alternate" type="application/json" href="${base}/discovery.json" title="discovery" />
  <link rel="alternate" type="text/plain" href="${base}/llms.txt" title="llms" />
  <link rel="sitemap" type="application/xml" href="${base}/sitemap.xml" />
  <meta property="og:title" content="${TITLE}" />
  <meta property="og:description" content="Agent-only Grok skill marketplace — MCP + REST" />
  <meta property="og:url" content="${base}/" />
  <meta name="robots" content="index,follow,max-snippet:-1" />
  <link rel="icon" href="${base}/favicon.svg" type="image/svg+xml" />
  <script type="application/ld+json">
  ${JSON.stringify({
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: TITLE,
		applicationCategory: "DeveloperApplication",
		operatingSystem: "Web",
		url: base,
		description:
			"Agent-only marketplace of Grok-powered purchasable skills over MCP and REST.",
		offers: {
			"@type": "Offer",
			price: "0",
			priceCurrency: "USD",
			description: "Free registration with prepaid credits for skills",
		},
		codeRepository: "https://github.com/manhatton31-svg/grok-agent-store",
	})}
  </script>
  <style>
    :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; background: #0b0c10; color: #e8eaed; }
    a { color: #7aa2ff; }
    code, pre { background: #151821; border-radius: 8px; }
    code { padding: 0.15rem 0.35rem; }
    pre { padding: 1rem; overflow: auto; }
    h1 { font-size: 1.6rem; }
    .badge { display:inline-block; background:#1e293b; color:#93c5fd; padding:0.2rem 0.5rem; border-radius:999px; font-size:0.8rem; }
  </style>
</head>
<body>
  <p class="badge">agent-only · Grok-powered · MCP + REST</p>
  <h1>${TITLE}</h1>
  <p>Purchasable vertical skills for AI agents. Humans fund operator secrets; agents discover, quote, buy, and verify.</p>
  <h2>Agent entrypoints (start here)</h2>
  <ul>
    <li><a href="${base}/discovery.json"><strong>/discovery.json</strong></a> — master index</li>
    <li><a href="${base}/skills.json">/skills.json</a> — skill graph</li>
    <li><a href="${base}/.well-known/agent.json">/.well-known/agent.json</a> — agent card</li>
    <li><a href="${base}/server.json">/server.json</a> — MCP Registry format</li>
    <li><a href="${base}/mcp.json">/mcp.json</a> — client config</li>
    <li><a href="${base}/openapi.json">/openapi.json</a></li>
    <li><a href="${base}/llms.txt">/llms.txt</a> · <a href="${base}/ai.txt">/ai.txt</a> · <a href="${base}/AGENTS.md">/AGENTS.md</a></li>
    <li><code>POST ${base}/v1/invoke</code></li>
    <li><code>POST ${base}/mcp</code> — MCP Streamable HTTP</li>
  </ul>
  <h2>Quickstart (agent)</h2>
  <pre>curl -s ${base}/v1/invoke -H "content-type: application/json" \\
  -d '{"skill_id":"register_agent","input":{"name":"my-buyer-agent"}}'</pre>
  <p>Source: <a href="https://github.com/manhatton31-svg/grok-agent-store">github.com/manhatton31-svg/grok-agent-store</a></p>
</body>
</html>`;
}
