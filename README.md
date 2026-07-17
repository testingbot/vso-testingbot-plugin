# TestingBot for Azure DevOps

Azure DevOps (formerly VSTS) extension that integrates [TestingBot](https://testingbot.com)
into your pipelines: a configuration task that exports your TestingBot credentials
and optionally launches TestingBot Tunnel, a task to stop the tunnel, and a build
results tab.

## Using the tasks in a pipeline

Add a **TestingBot** service connection (Project settings → Service connections →
New → *TestingBot Credentials*) with your key and secret, then reference the tasks:

```yaml
steps:
  # Exports TB_KEY / TB_SECRET / SELENIUM_HOST / … and (optionally) starts the tunnel.
  - task: TBMain@0
    inputs:
      connectedServiceName: 'my-testingbot-connection'
      tbTunnel: true            # optional — needs Java 11+ on the agent

  # ... run your Selenium/Appium tests here; they read the exported variables ...

  # Only needed when tbTunnel was true.
  - task: TBStopTunnel@0
```

Test results appear on the **TestingBot** tab of the build summary.

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

`clean` → `compile` (`tsc` compiles each task's `index.ts`) → `build` (webpack
bundles the results-tab scripts and copies the static files into `dist/`) →
`deps` (installs each task's production `node_modules` into `dist/`) → `stamp`
(writes the version into the built manifest and task definitions) → `create`
(`tfx extension create`).

To iterate on just the web bundle, run `npm run build`.

## Development

```bash
npm run lint    # eslint (flat config, typescript-eslint)
npm test        # tsc + mocha task tests
```

CI runs lint, tests and a full package build on every PR
(`.github/workflows/build.yml`). Tagging a commit `v*` publishes to the
Marketplace (`.github/workflows/publish.yml`) — see that file for the required
`AZURE_DEVOPS_MARKETPLACE_PAT` secret and version-bump steps.
