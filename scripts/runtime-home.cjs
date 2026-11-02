// Isolate CLI caches for this child process without changing the user's account environment.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { syncBuiltinESMExports } = require('node:module');
if (process.env.TUTORIAL_RUNTIME_HOME) {
  const root = path.resolve(process.env.TUTORIAL_RUNTIME_HOME);
  fs.mkdirSync(root, { recursive: true });
  os.homedir = () => root;
  syncBuiltinESMExports();
}
