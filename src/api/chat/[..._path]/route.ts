import { NextRequest } from 'next/server';
import { initApiPassthrough } from 'langgraph-nextjs-api-passthrough';
import { getUser } from '@/lib/auth0';

// Create the LangGraph API passthrough with Auth0 context
const handler = initApiPassthrough({
  apiUrl: 'http://127.0.0.1:8123', // Default LangGraph server URL
  bodyParameters: async (req: NextRequest, body: any) => {
    // Get Auth0 user context
    const user = await getUser();
    
    // Add Auth0 user context to the request configuration
    if (user && body.config) {
      return {
        ...body,
        config: {
          ...body.config,
          configurable: {
            ...body.config?.configurable,
            user_id: user.sub,
            _credentials: {
              user: user
            }
          }
        }
      };
    }
    
    return body;
  }
});

export const { GET, POST } = handler;
