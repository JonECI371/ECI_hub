/** Simple outline icons for the five disciplines on the homepage. Decorative: the card title carries the meaning. */
const base = { width: 32, height: 32, viewBox: '0 0 32 32', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const;

const ICONS = {
  flame: <svg {...base}><path d="M16 3c1 5 7 8 7 15a7 7 0 0 1-14 0c0-3 1.5-5 3-6.5.3 2 1.2 3 2.5 3.5C14.5 11 14.5 6.5 16 3Z" /><path d="M16 27a3 3 0 0 1-3-3c0-2 3-4 3-4s3 2 3 4a3 3 0 0 1-3 3Z" /></svg>,
  ex: <svg {...base}><path d="M16 3.5 26.5 9.5v13L16 28.5 5.5 22.5v-13L16 3.5Z" /><path d="M11 12.5h4.5M11 12.5v7h4.5M11 16h3.5M17.5 12.5l5 7M22.5 12.5l-5 7" /></svg>,
  factory: <svg {...base}><path d="M4 27V14l7 4v-4l7 4v-4l7 4" /><path d="M25 27V9h-4v8" /><path d="M3 27h26" /><path d="M9 23h2M15 23h2M21 23h2" /></svg>,
  sis: <svg {...base}><path d="M16 3.5 26 7v8.5c0 6-4 10.5-10 13-6-2.5-10-7-10-13V7l10-3.5Z" /><path d="m11.5 16 3.5 3.5 6-7" /></svg>,
  water: <svg {...base}><path d="M16 3.5S7 13 7 19.5a9 9 0 0 0 18 0C25 13 16 3.5 16 3.5Z" /><path d="M12 20.5a4.5 4.5 0 0 0 4 4" /></svg>,
} as const;

export type DisciplineIcon = keyof typeof ICONS;
export function DisciplineGlyph({ name }: { name: DisciplineIcon }) { return ICONS[name]; }
