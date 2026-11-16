'use client';
import { useState } from 'react';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Date of birth as three boxes (day, month list, year) instead of free text with slashes.
 * It still submits one hidden field "name" as DD/MM/YYYY, so the server check is unchanged.
 */
export function DobField({ name, defaultValue, inputClass, invalid, describedBy }: { name: string; defaultValue: string; inputClass: string; invalid?: boolean; describedBy?: string }) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(defaultValue.trim());
  const [d, setD] = useState(m ? String(+m[1]) : '');
  const [mo, setMo] = useState(m ? String(+m[2]) : '');
  const [y, setY] = useState(m ? m[3] : '');
  const composed = d || mo || y ? `${d.padStart(2, '0')}/${mo.padStart(2, '0')}/${y}` : '';
  const a11y = { ...(invalid ? { 'aria-invalid': true } : {}), ...(describedBy ? { 'aria-describedby': describedBy } : {}) };
  const small = 'flex flex-col gap-1 text-sm font-semibold text-ink';
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-bold text-ink">Date of birth</legend>
      <input type="hidden" name={name} value={composed} />
      <div className="flex gap-3">
        <label className={`${small} w-20`}>Day
          <input inputMode="numeric" autoComplete="bday-day" maxLength={2} placeholder="DD" value={d} onChange={(e) => setD(e.target.value.replace(/\D/g, '').slice(0, 2))} className={inputClass} {...a11y} />
        </label>
        <label className={`${small} min-w-0 flex-1`}>Month
          <select autoComplete="bday-month" value={mo} onChange={(e) => setMo(e.target.value)} className={inputClass} {...a11y}>
            <option value="">Month</option>
            {MONTHS.map((n, i) => <option key={n} value={String(i + 1)}>{n}</option>)}
          </select>
        </label>
        <label className={`${small} w-24`}>Year
          <input inputMode="numeric" autoComplete="bday-year" maxLength={4} placeholder="YYYY" value={y} onChange={(e) => setY(e.target.value.replace(/\D/g, '').slice(0, 4))} className={inputClass} {...a11y} />
        </label>
      </div>
    </fieldset>
  );
}
