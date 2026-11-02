import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, jobPath, probe, readJson, scenario, writeJson } from './lib/runtime.mjs';
import { assertApproval } from './approval.mjs';

export const voiceSignature = (text, settings) => createHash('sha256').update(JSON.stringify({ text, settings })).digest('hex');
export function voiceRequest(text, model, options = {}) {
  return { action: 'generate_voice_output', text, forceNewThread: true, context: { route: '/ai' },
    ...(model ? { modelOverride: model } : {}), settings: { responseFormat: 'wav', language: 'fa-IR', voiceStyle: 'warm', ...(options.voice ? { voice: options.voice } : {}),
      voiceInstructions: 'فارسی معیار ایران، شمرده و آموزشی بخوان. نام محصول تازه‌سیستم است. فقط متن داده‌شده را بخوان.', musicMode: 'off' } };
}
export async function voice(id) {
  assertApproval(id);
  const flow = scenario(id), job = jobPath(id);
  const sessionFile = path.join(ROOT, '.local/service-session.json');
  const session = fs.existsSync(sessionFile) ? readJson(sessionFile) : {};
  const base = (process.env.TAZE_AI_URL || session.baseUrl)?.replace(/\/+$/, '');
  const token = process.env.TAZE_AI_ACCESS_TOKEN || (session.expiresAt * 1000 > Date.now() ? session.accessToken : null);
  const anonKey = process.env.TAZE_AI_ANON_KEY || session.anonKey;
  if (!base || !token) throw new Error('برای تولید صدا، نشست حساب تولیدکننده در سرویس هوش مصنوعی تازه‌سیستم لازم است. راهنمای README را ببینید.');
  const endpoint = base.endsWith('/ai-assistant') ? base : `${base}/functions/v1/ai-assistant`;
  if (new URL(endpoint).protocol !== 'https:') throw new Error('سرویس صدا باید HTTPS باشد.');
  const selectedModel = process.env.TAZE_VOICE_MODEL || flow.voice?.model;
  const settings = voiceRequest('', selectedModel, flow.voice);
  const previous = fs.existsSync(path.join(job, 'voice.json')) ? readJson(path.join(job, 'voice.json')) : { clips: [] };
  const clips = [];
  fs.mkdirSync(path.join(job, 'audio'), { recursive: true });
  for (const step of flow.steps) {
    const signature = voiceSignature(step.say, { endpoint, settings });
    const cached = previous.clips.find(c => c.id === step.id && c.signature === signature && fs.existsSync(c.file));
    if (cached) { clips.push(cached); continue; }
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
      ...(anonKey ? { apikey: anonKey } : {}) },
      body: JSON.stringify(voiceRequest(step.say, selectedModel, flow.voice)), signal: AbortSignal.timeout(180000) });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(`تولید صدای گام «${step.title}» ناموفق بود (HTTP ${response.status}).`);
    if (selectedModel && result.model && result.model !== selectedModel) throw new Error('سرویس صدا مدل دیگری برگرداند؛ پیش از ادامه، تنظیم مدل بررسی شود.');
    const returnedVoice = result.usage?.settings?.voice;
    if (flow.voice?.voice && returnedVoice && returnedVoice.toLowerCase() !== flow.voice.voice.toLowerCase()) throw new Error('سرویس صدا گویندهٔ دیگری انتخاب کرد؛ پیش از ادامه، نگاشت صداهای همین مدل بررسی شود.');
    const url = result.file?.url || result.file?.public_url || result.file?.publicUrl;
    if (!url || new URL(url).protocol !== 'https:') throw new Error('آدرس فایل صوتی معتبر برنگشت.');
    // Never forward the bearer token to the file's storage host.
    const audio = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!audio.ok) throw new Error('دریافت فایل صوتی ناموفق بود.');
    const file = path.join(job, 'audio', `${step.id}-${signature.slice(0, 12)}.wav`);
    fs.writeFileSync(file, Buffer.from(await audio.arrayBuffer()));
    const duration = Number(probe(file).format.duration);
    if (!(duration > 0)) throw new Error('زمان فایل صوتی معتبر نیست.');
    clips.push({ id: step.id, text: step.say, signature, file, duration, provider: result.provider, model: result.model, voice: returnedVoice || null });
    // Persist after each successful paid step, so a later failure does not re-bill earlier lines.
    writeJson(path.join(job, 'voice.json'), { provider: 'taze-system', clips: [...clips, ...previous.clips.filter(c => !clips.some(n => n.id === c.id))] });
    console.log(`صدا آماده شد: ${step.title}`);
  }
  writeJson(path.join(job, 'voice.json'), { provider: 'taze-system', clips });
}
