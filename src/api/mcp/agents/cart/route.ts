import { NextRequest, NextResponse } from 'next/server';
import { cartAndCheckoutGraph } from '@/lib/agents/cart-and-checkout-agent';
import { verifyMCPAuth, MCPAuthError } from '@/lib/mcp/auth';
import { requireUserContext } from '@/lib/mcp/dual-token-auth';

/**
 * MCP-specific endpoint for cart and checkout agent
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

    // Generate a thread ID
    // If user context available, include user ID for user-specific cart
    const configThreadId = threadId || 
      (authContext?.userId 
        ? `mcp-cart-${authContext.userId}-${Date.now()}`
        : `mcp-cart-${Date.now()}`);

    // Build agent input
    // Pass user context if available (for checkout, payment, user-specific cart)
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

    // Invoke existing cart agent
    const result = await cartAndCheckoutGraph.invoke(
      agentInput,
      {
        configurable: {
          thread_id: configThreadId
        }
      }
    );

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
