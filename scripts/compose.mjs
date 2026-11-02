import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, appRoot, jobPath, readJson, scenario, writeJson } from './lib/runtime.mjs';
import { loadProductBrand } from './product-brand.mjs';
import { fingerprint } from './workflow.mjs';
import { assertApproval } from './approval.mjs';
import { cameraBeats } from './camera.mjs';
const require = createRequire(import.meta.url);
export const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function timing(scenes) {
  let cursor = 0;
  return scenes.map(scene => { const result = { ...scene, start: cursor }; cursor += scene.duration; return result; });
}
export async function compose(id) {
  const approval = assertApproval(id);
  const job = jobPath(id), flow = scenario(id);
  const { take } = readJson(path.join(job, 'latest.json'));
  const manifest = readJson(path.join(take, 'capture.json'));
  if (manifest.approvalHash !== approval.hash) throw new Error('این برداشت مربوط به نسخهٔ تأییدشدهٔ فعلی نیست.');
  if (manifest.inputHash !== fingerprint(flow)) throw new Error('سورس، برند یا سناریو تغییر کرده؛ برداشت تازه لازم است.');
  if (manifest.scenes.some(scene => !flow.steps.some(s => s.id === scene.id && s.say === scene.say))) throw new Error('سناریو تغییر کرده؛ دوباره ضبط کنید.');
  const project = path.join(take, 'composition');
  const assets = path.join(project, 'assets'); fs.mkdirSync(assets, { recursive: true });
  const brand = await loadProductBrand();
  const editing = readJson(path.join(ROOT, 'editing', (flow.editing?.profile || 'product-tutorial') + '.json'));
  writeJson(path.join(project, 'editing-snapshot.json'), editing);
  writeJson(path.join(project, 'brand-snapshot.json'), brand);
  fs.copyFileSync(brand.logo, path.join(assets, 'product-logo.webp'));
  const scenes = timing(manifest.scenes), duration = scenes.at(-1).start + scenes.at(-1).duration;
  fs.copyFileSync(require.resolve('gsap/dist/gsap.min.js'), path.join(assets, 'gsap.min.js'));
  const fontRules = brand.fonts.map(font => {
    const name = `font-${font.weight}${path.extname(font.file)}`;
    fs.copyFileSync(font.file, path.join(assets, name));
    return `@font-face{font-family:Product;src:url('assets/${name}');font-weight:${font.weight};font-style:normal}`;
  }).join('\n');
  const compositions = path.join(project, 'compositions'); fs.mkdirSync(compositions, { recursive: true });
  const hosts = [], audio = [], vtt = ['WEBVTT\n'];
  for (const [index, scene] of scenes.entries()) {
    fs.copyFileSync(scene.clip, path.join(assets, `${scene.id}.mp4`));
    const sceneId = `scene-${scene.id}`;
    hosts.push(`<div id="${sceneId}" class="clip" data-composition-id="${sceneId}" data-composition-src="compositions/${sceneId}.html" data-start="${scene.start}" data-duration="${scene.duration}" data-track-index="0" data-track-kind="graphics" data-width="1920" data-height="1080"></div>`);
    const motion = [`tl.fromTo('#caption-${scene.id} p',{y:12,opacity:0},{y:0,opacity:1,duration:0.3},0);`];
    for (const beat of cameraBeats(scene.events, scene.duration, editing.camera)) {
      motion.push(`tl.fromTo('#video-${scene.id}',{scale:1,x:0,y:0,transformOrigin:'0 0'},{scale:${beat.scale},x:${1344 * beat.tx},y:${840 * beat.ty},duration:${beat.enter},ease:'power2.inOut'},${beat.start});`);
      motion.push(`tl.to('#video-${scene.id}',{scale:1,x:0,y:0,duration:${beat.exit},ease:'power2.inOut'},${beat.start + beat.enter + beat.hold});`);
    }
    fs.writeFileSync(path.join(compositions, `${sceneId}.html`), `<template><style>${fontRules}
#root{position:absolute;inset:0;font-family:Product,Tahoma,sans-serif;color:#292437;direction:rtl}.screen-viewport{position:absolute;left:288px;top:100px;width:1344px;height:840px;border-radius:18px;overflow:hidden;background:white}.shot{width:1344px;height:840px;object-fit:contain}.caption{position:absolute;left:192px;right:192px;top:958px;height:105px;text-align:right}.caption small{font-size:18px;color:#746879}.caption p{font-size:29px;margin:8px 0 0;line-height:1.5;color:#292437}</style>
<div id="root" data-composition-id="${sceneId}" data-width="1920" data-height="1080">
<div class="screen-viewport"><video id="video-${scene.id}" class="clip shot" data-start="0" data-duration="${scene.duration}" muted src="assets/${scene.id}.mp4"></video></div>
<div id="caption-${scene.id}" class="clip caption" data-start="0" data-duration="${scene.duration}"><small>${index + 1} / ${scenes.length} · ${escapeHtml(scene.title)}</small><p>${escapeHtml(scene.caption || scene.say)}</p></div></div>
<script>const tl=gsap.timeline({paused:true});${motion.join('\n')}window.__timelines['${sceneId}']=tl;</script></template>`, 'utf8');
    if (scene.audio) {
      fs.copyFileSync(scene.audio, path.join(assets, `${scene.id}.wav`));
      audio.push(`<audio id="voice-${scene.id}" class="clip" data-start="${scene.start}" data-duration="${scene.duration}" data-track-index="3" src="assets/${scene.id}.wav"></audio>`);
    }
    const stamp = seconds => new Date(seconds * 1000).toISOString().slice(11, 23);
    vtt.push(`${stamp(scene.start)} --> ${stamp(scene.start + scene.duration)}\n${scene.say}\n`);
  }
  fs.writeFileSync(path.join(compositions, 'header.html'), `<template><style>${fontRules}
#root{position:absolute;inset:0;font-family:Product,Tahoma,sans-serif;direction:rtl;pointer-events:none}.masthead{position:absolute;left:192px;right:192px;top:26px;display:flex;align-items:center;justify-content:space-between;height:52px}.masthead strong{font-size:29px;color:${brand.palette.secondary};display:flex;align-items:center;gap:16px}.masthead img{width:54px;height:54px;object-fit:contain}.masthead span{font-size:18px;color:#6a5730}.brandline{position:absolute;left:192px;right:192px;top:85px;height:3px;background:${brand.palette.primary}}</style>
<div id="root" data-composition-id="header" data-width="1920" data-height="1080"><div id="brand" class="clip masthead" data-start="0" data-duration="${duration}"><strong><img src="assets/product-logo.webp" alt="${escapeHtml(brand.name)}">${escapeHtml(brand.name)} · ${escapeHtml(flow.title)}</strong><span>پیش‌نمایش آموزشی · ${manifest.audioMode === 'narrated' ? 'با نریشن' : 'فعلاً بدون نریشن'}</span></div><div id="brandline" class="clip brandline" data-start="0" data-duration="${duration}"></div></div>
<script>window.__timelines.header=gsap.timeline({paused:true});</script></template>`, 'utf8');
  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(flow.title)}</title><style>*{box-sizing:border-box}body{margin:0;background:#fafafa}#main{width:1920px;height:1080px;position:relative;overflow:hidden;background:#fafafa}</style></head><body>
<div id="main" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="1920" data-height="1080">${hosts.join('\n')}<div id="header" class="clip" data-composition-id="header" data-composition-src="compositions/header.html" data-start="0" data-duration="${duration}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:2;pointer-events:none" data-layout-allow-overlap></div>${audio.join('\n')}</div>
<script src="assets/gsap.min.js"></script><script>window.__timelines=window.__timelines||{};window.__timelines.main=gsap.timeline({paused:true});</script></body></html>`;
  fs.writeFileSync(path.join(project, 'index.html'), html, 'utf8');
  fs.writeFileSync(path.join(project, 'captions.vtt'), vtt.join('\n'), 'utf8');
  writeJson(path.join(project, 'hyperframes.json'), { paths: { assets: 'assets', blocks: 'compositions' }, media: { autoProxy: false } });
  writeJson(path.join(job, 'composition.json'), { project, duration, audioMode: manifest.audioMode, approvalHash: approval.hash });
  writeJson(path.join(job, 'cms-draft.json'), { title: flow.title, slug: id, status: 'draft', help_contexts: flow.helpContexts, training_only: true,
    content_blocks: [{ id: `${id}-intro`, type: 'paragraph', content: '<p>پیش‌نمایش آموزشی با داده و پاسخ سرویس شبیه‌سازی‌شده؛ اتصال واقعی تأیید نشده است.</p>' },
      ...flow.steps.flatMap(step => [{ id: step.id + '-heading', type: 'heading', level: 2, content: step.title }, { id: step.id + '-text', type: 'paragraph', content: `<p>${escapeHtml(step.say)}</p>` }])],
    pending: ['بازبینی نریشن', 'آزمون بات واقعی', 'آپلود ویدیو و افزودن بلوک video_file', 'تأیید انتشار و بررسی صفحه عمومی'] });
  console.log(project);
  return project;
}
