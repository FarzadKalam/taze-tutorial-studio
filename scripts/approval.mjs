import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { jobPath, readJson, scenario, writeJson } from './lib/runtime.mjs';
import { fingerprint } from './workflow.mjs';

export function reviewText(flow) {
  return `# متن و سناریوی نهایی پیشنهادی\n\nآموزش: ${flow.title}\n\nلحن: ساده، کاربردی، محاوره‌ای و فارسی رایج ایران.\n\nمدل صدا: ${flow.voice?.model || 'مدل حساب'}؛ صدای پیشنهادی: ${flow.voice?.voice || 'صدای حساب'}. انتخاب نهایی نیازمند تأیید کاربر است.\n\nهویت بصری: تم جاری PublicSite، لوگوی F01 و فونت پیدا.\n\nتدوین: زوم به کنترل مرتبط و بازگشت به نمای کامل، نشانگر نرم با رد کوتاه و حلقهٔ کلیک؛ در گوشی نشان لمس. مبنای سلیقه: راهنمای video-kit با اولویت خوانایی و آموزش درست.\n\nنوع ضبط: رابط واقعی محصول با داده و پاسخ سرویس شبیه‌سازی‌شده؛ نشان «محیط آموزشی» در تصویر باقی می‌ماند. برنامه‌های بیرونی در قاب گوشی به‌صورت بازسازی آموزشی با منبع و برچسب مشخص می‌شوند؛ ظاهر دقیق نسخهٔ جاری آن‌ها ادعا نمی‌شود.\n\nاین نسخه پیش از تولید صدا، ضبط یا تدوین به تأیید صاحب کار نیاز دارد.\n\n${flow.steps.map((step, index) => `## ${index + 1}. ${step.title}\n\n**نریشن دقیق:** ${step.say}\n\n**آنچه در تصویر می‌بینیم:** ${step.visual || 'تعریف نشده؛ پیش از تأیید تکمیل شود.'}\n\n**متن روی تصویر:** ${step.caption}\n`).join('\n')}\n`;
}
export function reviewHash(id) {
  const flow = scenario(id);
  return createHash('sha256').update(fingerprint(flow)).update(reviewText(flow)).digest('hex');
}
export function prepareReview(id) {
  const flow = scenario(id), job = jobPath(id);
  fs.mkdirSync(job, { recursive: true });
  const file = path.join(job, 'SCRIPT_REVIEW.md');
  fs.writeFileSync(file, reviewText(flow), 'utf8');
  const hash = reviewHash(id);
  writeJson(path.join(job, 'review-request.json'), { hash, inputHash: fingerprint(flow), requestedAt: new Date().toISOString(), status: 'awaiting-user-approval' });
  return { file, hash, status: 'awaiting-user-approval' };
}
export function assertApproval(id) {
  const file = path.join(jobPath(id), 'approval.json');
  if (!fs.existsSync(file)) throw new Error('تأیید متن و سناریو ثبت نشده است. ابتدا review و سپس تأیید صریح صاحب کار لازم است.');
  const approval = readJson(file);
  return validateApproval(approval, reviewHash(id));
}
export function validateApproval(approval, currentHash) {
  if (approval?.hash !== currentHash || approval?.decision !== 'approved' || !approval?.reference?.trim()) throw new Error('تأیید قبلی برای این نسخه معتبر نیست؛ متن، سناریو یا برند تغییر کرده و باید دوباره تأیید شود.');
  return approval;
}
export function approve(id, { hash, reference } = {}) {
  const flow = scenario(id);
  if (flow.steps.some(step => !step.visual?.trim() || !step.caption?.trim())) throw new Error('سناریوی تصویر و متن نمایشی همهٔ گام‌ها باید تکمیل شوند.');
  const request = readJson(path.join(jobPath(id), 'review-request.json'));
  if (!reference?.trim()) throw new Error('متن یا مرجع پیام تأیید واقعی صاحب کار لازم است.');
  if (hash !== request.hash || hash !== reviewHash(id)) throw new Error('نسخهٔ تأییدشده با نسخهٔ فعلی برابر نیست.');
  const approval = { decision: 'approved', hash, reference, approvedAt: new Date().toISOString(), producer: 'tutorial-producer' };
  writeJson(path.join(jobPath(id), 'approval.json'), approval);
  return { status: 'approved', hash };
}
