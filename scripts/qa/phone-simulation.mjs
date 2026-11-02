import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { ROOT, browserPath, localEnv, readJson } from '../lib/runtime.mjs';
import { startFixtureServer } from '../fixture-server.mjs';
import { installFixtureNetwork } from '../fixture-network.mjs';

const out = path.join(ROOT, '.local/qa/phone'); fs.mkdirSync(out, { recursive: true });
const { server, url } = await startFixtureServer(5199);
let browser;
try {
  browser = await chromium.launch({ executablePath: browserPath(), headless: true, env: localEnv() });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'fa-IR', serviceWorkers: 'block' });
  const network = await installFixtureNetwork(context);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByPlaceholder('جستجو در اتصالات...').waitFor({ timeout: 120000 });
  for (const [key, state] of Object.entries(readJson(path.join(ROOT, 'external-apps/bale.json')).states)) {
    await page.evaluate(state => window.dispatchEvent(new CustomEvent('tutorial-surface', { detail: { kind: 'phone', app: 'bale', state } })), key);
    await page.getByRole('heading', { name: state.title, exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.getByText('بازسازی آموزشی بله · متن پیام‌ها خلاصه شده', { exact: true }).waitFor();
    const phone = await page.locator('.training-phone').boundingBox();
    assert.ok(phone.x >= 0 && phone.y >= 0 && phone.x + phone.width <= 1600 && phone.y + phone.height <= 1000, 'phone fits video viewport');
    const target = await page.getByRole('button', { name: state.button, exact: true }).boundingBox();
    assert.ok(target.height >= 44, 'touch target is readable and large enough');
    await page.screenshot({ path: path.join(out, key + '.png') });
  }
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('tutorial-surface', { detail: { kind: 'product' } })));
  await page.getByPlaceholder('جستجو در اتصالات...').waitFor();
  assert.deepEqual(errors, []); assert.deepEqual(network.failures, []);
  console.log('PASS: five phone states, disclosure, readable targets, viewport bounds, return to real product, no page/network errors');
} finally { if (browser) await browser.close(); await server.close(); }
