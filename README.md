# Shopping Assistant - Chat Frontend

Next.js frontend and API gateway for the Shopping Assistant application.

## Quick Start

```bash
npm install
cp .env.example .env.local
# Edit .env.local with your values
npm run dev
```

Runs on http://localhost:3000

**Requires**: shopping-assistant-agents server running on port 2024

## What's Here

- Next.js frontend (src/app/, src/components/)
- API gateway routes (src/app/api/)
- Auth0 integration
- MCP server (src/mcp/)
- LangGraph SDK client (src/lib/agents/langgraphClient.ts)

## What's NOT Here

- Agent implementations (in shopping-assistant-agents repo)
- Tools (in shopping-assistant-agents repo)
- LangGraph CLI

## Related

See: shopping-assistant-agents repository
