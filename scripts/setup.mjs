import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ROOT, browserPath, localEnv } from './lib/runtime.mjs';
const require = createRequire(import.meta.url);
if (browserPath()) console.log('مرورگر موجود برای ضبط headless آماده است.');
else {
  const cli = path.join(path.dirname(require.resolve('playwright-core/package.json')), 'cli.js');
  const result = spawnSync(process.execPath, [cli, 'install', ...(process.platform === 'linux' ? ['--with-deps'] : []), 'chromium'], { env: localEnv(), stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('آماده‌سازی مرورگر در محیط جاری کامل نشد.');
  const marker = path.join(ROOT, '.cache', 'browser-ready.txt'); fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(marker, 'Playwright Chromium installed\n');
}
