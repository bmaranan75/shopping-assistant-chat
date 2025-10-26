#!/usr/bin/env node
/**
 * MCP Server with STDIO Transport for Claude Desktop
 * 
 * This version uses stdio (standard input/output) which is required by Claude Desktop.
 * The SSE version (server.ts) is for ChatGPT Enterprise and production deployments.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { MCPAgentClient } from './client.js';
import { mcpTools } from './tools.js';

// Configuration from environment
const NEXTJS_URL = process.env.NEXTJS_URL || 'http://localhost:3000';
const MCP_API_KEY = process.env.MCP_API_KEY;

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
  console.error('[MCP Server STDIO] Listing available tools');
  return {
    tools: mcpTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

// Handle call_tool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  console.error(`[MCP Server STDIO] Tool called: ${name}`, JSON.stringify(args, null, 2));

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

    console.error(`[MCP Server STDIO] Tool ${name} completed successfully`);

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
    console.error(`[MCP Server STDIO] Tool ${name} failed:`, error);

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

// Start server with STDIO transport
async function main() {
  console.error('[MCP Server STDIO] Starting MCP server with stdio transport');
  console.error('[MCP Server STDIO] Next.js URL:', NEXTJS_URL);
  console.error('[MCP Server STDIO] Available tools:', mcpTools.map(t => t.name).join(', '));
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('[MCP Server STDIO] Server started and ready for Claude Desktop');
}

main().catch((error) => {
  console.error('[MCP Server STDIO] Fatal error:', error);
  process.exit(1);
});
