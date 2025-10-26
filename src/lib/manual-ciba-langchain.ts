import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getUser } from "./auth0";

// Manual CIBA implementation for LangChain tools
export function withManualCIBAAuthorization<T extends Record<string, any>>(
  baseTool: any,
  scopes: string[],
  audience: string
) {
  return tool(
    async (args: T, config?: any) => {
      console.log("[manual-ciba] Starting CIBA authorization flow");
      
      // Get the authenticated user
      const user = await getUser();
      if (!user?.sub) {
        throw new Error("User must be logged in to perform this action");
      }
      
      console.log("[manual-ciba] User authenticated:", user.sub);
      
      try {
        // Step 1: Initiate CIBA request - create safe binding message
        const safeArgs = typeof args === 'object' ? Object.keys(args).join(' ') : String(args);
        const bindingMessage = `Approve checkout: ${safeArgs.replace(/[^a-zA-Z0-9\s+\-_.,:#]/g, '')}`;
        
        const cibaResponse = await initiateCIBARequest({
          userSub: user.sub,
          scopes,
          audience,
          bindingMessage,
        });
        
        console.log("[manual-ciba] CIBA request initiated:", cibaResponse.auth_req_id);
        
        // Step 2: Poll for token
        const tokenResponse = await pollForToken(cibaResponse.auth_req_id);
        
        console.log("[manual-ciba] Token obtained successfully");
        
        // Step 3: Add token to config and call the original tool
        const updatedConfig = {
          ...config,
          configurable: {
            ...config?.configurable,
            _credentials: {
              accessToken: tokenResponse.access_token,
            },
          },
        };
        
        // Call the original tool with the token
        return await baseTool.invoke(args, updatedConfig);
        
      } catch (error) {
        console.error("[manual-ciba] Authorization failed:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Return a clear failure message instead of throwing to prevent retries
        return `Authorization failed: ${errorMessage}. Please try again later.`;
      }
    },
    {
      name: baseTool.name,
      description: baseTool.description,
      schema: baseTool.schema,
    }
  );
}

async function initiateCIBARequest({
  userSub,
  scopes,
  audience,
  bindingMessage,
}: {
  userSub: string;
  scopes: string[];
  audience: string;
  bindingMessage: string;
}) {
  const response = await fetch(`${process.env.AUTH0_ISSUER_BASE_URL}/bc-authorize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.AUTH0_CLIENT_ID!,
      client_secret: process.env.AUTH0_CLIENT_SECRET!,
      scope: scopes.join(" "),
      audience: audience,
      login_hint: userSub,
      binding_message: bindingMessage,
    }),
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    console.error("[manual-ciba] CIBA initiation failed:", errorData);
    throw new Error(`CIBA initiation failed: ${response.status} ${errorData}`);
  }
  
  return await response.json();
}

async function pollForToken(authReqId: string): Promise<{ access_token: string }> {
  const maxAttempts = 30; // 30 attempts with 2-second intervals = 60 seconds max
  const pollInterval = 2000; // 2 seconds
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    console.log(`[manual-ciba] Polling attempt ${attempt + 1}/${maxAttempts}`);
    
    try {
      const response = await fetch(`${process.env.AUTH0_ISSUER_BASE_URL}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "urn:openid:params:grant-type:ciba",
          auth_req_id: authReqId,
          client_id: process.env.AUTH0_CLIENT_ID!,
          client_secret: process.env.AUTH0_CLIENT_SECRET!,
        }),
      });
      
      if (response.ok) {
        const tokenData = await response.json();
        console.log("[manual-ciba] Token received successfully");
        return tokenData;
      }
      
      if (response.status === 400) {
        const errorData = await response.json();
        if (errorData.error === "authorization_pending") {
          // User hasn't approved yet, continue polling
          console.log("[manual-ciba] Authorization pending, continuing to poll...");
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          continue;
        } else if (errorData.error === "slow_down") {
          // Auth0 is asking us to slow down
          console.log("[manual-ciba] Slowing down polling interval");
          await new Promise(resolve => setTimeout(resolve, pollInterval + 1000));
          continue;
        } else {
          throw new Error(`Token polling failed: ${errorData.error_description || errorData.error}`);
        }
      }
      
      throw new Error(`Token polling failed: ${response.status}`);
      
    } catch (error) {
      if (attempt === maxAttempts - 1) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Token polling timed out: ${errorMessage}`);
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[manual-ciba] Polling attempt ${attempt + 1} failed:`, errorMessage);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }
  
  throw new Error("Authorization timeout - user did not approve the request in time");
}
