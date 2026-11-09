import type { Metadata } from 'next';
import { SimplePage } from '@/components/simple-page';

export const metadata: Metadata = { title: 'Apply for a credit account', robots: { index: false } };

export default function Apply() {
  return (
    <SimplePage eyebrow="Credit accounts" title="Online applications open soon" actions={[['Ask about a credit account', '/contact?topic=other'], ['Book by card', '/courses', true]]}>
      <p className="mb-3">Credit accounts let your company book any course and pay one invoice at the end of each month.</p>
      <p>The online application is part of the next phase. Until then, contact us and we will set one up for you.</p>
    </SimplePage>
  );
}
