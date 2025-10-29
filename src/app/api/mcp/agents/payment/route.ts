import { NextRequest, NextResponse } from 'next/server';
import LangGraphClient from '@/lib/agents/langgraphClient';
import { verifyMCPAuth, MCPAuthError } from '@/lib/mcp/auth';
import { requireUserContext } from '@/lib/mcp/dual-token-auth';

/**
 * MCP-specific endpoint for payment agent
 * Connects to externally deployed LangGraph agents
 * Supports both API Key (legacy) and OAuth2 dual token (enterprise) authentication
 * 
 * For add payment method, user context (X-User-Token) is REQUIRED
 * 
 * URL: POST /api/mcp/agents/payment
 */
export async function POST(req: NextRequest) {
  try {
    // Verify MCP authentication (supports both API key and OAuth2)
    const authContext = await verifyMCPAuth(req);

    const body = await req.json();
    const { action, threadId, ...args } = body;

    console.log('[MCP Payment] Request:', { 
      action, 
      args,
      clientId: authContext?.clientId,
      userId: authContext?.userId,
    });

    // For add payment action, user context is REQUIRED
    if (action === 'add' && authContext) {
      requireUserContext(authContext);
    }

    // Generate a conversation ID for the external agent
    const conversationId = threadId || 
      (authContext?.userId 
        ? `mcp-payment-${authContext.userId}-${Date.now()}`
        : `mcp-payment-${Date.now()}`);

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

    // Call external payment agent with streaming
    const result = await langGraphClient.callAgentWithStream({
      agentId: 'payment',
      message: messageContent,
      userId: authContext?.userId || 'default-user',
      conversationId
    });

    console.log('[MCP Payment] Success');
    return NextResponse.json(result);

  } catch (error) {
    console.error('[MCP Payment] Error:', error);

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
