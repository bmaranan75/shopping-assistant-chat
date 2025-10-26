import { NextRequest, NextResponse } from 'next/server';
import { dealsGraph } from '@/lib/agents/deals-agent';
import { verifyMCPAuth, MCPAuthError } from '@/lib/mcp/auth';

/**
 * MCP-specific endpoint for deals agent
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

    // Generate a thread ID
    // If user context available, can provide personalized deals
    const configThreadId = threadId || 
      (authContext?.userId 
        ? `mcp-deals-${authContext.userId}-${Date.now()}`
        : `mcp-deals-${Date.now()}`);

    // Build agent input
    // Pass user context if available (for personalized deals)
    const agentInput: any = {
      messages: [
        {
          role: 'user',
          content: JSON.stringify({ 
            action, 
            ...args,
            // Pass user ID if available for personalization
            ...(authContext?.userId && { userId: authContext.userId }),
          })
        }
      ]
    };

    // Invoke existing deals agent
    const result = await dealsGraph.invoke(
      agentInput,
      {
        configurable: {
          thread_id: configThreadId
        }
      }
    );

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
