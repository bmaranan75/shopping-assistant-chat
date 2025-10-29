/**
 * MCP OAuth2 Client
 * Handles OAuth2 client credentials flow for MCP server authentication
 */

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

interface CachedToken {
  access_token: string;
  expires_at: number;
}

export class MCPOAuth2Client {
  private clientId: string;
  private clientSecret: string;
  private tokenEndpoint: string;
  private audience?: string;
  private cachedToken: CachedToken | null = null;

  constructor() {
    this.clientId = process.env.MCP_OAUTH2_CLIENT_ID!;
    this.clientSecret = process.env.MCP_OAUTH2_CLIENT_SECRET!;
    this.tokenEndpoint = process.env.MCP_OAUTH2_TOKEN_ENDPOINT!;
    this.audience = process.env.MCP_OAUTH2_AUDIENCE;

    if (!this.clientId || !this.clientSecret || !this.tokenEndpoint) {
      throw new Error(
        'Missing required MCP OAuth2 configuration. Please set the following environment variables:\n' +
        '- MCP_OAUTH2_CLIENT_ID: Your OAuth2 client ID\n' +
        '- MCP_OAUTH2_CLIENT_SECRET: Your OAuth2 client secret\n' +
        '- MCP_OAUTH2_TOKEN_ENDPOINT: OAuth2 token endpoint URL\n' +
        '- MCP_OAUTH2_AUDIENCE (optional): Target audience for the token'
      );
    }

    console.log('[MCP OAuth2] Initialized with client ID:', this.clientId);
    console.log('[MCP OAuth2] Token endpoint:', this.tokenEndpoint);
    if (this.audience) {
      console.log('[MCP OAuth2] Audience:', this.audience);
    }
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getAccessToken(): Promise<string> {
    // Check if we have a cached token that's still valid
    if (this.cachedToken && Date.now() < this.cachedToken.expires_at) {
      return this.cachedToken.access_token;
    }

    // Fetch new token using client credentials flow
    const token = await this.fetchAccessToken();
    
    // Cache the token with a 30-second buffer before expiration
    this.cachedToken = {
      access_token: token.access_token,
      expires_at: Date.now() + (token.expires_in - 30) * 1000
    };

    return token.access_token;
  }

  /**
   * Perform OAuth2 client credentials flow
   */
  private async fetchAccessToken(): Promise<TokenResponse> {
    console.log('[MCP OAuth2] Requesting new access token...');
    
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    // Add audience if configured (some OAuth2 providers require this)
    if (this.audience) {
      params.append('audience', this.audience);
    }

    try {
      const response = await fetch(this.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: params
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('[MCP OAuth2] Token request failed:', response.status, response.statusText, errorText);
        throw new Error(
          `OAuth2 token request failed: ${response.status} ${response.statusText}\n` +
          `Error details: ${errorText}\n` +
          `Endpoint: ${this.tokenEndpoint}\n` +
          `Client ID: ${this.clientId}`
        );
      }

      const tokenData: TokenResponse = await response.json();

      if (!tokenData.access_token) {
        console.error('[MCP OAuth2] Invalid token response:', tokenData);
        throw new Error('Invalid token response: missing access_token');
      }

      console.log('[MCP OAuth2] Successfully obtained access token, expires in:', tokenData.expires_in, 'seconds');
      return tokenData;
      
    } catch (error) {
      if (error instanceof Error) {
        console.error('[MCP OAuth2] Token fetch error:', error.message);
        throw error;
      } else {
        console.error('[MCP OAuth2] Unknown token fetch error:', error);
        throw new Error(`Failed to fetch OAuth2 token: ${String(error)}`);
      }
    }
  }

  /**
   * Get authorization header for API requests
   */
  async getAuthorizationHeader(): Promise<string> {
    const token = await this.getAccessToken();
    return `Bearer ${token}`;
  }

  /**
   * Clear cached token (force refresh on next request)
   */
  clearCache(): void {
    this.cachedToken = null;
  }
}

// Singleton instance for reuse across the application
let mcpOAuth2Client: MCPOAuth2Client | null = null;

/**
 * Get the singleton MCP OAuth2 client instance
 */
export function getMCPOAuth2Client(): MCPOAuth2Client {
  if (!mcpOAuth2Client) {
    mcpOAuth2Client = new MCPOAuth2Client();
  }
  return mcpOAuth2Client;
}