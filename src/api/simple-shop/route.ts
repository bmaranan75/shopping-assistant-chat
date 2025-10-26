import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth0';

export async function POST(req: NextRequest) {
  try {
    console.log("[simple-shop] Starting simple shop test...");
    
    // Check if user is authenticated
    const user = await getUser();
    if (!user) {
      return NextResponse.json({
        error: "User not authenticated",
        message: "Please log in first"
      }, { status: 401 });
    }

    const body = await req.json();
    const { product = 'test apple', qty = 1 } = body;
    
    console.log(`[simple-shop] User ${user.sub} wants to buy ${qty} ${product}`);
    
    // Instead of calling the CIBA-wrapped tool, let's call the checkout API directly
    // with a mock authorization to test if the basic flow works
    
    // For now, let's simulate the purchase without actual authorization
    // This helps us isolate the CIBA issue
    
    return NextResponse.json({
      success: true,
      message: `Successfully simulated purchase of ${qty} ${product}`,
      user: {
        sub: user.sub,
        email: user.email
      },
      note: "This is a simulation - CIBA authorization would happen here in production",
      nextSteps: [
        "1. Configure CIBA in Auth0 tenant",
        "2. Set up proper Auth0 AI CIBA flow",
        "3. Test with real authorization"
      ],
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("[simple-shop] Error:", error);
    return NextResponse.json({
      success: false,
      error: "Test failed",
      message: error.message
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Simple Shop Test Endpoint",
    instructions: "POST to test basic shopping flow without CIBA"
  });
}
