import { NextRequest, NextResponse } from 'next/server';
import { simpleAgent } from '@/lib/simple-agent';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages } = body;
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({
        message: "Hello! I'm your shopping assistant. How can I help you today?"
      });
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || !lastMessage.content) {
      return NextResponse.json({
        message: "I didn't receive a message. Please try again."
      });
    }

    console.log("[test-chat] Processing message:", lastMessage.content);
    
    const response = await simpleAgent(lastMessage.content);
    
    return NextResponse.json({
      message: response
    });
    
  } catch (error) {
    console.error('Test chat error:', error);
    return NextResponse.json(
      { error: 'Failed to process request', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "Simple Agent Ready",
    message: "Test endpoint active"
  });
}
