'use client';

import { useState } from 'react';

export type AttendanceRow = { id: string; name: string; company: string; needs: string; mark: 'ATTENDED' | 'NO_SHOW' | null };

/** One tap per delegate: Attended or No-show, with a live count. */
export function AttendanceForm({ action, sessionId, rows, open }: { action: (f: FormData) => void; sessionId: string; rows: AttendanceRow[]; open: boolean }) {
  const [marks, setMarks] = useState<Record<string, 'ATTENDED' | 'NO_SHOW' | null>>(Object.fromEntries(rows.map((r) => [r.id, r.mark])));
  const marked = Object.values(marks).filter(Boolean).length;
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="sessionId" value={sessionId} />
      <ul className="overflow-hidden rounded-card bg-white shadow-card">
        {rows.map((r) => (
          <li key={r.id} className="border-b border-hairline px-5 py-4 last:border-0">
            <fieldset disabled={!open}>
              <legend className="font-bold text-ink">{r.name}</legend>
              {r.company && <p className="text-[13px]">{r.company}</p>}
              {r.needs && <p className="mt-1 rounded-control bg-warn-bg px-3 py-1.5 text-[13px] font-semibold text-warn-fg">{r.needs}</p>}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {([['ATTENDED', 'Attended'], ['NO_SHOW', 'No-show']] as const).map(([v, l]) => (
                  <label key={v} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-control border text-sm font-bold ${marks[r.id] === v ? (v === 'ATTENDED' ? 'border-ink bg-ink text-white' : 'border-bad-fg bg-bad-bg text-bad-fg') : 'border-field bg-white text-ink'}`}>
                    <input type="radio" name={`m_${r.id}`} value={v} checked={marks[r.id] === v} onChange={() => setMarks({ ...marks, [r.id]: v })} className="sr-only" />{l}
                  </label>
                ))}
              </div>
            </fieldset>
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="text-sm font-bold text-ink">{marked} of {rows.length} marked.{marked < rows.length && open ? ' You can save and finish later.' : ''}</p>
      <button type="submit" disabled={!open || marked === 0} className="inline-flex min-h-[52px] items-center justify-center rounded-chip bg-cyan px-6 font-bold text-ink disabled:opacity-50">Save attendance</button>
    </form>
  );
}
