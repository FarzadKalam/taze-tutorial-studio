import fs from 'node:fs';
import path from 'node:path';
import { scenario, jobPath } from './lib/runtime.mjs';
const id = process.argv[2];
const flow = scenario(id);
const file = path.join(jobPath(id), 'NARRATION.txt');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, flow.steps.map(step => step.say).join('\n\n') + '\n', 'utf8');
console.log(file);
