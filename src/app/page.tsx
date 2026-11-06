import { Hero, Button } from '@/components/ui';

// Placeholder home. Build the full homepage from docs/design/Main.dc.html in Phase 1.
export default function Home() {
  return (
    <>
      <Hero
        eyebrow="EC and I safety engineering"
        title="Competence that holds up when it matters"
        sub="Accredited training and specialist consultancy for COMAH, chemical, oil and gas, and water sites."
      />
      <div className="grid gap-px bg-hairline md:grid-cols-2">
        <div className="bg-white p-8">
          <h2 className="mb-2 text-xl font-bold text-ink">Book a course</h2>
          <p className="mb-4">For yourself or your team. Pay by card, Apple Pay or Google Pay.</p>
          <Button href="/courses">Choose a course</Button>
        </div>
        <div className="bg-ink p-8">
          <h2 className="mb-2 text-xl font-bold text-white">Open a credit account</h2>
          <p className="mb-4 text-white/80">Book any course for your team and pay one invoice at the end of each month.</p>
          <Button href="/accounts/apply">Apply for an account</Button>
        </div>
      </div>
    </>
  );
}
