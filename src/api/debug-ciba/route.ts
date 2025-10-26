import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  return NextResponse.json({
    message: 'CIBA Debug Information',
    environment: {
      AUTH0_DOMAIN: process.env.AUTH0_DOMAIN,
      AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID,
      AUTH0_ISSUER_BASE_URL: process.env.AUTH0_ISSUER_BASE_URL,
      SHOP_API_AUDIENCE: process.env.SHOP_API_AUDIENCE,
      ADD_PAYMENT_API_AUDIENCE: process.env.ADD_PAYMENT_API_AUDIENCE,
    },
    endpoints: {
      checkoutAPI: process.env.SHOP_API_URL,
      paymentAPI: process.env.ADD_PAYMENT_URL,
    },
    recommendations: [
      'Ensure CIBA is enabled in your Auth0 tenant',
      'Configure your Auth0 application to support CIBA grant type',
      'Set up push notifications or polling mode',
      'Verify user has Auth0 Guardian app or similar for notifications'
    ],
    timestamp: new Date().toISOString()
  });
}
