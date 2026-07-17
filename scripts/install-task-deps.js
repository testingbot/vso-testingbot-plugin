// Installs production dependencies for each agent task into dist/ so the packaged
// .vsix ships a self-contained node_modules per task. Runs after `webpack` has
// copied the task folders (including their package.json / package-lock.json).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const distDir = path.join(__dirname, '..', 'dist');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

for (const entry of fs.readdirSync(distDir)) {
  if (!entry.startsWith('tb-')) continue;

  const taskDir = path.join(distDir, entry);
  const pkgPath = path.join(taskDir, 'package.json');
  if (!fs.existsSync(pkgPath)) continue;

  // A dependency-free task (e.g. tb-stop-tunnel) has nothing to install.
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (!pkg.dependencies || Object.keys(pkg.dependencies).length === 0) {
    console.log(`No production deps for ${entry}, skipping`);
    continue;
  }

  const hasLock = fs.existsSync(path.join(taskDir, 'package-lock.json'));
  const args = hasLock
    ? ['ci', '--omit=dev', '--no-audit', '--no-fund']
    : ['install', '--omit=dev', '--no-audit', '--no-fund', '--no-package-lock'];

  console.log(`Installing production deps for ${entry} (npm ${args[0]})`);
  execFileSync(npm, args, { cwd: taskDir, stdio: 'inherit' });
}
