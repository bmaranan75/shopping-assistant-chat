/**
 * CIBA Provider Selector
 * 
 * Automatically selects the appropriate CIBA implementation:
 * - Auth0: Uses Auth0 SDK (@auth0/ai-langchain) for best integration
 * - Okta/Others: Uses standards-based OpenID CIBA implementation
 */

import type { AccessDeniedInterrupt } from '@auth0/ai/interrupts';

// Type definitions for compatibility
type ToolFunction = any; // Accept any tool type for maximum compatibility

interface AsyncUserConfirmationOptions {
  userID?: (params: any, config: any) => Promise<string | undefined>;
  bindingMessage?: (params: any) => Promise<string>;
  scopes?: string[];
  audience?: string;
  onAuthorizationRequest?: (authReq: any, poll: Promise<any>) => Promise<void>;
  onUnauthorized?: (error: Error) => Promise<string>;
}

/**
 * Determine which CIBA implementation to use
 */
function getCIBAProvider(): 'auth0' | 'standard' {
  const provider = process.env.IDENTITY_PROVIDER?.toLowerCase();
  
  // Use Auth0 SDK for Auth0 (best integration)
  if (provider === 'auth0' || !provider) {
    return 'auth0';
  }
  
  // Use standards-based implementation for Okta and others
  return 'standard';
}

/**
 * Get authorization state
 * Works with both Auth0 and standards-based CIBA
 */
export function getAuthorizationState() {
  const cibaProvider = getCIBAProvider();
  
  if (cibaProvider === 'auth0') {
    const { getAuthorizationState: getAuth0State } = require('./auth0-ai-langchain');
    return getAuth0State();
  } else {
    const { getAuthorizationState: getStandardState } = require('./ciba-langchain');
    return getStandardState();
  }
}

/**
 * Reset authorization state
 * Works with both Auth0 and standards-based CIBA
 */
export function resetAuthorizationState() {
  const cibaProvider = getCIBAProvider();
  
  if (cibaProvider === 'auth0') {
    const { resetAuthorizationState: resetAuth0State } = require('./auth0-ai-langchain');
    return resetAuth0State();
  } else {
    const { resetAuthorizationState: resetStandardState } = require('./ciba-langchain');
    return resetStandardState();
  }
}

/**
 * Wrapper for tools that require CIBA authorization
 * Automatically uses Auth0 SDK or standards-based implementation
 */
export function withCIBAAuthorization<T extends ToolFunction>(toolFunction: T): T {
  const cibaProvider = getCIBAProvider();
  
  console.log(`[CIBA Provider] Using ${cibaProvider} CIBA implementation`);
  
  if (cibaProvider === 'auth0') {
    // Use Auth0 SDK (original implementation)
    const { withAsyncAuthorization } = require('./auth0-ai-langchain');
    return withAsyncAuthorization(toolFunction);
  } else {
    // Use standards-based implementation (Okta, Azure AD, etc.)
    const { withCIBAAuthorization: withStandardCIBA } = require('./ciba-langchain');
    return withStandardCIBA(toolFunction);
  }
}

/**
 * Wrapper function with configuration options
 * Mimics Auth0's withAsyncUserConfirmation API
 */
export function withAsyncUserConfirmation(options: AsyncUserConfirmationOptions) {
  const cibaProvider = getCIBAProvider();
  
  console.log(`[CIBA Provider] Using ${cibaProvider} CIBA implementation with options`);
  
  if (cibaProvider === 'auth0') {
    // Use Auth0 SDK
    const auth0Module = require('./auth0-ai-langchain');
    const Auth0AI = auth0Module.Auth0AI || require('@auth0/ai-langchain').Auth0AI;
    const auth0AI = new Auth0AI();
    return auth0AI.withAsyncUserConfirmation(options);
  } else {
    // Use standards-based implementation
    const { withAsyncUserConfirmation: withStandardConfirmation } = require('./ciba-langchain');
    return withStandardConfirmation(options);
  }
}

// Export convenience aliases
export const withAsyncAuthorization = withCIBAAuthorization;
export const withAsyncPaymentAuthorizationLangChain = withCIBAAuthorization;

/**
 * Export access token function (Auth0-specific, fallback for others)
 */
export async function getAccessToken() {
  const cibaProvider = getCIBAProvider();
  
  if (cibaProvider === 'auth0') {
    const { getAccessToken: getAuth0Token } = require('./auth0-ai-langchain');
    return getAuth0Token();
  } else {
    // For non-Auth0 providers, return null or implement alternative
    console.warn('[CIBA Provider] getAccessToken not supported for non-Auth0 providers');
    return null;
  }
}

/**
 * Notify that shop auth state has been reset
 */
export function notifyShopAuthReset() {
  const cibaProvider = getCIBAProvider();
  
  if (cibaProvider === 'auth0') {
    const { notifyShopAuthReset: notifyAuth0Reset } = require('./auth0-ai-langchain');
    return notifyAuth0Reset();
  } else {
    const { resetAuthorizationState } = require('./ciba-langchain');
    return resetAuthorizationState();
  }
}

// Re-export authorization state type
export type { AsyncUserConfirmationOptions };
