import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { appRoot } from './lib/runtime.mjs';

const target = appRoot();
const repository = 'https://github.com/FarzadKalam/KalamApp.git';
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' && command === 'npm' });
  if (result.error || result.status !== 0) throw new Error('دریافت سورس یا نصب وابستگی‌های محصول کامل نشد؛ دسترسی حساب خودتان به KalamApp را بررسی کنید.');
}
if (!fs.existsSync(target)) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  run('git', ['clone', '--', repository, target], path.dirname(target));
} else if (!fs.existsSync(path.join(target, '.git')) || !fs.existsSync(path.join(target, 'pages/Settings/ConnectionsTab.tsx'))) {
  throw new Error('مسیر KALAMAPP_ROOT باید checkout واقعی KalamApp باشد؛ پوشهٔ موجود بازنویسی نمی‌شود.');
}
// Never reset or pull a coworker's existing working tree.
run('npm', ['ci'], target);
console.log('سورس محصول و وابستگی‌هایش آماده‌اند. برای بررسی محیط آموزشی npm run preflight را اجرا کنید.');
