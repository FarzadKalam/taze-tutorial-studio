import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ROOT, appRoot, jobPath, readJson, scenario, writeJson } from './lib/runtime.mjs';
import { describeEnvironment } from './environment.mjs';
import { BRAND_SOURCES } from './product-brand.mjs';

export function fingerprint(flow, product = appRoot()) {
  const hash = createHash('sha256').update(JSON.stringify(flow));
  for (const app of new Set(flow.steps.filter(step => step.surface?.kind === 'phone').map(step => step.surface.app))) {
    if (!/^[a-z0-9-]+$/.test(app)) throw new Error('شناسهٔ برنامهٔ بیرونی نامعتبر است.');
    hash.update(fs.readFileSync(path.join(ROOT, 'external-apps', app + '.json')));
  }
  if (flow.editing?.profile) {
    if (!/^[a-z0-9-]+$/.test(flow.editing.profile)) throw new Error('پروفایل تدوین نامعتبر است.');
    hash.update(fs.readFileSync(path.join(ROOT, 'editing', flow.editing.profile + '.json')));
  }
  const brandAssets = fs.readdirSync(path.join(product, 'public/brand')).map(file => `public/brand/${file}`);
  for (const source of [...flow.sources, ...BRAND_SOURCES, ...brandAssets]) {
    const file = path.resolve(product, source), rel = path.relative(product, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('منبع باید داخل سورس محصول باشد.');
    hash.update(source).update(fs.readFileSync(file));
  }
  return hash.digest('hex');
}
export function plan(id) {
  const flow = scenario(id), job = jobPath(id);
  const file = path.join(job, 'workflow.json');
  const existing = fs.existsSync(file) ? readJson(file) : {};
  const result = { ...existing, schemaVersion: 1, id, title: flow.title, inputHash: fingerprint(flow),
    createdAt: existing.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
    environment: describeEnvironment(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: appRoot(), encoding: 'utf8' }).trim(),
    mode: 'agent-orchestrated', voiceProvider: 'taze-system', captureMode: 'product-ui-fixture', publication: 'draft' };
  writeJson(file, result); return result;
}
export function next(id) {
  const job = jobPath(id), flow = scenario(id);
  const file = path.join(job, 'workflow.json');
  const saved = fs.existsSync(file) ? readJson(file) : null;
  const changed = !!saved && saved.inputHash !== fingerprint(flow);
  const latest = path.join(job, 'latest.json');
  const take = fs.existsSync(latest) ? readJson(latest).take : null;
  const hasCapture = !!take && fs.existsSync(path.join(take, 'capture.json'));
  const capture = hasCapture ? readJson(path.join(take, 'capture.json')) : null;
  const captureStale = !!capture && capture.inputHash !== fingerprint(flow);
  const hasComposition = fs.existsSync(path.join(job, 'composition.json'));
  const composition = hasComposition ? readJson(path.join(job, 'composition.json')) : null;
  const approvalFile = path.join(job, 'approval.json'), requestFile = path.join(job, 'review-request.json');
  const approval = fs.existsSync(approvalFile) ? readJson(approvalFile) : null;
  const request = fs.existsSync(requestFile) ? readJson(requestFile) : null;
  const approved = approval?.decision === 'approved' && approval.hash === request?.hash && request.inputHash === fingerprint(flow);
  return { id, inputChanged: changed, environment: describeEnvironment(),
    stages: {
      researchAndScript: !saved ? 'needs-agent' : changed ? 'stale' : 'recorded',
      userApproval: approved ? 'approved' : 'awaiting-user-approval',
      voice: fs.existsSync(path.join(job, 'voice.json')) ? 'available-check-text-signatures' : 'pending-generation-or-approved-silent-preview',
      capture: !hasCapture ? 'pending' : captureStale ? 'stale' : capture.audioMode,
      compose: hasComposition && !changed && !captureStale ? 'available' : 'pending',
      review: fs.existsSync(path.join(job, 'REVIEW.md')) ? 'see-review-file' : 'needs-agent',
      render: composition && fs.existsSync(path.join(composition.project, 'final.mp4')) ? 'available-check-probe' : 'pending',
      publish: 'not-published' },
    nextCommands: !approved ? [`npm run review -- ${id}`, 'نمایش متن، نریشن و سناریوی تصویر و انتظار برای تأیید صریح صاحب کار'] : !saved || changed ? [`npm run plan -- ${id}`] : !hasCapture || captureStale ? [`npm run capture -- ${id}`]
      : !hasComposition ? [`npm run compose -- ${id}`] : ['عامل باید check، قاب‌ها و REVIEW.md را بررسی کند.'] };
}
export function handoff(id) {
  const flow = scenario(id), job = jobPath(id);
  const file = path.join(job, 'handoff.json');
  writeJson(file, { schemaVersion: 1, id, scenario: flow, inputHash: fingerprint(flow),
    environmentPolicy: 'current-environment-first', requiredProductSources: flow.sources,
    note: 'فقط قرارداد و سناریو؛ هیچ کلید، نشست، صوت یا رسانه‌ای در این بسته نیست. وابستگی‌ها و سورس محصول در مقصد آماده شوند.',
    commands: ['npm ci', 'npm run preflight', `npm run plan -- ${id}`, `npm run capture -- ${id}`, `npm run compose -- ${id}`] });
  return file;
}
