import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { MAX_ATTEMPTS, linkTokenOk, safeNext } from '@/lib/auth';
import { finishFirstStep } from '@/lib/login';

export const dynamic = 'force-dynamic';

/** Magic link from the sign-in email: same code record, one use, 15 minutes. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const cid = u.searchParams.get('c') ?? '';
  const token = u.searchParams.get('t') ?? '';
  const next = safeNext(u.searchParams.get('next'));
  const row = cid ? await db.loginCode.findUnique({ where: { id: cid } }) : null;
  if (!row || row.usedAt || row.expiresAt < new Date() || row.attempts >= MAX_ATTEMPTS || !linkTokenOk(row.id, row.codeHash, token)) {
    redirect('/login?error=expired');
  }
  await db.loginCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  await finishFirstStep(row.personId, true, next);
}
