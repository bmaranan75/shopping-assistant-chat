import { withAsyncAuthorization } from './ciba-provider';
import { getUser } from './auth0';

// Manual CIBA implementation for direct tool calls
export async function performCIBAAuthorization(product: string, qty: number): Promise<string | null> {
  try {
    console.log('[manual-ciba] Starting CIBA authorization for:', product, qty);

    const user = await getUser();
    if (!user?.sub) {
      throw new Error('User not authenticated');
    }

    console.log('[manual-ciba] User ID:', user.sub);

    // Use withAsyncAuthorization as a wrapper around a minimal tool to trigger CIBA
    const dummyTool = {
      name: 'manual-ciba-dummy',
      invoke: async (args: any, config?: any) => {
        // This tool just returns a simple acknowledgment when called after CIBA
        return { approved: true, args };
      }
    } as any;

    const authorizedTool = withAsyncAuthorization(dummyTool);

    // Call the authorized tool with user context to initiate CIBA
    const result = await authorizedTool.invoke(
      { product, qty },
      { configurable: { _credentials: { user } } }
    );

    console.log('[manual-ciba] CIBA result:', result);

    return result ? String(result) : null;

  } catch (error) {
    console.error('[manual-ciba] CIBA authorization failed:', error);
    return null;
  }
}
