// Ensures each task's dependencies are installed in its source folder so `tsc`
// can resolve the library type declarations (azure-pipelines-task-lib,
// testingbot-tunnel-launcher) when compiling index.ts and the tests. Runs
// automatically before `compile` (via the `precompile` npm hook). The packaged
// production node_modules are installed separately into dist/ by
// scripts/install-task-deps.js.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

for (const entry of fs.readdirSync(root)) {
  if (!entry.startsWith('tb-')) continue;

  const taskDir = path.join(root, entry);
  if (!fs.existsSync(path.join(taskDir, 'package.json'))) continue;
  if (fs.existsSync(path.join(taskDir, 'node_modules'))) continue;

  console.log(`Installing source deps for ${entry}`);
  execFileSync(npm, ['install', '--no-audit', '--no-fund'], { cwd: taskDir, stdio: 'inherit' });
}
