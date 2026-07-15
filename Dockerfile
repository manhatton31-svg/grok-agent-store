# Glama / local stdio MCP server
# Must start and answer list_tools without secrets.
FROM node:22-alpine

WORKDIR /app

# Install only runtime deps needed by stdio server
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY stdio/ ./stdio/

ENV NODE_ENV=production
ENV GROK_AGENT_STORE_URL=https://grok-agent-store.chemical-lark.workers.dev

# Stdio MCP entrypoint (Glama runs this and introspects tools)
CMD ["node", "stdio/server.mjs"]
