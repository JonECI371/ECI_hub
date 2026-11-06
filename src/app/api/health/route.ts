import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Load balancer health check: app is up and the database answers.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
