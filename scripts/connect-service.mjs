import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { ROOT, appRoot, browserPath, localEnv, writeJson } from './lib/runtime.mjs';

// A separate interactive login is only for service access, never for recording a personal desktop.
const applicationUrl = process.argv[2] || process.env.TAZE_APP_URL || 'https://app.tazesystem.ir';
const origin = new URL(applicationUrl);
if (origin.protocol !== 'https:') throw new Error('ورود به حساب فقط روی HTTPS مجاز است.');
const productEnv = path.join(appRoot(), '.env.local');
const publicConfig = {};
if (fs.existsSync(productEnv)) {
  for (const line of fs.readFileSync(productEnv, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.*)$/);
    if (match) publicConfig[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}
let baseUrl = process.env.TAZE_AI_URL || publicConfig.VITE_SUPABASE_URL;
let anonKey = process.env.TAZE_AI_ANON_KEY || publicConfig.VITE_SUPABASE_ANON_KEY;
if (process.platform === 'linux' && !process.env.DISPLAY) throw new Error('در محیط بدون نمایشگر، نشست حساب تولیدکننده را از secrets همان محیط تنظیم کنید.');
const browser = await chromium.launch({ executablePath: browserPath(), headless: false, env: localEnv() });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Read the public gateway configuration from the official app's own auth request.
  // Coworkers need their own login, not a copy of another person's .env file.
  const gateways = new Map();
  page.on('request', request => {
    const url = new URL(request.url());
    const key = request.headers().apikey;
    if (url.protocol === 'https:' && url.pathname.startsWith('/auth/v1/') && key) gateways.set(url.origin, key);
  });
  await page.goto(applicationUrl, { waitUntil: 'domcontentloaded' });
  console.log('در پنجرهٔ جداگانه وارد حساب تولیدکنندهٔ آموزش شوید. رمز و نشست در خروجی چاپ نمی‌شود.');
  const readSession = () => {
    for (const key of Object.keys(localStorage).filter(key => /^sb-.+-auth-token$/.test(key))) {
      try { const session = JSON.parse(localStorage.getItem(key)); if (session?.access_token && session.expires_at * 1000 > Date.now()) return session; } catch {}
    }
    return null;
  };
  await page.waitForFunction(readSession, null, { timeout: 300000 });
  const session = await page.evaluate(readSession);
  const claims = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString('utf8'));
  const issuer = new URL(claims.iss);
  if (issuer.protocol !== 'https:') throw new Error('نشست ورود باید متعلق به سرویس HTTPS باشد.');
  if (baseUrl && new URL(baseUrl).origin !== issuer.origin) throw new Error('نشست ورود با سرویس تنظیم‌شده تطابق ندارد.');
  baseUrl ||= issuer.origin;
  anonKey ||= gateways.get(issuer.origin);
  if (!anonKey) throw new Error('تنظیم عمومی سرویس از ورود رسمی شناسایی نشد؛ TAZE_AI_ANON_KEY را از تنظیم عمومی محصول وارد کنید.');
  const file = path.join(ROOT, '.local/service-session.json');
  writeJson(file, { baseUrl, anonKey, accessToken: session.access_token, expiresAt: session.expires_at });
  if (process.platform !== 'win32') fs.chmodSync(file, 0o600);
  console.log('نشست تولید صدا ذخیره شد. این فایل خصوصی است؛ در بستهٔ انتقال یا Git قرار نمی‌گیرد.');
} finally { await browser.close(); }
