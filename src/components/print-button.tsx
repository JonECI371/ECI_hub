'use client';

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center rounded-chip bg-ink px-5 text-sm font-bold text-white">Print or save as PDF</button>;
}
