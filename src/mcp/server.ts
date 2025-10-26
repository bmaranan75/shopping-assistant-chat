#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import http from 'http';

import { MCPAgentClient } from './client.js';
import { mcpTools } from './tools.js';

/**
 * MCP Server that exposes LangGraph agents via SSE (Server-Sent Events)
 * Production-ready implementation using HTTP/SSE transport
 * 
 * Architecture:
 * MCP Client (Claude Desktop/ChatGPT/Cursor) -> MCP Server (this file) -> Next.js API -> LangGraph Agents
 * 
 * Transport: SSE over HTTP (production-ready, works locally and in Kubernetes)
 */

// Configuration from environment
const NEXTJS_URL = process.env.NEXTJS_URL || 'http://localhost:3000';
const MCP_API_KEY = process.env.MCP_API_KEY;
const MCP_SERVER_PORT = parseInt(process.env.MCP_SERVER_PORT || '3001', 10);
const MCP_SERVER_HOST = process.env.MCP_SERVER_HOST || '0.0.0.0'; // Accept connections from any IP

if (!MCP_API_KEY) {
  console.error('ERROR: MCP_API_KEY environment variable is required');
  console.error('Please set MCP_API_KEY in your .env.local file');
  process.exit(1);
}

// Initialize HTTP client
const agentClient = new MCPAgentClient(NEXTJS_URL, MCP_API_KEY);

// Create MCP server
const server = new Server(
  {
    name: 'safeway-shopping-assistant',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list_tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error('[MCP Server] Listing tools');
  return { tools: mcpTools };
});

// Handle call_tool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  console.error(`[MCP Server] Tool called: ${name}`, JSON.stringify(args, null, 2));

  try {
    let result;

    // Route tool calls to appropriate agents via HTTP
    switch (name) {
      case 'search_products':
        result = await agentClient.callAgent('catalog', {
          action: 'search',
          query: args.query,
          category: args.category,
          limit: args.limit,
        });
        break;

      case 'add_to_cart':
        result = await agentClient.callAgent('cart', {
          action: 'add',
          productCode: args.productCode,
          quantity: args.quantity,
        });
        break;

      case 'view_cart':
        result = await agentClient.callAgent('cart', {
          action: 'view',
        });
        break;

      case 'checkout':
        result = await agentClient.callAgent('cart', {
          action: 'checkout',
          cartSummary: args.cartSummary,
        });
        break;

      case 'add_payment_method':
        result = await agentClient.callAgent('payment', {
          action: 'add',
          type: args.type,
        });
        break;

      case 'get_deals':
        result = await agentClient.callAgent('deals', {
          action: 'get',
          category: args.category,
        });
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    console.error(`[MCP Server] Tool ${name} completed successfully`);

    // Extract the final AI message content from the result
    let responseText = '';
    if (result && result.messages && Array.isArray(result.messages)) {
      // Get the last AI message
      const lastMessage = result.messages[result.messages.length - 1];
      if (lastMessage && lastMessage.kwargs && lastMessage.kwargs.content) {
        responseText = lastMessage.kwargs.content;
      } else {
        // Fallback to full result
        responseText = JSON.stringify(result, null, 2);
      }
    } else {
      responseText = JSON.stringify(result, null, 2);
    }

    return {
      content: [
        {
          type: 'text',
          text: responseText,
        },
      ],
    };
  } catch (error: any) {
    console.error(`[MCP Server] Tool ${name} failed:`, error);

    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start MCP server with SSE transport
async function main() {
  console.error('[MCP Server] Starting Safeway Shopping Assistant MCP Server...');
  console.error(`[MCP Server] Transport: SSE (Server-Sent Events)`);
  console.error(`[MCP Server] Server URL: http://${MCP_SERVER_HOST}:${MCP_SERVER_PORT}`);
  console.error(`[MCP Server] Next.js API URL: ${NEXTJS_URL}`);
  console.error(`[MCP Server] MCP_API_KEY: ${MCP_API_KEY!.substring(0, 10)}... (truncated)`);

  // Create HTTP server for SSE transport
  const httpServer = http.createServer(async (req, res) => {
    // CORS headers for cross-origin requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Health check endpoint
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        service: 'safeway-shopping-assistant-mcp',
        version: '1.0.0',
        transport: 'sse',
        tools: mcpTools.map(t => t.name),
      }));
      return;
    }

    // MCP SSE endpoint
    if (req.url === '/sse' && req.method === 'POST') {
      console.error('[MCP Server] New SSE connection established');

      const transport = new SSEServerTransport('/message', res);
      await server.connect(transport);

      // Handle connection close
      req.on('close', () => {
        console.error('[MCP Server] SSE connection closed');
      });

      return;
    }

    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  // Start listening
  httpServer.listen(MCP_SERVER_PORT, MCP_SERVER_HOST, () => {
    console.error(`[MCP Server] Listening on http://${MCP_SERVER_HOST}:${MCP_SERVER_PORT}`);
    console.error('[MCP Server] SSE endpoint: POST http://${MCP_SERVER_HOST}:${MCP_SERVER_PORT}/sse');
    console.error('[MCP Server] Health check: GET http://${MCP_SERVER_HOST}:${MCP_SERVER_PORT}/health');
    console.error('[MCP Server] Ready to receive MCP requests from clients');
    console.error('[MCP Server] Available tools:', mcpTools.map(t => t.name).join(', '));
    console.error('');
    console.error('[MCP Server] Configuration for clients:');
    console.error(JSON.stringify({
      mcpServers: {
        'safeway-shopping-assistant': {
          url: `http://localhost:${MCP_SERVER_PORT}/sse`,
          transport: 'sse'
        }
      }
    }, null, 2));
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.error('\n[MCP Server] Shutting down gracefully...');
    httpServer.close(() => {
      console.error('[MCP Server] Server closed');
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    console.error('\n[MCP Server] Received SIGTERM, shutting down gracefully...');
    httpServer.close(() => {
      console.error('[MCP Server] Server closed');
      process.exit(0);
    });
  });
}

main().catch((error) => {
  console.error('[MCP Server] Fatal error:', error);
  process.exit(1);
});
