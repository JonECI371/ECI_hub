import { SimplePage } from '@/components/simple-page';

export default function NotFound() {
  return (
    <SimplePage eyebrow="Error 404" title="We can't find that page" actions={[['All courses', '/courses'], ['Course calendar', '/courses?view=calendar', true]]}>
      <p>It may have moved, or the course may no longer be running. Try the course list or the calendar.</p>
    </SimplePage>
  );
}
