import type { Config } from 'tailwindcss';

// Design system v2 tokens. Source of truth: docs/design-system.md
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#242424',
        slate: '#424652',
        cyan: { DEFAULT: '#2EC39B', tint: '#D3F2E9', soft: '#E8F8F3' },
        page: '#F3F4F6',
        hairline: '#E3E5E8',
        field: '#8A8D96',
        elearn: '#E6E8EE',
        warn: { bg: '#FFF1D6', fg: '#5C3B00' },
        bad: { bg: '#FDE4DC', fg: '#8A2400' },
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
