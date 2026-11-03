import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import ffprobePackage from '@ffprobe-installer/ffprobe';
import { chromium } from 'playwright-core';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(ROOT, '.cache', 'browsers');
export const appRoot = () => path.resolve(process.env.KALAMAPP_ROOT || path.join(ROOT, '../Kalamapp'));
export const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}
export function jobPath(id) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id || '')) throw new Error('شناسهٔ آموزش نامعتبر است.');
  const base = path.join(ROOT, '.local', 'projects');
  const target = path.join(base, id);
  for (let p = target; p !== path.dirname(p); p = path.dirname(p)) {
    if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()) throw new Error('مسیر خروجی نباید لینک باشد.');
  }
  return target;
}
export function browserPath() {
  const caches = [path.join(ROOT, '.cache/browsers'), process.env.PLAYWRIGHT_BROWSERS_PATH, '/ms-playwright'].filter(Boolean);
  const installed = caches.flatMap(base => fs.existsSync(base) ? fs.readdirSync(base).flatMap(folder => [
    path.join(base, folder, 'chrome-linux64/chrome'), path.join(base, folder, 'chrome-linux/chrome'),
    path.join(base, folder, 'chrome-win64/chrome.exe'), path.join(base, folder, 'chrome-win/chrome.exe'),
    path.join(base, folder, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium')]) : []);
  return [process.env.TUTORIAL_BROWSER_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', ...installed, chromium.executablePath()].find(p => p && fs.existsSync(p));
}
export function localEnv() {
  const cache = path.join(ROOT, '.cache');
  const temp = path.resolve(process.env.TUTORIAL_TEMP_DIR || path.join(cache, 'temp')); fs.mkdirSync(temp, { recursive: true });
  return { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp, npm_config_cache: path.join(cache, 'npm'),
    XDG_CACHE_HOME: cache, HYPERFRAMES_NO_UPDATE_CHECK: '1', HYPERFRAMES_SKIP_SKILLS: '1',
    TUTORIAL_RUNTIME_HOME: path.join(cache, 'tool-home'), XDG_CONFIG_HOME: path.join(cache, 'config'),
    LOCALAPPDATA: path.join(cache, 'appdata/local'), APPDATA: path.join(cache, 'appdata/roaming'),
    HYPERFRAMES_TELEMETRY_DISABLED: '1', HYPERFRAMES_BROWSER_PATH: browserPath(),
    PLAYWRIGHT_BROWSERS_PATH: path.join(cache, 'browsers'), PUPPETEER_CACHE_DIR: path.join(cache, 'browsers'),
    PATH: [path.dirname(ffmpeg), path.dirname(ffprobePackage.path), process.env.PATH].join(path.delimiter) };
}
export const tools = { ffmpeg, ffprobe: ffprobePackage.path };
export function probe(file) {
  return JSON.parse(execFileSync(tools.ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], { encoding: 'utf8', env: localEnv() }));
}
export function scenario(id) {
  jobPath(id);
  const flow = readJson(path.join(ROOT, 'tutorials', id + '.json'));
  if (flow.id !== id || !Array.isArray(flow.steps) || !flow.steps.length) throw new Error('سناریو معتبر نیست.');
  const ids = new Set();
  for (const step of flow.steps) {
    if (!/^[a-z0-9-]+$/.test(step.id || '') || ids.has(step.id) || !step.say?.trim()) throw new Error('گام‌ها باید شناسهٔ یکتا و متن داشته باشند.');
    ids.add(step.id);
    if (step.seconds !== undefined && (!Number.isFinite(step.seconds) || step.seconds < 1 || step.seconds > 60)) throw new Error('زمان گام نامعتبر است.');
    if (step.surface) {
      if (step.surface.kind !== 'phone' || !/^[a-z0-9-]+$/.test(step.surface.app || '')) throw new Error('سطح بازسازی برنامهٔ بیرونی نامعتبر است.');
      const model = readJson(path.join(ROOT, 'external-apps', step.surface.app + '.json'));
      if (!model.disclosure || !model.sourceUrls?.length || !model.states[step.surface.state]) throw new Error('بازسازی برنامهٔ بیرونی باید منبع، برچسب و صحنهٔ مشخص داشته باشد.');
    }
  }
  return flow;
}
