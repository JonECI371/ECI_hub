import type { Metadata } from 'next';
import { SimplePage } from '@/components/simple-page';

export const metadata: Metadata = { title: 'Free tools', robots: { index: false } };

export default function Tools() {
  return (
    <SimplePage eyebrow="Free tools" title="Free tools are on their way" actions={[['See our courses', '/courses'], ['Talk to us', '/contact', true]]}>
      <p>Quizzes, checklists and guides for hazardous area and process safety teams are coming soon. Meanwhile, our team is happy to answer questions.</p>
    </SimplePage>
  );
}
