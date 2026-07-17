# TestingBot Azure DevOps Extension — Modernization Plan

_Date: 2026-07-17. Applies to repo `vso-testingbot-plugin` (marketplace: `testingbot.testingbot-tasks`, published v0.2.7, ~95 installs, last updated ~Oct 2022)._

> **Status (living document).** The findings below describe the pre-modernization
> state as originally analyzed; sections are being resolved phase by phase.
> - **Phase 1 — DONE (PR #17):** clean-checkout packaging restored (npm scripts +
>   webpack 5, gulp/Travis removed), both tasks on the `Node20_1` handler,
>   `azure-pipelines-task-lib` 5 with committed `node_modules` deleted, version
>   drift resolved via `scripts/stamp-version.js`, immediate correctness bugs fixed.
> - **Phase 2 — DONE (PR #18):** tasks rewritten in TypeScript, runtime tunnel via
>   `testingbot-tunnel-launcher` (jar deleted), secret pipeline variables, tests.
> - **Phase 3 — PENDING:** results-tab / SDK rewrite, including moving the `/mini`
>   URL signing server-side so the secret leaves the browser (finding #1).
> - **Phase 4 — PENDING:** CI/CD, lint, publishing.
>
> Items marked "PENDING" below are the genuinely outstanding work.

## 1. Executive summary

This extension is a 2016-era fork of Sauce Labs' now-unpublished `vso-sauce-ondemand-plugin`, written in ES5 JavaScript against the deprecated `vss-web-extension-sdk` and a vendored `vsts-task-lib` 1.1.0, with both pipeline tasks on the removed Node 6 `"Node"` execution handler. The build system is unrunnable from a clean checkout: Dependabot bumped gulp to ^4 and webpack-stream to ^7 (webpack 5) without migrating the gulp 3 / webpack 1 code, so `gulp`, `npm run package`, and every CI path fail before producing a `.vsix`. Worst of all, the agent task writes the raw TestingBot API key **and secret** into a plaintext `testingbot.json` build attachment that any user with build-read access can download, and the results tab loads an SRI-less third-party script from unpkg.com into that credential-holding page. All CI (Travis, Jenkinsfile on node:6.6.0, CodeQL v1) is dead.

**Top 5 actions:**

1. **Stop leaking the API secret** — remove `TB_KEY`/`TB_SECRET` from the build attachment and route all TestingBot API calls through the service-endpoint data source; mark exported variables secret. _(PARTIAL: secret pipeline variables done in Phase 2; the attachment still carries the credentials so the tab can sign `/mini` share URLs — moving that server-side is **PENDING** in Phase 3.)_
2. **Migrate both tasks to the `Node20_1` handler + `azure-pipelines-task-lib` 5.x** — the bare `"Node"` (Node 6) handler is removed from new agents in November 2026; the extension breaks on schedule without this. _(DONE — Phase 1/2.)_
3. **Replace the broken gulp 3 / webpack 1 / babel 6 toolchain** with TypeScript + webpack 5 + npm scripts (per `microsoft/azure-devops-extension-sample`) so a `.vsix` can be built at all. _(DONE — Phase 1 build, Phase 2 TypeScript.)_
4. **Stop bundling the 2019 tunnel jar** (`tb-main/tunnel/2.30.jar`, internally v2.9, vulnerable Jetty 9.4.12) — use `testingbot-tunnel-launcher` (npm, v1.1.18) to download/cache the current tunnel (v4.8) at runtime. _(DONE — Phase 2.)_
5. **Add real CI/CD** — GitHub Actions building the `.vsix` on every PR and publishing to the Marketplace on tag (tfx-cli 0.23.x, Entra/OIDC auth), replacing dead Travis/Jenkins/CodeQL v1 configs. _(PENDING — Phase 4.)_

## 2. Critical bugs & security issues (verified findings)

Severities shown are post-review calibrated values.

| # | Finding | File(s) | Severity | Fix |
|---|---------|---------|----------|-----|
| 1 | **API secret shipped to every build viewer**: task writes `TB_KEY`/`TB_SECRET` into `testingbot.json`, attaches it via `task.addattachment`; browser tab downloads and parses it (`info.js:282-304`), uses it at `info.js:202` and `:246`. Any project reader can extract the working credentials for the build's retention lifetime. | `tb-main/testingbot.js:151-170`, `tb-build-info/scripts/info.js` | Critical | Attachment carries only build name + endpoint id; API calls go through the endpoint data source (the Basic header at `info.js:200-203` is already redundant — the proxy injects credentials). Share-link md5 hashes (`info.js:246`) need a redesign (second data source or server-computed hashes). |
| 2 | **Build system cannot produce a `.vsix`**: entire Gulpfile is gulp 3 idiom under gulp ^4.0.2 — dies at `Gulpfile.js:18` (`gulp-help` touches removed `gulp.tasks`), then array-deps (`:58/:85/:89/:187`) and `run-sequence` would fail next. `dist/` is gitignored; no built bundle exists anywhere. | `Gulpfile.js`, `package.json:31` | Critical | Rewrite for gulp 4 (`series`/`parallel`) or, better, drop gulp for npm scripts + webpack 5 (Phase 1). |
| 3 | **webpack 1 config vs webpack 5**: `module.loaders`, `resolveLoader.root`, bare `'babel'`/`'style!css'` loaders, `query`, `#inline-source-map` — all rejected by webpack 5 schema validation; babel config (`presets: ['es2015']`) incompatible with babel-loader 9 / @babel/core 7. | `Gulpfile.js:93-137` | Critical | Rewrite as `module.rules` + `@babel/preset-env`, or move to ts-loader/TypeScript (Phase 1/3). |
| 4 | **Node 6 `"Node"` execution handler** in both tasks — deprecated, currently runs via agent fallback with warnings; removal from new agents November 2026. | `tb-main/task.json:47-52`, `tb-stop-tunnel/task.json:22-27` | Critical (time-boxed) | Declare `"Node20_1"` (+ `"Node16"`/`"Node10"` fallback), `minimumAgentVersion: 3.232.1`. `tb-stop-tunnel/sample.js` is dependency-free and Node 20-ready; `tb-main` needs the task-lib upgrade. |
| 5 | **SRI-less third-party script from unpkg.com** loaded into the credential-holding tab (`text-encoding@0.6.1`, no `integrity`, no CSP); a CDN compromise runs arbitrary JS with the VSS token and TB credentials. The polyfill is dead weight — `window.TextDecoder` is native everywhere (`info.js:303`). | `tb-build-info/infoTab.html:5` | High (high-impact / low-likelihood) | Delete the script tag entirely. |
| 6 | **Secret exported as non-secret pipeline variable** — `tl.setVariable('TB_SECRET', ...)` without the `secret` flag: plain env var for every subsequent step, no masking registration. | `tb-main/testingbot.js:60-63` | High | Pass `true` as third arg (works even in vendored lib 1.1.0); after migration use `tl.setSecret` too. |
| 7 | **Vendored 2016 `vsts-task-lib` 1.1.0 + 210 committed node_modules files**, no `tb-main/package.json`, invisible to Dependabot/`npm audit`; lib was literally copied from the Sauce plugin checkout. | `tb-main/node_modules/` | Medium–High | Declare `azure-pipelines-task-lib` ^5 (npm latest 5.277.0) in a real per-task `package.json`; install prod deps (or esbuild-bundle) at package time. |
| 8 | **Bundled tunnel jar from Jan 2019** (file named 2.30.jar, internal pom says v2.9) with Jetty 9.4.12 (CVE-2019-10241/10247, CVE-2020-27216, CVE-2021-28165), commons-collections 3.2.1, abandoned Ganymed SSH-2; no `error` handler on spawn so a missing `java` crashes the task. | `tb-main/tunnel/2.30.jar`, `testingbot.js:85-97` | High | Replace with `testingbot-tunnel-launcher` runtime download (Java >= 11 check, ready-file detection built in). |
| 9 | **Secret on the java command line** — key/secret passed as argv, visible in process listings on shared agents; tunnel v4.8 supports `TESTINGBOT_AUTH` env instead. | `tb-main/testingbot.js:85-92` | Low–Medium | Pass credentials via env (`TESTINGBOT_AUTH`) or the launcher's options. |
| 10 | **`tb-stop-tunnel` crashes when `TB_TUNNEL_PID` is unset** — `.replace()` on `undefined` before the guard; the friendly "Maybe the Tunnel was not started?" path is unreachable. Also kills `'undefined'`-string PIDs from failed spawns. | `tb-stop-tunnel/sample.js:1-10` | Medium–High | Guard first, `parseInt` + `isNaN` check, exit 0 gracefully. |
| 11 | **Tunnel error paths masked**: `close` handler does `process.exit(code)` — a tunnel that exits 0 before printing "You may start your tests" reports success; no timeout, no diagnostics, no attachment written on failure. | `tb-main/testingbot.js:132-134, 172-174` | Medium | Fail explicitly with nonzero code + message pre-readiness; add readiness timeout and spawn `error` handler (launcher provides all of this). |
| 12 | **Null endpoint auth → confusing TypeError** (`auth.scheme` on null) plus `task.json:27` declares `connectedServiceName` `required:false` while the script hard-requires it; error message mentions "SonarQube endpoint" (copy-paste residue, `testingbot.js:21`). | `tb-main/testingbot.js:18-21, 47-50` | Low–Medium | Null-check auth, set `required:true`, fix the message. |
| 13 | **`JSON.parse(tl.getInput('tbTunnel'))`** — throws on `"True"`/`"False"` produced by YAML template-expression expansion of boolean parameters. | `tb-main/testingbot.js:138` | Medium | `tl.getBoolInput('tbTunnel', false)`. |
| 14 | **Over-broad scopes**: `vso.serviceendpoint_manage` (full CRUD on all service connections) where `vso.serviceendpoint_query` suffices; `vso.build_execute` where `vso.build` suffices; `vso.test`/`vso.test_write` unused. Amplified by finding #5. | `vss-extension.json:35` | Medium | Reduce to `vso.serviceendpoint_query` + `vso.build`. |
| 15 | **Results-tab pagination bugs**: divisor taken from current page's `count` (last-page navigation corrupts links/labels/offsets); `count:0` with `total>0` hangs the tab in an infinite loop. | `tb-build-info/scripts/info.js:222-243` | Medium | Use fixed page size (API `count` max 500), guard `paginationCount <= 0`. |
| 16 | **Errors leave "LOADING" up forever**; pagination clicks swallow failures as unhandled rejections. | `info.js:280-314, 234-241`, `infoTab.html:21` | Medium | Render an error state in both catch paths; guard `build.orchestrationPlan`. |
| 17 | **`embedDialog` frames any `?url=`** with no allowlist (renders on the extension CDN origin, so phishing value is limited but real). | `tb-build-info/scripts/dialog.js:16-20` | Low–Medium | Require `https:` + `testingbot.com` host via `new URL()` check. |
| 18 | **Version drift**: package.json 0.2.7 vs vss-extension.json 0.1.0 vs task.json 0.2.0 — stamping only happens in the (unrunnable) gulp build. | `vss-extension.json:5`, `tb-*/task.json` | Medium | Single source of truth + CI stamping (`tfx --rev-version` or marketplace-driven versioning). |
| 19 | **All CI dead**: Travis (org shut down 2021, node 9), Jenkinsfile pinned to `node:6.6.0` with removed `stage 'Name'` syntax, CodeQL action @v1 (disabled Jan 2023). `TB_BUILD_NAME` also degrades to `'_'` in releases without a build artifact (`testingbot.js:67-70`). | `.travis.yml`, `Jenkinsfile:7`, `.github/workflows/codeql-analysis.yml` | Medium | Phase 4. |
| 20 | Minor: `tunnel_bin` variable shadowing (`testingbot.js:77/85`); phantom `gulp-util` dependency (`Gulpfile.js:4`); deep requires into `tfx-cli/_build/*` internals (`Gulpfile.js:11-12, 141-167`); `$(message)` in both `instanceNameFormat`s references a nonexistent input; VSTS branding in name/description. | various | Low | Swept up by the phase work below. |

## 3. Modernization roadmap

### Phase 1 — Make it build & run again

Goal: a clean checkout produces a correct, versioned `.vsix`, and the tasks execute on 2026 agents.

| Step | Effort | Detail / rationale |
|------|--------|--------------------|
| 1.1 Replace the Gulpfile with npm scripts + webpack 5 | **M** | Model on `microsoft/azure-devops-extension-sample`: `webpack ^5` + `copy-webpack-plugin` for static files, `rimraf` for clean, `tfx extension create --manifest-globs vss-extension.json --rev-version` for packaging. This deletes gulp 3/4, `gulp-help`, `run-sequence`, `gulp-copy`, the phantom `gulp-util` require, and the fragile `tfx-cli/_build/*` internal requires (`Gulpfile.js:11-12, 141-167`) in one move. If a minimal interim fix is wanted first, shelling out to `node_modules/.bin/tfx` from a tiny script restores packaging in hours. |
| 1.2 Upgrade tfx-cli to 0.23.4 (needs Node >= 20) | **S** | Current pin ^0.12.0 is years stale; 0.23.x supports Entra-token auth and current manifest validation. |
| 1.3 Switch both `task.json`s to `Node20_1` handler | **S** | `"execution": { "Node20_1": { "target": "..." }, "Node16": { ... } }`, `minimumAgentVersion: "3.232.1"`. Node 6/10/16 runners are removed from new agents in **November 2026** — this is the hard deadline for the whole plan. `tb-stop-tunnel/sample.js` is already Node 20-compatible (after the unset-PID guard fix). |
| 1.4 Real dependency manifest for `tb-main` | **M** | Add `tb-main/package.json` declaring `azure-pipelines-task-lib@^5.277.0`; delete the 210 committed node_modules files; run `npm ci --omit=dev` (or esbuild-bundle to one file) into `dist/tb-main` at package time. Update `require('vsts-task-lib')` → `require('azure-pipelines-task-lib/task')` and verify against lib 5.x API. |
| 1.5 Fix the immediate correctness bugs | **S** | Findings #10, #12, #13, `tunnel_bin` shadowing, `$(message)` removal, `connectedServiceName` `required:true`, `TB_BUILD_NAME` release fallback (`RELEASE_DEFINITIONNAME`/`RELEASE_RELEASEID`, filter falsy parts). |
| 1.6 Version stamping in one place | **S** | Keep `package.json` as source of truth; stamp `vss-extension.json` and both `task.json`s numerically in the package script (or use `tfx --rev-version` / marketplace-driven versioning in Phase 4). Resolves the 0.2.7/0.1.0/0.2.0 drift. |

### Phase 2 — Modernize the tasks

Goal: TypeScript tasks matching current Microsoft and vendor practice, with credentials handled safely.

| Step | Effort | Detail / rationale |
|------|--------|--------------------|
| 2.1 Rewrite `tb-main` and `tb-stop-tunnel` in TypeScript | **M** | `index.ts` per task, `tsc` targeting ES2022, TypeScript >= 5.0, `azure-pipelines-task-lib` 5.x typed API. Adopt the documented `buildandreleasetask` layout (task.json + index.ts + package.json + tests/ per folder). BrowserStack made exactly this migration (Node handler + TS) in their 2.1.0 release. |
| 2.2 Replace the bundled jar with `testingbot-tunnel-launcher` | **M** | npm `testingbot-tunnel-launcher@1.1.18` (zero deps, Node >= 18): downloads/caches the current tunnel jar from testingbot.com, checks Java >= 11 (Microsoft-hosted agents ship 11/17), ready-file startup detection with timeout, `downloadAndRunAsync`/`killAsync` promise API, fatal-condition watch (401, minutes-left). Kills findings #8, #11, and the missing-`java` crash; VSIX shrinks by 3.2 MB and the tunnel is never frozen again. Expose inputs mirroring `testingbot-tunnel-action` v2: `tunnelIdentifier`, `sePort`, `proxy`, `noCache`, `noBump`, `readyTimeout`. |
| 2.3 Credential hygiene | **S** | `tl.setSecret(secret)` before any use; `tl.setVariable(name, value, /*secret*/ true)` for `TB_SECRET`/`TESTINGBOT_SECRET`; pass credentials to the tunnel via env (`TESTINGBOT_AUTH`, tunnel >= 4.8) or launcher options, never argv (finding #9). Export `TESTINGBOT_KEY`/`TESTINGBOT_SECRET` names alongside legacy `TB_*` for compatibility with TestingBot's current docs. |
| 2.4 Fix the attachment payload (security finding #1) | **M** | `testingbot.json` attachment carries only: build name, endpoint id, task version. No key, no secret. This is the agent-side half of the Phase 3 tab fix and can ship first (the tab must tolerate both payload shapes during transition, as BrowserStack's tab does for its old format). |
| 2.5 Robust tunnel lifecycle | **S** | Fail with a clear nonzero result if the tunnel exits pre-ready (even with code 0); readiness timeout; unique `tunnelIdentifier` derived from `Build.BuildId` + attempt; stop task falls back to `GET /v1/tunnel/list` + `DELETE /v1/tunnel/{id}` for orphaned tunnels on cancelled jobs. |
| 2.6 Modern task.json metadata | **S** | Add `"restrictions": {"commands": {"mode": "restricted"}, "settableVariables": {"allowed": ["TB_*", "TESTINGBOT_*", "SELENIUM_*"]}}` (Microsoft-recommended for all new tasks; needs agent >= 2.182.1), `runsOn: ["Agent"]`, `outputVariables`, and a proper `instanceNameFormat`. |
| 2.7 Unit tests | **M** | `azure-pipelines-task-lib/mock-run` (`TaskMockRunner`) + `mock-test` (`MockTestRunner`) under mocha; smoke-test via `node index.js` with `INPUT_*` env vars. The repo currently has zero tests. |

### Phase 3 — Modernize the web tab

Goal: a results tab with no secrets in the browser, no CDN scripts, and a supported SDK.

| Step | Effort | Detail / rationale |
|------|--------|--------------------|
| 3.1 Delete the unpkg script tag | **S** | `infoTab.html:5` — remove entirely; `window.TextDecoder` is native (its sole use is `info.js:303`). Do this immediately; it does not depend on the SDK migration. |
| 3.2 Port from `vss-web-extension-sdk` 1.106 to `azure-devops-extension-sdk` | **L** | Use sdk **v4.x** for now (api 5.275.0's peerDependency is `^2 \|\| ^3 \|\| ^4`, not yet v5) + `azure-devops-extension-api` 5.275.0 with subpath imports (`azure-devops-extension-api/Build`), optionally `azure-devops-ui` 2.276.0 (hard peer dep: React 16.8.x, not 18). Get build context via `SDK.getService(BuildServiceIds.BuildPageDataService).getBuildPageData()` — `SDK.getConfiguration()` is unreliable for `ms.vss-build-web.build-results-tab`. The old VSS.SDK keeps working meanwhile ("will continue to work indefinitely" per Microsoft), so this can trail Phases 1-2 without a flag day. |
| 3.3 Remove all credential use from the browser | **M** | Drop the client-built Basic header (`info.js:200-203`) — `executeServiceEndpointRequest` proxies auth server-side via the endpoint's stored credential. Read only non-secret metadata from the (fixed) attachment. For per-test share links (`info.js:246`, md5(key:secret:session_id) — TestingBot's own scheme), add a service-endpoint data source or a TestingBot API endpoint that returns share URLs/hashes server-side; until then, degrade to linking testingbot.com directly rather than shipping the secret. Delete the 180-line inline MD5 implementation. |
| 3.4 Fix pagination + error UX | **S** | Fixed page size from the offset-0 response (`meta` envelope: `{data, meta:{offset,count,total}}`, count max 500); guard zero counts; render error states instead of eternal "LOADING"; try/catch the pagination click handler. |
| 3.5 Validate `embedDialog` URL | **S** | `new URL(params.url)` must be `https:` + host `testingbot.com`, else render nothing (`dialog.js:16-20`). |
| 3.6 Minimize scopes + rebrand | **S** | `vss-extension.json:35` → `["vso.build", "vso.serviceendpoint_query"]`; drop unused `vso.test`/`vso.test_write`. Rename "TestingBot for Visual Studio Team Services" → Azure DevOps branding (`vss-extension.json:4,8`), fix the "integeration"-era description, refresh the marketplace listing to enumerate the tasks. |

### Phase 4 — DX & release automation

| Step | Effort | Detail / rationale |
|------|--------|--------------------|
| 4.1 Delete dead CI | **S** | Remove `.travis.yml` (org shut down 2021) and `Jenkinsfile` (node:6.6.0, removed `stage` syntax). |
| 4.2 GitHub Actions build workflow | **S** | On PR/push: Node 20, `npm ci`, lint, tests, build, `tfx extension create`, upload `.vsix` artifact. This single workflow would have caught the Dependabot gulp4/webpack5 breakage that shipped unnoticed. |
| 4.3 Marketplace publishing on tag | **M** | `jessehouwing/azdo-marketplace@v6` (successor of Azure DevOps Extension Tasks; runs on GitHub Actions): `query-version` (version-source: marketplace, action: Patch) → `publish` with `extension-version` override — no version-commit-back needed. Prefer `auth-type: oidc` (federated Entra) over PATs: all-org PATs are retired **Dec 1, 2026**. Publish a private `-dev` manifest variant to a TestingBot test org before public release (pattern from both the Sauce fork's beta channel and the Microsoft sample). |
| 4.4 Fix CodeQL workflow | **S** | `github/codeql-action/*@v3`, `actions/checkout@v4` (v1 disabled Jan 2023; the repo's only automated check produces no signal today). |
| 4.5 ESLint / formatting refresh | **S** | Replace `babel-eslint` config with `@typescript-eslint` once Phase 2 lands. |
| 4.6 Docs | **S** | Rewrite README (current build instructions are all broken); add a YAML quick-start (secret variables + script steps) mirroring what Sauce/BrowserStack docs do, for users who cannot install marketplace extensions. |

**Sequencing note:** Phase 1 + steps 2.3/2.4/3.1 are the minimum credible release (fixes the credential leak and the November 2026 handler deadline). Phase 3.2 (SDK port) is the largest single item and can ship in a later minor version.

## 4. Competitor comparison

| Dimension | **TestingBot** (this repo, v0.2.7) | **Sauce Labs** (`saucelabs.saucelabs-tasks`, v0.1.18) | **BrowserStack** (`browserstackcom.browserstack-vsts-extension`, v2.2.2) |
|---|---|---|---|
| Status | Published but stale (~Oct 2022, ~95 installs) | **Unpublished/abandoned** (last commit Jul 2019; docs now recommend plain YAML + saucectl) | **Actively maintained** (updated Jul 2026, ~3.1k installs), closed source |
| Tasks | Config (+tunnel start), Stop Tunnel | Config (+Sauce Connect), Stop SC | Config (+Local), Stop Local, **Test Reports**, **App Uploader** |
| Language / task-lib | ES5 JS, vendored `vsts-task-lib` 1.1.0 | ES5 JS, vendored `vsts-task-lib` 1.1.0 (this repo's direct ancestor) | TypeScript, `azure-pipelines-task-lib` 4.17.3 |
| Node handler | `Node` (Node 6) — removal Nov 2026 | `Node` (Node 6) | `Node20_1`, `minimumAgentVersion` 3.232.1 (migrated 2.1.0, Apr 2025) |
| Tunnel handling | 2019 jar (internally v2.9) committed in git, spawned with argv credentials | SC 4.5.4 binaries committed + upx-compressed (frozen forever) | **Not bundled** — `browserstack-local` npm downloads per-platform binary at runtime, PID + binary path saved for the stop task, multi-tunnel support |
| Results UI | jQuery tab on VSS.SDK; **secret shipped to browser via attachment**; unpkg CDN script | Same architecture, but data sources keep the key server-side | Agent-side task fetches report, attaches JSON; tab reads attachment with viewer's own AzDO session — **no vendor credentials in browser**; still legacy VSS.SDK, CDN jQuery |
| Service endpoint | Basic auth key/secret + `getBuildFullJobs` data source | Basic auth + data-center combo + data sources | Basic auth (confidential accessKey) + **TestConnection data source** (working Verify button) |
| Scopes | build_execute, test, test_write, **serviceendpoint_manage** | Same (shared ancestry) | build_execute, serviceendpoint_manage (still broad, but smaller) |
| Build-name join key | `BUILD_DEFINITIONNAME_BUILDID` (breaks to `'_'` in artifact-less releases) | Same | Sanitized `azure-<def>-<id>` with RELEASE_* fallback + `-azure` username suffix for attribution |
| CI/publishing | Dead Travis + Jenkins node:6.6.0; manual tfx via private internals | Dead Travis + Jenkins; dev-channel beta publisher (good idea) | Opaque, but ships regular releases |

**Gap analysis.** TestingBot inherits every flaw that killed the Sauce extension (Node 6 handler, vendored 2016 task-lib, bundled frozen tunnel, dead CI) and adds a credential leak the Sauce ancestor did not have (Sauce kept the key server-side via data sources). BrowserStack demonstrates the target state on every axis — Node20_1 + TypeScript + task-lib 4/5, runtime tunnel download via the vendor npm wrapper, attachment-fed results tab with zero browser-side vendor credentials, TestConnection verify button — while still leaving TestingBot room to beat it: BrowserStack sets its access key as a non-secret variable, uses the deprecated `request` lib, loads jQuery from a CDN, and has no public source repo. **Market opening:** Sauce Labs has *no* Azure DevOps extension today; a maintained TestingBot extension with a working in-UI results tab is a genuine differentiator, and an open GitHub repo is a trust advantage BrowserStack lacks.

## 5. Ranked recommendations

### Must-have

1. **Remove TB_KEY/TB_SECRET from the build attachment and all browser code**; proxy API calls through the service-endpoint data source; secret-flag pipeline variables. _(Verified findings #1/#6; BrowserStack attachment pattern — browserstack.com/docs/automate/selenium/azure-pipelines + VSIX inspection; Sauce data-source pattern — vso-sauce-ondemand-plugin sources.)_
2. **Migrate both tasks to `Node20_1` + `azure-pipelines-task-lib` 5.x (5.277.0), TypeScript >= 5.0**, `minimumAgentVersion` 3.232.1, before the November 2026 Node 6/10/16 runner removal. _(learn.microsoft.com/…/nodejs-runners; tasks.schema.json; devblogs node-runner guidance.)_
3. **Restore the build**: npm scripts + webpack 5 + tfx-cli 0.23.4, deleting gulp/run-sequence/gulp-help/gulp-util and the `tfx-cli/_build` internal requires. _(microsoft/azure-devops-extension-sample package.json; verified Gulpfile failure at line 18.)_
4. **Adopt `testingbot-tunnel-launcher@1.1.18` for runtime tunnel download** (tunnel v4.8, Java 11+, ready-file detection); delete `tb-main/tunnel/2.30.jar`. _(registry.npmjs.org/testingbot-tunnel-launcher; github.com/testingbot/Testingbot-Tunnel releases; testingbot-tunnel-action v2 input surface.)_
5. **Remove the unpkg.com script tag** (`infoTab.html:5`) — native `TextDecoder` suffices. _(Verified finding #5.)_
6. **Minimize manifest scopes** to `vso.build` + `vso.serviceendpoint_query`; add `restrictions.commands.mode: restricted` to both task.jsons. _(tasks.schema.json; add-build-task tutorial.)_
7. **Modernize REST usage**: Basic auth header (never URL-embedded), `GET /v1/builds` with `{data, meta}` envelope and offset/count (max 500) — also fixes the pagination bugs. _(testingbot.com/support/api.)_

### Should-have

8. **Port the tab to `azure-devops-extension-sdk` v4 + `azure-devops-extension-api` 5.275.0** (React 16.8.x if using azure-devops-ui); use `BuildPageDataService` for build context. _(azure-devops-extension-sample; sdk#85 and vsts-extension-samples#143 for tab limitations.)_
9. **GitHub Actions CI + marketplace publish** via `jessehouwing/azdo-marketplace@v6` with OIDC/Entra auth (all-org PATs retired Dec 1, 2026); PR builds upload the `.vsix`. _(github.com/jessehouwing/azdo-marketplace; learn.microsoft.com publish/command-line.)_
10. **TestConnection data source** on the endpoint type so the service-connection UI gets a working Verify button (e.g. `GET /v1/user` with a jsonpath resultSelector). _(BrowserStack vsomanifest.)_
11. **Unit tests** with mock-run/mock-test + mocha; there are currently none. _(add-build-task tutorial.)_
12. **Robust tunnel lifecycle**: readiness timeout, fail on pre-ready exit (even code 0), unique tunnel identifier from `Build.BuildId`+attempt, API-based orphan cleanup (`/v1/tunnel/list`, `DELETE /v1/tunnel/{id}`). _(Findings #10/#11; testingbot.com/support/api; sauce-connect-action retry pattern.)_
13. **Fix build-name join key** with RELEASE_* fallback and falsy-part filtering; document that users must pass it as the `build` capability. _(Finding on `testingbot.js:67-70`; BrowserStack build-name pattern.)_
14. **Rebrand to Azure DevOps** in name/description/README; refresh the marketplace listing (last touched ~Oct 2022). _(marketplace listing for testingbot.testingbot-tasks.)_

### Nice-to-have

15. **esbuild bundling** of task entry points to shrink the VSIX instead of shipping node_modules. _(devblogs "Shrinking Azure Pipeline task extensions using esbuild".)_
16. **Docker-mode tunnel option** (`testingbot/tunnel` image) for agents without Java, mirroring testingbot-tunnel-action v2. _(github.com/testingbot/testingbot-tunnel-action.)_
17. **Private `-dev` publisher channel** for pre-release smoke tests in a real org. _(Sauce fork's beta rebrand; azure-devops-extension-sample dev manifest.)_
18. **Usage attribution** (e.g. User-Agent `AzureDevOps/<taskVersion>` on API calls or a username suffix), fail-silent. _(Sauce stats ping; BrowserStack `-azure` suffix.)_
19. **App-upload task** analogue if TestingBot mobile testing warrants it (validate file, export `TESTINGBOT_APP_ID`). _(BrowserStack AppUploader contract.)_
