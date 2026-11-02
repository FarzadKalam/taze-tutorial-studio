// Only synthetic data. No production host, token, user, or group is used here.
export const DEMO = { org: '10000000-0000-4000-8000-000000000001', user: '20000000-0000-4000-8000-000000000001' };
export async function installFixtureNetwork(context) {
  const records = new Map();
  const calls = [];
  const failures = [];
  let inboundReady = false;
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: DEMO.user, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.training-only`;
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('sb-tutorial-auth-token', JSON.stringify({ access_token: token, refresh_token: 'training-only', expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer', user: { id: user, email: 'training@example.invalid' } }));
  }, { token, user: DEMO.user });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname !== 'tutorial.invalid') { failures.push({ kind: 'blocked-host', host: url.hostname }); return route.abort(); }
    const json = (data, headers = {}) => route.fulfill({ status: 200, json: data, headers });
    if (url.pathname === '/auth/v1/user') return json({ id: DEMO.user, email: 'training@example.invalid' });
    if (url.pathname === '/rest/v1/profiles') {
      const profile = { id: DEMO.user, org_id: DEMO.org, full_name: 'کاربر آموزش', role: 'admin', role_id: null, is_active: true };
      return json(request.headers().accept?.includes('object') ? profile : [profile]);
    }
    if (url.pathname === '/rest/v1/integration_settings') {
      if (request.method() === 'GET') return json([...records.values()]);
      const body = request.postDataJSON();
      const saved = [];
      for (const [index, row] of (Array.isArray(body) ? body : [body]).entries()) {
        if (row.org_id !== DEMO.org) { failures.push({ kind: 'org-scope' }); return route.fulfill({ status: 403, json: { message: 'سازمان آموزشی لازم است.' } }); }
        const result = { ...row, id: row.id || records.get(row.connection_type)?.id || `30000000-0000-4000-8000-${String(records.size + 1).padStart(12, '0')}` };
        records.set(row.connection_type, result); saved.push(result);
      }
      calls.push({ kind: 'save', count: records.size });
      return json(request.headers().accept?.includes('object') ? saved[0] : saved);
    }
    if (url.pathname === '/functions/v1/taxpayer_system' && request.postDataJSON()?.action === 'get_settings') return json({ success: true, settings: {} });
    if (url.pathname === '/functions/v1/external-connectors' && request.postDataJSON()?.action === 'list') return json({ success: true, connections: [] });
    if (url.pathname === '/functions/v1/bot-admin') {
      const body = request.postDataJSON();
      calls.push({ kind: 'bot-action', action: body.action, channel: body.channel });
      if (!['start_capture', 'poll_updates', 'send_test_message'].includes(body.action)) {
        failures.push({ kind: 'unknown-action', action: body.action });
        return route.fulfill({ status: 400, json: { success: false, message: 'عملیات آموزشی تعریف نشده است.' } });
      }
      if (body.action === 'poll_updates' && inboundReady) return json({ success: true, found: true, cursor: 'training-cursor-received',
        contact: { id: '40000000-0000-4000-8000-000000000001', channel_type: body.channel, chat_id: '123456789', username: 'training_user',
          display_name: 'کاربر آموزشی', last_message_text: 'سلام', last_seen_at: new Date().toISOString() } });
      return json({ success: true, cursor: 'training-cursor', provider_result: { training_only: true }, contact: null, latest: null });
    }
    const emptyTables = ['org_roles', 'company_settings', 'bank_accounts', 'saas_org_settings', 'org_memberships'];
    if (emptyTables.some(table => url.pathname === `/rest/v1/${table}`)) return json([]);
    // Unknown mutations must never silently pass as successful.
    if (request.method() !== 'GET' || !url.pathname.startsWith('/rest/v1/')) {
      failures.push({ kind: 'unhandled-request', path: url.pathname, method: request.method() });
      return route.fulfill({ status: 501, json: { message: 'این مسیر در محیط آموزشی تعریف نشده است.' } });
    }
    return json([]);
  });
  return { calls, failures, advanceStage(stageId) { inboundReady = stageId === 'receive-chat' || stageId === 'test' || stageId === 'finish'; } };
}
