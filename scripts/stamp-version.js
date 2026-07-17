// Stamps the single source-of-truth version (package.json) into the built
// manifest and task definitions in dist/, resolving the historical drift
// between package.json, vss-extension.json and the task.json files.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const version = require(path.join(root, 'package.json')).version;
const [major, minor, patch] = version.split('.');

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

// Each task: { Major, Minor, Patch } object.
for (const task of ['tb-main', 'tb-stop-tunnel']) {
  const taskPath = path.join(distDir, task, 'task.json');
  if (!fs.existsSync(taskPath)) continue;
  const def = readJson(taskPath);
  def.version = { Major: major, Minor: minor, Patch: patch };
  writeJson(taskPath, def);
}

console.log(`Stamped version ${version} into dist manifest and task definitions`);
