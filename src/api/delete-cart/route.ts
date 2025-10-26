import { NextRequest, NextResponse } from 'next/server';
import { cartCache } from '@/lib/cache/cart-cache';

// Helper function to delete cart by userId
async function deleteCartByUserId(userId: string): Promise<void> {
  cartCache.clearCart(userId);
}

export async function DELETE(request: NextRequest) {
  try {
    // Check for userId in header first (for internal API calls)
    let userId = request.headers.get('x-user-id');
    
    // If not in header, get from query parameters
    if (!userId) {
      const { searchParams } = new URL(request.url);
      userId = searchParams.get('userId');
    }

    // Validate userId parameter
    if (!userId) {
      return NextResponse.json(
        { error: 'userId parameter is required (in header x-user-id or query param userId)' },
        { status: 400 }
      );
    }

    // Delete cart by userId
    await deleteCartByUserId(userId);

    return NextResponse.json(
      { message: 'Cart deleted successfully', userId },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting cart:', error);
    return NextResponse.json(
      { error: 'Failed to delete cart' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Alternative: Accept userId in request body
    const { userId } = await request.json();

    // Validate userId parameter
    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required in request body' },
        { status: 400 }
      );
    }

    // Delete cart by userId
    await deleteCartByUserId(userId);

    return NextResponse.json(
      { message: 'Cart deleted successfully', userId },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting cart:', error);
    return NextResponse.json(
      { error: 'Failed to delete cart' },
      { status: 500 }
    );
  }
}