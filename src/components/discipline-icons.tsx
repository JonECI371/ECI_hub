/** Simple outline icons for the five disciplines on the homepage. Decorative: the card title carries the meaning. */
const base = { width: 32, height: 32, viewBox: '0 0 32 32', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const;

const ICONS = {
  flame: <svg {...base}><path d="M16 2.5C16 2.5 24.5 9 24.5 18.5a8.5 8.5 0 0 1-17 0c0-4 2.5-6.5 4-8 .5 2.5 1.5 3.5 3 4C14 9 14.5 5.5 16 2.5Z" /><path d="M16 25a3 3 0 0 1-3-3c0-2.2 3-4.5 3-4.5s3 2.3 3 4.5a3 3 0 0 1-3 3Z" /></svg>,
  // The explosion protection mark: a flat-topped hexagon holding a capital E and a small x.
  ex: <svg {...base}><path d="M3 16 9.5 4.75h13L29 16 22.5 27.25h-13L3 16Z" /><path d="M14.5 11.5h-4v9h4M10.5 16h3.5" /><path d="m16.5 14.5 5.5 6m0-6-5.5 6" /></svg>,
  factory: <svg {...base}><path d="M4 27V14l7 4v-4l7 4V9h7v18H4Z" /><path d="M9 23h2M14 23h2M20.5 23h2M20.5 14h2" /></svg>,
  sis: <svg {...base}><path d="M16 3 26 6.5V15c0 6.5-4.2 10.8-10 14C10.2 25.8 6 21.5 6 15V6.5L16 3Z" /><path d="m11.5 15.5 3.5 3.5 6-7" /></svg>,
  water: <svg {...base}><path d="M16 3S24.5 12 24.5 19a8.5 8.5 0 0 1-17 0C7.5 12 16 3 16 3Z" /><path d="M12 20a4.2 4.2 0 0 0 3.8 4.2" /></svg>,
} as const;

export type DisciplineIcon = keyof typeof ICONS;
export function DisciplineGlyph({ name }: { name: DisciplineIcon }) { return ICONS[name]; }
