# TestingBot for Azure DevOps

Azure DevOps (formerly VSTS) extension that integrates [TestingBot](https://testingbot.com)
into your pipelines: a configuration task that exports your TestingBot credentials
and optionally launches TestingBot Tunnel, a task to stop the tunnel, and a build
results tab.

## Building the plugin

Requires **Node.js >= 20**.

1. Install dependencies (once):

   ```bash
   npm install
   ```

2. Set the release version in `package.json` (single source of truth — it is
   stamped into `vss-extension.json` and both `task.json` files at package time).

3. Build the `.vsix`:

   ```bash
   npm run package
   ```

   The packaged extension is written to `Packages/`.

### What `npm run package` does

`clean` → `build` (webpack bundles the results-tab scripts and copies the static
files into `dist/`) → `deps` (installs each task's production `node_modules` into
`dist/`) → `stamp` (writes the version into the built manifest and task
definitions) → `create` (`tfx extension create`).

To iterate on just the web bundle, run `npm run build`.
