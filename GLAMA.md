# Glama + awesome-mcp-servers checklist

Bot on PR #10179 asked for Glama listing + badge.

## Done in repo

- [x] `Dockerfile` Ã¢â‚¬â€ starts stdio MCP, answers `list_tools` with no secrets  
- [x] `stdio/server.mjs` Ã¢â‚¬â€ proxies to hosted store  
- [x] `glama.json` metadata  
- [x] Remote MCP already live at `/mcp`

## You do once (browser, ~3 min)

### A. List on Glama servers (required for PR)

1. Open https://glama.ai/mcp/servers and sign in (GitHub).  
2. Click **Add Server**.  
3. Paste repo: `https://github.com/manhatton31-svg/grok-agent-store`  
4. Confirm Dockerfile path: `Dockerfile`  
5. Wait for checks: server starts + introspection OK.  
6. Glama path will be: `manhatton31-svg/grok-agent-store`  
7. Score badge URL:  
   `https://glama.ai/mcp/servers/manhatton31-svg/grok-agent-store/badges/score.svg`

### B. Optional: hosted connector

1. https://glama.ai/mcp/connectors  
2. Add remote URL: `https://grok-agent-store.manhatton31.workers.dev/mcp`  
3. Transport: streamable-http  

### C. PR badge (we can push this once A is green)

```markdown
- [manhatton31-svg/grok-agent-store](https://github.com/manhatton31-svg/grok-agent-store) [![manhatton31-svg/grok-agent-store MCP server](https://glama.ai/mcp/servers/manhatton31-svg/grok-agent-store/badges/score.svg)](https://glama.ai/mcp/servers/manhatton31-svg/grok-agent-store) Ã¢ËœÂÃ¯Â¸Â Ã°Å¸ÂÂ  - Agent-only Grok skill marketplace...
```
