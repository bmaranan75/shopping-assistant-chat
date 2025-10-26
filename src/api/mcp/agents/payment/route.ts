import { NextRequest, NextResponse } from 'next/server';
import { paymentGraph } from '@/lib/agents/payment-agent';
import { verifyMCPAuth, MCPAuthError } from '@/lib/mcp/auth';
import { requireUserContext } from '@/lib/mcp/dual-token-auth';

/**
 * MCP-specific endpoint for payment agent
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

    // Generate a thread ID
    // If user context available, include user ID for user-specific payment methods
    const configThreadId = threadId || 
      (authContext?.userId 
        ? `mcp-payment-${authContext.userId}-${Date.now()}`
        : `mcp-payment-${Date.now()}`);

    // Build agent input with user context if available
    const agentInput: any = {
      messages: [
        {
          role: 'user',
          content: JSON.stringify({ 
            action, 
            ...args,
            // Pass user context if available
            ...(authContext?.userId && { userId: authContext.userId }),
            ...(authContext?.userToken && { userToken: authContext.userToken }),
          })
        }
      ]
    };

    // Invoke existing payment agent
    const result = await paymentGraph.invoke(
      agentInput,
      {
        configurable: {
          thread_id: configThreadId
        }
      }
    );

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
