import { execSync } from 'node:child_process';

/**
 * Brings the separate test database up to the current schema before the run. Non-destructive:
 * it only applies pending migrations, and the tests create their own uniquely named records.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://eci:eci@localhost:5432/eci_test';
  if (!/eci_test/.test(url)) throw new Error('Refusing to use a database whose name does not contain eci_test');
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
}
