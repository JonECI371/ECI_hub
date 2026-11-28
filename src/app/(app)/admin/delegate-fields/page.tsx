import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { FIELD_INFO, FIELD_KEYS, effectiveFields } from '@/lib/delegate-fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Delegate fields', robots: { index: false } };

const MARK = { REQUIRED: 'Required', OPTIONAL: 'Optional', OFF: '' } as const;

export default async function Page() {
  await requireAdmin('/admin/courses');
  const courses = await db.course.findMany({ where: { status: { not: 'WITHDRAWN' } }, include: { subject: true }, orderBy: [{ subject: { name: 'asc' } }, { title: 'asc' }] });
  const eff = courses.map((c) => ({ c, df: effectiveFields(c), custom: !!c.delegateFields }));
  return (
    <>
      <div>
        <p className="mb-1.5 text-xs"><Link href="/admin/courses">Courses</Link></p>
        <h1 className="text-[30px] font-extrabold tracking-tight text-ink">Delegate fields</h1>
        <p className="mt-1 max-w-[70ch] text-sm">What each course asks delegates for. First name, last name and email are always required. Change a course&apos;s settings on its edit page, under Delegate details.</p>
      </div>
      <div className="overflow-x-auto rounded-card bg-card shadow-card">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="text-left">
              <th scope="col" className="sticky left-0 bg-card px-4 py-3">Field</th>
              {eff.map(({ c, custom }) => (
                <th key={c.id} scope="col" className="px-3 py-3 align-bottom text-xs font-bold leading-snug">
                  <Link href={`/admin/courses/${c.id}/edit`} className="text-ink">{c.title}</Link>
                  <span className="block font-normal">{c.status === 'DRAFT' ? 'Draft · ' : ''}{custom ? 'Custom' : 'Template'}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FIELD_KEYS.map((k) => (
              <tr key={k} className="border-t border-hairline">
                <th scope="row" className="sticky left-0 bg-card px-4 py-2 text-left font-bold text-ink">{FIELD_INFO[k].label}</th>
                {eff.map(({ c, df }) => (
                  <td key={c.id} className="px-3 py-2 text-center">
                    {df.fields[k] === 'OFF' ? <span className="text-slate" aria-label="Not asked">-</span> : <span className={df.fields[k] === 'REQUIRED' ? 'font-bold text-ink' : ''}>{MARK[df.fields[k]]}{df.certificate.includes(k) ? ' *' : ''}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[13px]">* Held back from the certificate until we have it. Written record: docs/delegate-fields.md.</p>
    </>
  );
}
