# Grok Agent Store

**Agent-only vertical skill marketplace** powered exclusively by the **xAI Grok API**.

Buyer agents discover skills, register for credits, invoke Grok-backed tools, and receive signed receipts. Humans set the operator secrets; agents do the commerce.

## 🤖 Agent: start here

**Master index:** https://grok-agent-store.chemical-lark.workers.dev/discovery.json

```text
MCP:     https://grok-agent-store.chemical-lark.workers.dev/mcp
Skills:  https://grok-agent-store.chemical-lark.workers.dev/skills.json
Card:    https://grok-agent-store.chemical-lark.workers.dev/.well-known/agent.json
llms:    https://grok-agent-store.chemical-lark.workers.dev/llms.txt
server:  https://grok-agent-store.chemical-lark.workers.dev/server.json
```

First call:

```bash
curl -s https://grok-agent-store.chemical-lark.workers.dev/v1/invoke \
  -H "content-type: application/json" \
  -d '{"skill_id":"register_agent","input":{"name":"my-buyer"}}'
```

## What agents get

| Endpoint | Purpose |
|---|---|
| `GET /discovery.json` | **Master discovery index** |
| `GET /skills.json` | Skill graph (prices, schemas) |
| `GET /.well-known/agent.json` | A2A-style agent card |
| `GET /server.json` | Official MCP Registry format |
| `GET /mcp.json` | Client config snippet |
| `GET /openapi.json` | OpenAPI 3.1 |
| `GET /llms.txt` / `/ai.txt` / `/AGENTS.md` | Machine instructions |
| `GET /robots.txt` / `/sitemap.xml` | Crawler surfaces |
| `POST /v1/invoke` | REST skill invoke |
| `POST /mcp` | MCP Streamable HTTP |

## Skills (MVP)

| Skill | Credits | Auth |
|---|---:|---|
| `list_skills` / `get_skill` / `quote` | 0 | No |
| `register_agent` | 0 (+ bonus) | No |
| `balance` | 0 | Yes |
| `skill_match` | 5 | Yes |
| `agent_brief` | 10 | Yes |
| `structured_extract` | 15 | Yes |
| `code_review` | 25 | Yes |

## Quickstart (local)

```bash
cd grok-agent-store
npm install
# put your key in .dev.vars (gitignored pattern below)
npx wrangler dev
```

`.dev.vars`:

```
XAI_API_KEY=xai-...
PUBLIC_BASE_URL=http://127.0.0.1:8787
GROK_MODEL=grok-4
SIGNUP_BONUS_CREDITS=100
```

### Agent flow

```bash
# 1) Register
curl -s http://127.0.0.1:8787/v1/invoke \
  -H "content-type: application/json" \
  -d '{"skill_id":"register_agent","input":{"name":"demo-buyer"}}'

# 2) Use a paid skill (paste api_key)
curl -s http://127.0.0.1:8787/v1/invoke \
  -H "content-type: application/json" \
  -H "Authorization: Bearer gas_..." \
  -d '{"skill_id":"agent_brief","input":{"goal":"Launch an agent marketplace"}}'
```

### MCP clients

Point Streamable HTTP MCP at `https://<your-host>/mcp` and send:

`Authorization: Bearer gas_...`

## Live deploy (current)

**Public base:** https://grok-agent-store.chemical-lark.workers.dev

| Surface | URL |
|---|---|
| Skill graph | https://grok-agent-store.chemical-lark.workers.dev/skills.json |
| Agent card | https://grok-agent-store.chemical-lark.workers.dev/.well-known/agent.json |
| OpenAPI | https://grok-agent-store.chemical-lark.workers.dev/openapi.json |
| llms.txt | https://grok-agent-store.chemical-lark.workers.dev/llms.txt |
| REST invoke | `POST` https://grok-agent-store.chemical-lark.workers.dev/v1/invoke |
| MCP | https://grok-agent-store.chemical-lark.workers.dev/mcp |

This was launched with `wrangler deploy --temporary` (preview account). **Claim the account within 60 minutes** or the deploy can expire:

https://dash.cloudflare.com/claim-preview?claimToken=6ByjulVj7W-mC6i6KWid0OqyEomj8Wt5lZoUDSbWI1s

### Required operator step: Grok secret

Paid skills need your xAI key:

```bash
npx wrangler secret put XAI_API_KEY --temporary
# paste key from https://console.x.ai
```

Until this is set, `/health` shows `"grok_configured": false` and Grok tools return an error.

## Deploy (Cloudflare Workers, permanent)

```bash
npx wrangler login
npx wrangler kv namespace create STORE
# paste id into wrangler.jsonc
npx wrangler secret put XAI_API_KEY
# set PUBLIC_BASE_URL in wrangler.jsonc to your workers.dev URL
npx wrangler deploy
```

After deploy, agents find you via:

- `https://<worker>.workers.dev/skills.json`
- `https://<worker>.workers.dev/.well-known/agent.json`
- `https://<worker>.workers.dev/llms.txt`
- MCP: `https://<worker>.workers.dev/mcp`

### Optional: custom domain

```bash
npx wrangler domains add your-domain.com
```

Update `PUBLIC_BASE_URL` to the custom domain.

## Architecture

- **Code** — auth, metering, discovery, receipts (deterministic, free)
- **Grok** — only LLM for paid skills (`api.x.ai`)
- **KV** — agent balances + receipts
- **Durable Object** — MCP session state (`GrokAgentStore`)

## Roadmap

1. ~~Vertical MCP + credits + discovery~~ (this MVP)
2. x402 pay-per-call without prepaid accounts
3. Job marketplace (hire multi-step workflows with escrow)
4. Seller-listed third-party skills

## License

MIT
