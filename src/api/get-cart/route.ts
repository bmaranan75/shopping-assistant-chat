import { NextRequest, NextResponse } from 'next/server';
import { cartCache } from '@/lib/cache/cart-cache';

// GET - Get user's cart
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      );
    }

    const cart = cartCache.getUserCart(userId);
    
    if (!cart) {
      return NextResponse.json({
        success: true,
        message: 'Cart is empty',
        cart: {
          userId: userId,
          items: [],
          totalItems: 0,
          totalValue: 0,
        },
      });
    }

    return NextResponse.json({
      success: true,
      cart: cart,
    });
    
  } catch (error) {
    console.error('[get-cart API] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}