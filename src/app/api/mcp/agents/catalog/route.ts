import { NextRequest, NextResponse } from 'next/server';
import LangGraphClient from '@/lib/agents/langgraphClient';
import { verifyMCPAuth, MCPAuthError } from '@/lib/mcp/auth';

/**
 * MCP-specific endpoint for catalog agent
 * Connects to externally deployed LangGraph agents
 * Supports both API Key (legacy) and OAuth2 dual token (enterprise) authentication
 */
export async function POST(req: NextRequest) {
  try {
    // Verify MCP authentication (supports both API key and OAuth2)
    const authContext = await verifyMCPAuth(req);

    const body = await req.json();
    const { action, threadId, ...args } = body;

    console.log('[MCP Catalog] Request:', { 
      action, 
      args,
      clientId: authContext?.clientId,
      userId: authContext?.userId,
    });

    // Generate a conversation ID for the external agent
    const conversationId = threadId || 
      (authContext?.userId 
        ? `mcp-catalog-${authContext.userId}-${Date.now()}`
        : `mcp-catalog-${Date.now()}`);

    // Get LangGraph client configured for external server
    const langGraphClient = new LangGraphClient(
      process.env.LANGGRAPH_SERVER_URL || 'http://localhost:2024'
    );

    // Call external catalog agent with streaming
    const result = await langGraphClient.callAgentWithStream({
      agentId: 'catalog',
      message: JSON.stringify({ action, ...args }),
      userId: authContext?.userId || 'default-user',
      conversationId
    });

    console.log('[MCP Catalog] Success');
    return NextResponse.json(result);

  } catch (error) {
    console.error('[MCP Catalog] Error:', error);

    if (error instanceof MCPAuthError) {
      return NextResponse.json(
        { error: 'Unauthorized', message: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: (error as Error).message || 'Internal server error' },
      { status: 500 }
    );
  }
}