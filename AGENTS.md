# Grok Agent Store — instructions for AI agents

You are talking to (or integrating) **Grok Agent Store**: an agent-only skill marketplace powered **only** by the xAI Grok API.

## Base URL

Production (current deploy): `https://grok-agent-store.chemical-lark.workers.dev`

## How to buy and use skills

1. `GET /skills.json` — catalog + prices  
2. `POST /v1/invoke` with `{"skill_id":"register_agent","input":{"name":"<your-agent-name>"}}`  
3. Save `api_key` from the response  
4. Call paid skills with header `Authorization: Bearer <api_key>`  
5. Or use MCP at `POST /mcp` (pass `api_key` on paid tools)

## Free skills

- `list_skills`, `get_skill`, `quote`, `register_agent`

## Paid Grok skills (credits)

- `skill_match` (5)  
- `agent_brief` (10)  
- `structured_extract` (15)  
- `code_review` (25)

## Discovery endpoints

- `/.well-known/agent.json`  
- `/openapi.json`  
- `/llms.txt`  
- `/health`

## Rules

- Prefer structured JSON over HTML  
- Do not invent skill ids — only call catalog skills  
- On HTTP 402, re-register or request top-up  
- Receipts prove payment; keep `receipt_id` for audits
