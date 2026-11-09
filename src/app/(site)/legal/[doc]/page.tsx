import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { LEGAL } from '@/lib/legal';

export function generateStaticParams() {
  return Object.keys(LEGAL).map((doc) => ({ doc }));
}
export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const d = LEGAL[(await params).doc];
  return d ? { title: d.title, alternates: { canonical: `/legal/${d.slug}` } } : {};
}

export default async function Legal({ params }: { params: Promise<{ doc: string }> }) {
  const d = LEGAL[(await params).doc];
  if (!d) notFound();
  const id = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <div className="flex flex-col gap-8 px-4 py-10 md:px-20 lg:flex-row lg:items-start">
      <aside className="w-full rounded-card bg-white p-6 shadow-card lg:sticky lg:top-6 lg:w-[300px]">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-ink">Contents</p>
        <ol className="flex flex-col gap-2 text-sm">{d.sections.map((s, i) => <li key={s.heading}><a href={`#${id(s.heading)}`}>{i + 1}. {s.heading}</a></li>)}</ol>
        <nav aria-label="Legal documents" className="mt-6 border-t border-hairline pt-4 text-sm"><ul className="flex flex-col gap-2">{Object.values(LEGAL).map((x) => <li key={x.slug}><Link href={`/legal/${x.slug}`} aria-current={x.slug === d.slug ? 'page' : undefined} className={x.slug === d.slug ? 'font-bold' : ''}>{x.title}</Link></li>)}</ul></nav>
      </aside>
      <article className="min-w-0 max-w-[760px] flex-1 rounded-card bg-white p-6 shadow-card md:p-10">
        <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.1em] text-ink">Legal</p>
        <h1 className="mb-2 text-[34px] font-extrabold tracking-tight text-ink">{d.title}</h1>
        <p className="mb-8 text-sm">Version {d.version} · Effective from {d.effective}</p>
        {d.sections.map((s, i) => (
          <section key={s.heading} id={id(s.heading)} className="mb-8 scroll-mt-6">
            <h2 className="mb-3 text-[22px] font-extrabold text-ink">{i + 1}. {s.heading}</h2>
            {s.body && <p className="leading-[1.7]">{s.body}</p>}
            {s.table && (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="bg-[#FAFAFA] text-xs uppercase tracking-[0.06em]"><tr>{s.table[0].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
                  <tbody>{s.table.slice(1).map((r) => <tr key={r[0]} className="border-t border-hairline">{r.map((c, j) => <td key={j} className={`px-3 py-2 ${j === 0 ? 'font-mono text-ink' : ''}`}>{c}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        ))}
        {d.previous && (
          <section className="border-t border-hairline pt-6">
            <h2 className="mb-2 text-lg font-extrabold text-ink">Previous versions</h2>
            <ul className="list-disc pl-5 text-sm">{d.previous.map((p) => <li key={p}>{p}</li>)}</ul>
          </section>
        )}
      </article>
    </div>
  );
}
