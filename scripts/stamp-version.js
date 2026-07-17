// Stamps the single source-of-truth version (package.json) into the built
// manifest and task definitions in dist/, resolving the historical drift
// between package.json, vss-extension.json and the task.json files.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const version = require(path.join(root, 'package.json')).version;

// Require an exact numeric major.minor.patch — task.json versions must be
// integers and a malformed/prerelease value would silently produce a broken vsix.
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
if (!match) {
  throw new Error(`package.json version "${version}" is not a plain major.minor.patch version.`);
}
const [, major, minor, patch] = match.map(Number);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

// Extension manifest: flat semver string.
const manifestPath = path.join(distDir, 'vss-extension.json');
const manifest = readJson(manifestPath);
manifest.version = version;
writeJson(manifestPath, manifest);

// Each task: { Major, Minor, Patch } object. A missing manifest means the build
// copy step did not run correctly, so fail instead of shipping an unstamped task.
for (const task of ['tb-main', 'tb-stop-tunnel']) {
  const taskPath = path.join(distDir, task, 'task.json');
  if (!fs.existsSync(taskPath)) {
    throw new Error(`Expected task manifest is missing: ${taskPath}. Did the build copy step run?`);
  }
  const def = readJson(taskPath);
  def.version = { Major: major, Minor: minor, Patch: patch };
  writeJson(taskPath, def);
}

console.log(`Stamped version ${version} into dist manifest and task definitions`);
