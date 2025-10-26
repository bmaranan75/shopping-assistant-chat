import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth0';
import { checkoutTool } from '@/lib/tools/checkout-langchain';
import { withAsyncAuthorization } from '@/lib/auth0-ai-langchain';

export async function POST(req: NextRequest) {
  try {
    console.log('[ciba-test-api] Received CIBA test request');
    
    const body = await req.json();
    const { product = 'test apple', qty = 1 } = body;
    
    console.log(`[ciba-test-api] Testing CIBA for ${qty} ${product}`);
    
    // Check if user is authenticated first
    const user = await getUser();
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'User not authenticated. Please log in first.',
        authUrl: '/api/auth/login',
        timestamp: new Date().toISOString()
      }, { status: 401 });
    }
    
    console.log('[ciba-test-api] User authenticated:', user.sub);
    
    // Test by directly calling the wrapped shop tool
    console.log('[ciba-test-api] Attempting to call shop tool with CIBA...');
    
    try {
      // Create the wrapped checkout tool with CIBA authorization
      console.log('[ciba-test-api] Creating wrapped checkout tool with CIBA...');
      const authorizedCheckoutTool = withAsyncAuthorization(checkoutTool);
      
      console.log('[ciba-test-api] Testing CIBA with user context...');
      
      // Call the authorized tool which will handle the CIBA flow
      const result = await authorizedCheckoutTool.invoke(
        { product, qty },
        {
          configurable: {
            user_id: user.sub,
            _credentials: {
              user: user
            }
          }
        }
      );
      
      return NextResponse.json({
        success: true,
        result,
        user: {
          sub: user.sub,
          email: user.email
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (toolError: any) {
      console.error('[ciba-test-api] Tool execution error:', toolError);
      
      // Check if this is a CIBA-related error
      if (toolError.message?.includes('CIBA') || toolError.message?.includes('authorization')) {
        return NextResponse.json({
          success: false,
          error: 'CIBA authorization failed',
          details: toolError.message,
          cibaError: true,
          timestamp: new Date().toISOString()
        }, { status: 403 });
      }
      
      throw toolError;
    }
    
  } catch (error: any) {
    console.error('[ciba-test-api] CIBA test error:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    message: 'CIBA Test API - use POST to test CIBA flow',
    usage: 'POST with { "product": "test item", "qty": 1 }',
    timestamp: new Date().toISOString()
  });
}
