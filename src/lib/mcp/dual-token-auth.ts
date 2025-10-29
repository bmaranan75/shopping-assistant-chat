import { MCPAuthContext, MCPAuthError } from './auth';

/**
 * Require user context for operations that need user authentication
 * Throws MCPAuthError if user context is not available
 */
export function requireUserContext(authContext: MCPAuthContext): void {
  if (!authContext.userId || !authContext.userToken) {
    throw new MCPAuthError('User context required. Provide X-User-Token header for authenticated operations.');
  }
}