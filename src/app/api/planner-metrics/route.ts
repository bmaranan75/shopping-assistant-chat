import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  // Dev-only guard: refuse in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    // Planner metrics are no longer available since agents are deployed externally
    // This endpoint is kept for backward compatibility but returns empty metrics
    const metrics = {
      message: 'Planner metrics not available - agents are deployed externally',
      totalPlannerCalls: 0,
      averageResponseTime: 0,
      lastUpdated: new Date().toISOString()
    };
    return NextResponse.json({ ok: true, metrics });
  } catch (e) {
    console.warn('[planner-metrics] Failed to read metrics', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
