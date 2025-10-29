import { NextRequest, NextResponse } from 'next/server';
import LangGraphClient from '@/lib/agents/langgraphClient';
import { verifyMCPAuth, MCPAuthError } from '@/lib/mcp/auth';
import { requireUserContext } from '@/lib/mcp/dual-token-auth';

/**
 * MCP-specific endpoint for cart and checkout agent
 * Connects to externally deployed LangGraph agents
 * Supports both API Key (legacy) and OAuth2 dual token (enterprise) authentication
 * 
 * For checkout operations, user context (X-User-Token) is REQUIRED
 * 
 * URL: POST /api/mcp/agents/cart
 */
export async function POST(req: NextRequest) {
  try {
    // Verify MCP authentication (supports both API key and OAuth2)
    const authContext = await verifyMCPAuth(req);

    const body = await req.json();
    const { action, threadId, ...args } = body;

    console.log('[MCP Cart] Request:', { 
      action, 
      args,
      clientId: authContext?.clientId,
      userId: authContext?.userId,
    });

    // For checkout action, user context is REQUIRED
    if (action === 'checkout' && authContext) {
      requireUserContext(authContext);
    }

    // Generate a conversation ID for the external agent
    const conversationId = threadId || 
      (authContext?.userId 
        ? `mcp-cart-${authContext.userId}-${Date.now()}`
        : `mcp-cart-${Date.now()}`);

    // Build message content with user context
    const messageContent = JSON.stringify({ 
      action, 
      ...args,
      // Pass user context if available
      ...(authContext?.userId && { userId: authContext.userId }),
      ...(authContext?.userToken && { userToken: authContext.userToken }),
    });

    // Get LangGraph client configured for external server
    const langGraphClient = new LangGraphClient(
      process.env.LANGGRAPH_SERVER_URL || 'http://localhost:2024'
    );

    // Call external cart agent with streaming
    const result = await langGraphClient.callAgentWithStream({
      agentId: 'cart',
      message: messageContent,
      userId: authContext?.userId || 'default-user',
      conversationId
    });

    console.log('[MCP Cart] Success');
    return NextResponse.json(result);

  } catch (error) {
    console.error('[MCP Cart] Error:', error);

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
