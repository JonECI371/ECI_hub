import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOCAL_UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'eci-sec-'));

describe('security controls', async () => {
  const { sniffType, storeFile, UploadError } = await import('@/lib/integrations/files');
  const { sessionRevoked, safeNext } = await import('@/lib/auth');

  const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  const pdf = bytes(0x25, 0x50, 0x44, 0x46);
  const file = (b: Uint8Array, type: string) => new File([b as BlobPart], 'x', { type });

  it('recognises files by content, not by the type the browser reports', () => {
    expect(sniffType(pdf)).toBe('application/pdf');
    expect(sniffType(png)).toBe('image/png');
    expect(sniffType(bytes(0xff, 0xd8, 0xff))).toBe('image/jpeg');
    expect(sniffType(new TextEncoder().encode('<script>alert(1)</script>'))).toBeNull();
    expect(sniffType(new TextEncoder().encode('MZ executable'))).toBeNull();
  });

  it('refuses uploads whose content does not match their declared type', async () => {
    await expect(storeFile('files', 'test', file(new TextEncoder().encode('<html><script>alert(1)</script>'), 'image/png'))).rejects.toBeInstanceOf(UploadError);
    await expect(storeFile('files', 'test', file(png, 'application/pdf'))).rejects.toBeInstanceOf(UploadError);
    expect(await storeFile('files', 'test', file(pdf, 'application/pdf'))).toMatch(/^local:files\/test\/.+\.pdf$/);
  });

  it('sessions started before a revocation stop working; later ones and unrevoked ones are fine', () => {
    const now = Date.now();
    expect(sessionRevoked(now - 1000, new Date(now))).toBe(true);
    expect(sessionRevoked(undefined, new Date(now))).toBe(true); // older sessions have no start time
    expect(sessionRevoked(now + 1000, new Date(now))).toBe(false);
    expect(sessionRevoked(now - 1000, null)).toBe(false);
  });

  it('only same-site paths are accepted as a place to go after signing in', () => {
    expect(safeNext('/account/bookings')).toBe('/account/bookings');
    expect(safeNext('//evil.example')).toBe('/account');
    expect(safeNext('https://evil.example')).toBe('/account');
    expect(safeNext('javascript:alert(1)')).toBe('/account');
  });
});
