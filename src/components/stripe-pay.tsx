'use client';

import { useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';

function PayForm({ label, returnUrl }: { label: string; returnUrl: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;
        setBusy(true);
        setError(null);
        const { error: err } = await stripe.confirmPayment({ elements, confirmParams: { return_url: returnUrl } });
        // Only reached when the payment could not be confirmed (otherwise Stripe redirects).
        setError(err?.message ?? 'The payment did not go through. Try again or use another card.');
        setBusy(false);
      }}
      className="flex flex-col gap-4"
    >
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && <p role="alert" className="rounded-control bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg">{error}</p>}
      <button type="submit" disabled={!stripe || busy} className="inline-flex min-h-[56px] w-full items-center justify-center rounded-chip bg-cyan px-6 text-base font-bold text-ink disabled:opacity-60">
        {busy ? 'Taking payment…' : label}
      </button>
    </form>
  );
}

/** Stripe Payment Element: card, plus Apple Pay and Google Pay where the browser supports them (HTTPS only). */
export function StripePay({ publishableKey, clientSecret, label, returnUrl }: { publishableKey: string; clientSecret: string; label: string; returnUrl: string }) {
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: { theme: 'stripe', variables: { colorPrimary: '#242424', colorText: '#242424', borderRadius: '6px', fontFamily: 'Mulish, Avenir, system-ui, sans-serif' } },
        fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Mulish:wght@400;600;700&display=swap' }],
      }}
    >
      <PayForm label={label} returnUrl={returnUrl} />
    </Elements>
  );
}
