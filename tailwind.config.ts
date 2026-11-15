import type { Config } from 'tailwindcss';

// Design system v2 tokens. Source of truth: docs/design-system.md
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Colours are CSS variables (see globals.css) so the Admin area can run a dark palette. Light values are the design system v2 originals.
      colors: {
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        slate: 'rgb(var(--c-slate) / <alpha-value>)',
        cyan: { DEFAULT: '#2EC39B', tint: 'rgb(var(--c-cyan-tint) / <alpha-value>)', soft: 'rgb(var(--c-cyan-soft) / <alpha-value>)' },
        page: 'rgb(var(--c-page) / <alpha-value>)',
        card: 'rgb(var(--c-card) / <alpha-value>)',
        card2: 'rgb(var(--c-card2) / <alpha-value>)',
        hairline: 'rgb(var(--c-hairline) / <alpha-value>)',
        field: 'rgb(var(--c-field) / <alpha-value>)',
        elearn: 'rgb(var(--c-elearn) / <alpha-value>)',
        chrome: 'rgb(var(--c-chrome) / <alpha-value>)', // side menu and other always-dark bands
        strong: 'rgb(var(--c-strong) / <alpha-value>)', // fill of dark buttons and selected pills (flips light in Admin)
        'strong-fg': 'rgb(var(--c-strong-fg) / <alpha-value>)',
        'on-cyan': 'rgb(var(--c-on-cyan) / <alpha-value>)', // text on the green accent: always dark
        warn: { bg: 'rgb(var(--c-warn-bg) / <alpha-value>)', fg: 'rgb(var(--c-warn-fg) / <alpha-value>)', line: 'rgb(var(--c-warn-line) / <alpha-value>)' },
        bad: { bg: 'rgb(var(--c-bad-bg) / <alpha-value>)', fg: 'rgb(var(--c-bad-fg) / <alpha-value>)', line: 'rgb(var(--c-bad-line) / <alpha-value>)', solid: 'rgb(var(--c-bad-solid) / <alpha-value>)' },
        'ok-line': 'rgb(var(--c-ok-line) / <alpha-value>)',
      },
      fontFamily: { sans: ['Mulish', 'Avenir', 'system-ui', 'sans-serif'] },
      borderRadius: { chip: '4px', control: '6px', card: '8px' },
      boxShadow: {
        card: '0 1px 2px rgba(36,36,36,0.06), 0 6px 20px rgba(36,36,36,0.06)',
        lift: '0 2px 4px rgba(36,36,36,0.08), 0 14px 32px rgba(36,36,36,0.12)',
      },
    },
  },
  plugins: [],
};
export default config;
