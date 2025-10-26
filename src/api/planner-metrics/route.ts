import { NextResponse } from 'next/server';
import { getPlannerMetrics } from '@/lib/agents/planner';

export async function GET(req: Request) {
  // Dev-only guard: refuse in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    const metrics = getPlannerMetrics();
    return NextResponse.json({ ok: true, metrics });
  } catch (e) {
    console.warn('[planner-metrics] Failed to read metrics', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
