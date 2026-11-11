import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { db } from '@/lib/db';

/**
 * Xero accounting API (OAuth 2.0, authorisation code). Connected once from Admin Settings by a Super Admin.
 * Tokens are kept encrypted in the database; the refresh token rotates on every refresh, so refreshing is serialised.
 * Calls are retried safely: every write carries an Idempotency-Key.
 */
const AUTH = 'https://login.xero.com/identity/connect/authorize';
const TOKEN = 'https://identity.xero.com/connect/token';
const API = 'https://api.xero.com/api.xro/2.0';
export const XERO_SCOPES = process.env.XERO_SCOPES ?? 'offline_access accounting.invoices accounting.payments accounting.contacts accounting.settings.read';

export const xeroConfigured = () => !!process.env.XERO_CLIENT_ID && !!process.env.XERO_CLIENT_SECRET;
export const xeroRedirectUri = () => `${process.env.SITE_URL ?? 'http://localhost:3000'}/admin/xero/callback`;
export class XeroError extends Error { constructor(msg: string, readonly status = 0, readonly retryable = true) { super(msg); } }

const key = () => createHash('sha256').update(`xero:${process.env.AUTH_SECRET ?? ''}`).digest();
export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
export function unseal(sealed: string): string {
  const [iv, tag, enc] = sealed.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

type Conn = { tenantId: string; tenantName: string; refresh: string; access: string; expiresAt: number; connectedAt: string };
const loadConn = async (): Promise<Conn | null> => ((await db.setting.findUnique({ where: { key: 'xero_connection' } }))?.value as Conn | null) ?? null;
const saveConn = (c: Conn) => db.setting.upsert({ where: { key: 'xero_connection' }, create: { key: 'xero_connection', value: c }, update: { value: c } });

export async function xeroStatus(): Promise<{ configured: boolean; connected: boolean; tenantName?: string; connectedAt?: string }> {
  const c = await loadConn();
  return { configured: xeroConfigured(), connected: !!c, tenantName: c?.tenantName, connectedAt: c?.connectedAt };
}
export const disconnectXero = () => db.setting.deleteMany({ where: { key: 'xero_connection' } });

export function authorizeUrl(state: string) {
  const u = new URL(AUTH);
  u.search = new URLSearchParams({ response_type: 'code', client_id: process.env.XERO_CLIENT_ID ?? '', redirect_uri: xeroRedirectUri(), scope: XERO_SCOPES, state }).toString();
  return u.toString();
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(15000),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !j.access_token || !j.refresh_token) throw new XeroError(`Xero sign-in failed: ${j.error ?? res.status}`, res.status, res.status >= 500);
  return { access: j.access_token, refresh: j.refresh_token, expiresAt: Date.now() + (j.expires_in ?? 1800) * 1000 };
}

/** Finishes the connection: swaps the code for tokens and stores the organisation. */
export async function completeConnection(code: string) {
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: xeroRedirectUri() });
  const res = await fetch('https://api.xero.com/connections', { headers: { Authorization: `Bearer ${t.access}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  const orgs = (await res.json().catch(() => [])) as { tenantId: string; tenantName: string }[];
  if (!res.ok || !orgs.length) throw new XeroError('No Xero organisation was shared with this app.', res.status, false);
  const c: Conn = { tenantId: orgs[0].tenantId, tenantName: orgs[0].tenantName, refresh: seal(t.refresh), access: seal(t.access), expiresAt: t.expiresAt, connectedAt: new Date().toISOString() };
  await saveConn(c);
  return c.tenantName;
}

async function accessToken(): Promise<{ token: string; tenantId: string }> {
  let c = await loadConn();
  if (!c) throw new XeroError('Xero is not connected.', 0, false);
  if (c.expiresAt - Date.now() > 60000) return { token: unseal(c.access), tenantId: c.tenantId };
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('xero-refresh'))`;
    const row = (await tx.setting.findUnique({ where: { key: 'xero_connection' } }))?.value as Conn | undefined;
    if (!row) throw new XeroError('Xero is not connected.', 0, false);
    if (row.expiresAt - Date.now() > 60000) { c = row; return; } // someone else just refreshed
    const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: unseal(row.refresh) });
    c = { ...row, refresh: seal(t.refresh), access: seal(t.access), expiresAt: t.expiresAt };
    await tx.setting.update({ where: { key: 'xero_connection' }, data: { value: c } });
  });
  return { token: unseal(c!.access), tenantId: c!.tenantId };
}

/** One Xero API call. Writes pass an idempotency key so a retry never creates a second invoice. */
export async function xero<T = Record<string, unknown>>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { token, tenantId } = await accessToken();
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'xero-tenant-id': tenantId, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey.slice(0, 128) } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 429 && attempt < 3) { await new Promise((r) => setTimeout(r, Math.min(30, Number(res.headers.get('retry-after')) || 5) * 1000)); continue; }
    const text = await res.text();
    const j = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!res.ok) {
      const detail = (j.Message as string) ?? ((j.Elements as { ValidationErrors?: { Message: string }[] }[] | undefined)?.[0]?.ValidationErrors?.map((e) => e.Message).join('; ')) ?? text.slice(0, 200);
      throw new XeroError(`Xero ${res.status}: ${detail}`.slice(0, 400), res.status, res.status >= 500 || res.status === 429);
    }
    return j as T;
  }
  throw new XeroError('Xero is busy. Will retry.', 429, true);
}

export const xeroLink = (invoiceId: string) => `https://go.xero.com/app/invoicing/view/${invoiceId}`;
