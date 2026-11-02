import test from 'node:test';
import assert from 'node:assert/strict';
import { jobPath, scenario } from '../scripts/lib/runtime.mjs';
import { escapeHtml, timing } from '../scripts/compose.mjs';
import { voiceRequest, voiceSignature } from '../scripts/voice.mjs';
import { loadProductBrand } from '../scripts/product-brand.mjs';
import { installFixtureNetwork, DEMO } from '../scripts/fixture-network.mjs';
import { describeEnvironment } from '../scripts/environment.mjs';
import { assertApproval, validateApproval } from '../scripts/approval.mjs';
import { cameraBeats } from '../scripts/camera.mjs';
import { readJson, ROOT } from '../scripts/lib/runtime.mjs';
import path from 'node:path';
test('rejects traversal before reading or writing project data', () => {
  for (const id of ['../escape', 'a/b', 'C:/outside', '..', '', 'a\\b']) assert.throws(() => jobPath(id));
});
test('changing a narration, model or voice invalidates the paid audio cache', () => {
  const original = voiceSignature('سلام', { model: 'a', voice: 'Kore' });
  for (const [text, settings] of [['سلام!', { model: 'a', voice: 'Kore' }], ['سلام', { model: 'b', voice: 'Kore' }], ['سلام', { model: 'a', voice: 'other' }]]) {
    assert.notEqual(voiceSignature(text, settings), original);
  }
});
test('composition uses measured duration without gaps or overlaps', () => {
  assert.deepEqual(timing([{ duration: 4.137 }, { duration: 7.222 }, { duration: 2 }]).map(s => s.start), [0, 4.137, 11.359]);
});
test('CMS prose and generated HTML escape markup', () => {
  assert.equal(escapeHtml('<script>"&'), '&lt;script&gt;&quot;&amp;');
});
test('voice uses the existing app action and Persian settings without an implicit model override', () => {
  const request = voiceRequest('متن');
  assert.equal(request.action, 'generate_voice_output'); assert.equal(request.settings.language, 'fa-IR');
  assert.equal(request.modelOverride, undefined); assert.equal(request.settings.musicMode, 'off');
});
test('Bale scenario cannot claim the fixture is a real delivery', () => {
  const flow = scenario('bale-connection');
  assert.match(flow.steps.at(-1).say, /با اطلاعات نمونه ضبط شده/);
  assert.ok(flow.sources.includes('pages/Settings/ConnectionsTab.tsx'));
});
test('unapproved content cannot proceed to generation or accept a stale approval hash', () => {
  assert.throws(() => assertApproval('missing-approval-test'), /تأیید/);
  assert.throws(() => validateApproval({ decision: 'approved', hash: 'old', reference: 'explicit user message' }, 'new'), /نسخه/);
  assert.throws(() => validateApproval({ decision: 'approved', hash: 'new' }, 'new'), /تأیید/);
  assert.equal(validateApproval({ decision: 'approved', hash: 'new', reference: 'explicit user message' }, 'new').decision, 'approved');
});
test('brand snapshot resolves the current PublicSite asset and actual font weights', async () => {
  const brand = await loadProductBrand();
  assert.equal(brand.identitySource, 'PublicSite');
  assert.ok(brand.fonts.some(f => f.weight === 400));
  assert.ok(brand.fonts.some(f => f.weight === 700));
  assert.match(brand.fingerprint, /^[a-f0-9]{64}$/);
  assert.ok(brand.assets.logo.startsWith('/brand/'));
});
async function mockNetworkRequest({ url, method = 'POST', body, accept = 'application/json' }) {
  let handler, response;
  const state = await installFixtureNetwork({ addInitScript: async () => {}, route: async (_pattern, callback) => { handler = callback; } });
  await handler({ request: () => ({ url: () => url, method: () => method, postDataJSON: () => body, headers: () => ({ accept }) }),
    fulfill: async value => { response = value; }, abort: async () => { response = { aborted: true }; }, continue: async () => { response = { continued: true }; } });
  return { response, state };
}
test('fixture prevents an accidental request to production', async () => {
  const { response, state } = await mockNetworkRequest({ url: 'https://production.example/functions/v1/bot-admin', body: {} });
  assert.equal(response.aborted, true); assert.equal(state.failures[0].kind, 'blocked-host');
});
test('fixture fails closed for another organization and unknown mutations', async () => {
  const wrongOrg = await mockNetworkRequest({ url: 'https://tutorial.invalid/rest/v1/integration_settings', body: { org_id: 'other' } });
  assert.equal(wrongOrg.response.status, 403);
  const unknown = await mockNetworkRequest({ url: 'https://tutorial.invalid/rest/v1/unexpected_table', body: {} });
  assert.equal(unknown.response.status, 501);
});
test('fixture preserves PostgREST single-row response so saving is actually usable by the UI', async () => {
  const { response } = await mockNetworkRequest({ url: 'https://tutorial.invalid/rest/v1/integration_settings',
    body: [{ org_id: DEMO.org, connection_type: 'bale_bot' }], accept: 'application/vnd.pgrst.object+json' });
  assert.equal(response.json.connection_type, 'bale_bot'); assert.ok(response.json.id);
});
test('cloud selection is descriptive and never claims to provision a remote executor', () => {
  const report = describeEnvironment({ TUTORIAL_ENVIRONMENT_KIND: 'codex-cloud' }, 'linux');
  assert.equal(report.kind, 'codex-cloud'); assert.equal(report.remoteExecutorProvisioned, false); assert.equal(report.desktopCapture, false);
  assert.throws(() => describeEnvironment({ TUTORIAL_ENVIRONMENT_KIND: 'made-up' }));
});
test('camera emphasis stays inside source bounds, returns before scene end and never invents late click timing', () => {
  const camera = readJson(path.join(ROOT, 'editing/product-tutorial.json')).camera;
  const beats = cameraBeats([{ op: 'click', x: 1580, y: 990, time: 1 }, { op: 'click', x: 40, y: 20, time: 1.1 }, { op: 'click', x: 50, y: 30, time: 5 }], 8, camera);
  assert.equal(beats.length, 2);
  for (const beat of beats) {
    assert.ok(beat.end <= 8); assert.ok(beat.tx <= 0 && beat.tx >= -(beat.scale - 1));
    assert.ok(beat.ty <= 0 && beat.ty >= -(beat.scale - 1));
    assert.ok(beat.enter + beat.hold + beat.exit > 0);
  }
  assert.equal(cameraBeats([{ op: 'click', x: 20, y: 20, time: 0.1 }], 0.3, camera).length, 0);
});
test('Bale lesson uses Lite, includes the token workflow and declares every external reconstruction', () => {
  const flow = scenario('bale-connection');
  assert.equal(flow.voice.model, 'gemini-3.8-flash-lite-tts');
  assert.ok(flow.steps.some(step => step.id === 'bale-token'));
  assert.ok(flow.steps.some(step => step.id === 'bale-first-message'));
  const model = readJson(path.join(ROOT, 'external-apps/bale.json'));
  assert.match(model.disclosure, /بازسازی آموزشی/);
  for (const step of flow.steps.filter(step => step.surface?.kind === 'phone')) assert.ok(model.states[step.surface.state]);
  const request = voiceRequest('نمونه', flow.voice.model, flow.voice);
  assert.equal(request.settings.voice, 'Charon');
});
