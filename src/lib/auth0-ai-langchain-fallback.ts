// Temporary fallback implementation for auth0-ai-langchain to resolve build issues
// This provides basic functionality while the auth0 package issues are resolved

export interface AuthorizationState {
  status: 'idle' | 'requested' | 'pending' | 'approved' | 'denied';
  message?: string;
}

// Global state to track authorization status
export let authorizationState: AuthorizationState = { status: 'idle' };

export const getAuthorizationState = (): AuthorizationState => {
  console.log('[auth0-ai-fallback] getAuthorizationState returning:', authorizationState.status);
  return authorizationState;
};

export const resetAuthorizationState = () => {
  console.log('[auth0-ai-fallback] resetAuthorizationState called - setting status to idle');
  authorizationState = { status: 'idle' };
};

// Function to be called when shop auth state changes to reset main auth state
export const notifyShopAuthReset = () => {
  console.log('[auth0-ai-fallback] Resetting authorization state to idle (called by shop tool)');
  authorizationState = { status: 'idle' };
};

// Fallback authorization wrapper - just passes through the function for now
export const withAsyncAuthorization = <T extends (...args: any[]) => any>(fn: T): T => {
  return ((...args: any[]) => {
    console.log('[auth0-ai-fallback] withAsyncAuthorization called - bypassing for now');
    // For now, just call the original function
    // TODO: Implement proper authorization once auth0 package is fixed
    return fn(...args);
  }) as T;
};

// Export alias for payment-specific authorization (backward compatibility)
export const withAsyncPaymentAuthorizationLangChain = withAsyncAuthorization;