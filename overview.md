## TestingBot for Azure DevOps

Run your **Selenium** and **Appium** tests on the **TestingBot** cloud grid directly from **Azure Pipelines**. TestingBot gives you 6100+ browser and operating-system combinations plus physical iOS and Android devices, so you can run fast, parallel, cross-browser and mobile app tests as part of every Azure DevOps build and release.

[Sign up for a free TestingBot trial](https://testingbot.com/signup?utm_source=vsip) to get started.

### Why TestingBot + Azure DevOps

- **Cross-browser testing at scale** — 6100+ combinations, from legacy Internet Explorer to the latest Chrome, Firefox, Safari and Edge on Windows and macOS.
- **Physical mobile devices** — run mobile app tests on real, physical iOS and Android devices for true-to-life results.
- **Every major mobile framework** — Appium, Espresso, XCUITest and Maestro are all supported for native and hybrid app testing.
- **Run tests in parallel** — finish your automated test suite in minutes instead of hours by running tests concurrently on the grid.
- **Any language or framework** — compatible with Selenium and Appium tests written in Java, C#, Python, JavaScript, Ruby, PHP and more.

### What this extension adds to your pipeline

- **TestingBot Configuration (`TBMain`)** — securely injects your TestingBot credentials (`TB_KEY`, `TB_SECRET`) and grid endpoint into your build, so your tests reach the cloud without hardcoding secrets.
- **Upload App to TestingBot Storage (`TBUploadApp`)** — upload your `.apk`, `.aab`, `.ipa` or `.zip` build straight from the pipeline and get a `tb://` URL to use as your Appium, Espresso, XCUITest or Maestro app under test — ideal for always testing the latest build.
- **TestingBot Tunnel** — securely test websites and apps on private, staging or firewalled machines. Start it with `TBMain` and stop it with the **Stop TestingBot Tunnel (`TBStopTunnel`)** task.
- **In-build test results** — a TestingBot tab in the build-results view shows each test's status, browser/OS and duration, with video recordings, logs and screenshots — without leaving Azure DevOps.

### Get results faster

See test results — including video, screenshots, metadata and logs — for every test you run on TestingBot. Pinpoint errors, crashes and flaky tests by watching the recording or inspecting the logs and screenshots.

### Secure by design

Each test runs on a pristine, brand-new virtual machine that is destroyed after the run, so no data is exposed to future sessions. With TestingBot Tunnel you can securely test applications behind your firewall.

### Documentation

See the [Azure DevOps integration guide](https://testingbot.com/support/integrations/ci-cd/azure) for step-by-step setup instructions.
