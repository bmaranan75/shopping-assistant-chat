import { NextRequest, NextResponse } from 'next/server';
import LangGraphClient from '@/lib/agents/langgraphClient';
import { verifyMCPAuth, MCPAuthError } from '@/lib/mcp/auth';

/**
 * MCP-specific endpoint for deals agent
 * Connects to externally deployed LangGraph agents
 * Supports both API Key (legacy) and OAuth2 dual token (enterprise) authentication
 * 
 * User context (X-User-Token) is optional for personalized deals
 * 
 * URL: POST /api/mcp/agents/deals
 */
export async function POST(req: NextRequest) {
  try {
    // Verify MCP authentication (supports both API key and OAuth2)
    const authContext = await verifyMCPAuth(req);

    const body = await req.json();
    const { action, threadId, ...args } = body;

    console.log('[MCP Deals] Request:', { 
      action, 
      args,
      clientId: authContext?.clientId,
      userId: authContext?.userId,
    });

    // Generate a conversation ID for the external agent
    const conversationId = threadId || 
      (authContext?.userId 
        ? `mcp-deals-${authContext.userId}-${Date.now()}`
        : `mcp-deals-${Date.now()}`);

    // Build message content with user context
    const messageContent = JSON.stringify({ 
      action, 
      ...args,
      // Pass user ID if available for personalization
      ...(authContext?.userId && { userId: authContext.userId }),
    });

    // Get LangGraph client configured for external server
    const langGraphClient = new LangGraphClient(
      process.env.LANGGRAPH_SERVER_URL || 'http://localhost:2024'
    );

    // Call external deals agent with streaming
    const result = await langGraphClient.callAgentWithStream({
      agentId: 'deals',
      message: messageContent,
      userId: authContext?.userId || 'default-user',
      conversationId
    });

    console.log('[MCP Deals] Success');
    return NextResponse.json(result);

  } catch (error) {
    console.error('[MCP Deals] Error:', error);

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
