import 'server-only';
import type { Person, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requirePerson } from '@/lib/auth';

export const requireAdmin = (next = '/admin'): Promise<Person> => requirePerson(['ADMIN', 'SUPER_ADMIN'], next);

/** Write an audit row for an admin change. */
export function audit(actorId: string, action: string, recordType: string, recordId: string, before?: unknown, after?: unknown) {
  return db.auditLog.create({ data: { actorId, action, recordType, recordId, before: before as Prisma.InputJsonValue, after: after as Prisma.InputJsonValue } });
}

export const TASK_LABEL: Record<string, string> = {
  ELEARNING_ENROLMENT: 'eLearning enrolment',
  REGISTRATION_APPROVAL: 'Registration to check',
  CERTIFICATE_UPLOAD: 'Certificates to upload',
  DATE_CHANGE: 'Date change',
  ACCOUNT_APPLICATION: 'Credit account',
  BOOKER_APPROVAL: 'New booker',
  MONTH_END_BILLING: 'Month-end billing',
  EMAIL_BOUNCE: 'Bounced email',
  INTEGRATION_FAILURE: 'Integration failure',
};
