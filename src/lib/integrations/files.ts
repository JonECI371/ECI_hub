import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Stores a registration ID file. With ID_DOCS_BUCKET set it goes to the private S3 bucket,
 * whose lifecycle rule deletes it after 30 days. Without one (dev, test server) it is written
 * to a local folder that is never served publicly.
 */
export async function storeIdFile(prefix: string, file: File): Promise<string> {
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
  const key = `${prefix}/${randomUUID()}.${ext}`;
  const body = Buffer.from(await file.arrayBuffer());
  const bucket = process.env.ID_DOCS_BUCKET;
  if (bucket) {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    await new S3Client({ region: process.env.AWS_REGION }).send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: file.type, ServerSideEncryption: 'AES256' }),
    );
    return `s3:${key}`;
  }
  const dir = path.join(process.env.LOCAL_UPLOAD_DIR ?? path.join(process.cwd(), '.uploads'), path.dirname(key));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(path.join(dir, path.basename(key)), body, { mode: 0o600 });
  return `local:${key}`;
}
