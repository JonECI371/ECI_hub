import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

type Db = Prisma.TransactionClient | typeof db;
export type XeroKind = 'CONTACT' | 'CARD_INVOICE' | 'CREDIT_NOTE' | 'ACCOUNT_DRAFT';

/** Puts something on the Xero queue. The key makes it once-only, so calling this twice never makes two documents. */
export async function enqueueXero(tx: Db, kind: XeroKind, recordType: string, recordId: string, key: string, payload: Prisma.InputJsonValue = {}) {
  await tx.xeroJob.upsert({ where: { key }, create: { key, kind, recordType, recordId, payload }, update: {} });
}
