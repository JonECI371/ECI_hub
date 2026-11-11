'use client';

/** Last resort if the page layout itself fails: plain, self-contained, no technical detail. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-GB">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#F3F4F6', margin: 0, padding: '64px 16px' }}>
        <main role="alert" style={{ maxWidth: 560, margin: '0 auto', background: '#fff', padding: 36, borderRadius: 8 }}>
          <h1 style={{ marginTop: 0 }}>Something went wrong</h1>
          <p>The site could not load this page. Nothing has been charged. Try again, or call us on +44 (0) 1932 963463.</p>
          <button type="button" onClick={reset} style={{ minHeight: 44, padding: '0 20px', fontWeight: 700, background: '#2EC39B', border: 0, borderRadius: 4 }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
