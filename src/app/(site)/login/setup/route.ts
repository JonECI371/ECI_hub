import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { isStaff, startMfa } from '@/lib/auth';
import { readSetupToken } from '@/lib/staff-login';

export const dynamic = 'force-dynamic';

/** One-time link from a Super Admin: lets a staff member or trainer set up their authenticator app. Dead once an authenticator exists. */
export async function GET(req: Request) {
  const pid = readSetupToken(new URL(req.url).searchParams.get('t'));
  const person = pid ? await db.person.findUnique({ where: { id: pid } }) : null;
  if (!person || !isStaff(person.roles) || person.totpSecret) redirect('/login?error=setuplink');
  await startMfa(person.id, false, '/account', true);
  redirect('/login?step=staff');
}
