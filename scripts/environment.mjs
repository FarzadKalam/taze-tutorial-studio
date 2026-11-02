import fs from 'node:fs';
import path from 'node:path';
import { ROOT, appRoot, browserPath, localEnv, tools, writeJson } from './lib/runtime.mjs';

export function describeEnvironment(env = process.env, platform = process.platform) {
  const declared = env.TUTORIAL_ENVIRONMENT_KIND;
  if (declared && !['codex-cloud', 'container', 'local'].includes(declared)) throw new Error('نوع محیط اجرا نامعتبر است.');
  const inferred = env.CODEX_CLOUD === '1' || env.CODEX_ENVIRONMENT_ID ? 'codex-cloud'
    : fs.existsSync('/.dockerenv') ? 'container' : 'local';
  return { kind: declared || inferred, detection: declared ? 'declared' : 'best-effort', platform,
    policy: 'current-environment-first', desktopCapture: false, browser: !!browserPath(),
    productSource: fs.existsSync(path.join(appRoot(), 'pages/Settings/ConnectionsTab.tsx')),
    ffmpeg: fs.existsSync(tools.ffmpeg), ffprobe: fs.existsSync(tools.ffprobe),
    remoteExecutorProvisioned: false };
}
export async function preflight() {
  const report = describeEnvironment();
  if (report.browser) {
    const { chromium } = await import('playwright-core');
    try {
      const browser = await chromium.launch({ executablePath: browserPath(), headless: true, env: localEnv() });
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.setContent('<html lang="fa" dir="rtl"><body>آزمایش محیط ضبط</body></html>');
      const target = path.join(ROOT, '.local/environment-probe.png'); fs.mkdirSync(path.dirname(target), { recursive: true });
      await page.screenshot({ path: target });
      report.browserLaunch = true;
      await browser.close();
    } catch (error) { report.browserLaunch = false; report.browserError = error.message.split('\n')[0]; }
  }
  report.ready = !!(report.browserLaunch && report.productSource && report.ffmpeg && report.ffprobe);
  report.nextAction = report.ready ? 'run-in-current-environment' : 'install-missing-tools-or-transfer-job-to-local';
  writeJson(path.join(ROOT, '.local/environment.json'), report);
  console.log(JSON.stringify(report, null, 2));
  return report;
}
