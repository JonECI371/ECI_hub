import { redirect } from 'next/navigation';
import { endSession } from '@/lib/auth';

export async function POST() {
  await endSession();
  redirect('/');
}

/** Plain links ("Not you? Log out") use GET; signing out is harmless to trigger. */
export async function GET() {
  await endSession();
  redirect('/');
}
