/**
 * Standards-Based CIBA (Client Initiated Backchannel Authentication)
 * 
 * Implements OpenID CIBA 1.0 specification
 * Compatible with:
 * - Auth0
 * - Okta OIE
 * - Azure AD
 * - Any OpenID CIBA-compliant provider
 */

export interface CIBAConfig {
  issuer: string; // e.g., https://your-org.okta.com/oauth2/default
  clientId: string;
  clientSecret: string;
  scope: string;
  audience?: string;
}

export interface CIBAAuthRequest {
  auth_req_id: string;
  expires_in: number;
  interval: number;
}

export interface CIBATokenResponse {
  access_token: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

/**
 * Get CIBA endpoint URL based on identity provider
 */
function getCIBAEndpoint(issuer: string): string {
  const provider = process.env.IDENTITY_PROVIDER?.toLowerCase() || 'auth0';
  
  switch (provider) {
    case 'okta':
      // Okta OIE: https://{org}.okta.com/oauth2/default/v1/bc-authorize
      return `${issuer}/v1/bc-authorize`;
    
    case 'auth0':
    default:
      // Auth0: https://{tenant}.auth0.com/bc-authorize
      return `${issuer}/bc-authorize`;
  }
}

/**
 * Get token endpoint URL based on identity provider
 */
function getTokenEndpoint(issuer: string): string {
  const provider = process.env.IDENTITY_PROVIDER?.toLowerCase() || 'auth0';
  
  switch (provider) {
    case 'okta':
      // Okta OIE: https://{org}.okta.com/oauth2/default/v1/token
      return `${issuer}/v1/token`;
    
    case 'auth0':
    default:
      // Auth0: https://{tenant}.auth0.com/oauth/token
      return `${issuer}/oauth/token`;
  }
}

/**
 * Initiate CIBA authentication request
 * 
 * This sends a push notification to the user's mobile device
 * (Auth0 Guardian or Okta Verify) with the binding message.
 * 
 * @param config - CIBA configuration
 * @param userId - User identifier (email, username, or sub)
 * @param bindingMessage - Message shown to user during approval
 * @returns Authentication request details for polling
 */
export async function initiateCIBARequest(
  config: CIBAConfig,
  userId: string,
  bindingMessage: string
): Promise<CIBAAuthRequest> {
  const endpoint = getCIBAEndpoint(config.issuer);
  
  console.log('[CIBA] Initiating backchannel authentication');
  console.log('[CIBA] Endpoint:', endpoint);
  console.log('[CIBA] User:', userId);
  console.log('[CIBA] Message:', bindingMessage);

  // Build request body
  const body: Record<string, string> = {
    scope: config.scope,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    login_hint: userId,
    binding_message: bindingMessage,
  };

  // Add audience if provided (Auth0 requires this)
  if (config.audience) {
    body.audience = config.audience;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`CIBA request failed: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      auth_req_id: data.auth_req_id,
      expires_in: data.expires_in || 300, // Default 5 minutes
      interval: data.interval || 5, // Default 5 seconds
    };
  } catch (error: any) {
    console.error('[CIBA] Failed to initiate request:', error);
    throw new Error(`Failed to initiate CIBA: ${error.message}`);
  }
}

/**
 * Poll for CIBA authorization result
 * 
 * Polls the token endpoint until:
 * - User approves (returns tokens)
 * - User denies (returns null)
 * - Timeout (throws error)
 * 
 * @param config - CIBA configuration
 * @param authReqId - Authentication request ID from initiateCIBARequest
 * @param interval - Polling interval in seconds
 * @param maxAttempts - Maximum number of polling attempts
 * @returns Token response or null if denied
 */
export async function pollCIBAResult(
  config: CIBAConfig,
  authReqId: string,
  interval: number = 5,
  maxAttempts: number = 20
): Promise<CIBATokenResponse | null> {
  const tokenEndpoint = getTokenEndpoint(config.issuer);
  
  console.log('[CIBA] Starting to poll for user approval');
  console.log('[CIBA] Token endpoint:', tokenEndpoint);
  console.log('[CIBA] Poll interval:', interval, 'seconds');
  console.log('[CIBA] Max attempts:', maxAttempts);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Wait before polling (except first attempt)
    if (attempt > 1) {
      await new Promise(resolve => setTimeout(resolve, interval * 1000));
    }

    console.log(`[CIBA] Polling attempt ${attempt}/${maxAttempts}`);

    try {
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'urn:openid:params:grant-type:ciba',
          auth_req_id: authReqId,
          client_id: config.clientId,
          client_secret: config.clientSecret,
        }).toString(),
      });

      const data = await response.json();

      // Success - user approved
      if (response.ok) {
        console.log('[CIBA] ✅ User approved authorization');
        return {
          access_token: data.access_token,
          id_token: data.id_token,
          token_type: data.token_type,
          expires_in: data.expires_in,
          scope: data.scope,
        };
      }

      // Check error code
      if (data.error === 'authorization_pending') {
        // User hasn't responded yet, continue polling
        console.log('[CIBA] Authorization pending, continuing to poll...');
        continue;
      }

      if (data.error === 'access_denied') {
        // User explicitly denied the request
        console.log('[CIBA] ❌ User denied authorization');
        return null;
      }

      if (data.error === 'expired_token') {
        // Auth request expired
        console.log('[CIBA] ❌ Authorization request expired');
        throw new Error('Authorization request expired - user did not respond in time');
      }

      // Other error
      throw new Error(`CIBA polling error: ${data.error} - ${data.error_description || ''}`);

    } catch (error: any) {
      // Network error or other issue
      if (error.message.includes('CIBA polling error')) {
        throw error;
      }
      console.error(`[CIBA] Polling attempt ${attempt} failed:`, error.message);
      
      // Continue polling unless it's the last attempt
      if (attempt === maxAttempts) {
        throw new Error('CIBA polling failed after maximum attempts');
      }
    }
  }

  // Timeout - user did not respond
  console.log('[CIBA] ⏱️ Timeout - user did not respond');
  throw new Error('CIBA authorization timeout - user did not respond in time');
}

/**
 * Complete CIBA flow (initiate + poll)
 * 
 * Convenience function that initiates the CIBA request and polls for the result.
 * 
 * @param config - CIBA configuration
 * @param userId - User identifier
 * @param bindingMessage - Message shown to user
 * @returns Token response or null if denied
 */
export async function performCIBAAuthorization(
  config: CIBAConfig,
  userId: string,
  bindingMessage: string
): Promise<CIBATokenResponse | null> {
  console.log('[CIBA] Starting complete CIBA flow');
  
  // Step 1: Initiate CIBA request
  const authReq = await initiateCIBARequest(config, userId, bindingMessage);
  
  console.log('[CIBA] Auth request ID:', authReq.auth_req_id);
  console.log('[CIBA] Expires in:', authReq.expires_in, 'seconds');
  
  // Step 2: Poll for result
  const maxAttempts = Math.ceil(authReq.expires_in / authReq.interval);
  const result = await pollCIBAResult(
    config,
    authReq.auth_req_id,
    authReq.interval,
    maxAttempts
  );
  
  console.log('[CIBA] CIBA flow completed');
  return result;
}

/**
 * Create CIBA configuration from environment variables
 */
export function getCIBAConfig(): CIBAConfig {
  const issuer = process.env.AUTH0_ISSUER_BASE_URL;
  const clientId = process.env.AUTH0_CLIENT_ID;
  const clientSecret = process.env.AUTH0_CLIENT_SECRET;
  const audience = process.env.SHOP_API_AUDIENCE;

  if (!issuer || !clientId || !clientSecret) {
    throw new Error('CIBA configuration missing: AUTH0_ISSUER_BASE_URL, AUTH0_CLIENT_ID, and AUTH0_CLIENT_SECRET are required');
  }

  return {
    issuer,
    clientId,
    clientSecret,
    scope: 'openid profile email checkout:buy',
    audience,
  };
}

/**
 * Perform CIBA authorization using environment configuration
 * 
 * @param userId - User identifier
 * @param bindingMessage - Message shown to user
 * @returns Token response or null if denied
 */
export async function performCIBAAuthorizationWithEnv(
  userId: string,
  bindingMessage: string
): Promise<CIBATokenResponse | null> {
  const config = getCIBAConfig();
  return performCIBAAuthorization(config, userId, bindingMessage);
}
