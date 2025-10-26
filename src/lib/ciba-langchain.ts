/**
 * LangChain Integration for Standards-Based CIBA
 * 
 * Provides a wrapper similar to Auth0's withAsyncUserConfirmation
 * but using the standards-based CIBA implementation.
 */

import { performCIBAAuthorizationWithEnv } from './ciba-standard';
import { AccessDeniedInterrupt } from '@auth0/ai/interrupts';

// Global state to track authorization status
export let authorizationState: {
  status: 'idle' | 'requested' | 'pending' | 'approved' | 'denied';
  message?: string;
} = { status: 'idle' };

export const getAuthorizationState = () => {
  // Check if tool has marked auth as approved
  try {
    const { getShopAuthState } = require('./tools/checkout-langchain');
    const shopState = getShopAuthState();
    if (shopState?.status === 'approved' && authorizationState.status === 'requested') {
      authorizationState.status = 'approved';
    }
  } catch (e) {
    // Ignore if shop tool not available
  }
  console.log('[CIBA Standard] getAuthorizationState returning:', authorizationState.status);
  return authorizationState;
};

export const resetAuthorizationState = () => {
  console.log('[CIBA Standard] resetAuthorizationState called - setting status to idle');
  authorizationState = { status: 'idle' };
};

/**
 * Extract user ID from various parameter formats
 */
function extractUserId(params: any, config: any): string | undefined {
  // Try multiple paths to get user ID
  let userId = config?.configurable?._credentials?.user?.sub;
  
  if (!userId && params?.cartData?.userId) {
    userId = params.cartData.userId;
    console.log(`[CIBA Standard] Extracted user ID from cartData: ${userId}`);
  }
  
  if (!userId && params?.userId) {
    userId = params.userId;
    console.log(`[CIBA Standard] Extracted user ID from params: ${userId}`);
  }
  
  if (!userId) {
    console.error('[CIBA Standard] No user ID found in config or params:', { 
      configPath: config?.configurable?._credentials?.user?.sub,
      cartDataUserId: params?.cartData?.userId,
      paramsUserId: params?.userId 
    });
  }
  
  return userId;
}

/**
 * Create binding message from parameters
 */
