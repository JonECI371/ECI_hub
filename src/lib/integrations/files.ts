import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * File storage. Two areas:
 *  - 'id': registration photo ID; the S3 bucket deletes files after 30 days (ID_DOCS_BUCKET).
 *  - 'files': everything else, e.g. trainer certificates and course photos (FILES_BUCKET).
 * Without a bucket (dev, test server) files go to a private local folder that is never served directly.
 * Keys look like "s3:<area>/<path>" or "local:<area>/<path>".
 */
type Area = 'id' | 'files';
const bucketFor = (area: Area) => (area === 'id' ? process.env.ID_DOCS_BUCKET : process.env.FILES_BUCKET);
const localRoot = () => process.env.LOCAL_UPLOAD_DIR ?? path.join(process.cwd(), '.uploads');

export const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export class UploadError extends Error {}

/** The real type from the file's first bytes. The type the browser reports is never trusted. */
export function sniffType(b: Uint8Array): string | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (at(0, 0x25, 0x50, 0x44, 0x46)) return 'application/pdf'; // %PDF
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp'; // RIFF....WEBP
  return null;
}

export async function storeFile(area: Area, prefix: string, file: File): Promise<string> {
  const body = Buffer.from(await file.arrayBuffer());
  const type = sniffType(body);
  if (!type || type !== file.type) throw new UploadError('The file is not a PDF, JPEG, PNG or WebP.');
  const rel = `${area}/${prefix}/${randomUUID()}.${EXT[type]}`;
  const bucket = bucketFor(area);
  if (bucket) {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    await new S3Client({ region: process.env.AWS_REGION }).send(new PutObjectCommand({ Bucket: bucket, Key: rel, Body: body, ContentType: type, ServerSideEncryption: 'AES256' }));
    return `s3:${rel}`;
  }
  const full = path.join(localRoot(), rel);
  await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
  await writeFile(full, body, { mode: 0o600 });
  return `local:${rel}`;
}

/** Registration ID files (kept for compatibility with existing keys). */
export const storeIdFile = (prefix: string, file: File) => storeFile('id', prefix, file);

export async function readStoredFile(key: string): Promise<{ body: Buffer; type: string } | null> {
  const [kind, rel] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  if (!rel || rel.includes('..')) return null;
  const ext = rel.split('.').pop() ?? '';
  const type = Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream';
  if (kind === 'local') {
    try { return { body: await readFile(path.join(localRoot(), rel)), type }; } catch { return null; }
  }
  if (kind === 's3') {
    const area = rel.split('/')[0] as Area;
    const bucket = bucketFor(area);
    if (!bucket) return null;
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const r = await new S3Client({ region: process.env.AWS_REGION }).send(new GetObjectCommand({ Bucket: bucket, Key: rel }));
    return { body: Buffer.from(await r.Body!.transformToByteArray()), type };
  }
  return null;
}
