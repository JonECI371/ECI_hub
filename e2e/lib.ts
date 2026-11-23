import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { totpAt } from '../src/lib/totp';
import { TOTP_SECRET } from './fixtures';

const require = createRequire(import.meta.url);
// Playwright comes with the Claude Code environment; the project does not depend on it.
export const { chromium } = require('playwright') as typeof import('playwright');
export type Page = import('playwright').Page;
export type Browser = import('playwright').Browser;

export const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
export const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

export const results: { ok: boolean; name: string; note?: string }[] = [];
export function check(ok: boolean, name: string, note?: string) {
  results.push({ ok, name, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && note ? `  (${note})` : ''}`);
}
/** Runs one named check; a thrown error is a failure (with a screenshot), never a crash of the whole run. */
export async function step(name: string, page: Page | null, fn: () => Promise<void>) {
  try { await fn(); } catch (e) {
    check(false, name, (e as Error).message.split('\n')[0].slice(0, 160));
    if (page) await page.screenshot({ path: `${OUT}${name.replace(/\W+/g, '-').slice(0, 60)}.png` }).catch(() => {});
  }
}

export const authCode = () => totpAt(TOTP_SECRET, Math.floor(Date.now() / 30000));

export async function newPage(br: Browser, width = 1100, height = 850) {
  const ctx = await br.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(60000); // a development copy compiles each page the first time it is opened
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource.*(401|403|404)/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  return { page, ctx, errors };
}

/** Customer sign-in with the emailed code. On a local copy the code is shown on the page (test mode). */
export async function customerLogin(page: Page, email: string, next = '/account') {
  await page.goto(`${BASE}/login?next=${encodeURIComponent(next)}`);
  await page.fill('input[name=email]', email);
  await page.click('button[type=submit]');
  await page.waitForURL(/step=code/);
  const text = await page.locator('strong.font-mono').innerText();
  await page.fill('input[name=code]', text.trim());
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
}

/** Admin, Super Admin and trainer sign-in: email, then the authenticator code. */
export async function staffLogin(page: Page, email: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name=email]', email);
  await page.click('button[type=submit]');
  await page.waitForURL(/step=staff/);
  await page.fill('input[name=code]', authCode());
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
}

export const bodyText = (p: Page) => p.locator('body').innerText();
