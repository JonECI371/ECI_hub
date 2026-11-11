import type { Metadata } from 'next';
import { SimplePage } from '@/components/simple-page';

export const metadata: Metadata = { title: 'About ECI-Hub', alternates: { canonical: '/about' } };

export default function About() {
  return (
    <SimplePage eyebrow="About us" title="EC&I safety engineering" actions={[['See our courses', '/courses'], ['Talk to us', '/contact', true]]}>
      <p className="mb-3">ECI-Hub is the training and consultancy brand of ECFIO Engineering Ltd. We deliver accredited CompEx, EUSR, Thames Water, DSEAR and process safety training, and specialist consultancy for high-hazard process industries.</p>
      <p>Based at Summit House, Sunbury-on-Thames, and delivering on-site across the UK. Company number 09147227.</p>
    </SimplePage>
  );
}
