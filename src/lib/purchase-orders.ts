import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { storeFile, sniffType, UploadError } from '@/lib/integrations/files';

type Db = Prisma.TransactionClient | typeof db;

export const PO_MAX_FILES = 5;
export const PO_MAX_BYTES = 10 * 1024 * 1024;

/** "po 4500-221" and "PO4500221" are the same purchase order. */
export const poKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 50);

/** Pounds typed by the booker ("1,250", "£1250.50") to pence; null when empty or not a sensible amount. */
export function parsePoValue(raw: string): number | null | 'bad' {
  const t = raw.replace(/[£,\s]/g, '');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return 'bad';
  return Math.round(n * 100);
}

/** Creates the PO the first time its number is used, and records its value when one is given. */
export async function upsertPurchaseOrder(tx: Db, accountId: string, number: string, valuePence: number | null) {
  const key = poKey(number);
  if (!key) return null;
  return tx.purchaseOrder.upsert({
    where: { accountId_key: { accountId, key } },
    create: { accountId, number: number.trim().slice(0, 50), key, valuePence },
    update: valuePence ? { valuePence } : {},
  });
}

/** Checked before the booking is made, so a bad file stops the booking instead of arriving after it. */
export async function checkPoFiles(files: File[]): Promise<string | null> {
  const real = files.filter((f) => f.size > 0);
  if (real.length > PO_MAX_FILES) return `Attach up to ${PO_MAX_FILES} files.`;
  for (const f of real) {
    if (f.size > PO_MAX_BYTES) return `${f.name} is over 10 MB.`;
    const head = new Uint8Array(await f.slice(0, 16).arrayBuffer());
    if (!sniffType(head)) return `${f.name} is not a PDF, JPEG, PNG or WebP file.`;
  }
  return null;
}

/** Stores the files against the booking's PO. Called after the booking is made. */
export async function attachPoFiles(accountId: string, number: string, files: File[], personId: string) {
  const real = files.filter((f) => f.size > 0).slice(0, PO_MAX_FILES);
  if (!real.length) return;
  const po = await upsertPurchaseOrder(db, accountId, number, null);
  if (!po) return;
  for (const f of real) {
    try {
      const fileKey = await storeFile('files', `po/${accountId}`, f);
      const row = await db.poFile.create({ data: { purchaseOrderId: po.id, fileKey, fileName: f.name.slice(0, 200), contentType: f.type, sizeBytes: f.size, uploadedById: personId } });
      await db.auditLog.create({ data: { actorId: personId, action: 'PO_FILE_ADDED', recordType: 'PurchaseOrder', recordId: po.id, after: { fileId: row.id, fileName: row.fileName } } });
    } catch (e) {
      if (!(e instanceof UploadError)) throw e;
    }
  }
}

export type PoRow = { id: string | null; number: string; valuePence: number | null; billedPence: number; leftPence: number | null; files: { id: string; fileName: string; sizeBytes: number }[] };

/** Every PO used on the account, with what has been billed against it (statement lines, so refunds and reductions count). */
export async function poSummary(accountId: string): Promise<PoRow[]> {
  const [pos, lines, bookings] = await Promise.all([
    db.purchaseOrder.findMany({ where: { accountId }, include: { files: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' } }),
    db.statementLine.findMany({ where: { statement: { accountId }, booking: { poNumber: { not: null } } }, select: { netPence: true, vatPence: true, booking: { select: { poNumber: true } } } }),
    db.booking.findMany({ where: { accountId, poNumber: { not: null } }, select: { poNumber: true }, distinct: ['poNumber'] }),
  ]);
  const billed = new Map<string, number>();
  for (const l of lines) { const k = poKey(l.booking.poNumber ?? ''); if (k) billed.set(k, (billed.get(k) ?? 0) + l.netPence + l.vatPence); }
  const rows: PoRow[] = pos.map((p) => {
    const b = billed.get(p.key) ?? 0;
    return { id: p.id, number: p.number, valuePence: p.valuePence, billedPence: b, leftPence: p.valuePence == null ? null : p.valuePence - b, files: p.files.map((f) => ({ id: f.id, fileName: f.fileName, sizeBytes: f.sizeBytes })) };
  });
  const known = new Set(pos.map((p) => p.key));
  for (const b of bookings) {
    const k = poKey(b.poNumber ?? '');
    if (k && !known.has(k)) { known.add(k); rows.push({ id: null, number: b.poNumber!, valuePence: null, billedPence: billed.get(k) ?? 0, leftPence: null, files: [] }); }
  }
  return rows;
}
