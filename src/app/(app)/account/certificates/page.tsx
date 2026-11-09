import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requirePerson } from '@/lib/auth';
import { Chip } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Certificates', robots: { index: false } };
const dmy = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/London' });

export default async function Certificates() {
  const me = await requirePerson();
  const certs = await db.certificate.findMany({ where: { personId: me.id }, include: { course: true }, orderBy: { issuedAt: 'desc' } });
  return (
    <>
      <h1 className="text-[30px] font-extrabold tracking-tight text-ink">Certificates</h1>
      <section className="overflow-hidden rounded-card bg-white shadow-card">
        {certs.length === 0 ? (
          <p className="px-6 py-8">Your certificates appear here once our team uploads them after your course.</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-[#FAFAFA] text-xs uppercase tracking-[0.06em]"><tr><th className="px-6 py-3">Certificate</th><th className="px-6 py-3">Awarded</th><th className="px-6 py-3">Valid until</th><th className="px-6 py-3"><span className="sr-only">Renew</span></th></tr></thead>
              <tbody>
                {certs.map((c) => {
                  const soon = c.expiresAt && c.expiresAt.getTime() - Date.now() < 90 * 86400000;
                  return (
                    <tr key={c.id} className="border-t border-hairline">
                      <td className="px-6 py-3 font-bold text-ink">{c.course.title}</td>
                      <td className="px-6 py-3 tabular-nums">{dmy.format(c.issuedAt)}</td>
                      <td className="px-6 py-3 tabular-nums">{c.expiresAt ? dmy.format(c.expiresAt) : 'Does not expire'} {soon && <Chip tone="warn">Renew soon</Chip>}</td>
                      <td className="px-6 py-3">{soon && <Link href={`/courses/${c.course.slug}`}>Book renewal</Link>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
