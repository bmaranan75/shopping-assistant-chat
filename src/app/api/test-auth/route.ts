import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth0';
import { auth0 } from '@/lib/auth0';

export async function POST(req: NextRequest) {
  try {
    console.log("[test-auth] Starting auth token test...");
    
    // Check if user is authenticated
    const user = await getUser();
    if (!user) {
      return NextResponse.json({
        error: "User not authenticated",
        message: "Please log in first"
      }, { status: 401 });
    }

    console.log("[test-auth] User authenticated:", user.sub);

    // Try to get an access token for the user
    try {
      const session = await auth0.getSession();
      console.log("[test-auth] Session:", JSON.stringify(session, null, 2));

      if (session?.accessToken) {
        console.log("[test-auth] Access token found in session");
        
        // Test the checkout API directly with this token
        const checkoutResponse = await fetch(`${process.env.SHOP_API_URL}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.accessToken}`
          },
          body: JSON.stringify({
            product: 'test apple',
            qty: 1
          })
        });

        const checkoutResult = await checkoutResponse.text();
        
        return NextResponse.json({
          success: true,
          message: "Auth token test completed",
          userSub: user.sub,
          hasAccessToken: !!session.accessToken,
          tokenLength: session.accessToken ? String(session.accessToken).length : 0,
          checkoutStatus: checkoutResponse.status,
          checkoutResult: checkoutResult
        });
      } else {
        return NextResponse.json({
          success: false,
          message: "No access token in session",
          userSub: user.sub,
          sessionKeys: Object.keys(session || {})
        });
      }

    } catch (sessionError: any) {
      console.error("[test-auth] Session error:", sessionError);
      return NextResponse.json({
        success: false,
        error: "Session access failed",
        message: sessionError.message
      });
    }

  } catch (error: any) {
    console.error("[test-auth] General error:", error);
    return NextResponse.json({
      success: false,
      error: "Test failed",
      message: error.message
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Auth Token Test Endpoint",
    instructions: "POST to this endpoint while logged in to test token access"
  });
}
