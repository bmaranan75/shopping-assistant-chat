# MCP (Model Context Protocol) Setup

This repository provides client-side interfaces to externally deployed LangGraph agents. The agents themselves are deployed separately and are not contained in this repository.

## Architecture

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   MCP Test UI       │───▶│   Next.js Client    │───▶│  LangGraph Server   │
│ (mcp-test.html)     │    │  (API Routes)       │    │  (External Agents)  │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

## Configuration

Set the LangGraph server URL and OAuth2 credentials in your environment:
```bash
LANGGRAPH_SERVER_URL=http://localhost:2024

# MCP OAuth2 Configuration
MCP_OAUTH2_CLIENT_ID=your-mcp-client-id
MCP_OAUTH2_CLIENT_SECRET=your-mcp-client-secret
MCP_OAUTH2_TOKEN_ENDPOINT=https://your-auth-server.com/oauth/token
MCP_OAUTH2_AUDIENCE=http://localhost:2024
```

## Available Agents

The following agents are expected to be deployed on the external LangGraph server:

- **catalog** - Product search and catalog management
- **cart** - Shopping cart operations 
- **deals** - Promotions and deals
- **payment** - Payment processing
- **supervisor** - Multi-agent coordination

## MCP API Routes

### Authentication
MCP routes now use server-side OAuth2 client credentials flow:

1. **OAuth2 Client Credentials**: Automatic server-side authentication to LangGraph server
2. **Legacy API Key** (deprecated): `X-MCP-API-Key` header  
3. **Legacy OAuth2 Dual Token** (deprecated): `X-Client-Token` and `X-User-Token` headers

**New behavior**: Client applications no longer need to provide authentication headers. The Next.js server automatically obtains access tokens using the configured OAuth2 client credentials.

### Endpoints

- `POST /api/mcp/agents/catalog` - Product catalog operations
- `POST /api/mcp/agents/cart` - Shopping cart management
- `POST /api/mcp/agents/deals` - Deals and promotions  
- `POST /api/mcp/agents/payment` - Payment processing

### Request Format

```json
{
  "action": "search|add|view|get",
  "threadId": "optional-conversation-id",
  "...args": "action-specific-parameters"
}
```

## Testing

Use the MCP Test UI at: http://localhost:3000/mcp-test.html

The UI provides interactive testing for all agent endpoints with the following features:
- Product search via catalog agent
- Cart management operations
- Deal browsing
- Real-time streaming responses

## Development

### LangGraph Client

The `LangGraphClient` class handles communication with external agents:

```typescript
import LangGraphClient from '@/lib/agents/langgraphClient';

const client = new LangGraphClient('http://localhost:2024');

// For simple request-response
const result = await client.callAgentWithStream({
  agentId: 'catalog',
  message: JSON.stringify({ action: 'search', query: 'milk' }),
  userId: 'user123',
  conversationId: 'conv456'
});

// For real-time streaming
const stream = await client.streamAgentResponse({
  agentId: 'catalog', 
  message: 'search for milk',
  userId: 'user123',
  conversationId: 'conv456'
});
```

### Adding New Agents

To add support for a new external agent:

1. Ensure the agent is deployed on the LangGraph server
2. Create a new MCP API route in `/src/app/api/mcp/agents/[agent-name]/route.ts`
3. Follow the existing pattern for authentication and LangGraph client usage
4. Add testing support to the MCP test UI

## External Dependencies

- **LangGraph Server**: Must be running on configured URL (default: http://localhost:2024)
- **Agent Deployments**: All agents must be deployed and accessible via the LangGraph server  
- **OAuth2 Provider**: Configure OAuth2 server that supports client credentials flow
- **MCP Server Authentication**: LangGraph server must accept OAuth2 Bearer tokens