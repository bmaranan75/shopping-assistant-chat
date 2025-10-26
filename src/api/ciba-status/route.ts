import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth0';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    
    if (!user) {
      return NextResponse.json({
        status: 'Not authenticated',
        message: 'Please log in to test CIBA functionality',
        loginUrl: '/api/auth/login'
      }, { status: 401 });
    }

    // Test basic Auth0 configuration
    const config = {
      domain: process.env.AUTH0_DOMAIN,
      clientId: process.env.AUTH0_CLIENT_ID,
      hasClientSecret: !!process.env.AUTH0_CLIENT_SECRET,
      issuer: process.env.AUTH0_ISSUER_BASE_URL,
      shopAudience: process.env.SHOP_API_AUDIENCE,
      paymentAudience: process.env.ADD_PAYMENT_API_AUDIENCE,
    };

    // Test CIBA discovery
    let cibaSupported = false;
    let discoveryData = null;
    
    try {
      const discoveryUrl = `${process.env.AUTH0_ISSUER_BASE_URL}/.well-known/openid_configuration`;
      const discoveryResponse = await fetch(discoveryUrl);
      
      if (discoveryResponse.ok) {
        discoveryData = await discoveryResponse.json();
        cibaSupported = !!discoveryData.backchannel_authentication_endpoint;
      }
    } catch (error) {
      console.error('Error fetching discovery document:', error);
    }

    return NextResponse.json({
      status: 'Authenticated',
      user: {
        sub: user.sub,
        email: user.email,
        name: user.name
      },
      auth0Config: config,
      cibaSupport: {
        supported: cibaSupported,
        endpoint: discoveryData?.backchannel_authentication_endpoint,
        supportedGrantTypes: discoveryData?.grant_types_supported || [],
        supportedResponseTypes: discoveryData?.response_types_supported || []
      },
      recommendations: !cibaSupported ? [
        'CIBA endpoint not found in discovery document',
        'Contact Auth0 support to enable CIBA for your tenant',
        'Ensure your Auth0 plan includes CIBA functionality',
        'Check application configuration for CIBA grant type'
      ] : [
        'CIBA endpoint detected',
        'Try making a purchase request in the chat',
        'Check browser console and server logs for detailed error messages'
      ],
      testInstructions: {
        1: 'Go to the chat interface',
        2: 'Type: "I want to buy 2 apples"',
        3: 'Watch for authorization prompts',
        4: 'Check console logs for detailed error information'
      }
    });

  } catch (error: any) {
    return NextResponse.json({
      status: 'Error',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}
