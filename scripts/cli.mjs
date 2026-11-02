import fs from 'node:fs';
import path from 'node:path';
import { ROOT, appRoot, browserPath, scenario, tools } from './lib/runtime.mjs';
const [command, id] = process.argv.slice(2);
try {
  if (command === 'doctor') {
    const sessionFile = path.join(ROOT, '.local/service-session.json');
    const session = fs.existsSync(sessionFile) ? JSON.parse(fs.readFileSync(sessionFile, 'utf8')) : null;
    const status = { browser: !!browserPath(), ffmpeg: fs.existsSync(tools.ffmpeg), ffprobe: fs.existsSync(tools.ffprobe),
      productSource: fs.existsSync(path.join(appRoot(), 'pages/Settings/ConnectionsTab.tsx')),
      voiceSession: !!process.env.TAZE_AI_ACCESS_TOKEN || !!(session?.accessToken && session.expiresAt * 1000 > Date.now()), tutorials: fs.readdirSync(path.join(ROOT, 'tutorials')).filter(p => p.endsWith('.json')) };
    console.log(JSON.stringify(status, null, 2));
    if (!status.browser || !status.ffmpeg || !status.ffprobe || !status.productSource) process.exitCode = 1;
  } else if (command === 'preflight') {
    const result = await (await import('./environment.mjs')).preflight(); if (!result.ready) process.exitCode = 1;
  } else if (command === 'studio') {
    const { startFixtureServer } = await import('./fixture-server.mjs');
    const { url } = await startFixtureServer(); console.log(url);
  } else {
    scenario(id);
    if (command === 'review') console.log(JSON.stringify((await import('./approval.mjs')).prepareReview(id), null, 2));
    else if (command === 'approve') {
      const options = process.argv.slice(4);
      const option = name => { const index = options.indexOf(name); return index < 0 ? undefined : options[index + 1]; };
      console.log(JSON.stringify((await import('./approval.mjs')).approve(id, { hash: option('--hash'), reference: option('--reference') }), null, 2));
    }
    else if (['plan', 'next', 'handoff'].includes(command)) {
      console.log(JSON.stringify((await import('./workflow.mjs'))[command](id), null, 2));
    }
    else if (command === 'capture') await (await import('./capture.mjs')).capture(id);
    else if (command === 'voice') await (await import('./voice.mjs')).voice(id);
    else if (command === 'compose') await (await import('./compose.mjs')).compose(id);
    else throw new Error('دستورها: doctor | studio | capture <id> | voice <id> | compose <id>');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
