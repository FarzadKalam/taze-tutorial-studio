export function cameraBeats(events, duration, camera, frame = { width: 1600, height: 1000 }) {
  const beats = [], { enterSeconds: enter, holdSeconds: hold, exitSeconds: exit, minGapSeconds: gap } = camera;
  const scale = Math.min(camera.zoomScale, camera.maxScale);
  if (!(duration > 0) || !(scale > 1 && scale <= 2) || [enter, hold, exit, gap].some(n => !Number.isFinite(n) || n < 0)) throw new Error('تنظیمات دوربین نامعتبر است.');
  let freeAt = 0;
  for (const event of events.filter(item => ['click', 'fill', 'type'].includes(item.op))) {
    if (![event.x, event.y, event.time].every(Number.isFinite)) continue;
    const start = Math.max(0, event.time - enter);
    if (start < freeAt) continue;
    const remaining = duration - start - enter - exit;
    if (remaining < 0.25) continue;
    const rest = Math.min(hold, remaining);
    const end = start + enter + rest + exit;
    const normalizedX = Math.max(0, Math.min(1, event.x / frame.width));
    const normalizedY = Math.max(0, Math.min(1, event.y / frame.height));
    // Keep transformed edges outside the crop, even when the target is near an edge.
    const tx = Math.max(-(scale - 1), Math.min(0, 0.5 - scale * normalizedX));
    const ty = Math.max(-(scale - 1), Math.min(0, 0.5 - scale * normalizedY));
    beats.push({ start, enter, hold: rest, exit, end, scale, tx, ty, target: { x: event.x, y: event.y } });
    freeAt = end + gap;
  }
  return beats;
}
