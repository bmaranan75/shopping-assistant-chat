import { NextRequest, NextResponse } from 'next/server';
import { clearConversationThread } from '@/lib/agents/supervisor';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { conversationId } = body;
    
    // Clear the thread cache for this conversation
    clearConversationThread(conversationId);
    
    return NextResponse.json({ 
      success: true, 
      message: conversationId 
        ? `Thread cleared for conversation: ${conversationId}`
        : 'All threads cleared' 
    });
    
  } catch (error) {
    console.error('Error clearing conversation thread:', error);
    return NextResponse.json(
      { error: 'Failed to clear conversation thread' },
      { status: 500 }
    );
  }
}

// For clearing all threads (admin/debug use)
export async function DELETE() {
  try {
    clearConversationThread(); // Clear all threads
    return NextResponse.json({ 
      success: true, 
      message: 'All conversation threads cleared' 
    });
  } catch (error) {
    console.error('Error clearing all threads:', error);
    return NextResponse.json(
      { error: 'Failed to clear threads' },
      { status: 500 }
    );
  }
}