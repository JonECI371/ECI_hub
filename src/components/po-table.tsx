import { money } from '@/lib/format';
import type { PoRow } from '@/lib/purchase-orders';

/** Purchase orders on an account: the value (when the booker gave one), what has been billed against it and what is left. */
export function PoTable({ rows }: { rows: PoRow[] }) {
  if (!rows.length) return <p className="px-6 py-6 text-sm">No purchase orders yet. They appear here when a booker uses a PO number.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b border-hairline text-xs"><th className="px-6 py-2 font-bold">PO</th><th className="px-3 py-2 font-bold">Value</th><th className="px-3 py-2 font-bold">Billed</th><th className="px-3 py-2 font-bold">Left</th><th className="px-6 py-2 font-bold">Files</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.number} className="border-b border-hairline last:border-0 align-top">
              <td className="px-6 py-3 font-bold text-ink">{r.number}</td>
              <td className="px-3 py-3 tabular-nums">{r.valuePence == null ? <span className="text-xs">Not given</span> : money(r.valuePence)}</td>
              <td className="px-3 py-3 tabular-nums">{money(r.billedPence)}</td>
              <td className={`px-3 py-3 tabular-nums ${r.leftPence != null && r.leftPence < 0 ? 'font-bold text-bad-fg' : ''}`}>{r.leftPence == null ? '-' : r.leftPence < 0 ? `${money(-r.leftPence)} over` : money(r.leftPence)}</td>
              <td className="px-6 py-3">{r.files.length ? <ul className="flex flex-col gap-1">{r.files.map((f) => <li key={f.id}><a href={`/po-files/${f.id}`}>{f.fileName}</a></li>)}</ul> : <span className="text-xs">None</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
