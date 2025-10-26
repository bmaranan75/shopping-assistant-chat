import { NextResponse } from 'next/server';
import { sendPushoverNotification } from '@/lib/agents/supervisor';

// POST /api/test-push
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const params = Object.fromEntries(new URLSearchParams(req.url.split('?')[1] || ''));

    const title = (body.title as string) || (params.title as string) || 'Test Notification';
    const message = (body.message as string) || (params.message as string) || `Test push from app at ${new Date().toISOString()}`;
    const token = (body.token as string) || (params.token as string) || undefined;
    const user = (body.user as string) || (params.user as string) || undefined;

    const result = await sendPushoverNotification({ title, message, token, user });
    return NextResponse.json({ ok: true, push: result });
  } catch (err: any) {
    console.error('[api/test-push] Error handling request:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  // Support GET to allow quick manual tests via browser query params
  try {
    const url = new URL(req.url);
    const title = url.searchParams.get('title') || `Test Notification`;
    const message = url.searchParams.get('message') || `Test push from app at ${new Date().toISOString()}`;
    const token = url.searchParams.get('token') || undefined;
    const user = url.searchParams.get('user') || undefined;

    const result = await sendPushoverNotification({ title, message, token, user });
    return NextResponse.json({ ok: true, push: result });
  } catch (err: any) {
    console.error('[api/test-push] GET error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
