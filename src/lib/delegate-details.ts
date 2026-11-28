import 'server-only';
import type { Prisma } from '@prisma/client';

export const skillguardOf = (schemeIds: unknown): string => String(((schemeIds ?? {}) as Record<string, unknown>).skillguard ?? '').trim();

type Tx = Prisma.TransactionClient;
const REFS = ' Refs: ';

/**
 * Puts each delegate's invoice reference in the booking's statement line description (one line per booking, as before),
 * while the statement is still open. Only references that differ from the booking's own PO are listed.
 */
export async function refreshLineRefs(tx: Tx, bookingId: string) {
  const b = await tx.booking.findUnique({ where: { id: bookingId }, include: { attendees: { include: { person: true }, orderBy: { id: 'asc' } } } });
  if (!b || b.method !== 'ACCOUNT') return;
  const line = await tx.statementLine.findFirst({ where: { bookingId, statement: { status: 'OPEN' }, netPence: { gt: 0 }, NOT: { description: { startsWith: 'Cancellation charge' } } } });
  if (!line) return;
  const own = (b.poNumber ?? '').trim().toLowerCase();
  const refs = b.attendees
    .filter((x) => x.status !== 'CANCELLED' && x.invoiceRef && x.invoiceRef.trim().toLowerCase() !== own)
    .map((x) => `${x.person ? `${x.person.firstName} ${x.person.lastName}` : 'Delegate'} ${x.invoiceRef}`);
  const base = line.description.includes(REFS) ? line.description.split(REFS)[0].replace(/\.$/, '') : line.description;
  const description = (refs.length ? `${base}.${REFS}${refs.join('; ')}` : base).slice(0, 300);
  if (description !== line.description) await tx.statementLine.update({ where: { id: line.id }, data: { description } });
}
