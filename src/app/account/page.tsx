import type { Metadata } from 'next';
import { requirePerson } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My account', robots: { index: false } };

// Temporary: replaced by the dashboard (task 1.10).
export default async function Account() {
  const me = await requirePerson();
  return (
    <div className="flex flex-1 justify-center px-4 py-16">
      <section className="w-full max-w-[560px] rounded-card bg-white p-9 shadow-card">
        <p className="mb-2.5 text-xs font-extrabold uppercase tracking-[0.1em] text-ink">My account</p>
        <h1 className="mb-3 text-[30px] font-extrabold text-ink">Hello, {me.firstName}</h1>
        <p className="mb-6">You are logged in as {me.email}.</p>
        <form action="/logout" method="post">
          <button type="submit" className="inline-flex min-h-11 items-center rounded-chip border border-field bg-white px-5 font-bold text-ink">Log out</button>
        </form>
      </section>
    </div>
  );
}
