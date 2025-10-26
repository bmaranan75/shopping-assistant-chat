import { NextRequest, NextResponse } from 'next/server';
import { catalogGraph } from '@/lib/agents/catalog-agent';
import { verifyMCPAuth, MCPAuthError } from '@/lib/mcp/auth';

/**
 * MCP-specific endpoint for catalog agent
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

    // Generate a thread ID
    // If user context available, include user ID for better tracking
    const configThreadId = threadId || 
      (authContext?.userId 
        ? `mcp-catalog-${authContext.userId}-${Date.now()}`
        : `mcp-catalog-${Date.now()}`);

    // Invoke existing catalog agent (no changes to agent logic)
    const result = await catalogGraph.invoke(
      {
        messages: [
          {
            role: 'user',
            content: JSON.stringify({ action, ...args })
          }
        ]
      },
      {
        configurable: {
          thread_id: configThreadId
        }
      }
    );

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