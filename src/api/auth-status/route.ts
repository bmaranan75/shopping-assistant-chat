import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth0';
import { getAuthorizationState } from '@/lib/auth0-ai-langchain';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    const authState = getAuthorizationState();
    
    console.log('[auth-status API] Current authorization state:', authState.status);
    
    const response: any = {
      authenticated: !!user,
      user: user ? {
        sub: user.sub,
        email: user.email,
        name: user.name,
        picture: user.picture
      } : null,
      authorizationStatus: authState.status, // Always include status (idle, pending, approved, denied, requested)
      timestamp: new Date().toISOString()
    };

    // Include authorization message if present
    if (authState.message) {
      response.authorizationMessage = authState.message;
    }
    
    console.log('[auth-status API] Returning response with status:', response.authorizationStatus);
    
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
  } catch (error: any) {
    console.error('[auth-status] Error getting user:', error);
    return NextResponse.json({
      authenticated: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
