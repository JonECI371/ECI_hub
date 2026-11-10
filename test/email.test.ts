import { describe, expect, it } from 'vitest';
import { renderEmail } from '@/lib/email-layout';

describe('email layout', () => {
  it('escapes names and links so nobody can inject markup', () => {
    const { html, text } = renderEmail('Hi', [{ type: 'heading', text: '<script>alert(1)</script>' }, { type: 'button', label: 'Go "now"', href: '/account' }]);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('href="http://localhost:3000/account"');
    expect(text).toContain('Go "now": http://localhost:3000/account');
  });
});
