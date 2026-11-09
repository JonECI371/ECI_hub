import 'server-only';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { isStaff, startMfa, startSession } from '@/lib/auth';

/** After the code or magic link: staff go to the authenticator step, everyone else is signed in. Server-side only. */
export async function finishFirstStep(personId: string, trust: boolean, next: string): Promise<never> {
  const person = await db.person.findUniqueOrThrow({ where: { id: personId } });
  if (isStaff(person.roles)) {
    await startMfa(person.id, trust, next);
    redirect('/login?step=staff');
  }
  await startSession(person.id, trust);
  redirect(next);
}
