# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Azure DevOps / Visual Studio Team Services (VSTS) extension that integrates
[TestingBot](https://testingbot.com) (Selenium/Appium cloud grid + tunnel) into
Azure Pipelines builds and releases. It ships as a `.vsix` package built from
this repo. `vss-extension.json` is the extension manifest and the source of truth
for what the package contains and contributes.

## Build & package

Requires Node.js >= 20. The build is npm-scripts + TypeScript + webpack 5 (no gulp).

```bash
npm install                  # root build deps
npm run compile              # tsc: compile each task's index.ts -> index.js
npm test                     # compile + mocha (task-lib mock-run/mock-test)
npm run package              # full pipeline -> ./Packages/*.vsix
```

`npm run package` chains: `clean` -> `compile` (`tsc` per task, emitting
`index.js` next to `index.ts`) -> `build` (webpack: bundle the tab scripts + copy
static files, including the compiled task `index.js`, into `dist/`) -> `deps`
(`scripts/install-task-deps.js` runs `npm ci --omit=dev` into each `dist/tb-*`
that has a `package.json`) -> `stamp` (`scripts/stamp-version.js`) -> `create`
(`tfx extension create`). A `precompile` hook (`scripts/ensure-task-src-deps.js`)
installs each task's source `node_modules` so `tsc` can resolve library types.

Versioning: `package.json`'s `version` is the single source of truth. The stamp
step writes it into `dist/vss-extension.json` (flat semver) and both
`dist/tb-*/task.json` (`version.Major/Minor/Patch`). Source manifests keep a
placeholder version — only the `dist` copies are stamped, so don't rely on the
version in the checked-in `vss-extension.json` / `task.json`.

Tests: `npm test` compiles and runs the mocha suites under `tb-*/tests/` (they
use `azure-pipelines-task-lib`'s `mock-run`/`mock-test`; `MockTestRunner`
downloads the Node20 runtime on first run, so the first `npm test` is slow).
Lint: `npm run lint` runs ESLint (flat config in `eslint.config.mjs`,
typescript-eslint for the `.ts` tasks; the legacy tab scripts are linted
leniently). CI (`.github/workflows/build.yml`) runs lint + tests + a full
package build on every PR.

## Architecture

The extension contributes three server-side pieces plus one endpoint type,
declared in `vss-extension.json` under `contributions`:

- **`tb-main/`** — Pipeline task "TestingBot Configuration" (`TBMain`). TypeScript
  task (`index.ts`) that reads a TestingBot service-endpoint credential, exports
  `TB_KEY`/`TB_SECRET`/`SELENIUM_HOST`/etc. as pipeline variables (the secret ones
  via `setSecret` + a secret variable) so downstream test steps can reach the
  grid, and optionally launches **TestingBot Tunnel** via the
  `testingbot-tunnel-launcher` npm package (which downloads/caches the current
  tunnel jar at runtime — nothing is bundled). It writes `testingbot.json` and
  attaches it to the build via `task.addattachment` with type
  `TestingBotBuildResult` — this attachment is how the results tab (below) later
  finds the build's credentials and build name. The credentials still travel in
  that attachment because the tab needs them to sign TestingBot `/mini` share
  URLs; removing them from the browser (finding #1) is the Phase 3 tab redesign.

- **`tb-stop-tunnel/`** — Pipeline task "Stop TestingBot Tunnel" (`TBStopTunnel`).
  TypeScript task (`index.ts`) that kills the tunnel process using the PID that
  `tb-main` stored in the `TB_TUNNEL_PID` variable (the launcher's in-process
  `killAsync` can't reach a tunnel started by a different task). Add this task
  after your test steps to tear the tunnel down.

- **`tb-build-info/`** — A build-results web tab (`infoTab.html` +
  `scripts/info.js`) shown inside the Azure DevOps build view. It reads the
  `TestingBotBuildResult` attachment left by `tb-main`, calls the TestingBot API
  through the extension's service-endpoint data source (`getBuildFullJobs`), and
  renders a paginated table of test results. Clicking a test opens `embedDialog.html`
  (via `scripts/dialog.js`) which iframes the TestingBot mini test view.

- **`tb-endpoint-type`** (manifest-only) — Defines the "TestingBot Credentials"
  service endpoint (basic auth, key/secret) and the `getBuildFullJobs` data source
  that proxies `https://api.testingbot.com/v1/builds/{{build}}`.

Data flow across the pieces: `tb-main` (build agent) → build attachment
`TestingBotBuildResult` → `tb-build-info` tab (browser) → TestingBot API via the
service endpoint. The tab never sees raw credentials outside that attachment.

## Task vs. web code — two different runtimes

- **Task code** runs on the build agent under the `Node20_1` handler. Both tasks
  are TypeScript (`index.ts` compiled to `index.js` in place).
  - `tb-main/index.ts` uses `azure-pipelines-task-lib/task` (`tl.getInput`,
    `tl.getBoolInput`, `tl.setVariable`, `tl.setSecret`, `tl.command`,
    `tl.setResult`) and `testingbot-tunnel-launcher`. It declares those runtime
    deps in `tb-main/package.json`; they are NOT committed — the `deps` build
    step installs them into `dist/tb-main/node_modules` so the task is
    self-contained.
  - `tb-stop-tunnel/index.ts` must stay **dependency-free** — it reads
    `TB_TUNNEL_PID` directly from `process.env`, calls `process.kill`, and emits
    the raw `##vso[task.complete …]` logging command itself. Do NOT add
    `azure-pipelines-task-lib` (or any runtime dependency) to the stop task; its
    `package.json` has no `dependencies`, so nothing is installed into
    `dist/tb-stop-tunnel`.

- **Web/tab code** (`tb-build-info/scripts/*.js`) runs in the browser inside Azure
  DevOps and is bundled by webpack (`webpack.config.js`) with AMD output and
  `@babel/preset-env`. The two entry points (`info`, `dialog`) emit to
  `dist/tb-build-info/scripts/`. The host-provided SDK modules (`TFS/*`, `VSS/*`,
  `react`) are declared as webpack **externals** (`externalsType: 'amd'`) — they
  are resolved by the VSS module loader at runtime, not bundled. Add any new
  host-provided module to the `externals` list in `webpack.config.js`, or the
  bundle will try to inline it. `info.js` still uses `Buffer`, so the config
  provides a `buffer` polyfill (removed when the tab is rewritten — see
  `MODERNIZATION.md` Phase 3).

## webpack pipeline specifics

`webpack.config.js` does the bundle plus a `copy-webpack-plugin` pass that copies
the static files into `dist/`: `images`, `overview.md`, `vss-extension.json`, the
`tb-main` / `tb-stop-tunnel` folders, everything in `tb-build-info` **except**
`scripts/**` (those are bundled, not copied), and `VSS.SDK.js` into `dist/lib/`.

`bin/upload_all.js` is a helper that uploads the `tb-*` build task definitions
directly to a collection via tfx-cli (separate from packaging the extension).

`MODERNIZATION.md` holds the full modernization roadmap. This build/task rework
is Phase 1 of it; Phases 2-4 (TypeScript tasks, runtime tunnel download, secret
hygiene, SDK migration, CI/publishing) are still pending.
