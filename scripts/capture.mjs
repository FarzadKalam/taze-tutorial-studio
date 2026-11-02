import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { ROOT, appRoot, browserPath, jobPath, localEnv, probe, readJson, scenario, tools, writeJson } from './lib/runtime.mjs';
import { startFixtureServer } from './fixture-server.mjs';
import { installFixtureNetwork } from './fixture-network.mjs';
import { loadProductBrand } from './product-brand.mjs';
import { fingerprint } from './workflow.mjs';
import { assertApproval } from './approval.mjs';

export function locatorFor(page, target) {
  if (target.css) return page.locator(target.css);
  if (target.placeholder) return page.getByPlaceholder(target.placeholder, { exact: true });
  if (target.label) return page.getByLabel(target.label, { exact: true });
  if (target.role) return page.getByRole(target.role, { name: target.name, exact: true });
  if (target.text) return page.getByText(target.text, { exact: true });
  throw new Error('هدف مرحله تعریف نشده است.');
}
async function act(page, action, events, timeOrigin = null) {
  if (action.op === 'hold') return;
  const element = locatorFor(page, action.target);
  await element.waitFor({ state: 'visible' });
  await element.scrollIntoViewIfNeeded();
  const box = await element.boundingBox();
  if (box) {
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(point.x, point.y, { steps: 14 });
    events.push({ ...point, op: action.op, time: timeOrigin === null ? 0 : (performance.now() - timeOrigin) / 1000, box });
  }
  if (action.op === 'click') await element.click();
  else if (action.op === 'fill') await element.fill(action.value);
  else if (action.op === 'type') { await element.fill(''); await element.pressSequentially(action.value, { delay: 65 }); }
  else throw new Error(`عملیات ناشناخته: ${action.op}`);
  if (action.expect) await locatorFor(page, action.expect).waitFor({ state: 'visible' });
}
export async function capture(id) {
  const approval = assertApproval(id);
  const flow = scenario(id), job = jobPath(id);
  const take = path.join(job, 'takes', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(path.join(take, 'assets'), { recursive: true });
  writeJson(path.join(job, 'status.json'), { phase: 'capturing', trainingOnly: true });
  const { server, url } = await startFixtureServer();
  let browser, network;
  const errors = [];
  try {
    browser = await chromium.launch({ executablePath: browserPath(), headless: true, env: localEnv() });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, locale: 'fa-IR', serviceWorkers: 'block' });
    network = await installFixtureNetwork(context);
    const page = await context.newPage(); page.setDefaultTimeout(25000);
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByPlaceholder('جستجو در اتصالات...').waitFor({ timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);
    const brand = await loadProductBrand();
    await page.evaluate(primary => {
      const cursor = document.createElement('div'); cursor.id = 'tutorial-cursor';
      Object.assign(cursor.style, { position: 'fixed', width: '23px', height: '23px', border: `3px solid ${primary}`, borderRadius: '50%',
        background: '#ffffffaa', zIndex: '2147483647', pointerEvents: 'none', left: '-60px', top: '-60px', boxShadow: '0 1px 5px #0003' });
      document.body.appendChild(cursor);
      document.addEventListener('mousemove', event => { cursor.style.left = `${event.clientX - 11}px`; cursor.style.top = `${event.clientY - 11}px`; });
      let lastTrailAt = 0;
      document.addEventListener('mousemove', event => {
        if (document.documentElement.dataset.tutorialPointerMode === 'touch' || performance.now() - lastTrailAt < 24) return;
        lastTrailAt = performance.now();
        const dot = document.createElement('div');
        Object.assign(dot.style, { position: 'fixed', left: `${event.clientX - 4}px`, top: `${event.clientY - 4}px`, width: '8px', height: '8px', borderRadius: '50%', background: primary, zIndex: '2147483646', pointerEvents: 'none' });
        document.body.appendChild(dot);
        dot.animate([{ opacity: 0.25 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }).finished.then(() => dot.remove());
      });
      document.addEventListener('mousedown', event => {
        const ring = document.createElement('div');
        Object.assign(ring.style, { position: 'fixed', left: `${event.clientX - 13}px`, top: `${event.clientY - 13}px`, width: '26px', height: '26px', border: `2px solid ${primary}`, borderRadius: '50%', zIndex: '2147483647', pointerEvents: 'none' });
        document.body.appendChild(ring);
        ring.animate([{ transform: 'scale(1)', opacity: 0.75 }, { transform: 'scale(2.6)', opacity: 0 }], { duration: 460, fill: 'forwards' }).finished.then(() => ring.remove());
      });
      document.addEventListener('mousedown', () => { cursor.style.background = primary; });
      document.addEventListener('mouseup', () => { cursor.style.background = '#ffffffaa'; });
    }, brand.palette.primary);
    for (const action of flow.setup || []) await act(page, action, []);
    await page.waitForTimeout(600);
    if (network.failures.length || errors.length) throw new Error('محیط اولیه آماده نیست: ' + JSON.stringify({ failures: network.failures, errors }));
    const voiceFile = path.join(job, 'voice.json');
    const voice = fs.existsSync(voiceFile) ? readJson(voiceFile) : null;
    const scenes = [];
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    for (const step of flow.steps) {
      network.advanceStage(step.id);
      await page.evaluate(surface => window.dispatchEvent(new CustomEvent('tutorial-surface', { detail: surface })), step.surface || { kind: 'product' });
      await page.evaluate(isPhone => { document.documentElement.dataset.tutorialPointerMode = isPhone ? 'touch' : 'mouse'; }, step.surface?.kind === 'phone');
      await page.locator(`[data-tutorial-surface="${step.surface?.kind || 'product'}"]`).waitFor({ state: 'visible' });
      await page.waitForTimeout(250);
      const frames = [], events = [];
      const frameDir = path.join(take, 'frames', step.id); fs.mkdirSync(frameDir, { recursive: true });
      const onFrame = event => {
        cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
        const file = path.join(frameDir, String(frames.length).padStart(6, '0') + '.jpg');
        fs.writeFileSync(file, Buffer.from(event.data, 'base64'));
        frames.push({ file, timestamp: event.metadata.timestamp });
      };
      cdp.on('Page.screencastFrame', onFrame);
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 1600, maxHeight: 1000, everyNthFrame: 1 });
      const audio = voice?.clips?.find(c => c.id === step.id && c.text === step.say);
      if (voice && !audio) throw new Error(`صدای این گام با متن تازه منطبق نیست: ${step.id}`);
      const duration = audio ? Math.max(3, audio.duration + 0.8) : (step.seconds || 6);
      const started = performance.now();
      await page.waitForTimeout(audio ? 450 : 150);
      for (const action of step.actions || []) await act(page, action, events, started);
      if (step.expect) await locatorFor(page, step.expect).waitFor({ state: 'visible' });
      await page.waitForTimeout(Math.max(400, duration * 1000 - (performance.now() - started)));
      const elapsed = (performance.now() - started) / 1000;
      // Last frame anchors holds even when CDP emits no frames for a static UI.
      const still = path.join(take, 'assets', `${step.id}.png`);
      await page.screenshot({ path: still });
      await cdp.send('Page.stopScreencast'); cdp.off('Page.screencastFrame', onFrame);
      if (!frames.length) throw new Error('ضبط هیچ فریمی برنگرداند.');
      const quote = file => file.replace(/\\/g, '/').replace(/'/g, "'\\''");
      const concat = frames.map((frame, i) => `file '${quote(frame.file)}'\nduration ${Math.max(0.001, i + 1 < frames.length ? frames[i + 1].timestamp - frame.timestamp : elapsed - (frame.timestamp - frames[0].timestamp))}`).join('\n');
      const list = path.join(frameDir, 'frames.txt');
      fs.writeFileSync(list, concat + `\nfile '${quote(frames.at(-1).file)}'\n`, 'utf8');
      const clip = path.join(take, 'assets', `${step.id}.mp4`);
      execFileSync(tools.ffmpeg, ['-v', 'error', '-n', '-f', 'concat', '-safe', '0', '-i', list, '-t', elapsed.toFixed(3), '-vf', 'fps=30', '-c:v', 'libx264', '-threads', '2', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', clip], { env: localEnv() });
      scenes.push({ id: step.id, title: step.title, say: step.say, caption: step.caption, surface: step.surface || { kind: 'product' }, duration: Number(probe(clip).format.duration), clip, still, events,
        audio: audio?.file || null });
      console.log(`ضبط شد: ${step.title}`);
    }
    if (errors.length || network.failures.length) throw new Error(`خطای محیط ضبط: ${[...errors, ...network.failures.map(x => JSON.stringify(x))].join('; ')}`);
    const productGit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: appRoot(), encoding: 'utf8' }).trim();
    const manifest = { schemaVersion: 1, id, title: flow.title, approvalHash: approval.hash, inputHash: fingerprint(flow), trainingOnly: true, audioMode: voice ? 'narrated' : 'silent-review', createdAt: new Date().toISOString(),
      brand: { name: brand.name, source: brand.identitySource, fingerprint: brand.fingerprint, palette: brand.palette, logo: brand.assets.logo, fontFamily: brand.fontFamily },
      source: { commit: productGit, files: flow.sources, localDiff: execFileSync('git', ['diff', '--stat', '--', ...flow.sources], { cwd: appRoot(), encoding: 'utf8' }).trim() },
      scenes, network: network.calls, pageErrors: errors };
    writeJson(path.join(take, 'capture.json'), manifest);
    writeJson(path.join(job, 'latest.json'), { take });
    writeJson(path.join(job, 'status.json'), { phase: 'captured', audioMode: manifest.audioMode, trainingOnly: true });
    return manifest;
  } catch (error) {
    writeJson(path.join(job, 'status.json'), { phase: 'failed', stage: 'capture', message: error.message });
    if (browser) { const page = browser.contexts()[0]?.pages()[0]; if (page) {
      await page.screenshot({ path: path.join(take, 'failure.png') }).catch(() => {});
      writeJson(path.join(take, 'failure-details.json'), { body: await page.locator('body').innerText().catch(() => ''), network, errors });
    } }
    throw error;
  } finally { if (browser) await browser.close(); await server.close(); }
}
