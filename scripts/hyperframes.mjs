import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { ROOT, localEnv } from './lib/runtime.mjs';
import { assertApproval } from './approval.mjs';
import { readJson } from './lib/runtime.mjs';
const args = process.argv.slice(2);
if (args[0] === 'render') {
  const project = path.resolve(args[1] || ROOT);
  const relative = path.relative(path.join(ROOT, '.local/projects'), project);
  const id = relative.split(path.sep)[0];
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('مسیر رندر باید به یک آموزش ثبت‌شده تعلق داشته باشد.');
  const approval = assertApproval(id);
  const composition = readJson(path.join(ROOT, '.local/projects', id, 'composition.json'));
  if (path.resolve(composition.project) !== project || composition.approvalHash !== approval.hash) throw new Error('تدوین این نسخه تأیید نشده است.');
}
const require = createRequire(import.meta.url);
const pkgPath = require.resolve('hyperframes/package.json');
const pkg = require(pkgPath);
const entry = path.join(path.dirname(pkgPath), typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.hyperframes);
const result = spawnSync(process.execPath, ['--require', path.join(ROOT, 'scripts/runtime-home.cjs'), entry, ...args], { cwd: ROOT, env: localEnv(), stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
