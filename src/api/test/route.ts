import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  console.log("[test-api] GET request received");
  return NextResponse.json({ message: "Test route working" });
}

export async function POST(req: NextRequest) {
  console.log("[test-api] POST request received");
  const body = await req.json();
  console.log("[test-api] Request body:", body);
  return NextResponse.json({ message: "Test POST working", received: body });
}
