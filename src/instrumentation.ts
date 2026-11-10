/** Starts the scheduled jobs (reminders, waitlist) inside the server process when RUN_JOBS=1. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.RUN_JOBS === '1') {
    const { startJobs } = await import('@/lib/jobs');
    startJobs();
  }
}
