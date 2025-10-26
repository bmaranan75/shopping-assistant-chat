import { Auth0Client } from '@auth0/nextjs-auth0/server';

// Create an Auth0 Client.
export const auth0 = new Auth0Client();

export const getUser = async () => {
  const session = await auth0.getSession();
  return session?.user;
};

export const getAccessToken = async () => {
  try {
    const session = await auth0.getSession();
    if (!session) {
      console.log("[auth0] No session found");
      return null;
    }
    
    console.log("[auth0] Session found, getting access token...");
    console.log("[auth0] SHOP_API_AUDIENCE:", process.env.SHOP_API_AUDIENCE);
    
    // Get the default access token (without custom scopes for now)
    const tokenResult = await auth0.getAccessToken();
    
    console.log("[auth0] Access token retrieved:", {
      hasToken: !!tokenResult?.token,
      tokenLength: tokenResult?.token?.length || 0,
      tokenPreview: tokenResult?.token?.substring(0, 50) + "..." || "none",
      scopes: tokenResult?.scope,
      expiresAt: tokenResult?.expiresAt,
      audience: process.env.SHOP_API_AUDIENCE
    });
    
    // Check the session token directly
    console.log("[auth0] Session tokenSet:", {
      hasAccessToken: !!(session as any)?.tokenSet?.accessToken,
      tokenSetScopes: (session as any)?.tokenSet?.scope,
      sessionKeys: Object.keys(session || {}),
      userSub: session?.user?.sub
    });
    
    return tokenResult?.token;
  } catch (error) {
    console.error("[auth0] Failed to get access token:", error);
    console.error("[auth0] Error details:", {
      message: (error as any)?.message,
      name: (error as any)?.name
    });
    
    return null;
  }
};

// Get a machine-to-machine token with checkout:buy scope
export const getCheckoutToken = async () => {
  try {
    console.log("[auth0] Getting M2M token for checkout...");
    
    // For now, let's use a simple user identification approach
    // until M2M credentials are properly configured
    const session = await auth0.getSession();
    if (!session) {
      console.log("[auth0] No session found for checkout");
      return null;
    }
    
    // Create a simple token with user info for internal API use
    // This is a temporary workaround until proper JWT tokens are configured
    const userToken = {
      sub: session.user.sub,
      email: session.user.email,
      scope: 'checkout:buy',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
    };
    
    console.log("[auth0] Created checkout user token:", {
      sub: userToken.sub,
      scope: userToken.scope
    });
    
    // Return the user context instead of a JWT for now
    return JSON.stringify(userToken);
  } catch (error) {
    console.error("[auth0] Failed to get checkout token:", error);
    return null;
  }
};