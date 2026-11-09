import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'No access', robots: { index: false } };

export default function NoAccess() {
  return (
    <div className="flex flex-1 justify-center px-4 py-20">
      <section className="w-full max-w-[520px] rounded-card bg-white p-9 shadow-card">
        <p className="mb-2.5 text-xs font-extrabold uppercase tracking-[0.1em] text-ink">No access</p>
        <h1 className="mb-3 text-[30px] font-extrabold text-ink">You do not have access to this page</h1>
        <p className="mb-6 leading-relaxed">Your account does not include this area. If you think it should, ask a Super Admin to check your role.</p>
        <Link href="/account" className="inline-flex min-h-11 items-center rounded-chip bg-cyan px-5 font-bold text-ink no-underline">Go to my account</Link>
      </section>
    </div>
  );
}
