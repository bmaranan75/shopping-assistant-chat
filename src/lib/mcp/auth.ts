import { NextRequest } from 'next/server';

export class MCPAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MCPAuthError';
  }
}

export interface MCPAuthContext {
  clientId?: string;
  userId?: string;
  userToken?: string;
  apiKey?: string;
}

/**
 * Verify MCP authentication from request headers
 * Now uses server-side OAuth2 client credentials flow for LangGraph server authentication
 * Client requests no longer need authentication headers (handled server-side)
 */
export async function verifyMCPAuth(req: NextRequest): Promise<MCPAuthContext | null> {
  // Legacy: Check for API Key authentication (deprecated)
  const apiKey = req.headers.get('x-mcp-api-key');
  if (apiKey) {
    console.warn('[MCP Auth] API Key authentication is deprecated. Consider removing client-side auth.');
    if (apiKey.length > 0) {
      return {
        apiKey,
        clientId: 'api-key-client',
        userId: 'default-user'
      };
    }
  }

  // Legacy: Check for OAuth2 dual token authentication (deprecated)
  const clientToken = req.headers.get('x-client-token');
  const userToken = req.headers.get('x-user-token');
  
  if (clientToken) {
    console.warn('[MCP Auth] Client token authentication is deprecated. OAuth2 is now handled server-side.');
    const authContext: MCPAuthContext = {
      clientId: 'oauth-client'
    };

    if (userToken) {
      authContext.userId = 'oauth-user';
      authContext.userToken = userToken;
    }

    return authContext;
  }

  // Default: No client authentication required
  // OAuth2 client credentials flow is handled server-side when calling LangGraph
  return {
    clientId: 'mcp-server',
    userId: extractUserIdFromRequest(req) || 'default-user'
  };
}

/**
 * Extract user ID from request context (session, JWT, etc.)
 * This is application-specific and should be customized based on your auth system
 */
function extractUserIdFromRequest(req: NextRequest): string | null {
  // Try to extract from session cookie, JWT, or other auth mechanism
  // This is a placeholder - implement based on your authentication system
  
  // Example: Extract from Authorization header if present
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    try {
      // Decode JWT or validate session token
      // Return user ID if found
      return null; // Placeholder
    } catch (e) {
      console.warn('[MCP Auth] Failed to extract user from authorization header:', e);
    }
  }

  // Example: Extract from session cookie
  const sessionCookie = req.cookies.get('session')?.value;
  if (sessionCookie) {
    try {
      // Decode session and extract user ID
      return null; // Placeholder
    } catch (e) {
      console.warn('[MCP Auth] Failed to extract user from session cookie:', e);
    }
  }

  return null;
}