function createBindingMessage(params: any): string {
  if (params.product && params.qty) {
    // Individual product checkout
    return `Do you want to buy ${params.qty} ${params.product}`;
  }
  
  if (params.cartSummary) {
    // Cart checkout - create safe binding message with only allowed characters
    try {
      const parsed = typeof params.cartSummary === 'string' 
        ? JSON.parse(params.cartSummary) 
        : params.cartSummary;
      
      if (parsed.totalValue && parsed.items) {
        const itemCount = Array.isArray(parsed.items) ? parsed.items.length : 'multiple';
        return `Do you want to checkout cart with ${itemCount} items for ${parsed.totalValue}`;
      }
      
      if (parsed.summary) {
        // Clean the summary to only include allowed characters
        const cleanSummary = parsed.summary.replace(/[^a-zA-Z0-9\s+\-_.,:#]/g, '');
        return `Do you want to checkout cart: ${cleanSummary}`;
      }
      
      return `Do you want to checkout your cart`;
    } catch {
      // Clean cart info to only include allowed characters
      const cleanCartInfo = params.cartSummary.replace(/[^a-zA-Z0-9\s+\-_.,:#]/g, '');
      return `Do you want to checkout cart: ${cleanCartInfo}`;
    }
  }
  
  // Fallback for other parameters
  return `Do you want to proceed with this purchase`;
}

/**
 * Wrapper for tools that require CIBA authorization
 * 
 * Usage:
 * ```typescript
 * const authorizedTool = withCIBAAuthorization(myTool);
 * ```
 */
export function withCIBAAuthorization<T extends (...args: any[]) => any>(
  toolFunction: T
): T {
  return (async (params: any, config: any) => {
    console.log('[CIBA Standard] Tool called with CIBA authorization wrapper');
    
    // Extract user ID
    const userId = extractUserId(params, config);
    if (!userId) {
      throw new Error('User ID required for CIBA authorization');
    }
    
    // Create binding message
    const bindingMessage = createBindingMessage(params);
    
    // Update state
    authorizationState = {
      status: 'requested',
      message: bindingMessage
    };
    
    console.log('[CIBA Standard] Initiating CIBA flow');
    console.log('[CIBA Standard] User:', userId);
    console.log('[CIBA Standard] Message:', bindingMessage);
    
    // Update state to pending
    authorizationState.status = 'pending';
    
    try {
      // Perform CIBA authorization
      const result = await performCIBAAuthorizationWithEnv(userId, bindingMessage);
      
      if (result) {
        // User approved
        authorizationState.status = 'approved';
        console.log('[CIBA Standard] ✅ Authorization APPROVED');
        
        // Call the actual tool function
        return await toolFunction(params, config);
      } else {
        // User denied
        authorizationState.status = 'denied';
        console.log('[CIBA Standard] ❌ Authorization DENIED');
        const deniedError = new Error('The user has denied the request');
        deniedError.name = 'AccessDenied';
        throw deniedError;
      }
    } catch (error: any) {
      authorizationState.status = 'denied';
      console.error('[CIBA Standard] Authorization failed:', error);
      
      if (error instanceof AccessDeniedInterrupt) {
        throw error;
      }
      
      throw new Error(`CIBA authorization failed: ${error.message}`);
    }
  }) as T;
}

/**
 * Wrapper function that mimics Auth0's withAsyncUserConfirmation API
 * 
 * This provides backward compatibility with existing code that uses
 * the Auth0 SDK pattern.
 */
export function withAsyncUserConfirmation(options: {
  userID?: (params: any, config: any) => Promise<string | undefined>;
  bindingMessage?: (params: any) => Promise<string>;
  scopes?: string[];
  audience?: string;
  onAuthorizationRequest?: (authReq: any, poll: Promise<any>) => Promise<void>;
  onUnauthorized?: (error: Error) => Promise<string>;
}) {
  return function <T extends (...args: any[]) => any>(toolFunction: T): T {
    return (async (params: any, config: any) => {
      console.log('[CIBA Standard] Tool called with async user confirmation');
      
      // Get user ID (use custom function or default extraction)
      const userId = options.userID 
        ? await options.userID(params, config)
        : extractUserId(params, config);
      
      if (!userId) {
        throw new Error('User ID required for CIBA authorization');
      }
      
      // Get binding message (use custom function or default)
      const bindingMessage = options.bindingMessage
        ? await options.bindingMessage(params)
        : createBindingMessage(params);
      
      // Update state
      authorizationState = {
        status: 'requested',
        message: bindingMessage
      };
      
      console.log('[CIBA Standard] Initiating CIBA flow');
      authorizationState.status = 'pending';
      
      try {
        // Perform CIBA authorization
        const pollPromise = performCIBAAuthorizationWithEnv(userId, bindingMessage);
        
        // Call onAuthorizationRequest callback if provided
        if (options.onAuthorizationRequest) {
          const authReq = {
            binding_message: bindingMessage,
            login_hint: userId,
            scope: options.scopes?.join(' ') || 'openid',
            audience: options.audience
          };
          
          await options.onAuthorizationRequest(authReq, pollPromise);
        }
        
        const result = await pollPromise;
        
        if (result) {
          // User approved
          authorizationState.status = 'approved';
          console.log('[CIBA Standard] ✅ Authorization APPROVED');
          
          // Call the actual tool function
          return await toolFunction(params, config);
        } else {
          // User denied
          authorizationState.status = 'denied';
          console.log('[CIBA Standard] ❌ Authorization DENIED');
          
          const error = new Error('The user has denied the request');
          error.name = 'AccessDenied';
          
          if (options.onUnauthorized) {
            const errorMessage = await options.onUnauthorized(error);
            throw new Error(errorMessage);
          }
          
          throw error;
        }
      } catch (error: any) {
        authorizationState.status = 'denied';
        console.error('[CIBA Standard] Authorization failed:', error);
        
        if (options.onUnauthorized && !(error instanceof AccessDeniedInterrupt)) {
          const errorMessage = await options.onUnauthorized(error);
          throw new Error(errorMessage);
        }
        
        throw error;
      }
    }) as T;
  };
}

// Export alias for backward compatibility
export const withAsyncAuthorization = withCIBAAuthorization;
export const withAsyncPaymentAuthorizationLangChain = withCIBAAuthorization;
