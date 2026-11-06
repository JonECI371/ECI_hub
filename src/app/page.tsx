import { Hero, Button } from '@/components/ui';

// Placeholder home. Build the full homepage from docs/design/Main.dc.html in Phase 1.
export default function Home() {
  return (
    <>
      <Hero
        eyebrow="EC and I safety engineering"
        title="Stories that stay with you, skills that protect"
        sub="Accredited training and specialist high hazard Process Industries | COMAH, Chemical, Oil and Gas, and Water and Waste Treatment. Delivered by engineers who have worked on them."
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
