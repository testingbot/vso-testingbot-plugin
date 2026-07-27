import * as SDK from 'azure-devops-extension-sdk';
import { getClient } from 'azure-devops-extension-api/Common';
import { BuildRestClient, BuildServiceIds, IBuildPageDataService } from 'azure-devops-extension-api/Build';
import { ServiceEndpointRestClient, ServiceEndpointRequest } from 'azure-devops-extension-api/ServiceEndpoint';
import md5 from 'blueimp-md5';

interface BuildInformation {
  TB_KEY: string;
  TB_SECRET: string;
  TB_BUILD_NAME: string;
  CONNECTED_SERVICE_NAME: string;
}

interface TestJob {
  session_id: string;
  name: string;
  os: string;
  browser: string;
  browser_version?: string;
  duration?: number;
  created_at?: string;
  // status_id is TestingBot's raw test_case.success integer (1 pass, 0 fail,
  // 2 unknown, 3 ignored); `success` is the boolean roll-up (true only for 1).
  status_id?: number;
  success: boolean;
}

interface BuildMeta {
  offset: number;
  count: number;
  total: number;
}

interface BuildResponse {
  data: TestJob[];
  meta: BuildMeta;
}

const ATTACHMENT_TYPE = 'TestingBotBuildResult';

let buildClient: BuildRestClient;
let endpointClient: ServiceEndpointRestClient;
let projectId: string;

function container(): HTMLElement {
  return document.querySelector('.build-info') as HTMLElement;
}

function renderMessage(message: string): void {
  const el = container();
  el.textContent = '';
  const h2 = document.createElement('h2');
  h2.textContent = message;
  el.appendChild(h2);
}

async function downloadAttachmentJson(buildId: number, href: string, name: string): Promise<BuildInformation> {
  // The attachment self link is
  //   .../build/builds/{buildId}/{timelineId}/{recordId}/attachments/{type}/{name}
  // Download via the SDK's typed client (proxied through the host). A raw fetch to
  // dev.azure.com from the extension iframe would be blocked by CORS.
  const match = href.match(/\/builds\/\d+\/([0-9a-fA-F-]+)\/([0-9a-fA-F-]+)\/attachments\//);
  if (!match) {
    throw new Error('Unexpected attachment link format');
  }
  const [, timelineId, recordId] = match;
  const buffer = await buildClient.getAttachment(projectId, buildId, timelineId, recordId, ATTACHMENT_TYPE, name);
  return JSON.parse(new TextDecoder('utf-8').decode(buffer));
}

async function getBuildResponse(buildInformation: BuildInformation, offset: number): Promise<BuildResponse | null> {
  const headers = [];
  // The TestingBot data source injects auth server-side; the Basic header is only
  // added for backwards compatibility when the (legacy) secret is present.
  if (buildInformation.TB_SECRET) {
    headers.push({
      name: 'Authorization',
      value: 'Basic ' + btoa(buildInformation.TB_KEY + ':' + buildInformation.TB_SECRET)
    });
  }

  const request = {
    dataSourceDetails: {
      dataSourceName: 'getBuildFullJobs',
      dataSourceUrl: '',
      headers,
      parameters: { build: buildInformation.TB_BUILD_NAME, offset: String(offset) }
    }
  } as unknown as ServiceEndpointRequest;

  const result = await endpointClient.executeServiceEndpointRequest(
    request,
    projectId,
    buildInformation.CONNECTED_SERVICE_NAME
  );

  // The proxied data source returns { result: ["<json>"], statusCode, errorMessage }.
  // When the TestingBot API has no build with this name it answers 404, leaving
  // result empty — treat that as "no results" rather than an error.
  const payload = (result as unknown as { result?: string[] }).result;
  if (!payload || payload[0] === undefined) {
    return null;
  }
  return JSON.parse(payload[0]);
}

// Embed the TestingBot /mini viewer inline in this tab rather than in a custom
// dialog: openCustomDialog renders its content through the host's legacy dialog
// framework, which does not load in the modern build-results view (the dialog
// opened but its body stayed empty). This tab iframe already has a working SDK
// handshake and fills the results area, so we swap the table for the viewer and
// offer a link back to the results.
function openTestEmbed(buildInformation: BuildInformation, job: TestJob, restore: () => void): void {
  const auth = md5(buildInformation.TB_KEY + ':' + buildInformation.TB_SECRET + ':' + job.session_id);
  const url = 'https://testingbot.com/mini/' + job.session_id + '?auth=' + auth;

  const el = container();
  el.textContent = '';
  el.style.height = '';
  el.style.overflow = '';

  const back = document.createElement('a');
  back.className = 'tb-back';
  back.href = '#';
  // The leftwards arrow renders correctly now that infoTab.html declares
  // <meta charset="utf-8"> (the bundled script inherits the document encoding).
  back.textContent = '← Back to results';
  back.addEventListener('click', (e) => {
    e.preventDefault();
    restore();
  });
  el.appendChild(back);

  const iframe = document.createElement('iframe');
  iframe.className = 'tb-embed';
  iframe.src = url;
  iframe.title = job.name;
  // Fill the available tab height so the /mini viewer's video and step list are
  // not cut off, with a generous floor when the host reports a small viewport.
  iframe.style.height = Math.max(820, window.innerHeight - 40) + 'px';
  el.appendChild(iframe);
}

// Environment marks use TestingBot's own icons, bundled under
// tb-build-info/images/environments/ (mirrors app/helpers/application_helper.rb
// browser_image_from_name / os_image_from_name). Paths are relative to
// infoTab.html; if a file 404s the <img> is dropped, leaving the text label.
const ICON_BASE = 'images/environments/';

function iconImg(file: string, label: string): HTMLImageElement {
  const img = document.createElement('img');
  img.src = ICON_BASE + file;
  img.alt = label;
  img.addEventListener('error', () => img.remove());
  return img;
}

function browserIcon(browser: string): HTMLImageElement | null {
  const v = (browser || '').toLowerCase();
  if (/edge/.test(v)) {
    return iconImg('edge.png', browser);
  }
  if (/chrome|chromium/.test(v)) {
    return iconImg('chrome.png', browser);
  }
  if (/firefox/.test(v)) {
    return iconImg('firefox.png', browser);
  }
  if (/safari/.test(v)) {
    return iconImg('safari.png', browser);
  }
  if (/opera/.test(v)) {
    return iconImg('opera.png', browser);
  }
  if (/samsung/.test(v)) {
    return iconImg('samsung.png', browser);
  }
  if (/electron/.test(v)) {
    return iconImg('electron.png', browser);
  }
  if (/explorer|iexplore|(?:^|\W)ie(?:\b|\d)/.test(v)) {
    return iconImg('ie.png', browser);
  }
  return null;
}

// The API os field carries TestingBot's platform codes (WIN11, VISTA, SONOMA…);
// match them case-insensitively, most specific first.
function osIcon(os: string): HTMLImageElement | null {
  const v = (os || '').toUpperCase();
  const map: Array<[RegExp, string]> = [
    [/WIN11/, 'windows11.png'],
    [/WIN10|WIN8/, 'windows10.png'],
    [/(^|\W)XP(\W|$)/, 'xp_24.png'],
    [/WINDOWS|VISTA|WIN7/, 'windows.png'],
    [/LINUX/, 'linux.png'],
    [/HIGH.?SIERRA/, 'highsierra_24.png'],
    [/MOJAVE/, 'mojave_24.png'],
    [/CATALINA/, 'catalina_24.png'],
    [/BIG.?SUR/, 'bigsur_logo.png'],
    [/MONTEREY/, 'monterey_logo.png'],
    [/VENTURA/, 'ventura_logo.png'],
    [/SONOMA/, 'sonoma_logo.png'],
    [/SEQUOIA/, 'sequoia_logo.png'],
    [/TAHOE/, 'tahoe_logo.png'],
    [/GOLDENGATE/, 'goldengate_logo.png'],
    [/ANDROID/, 'android.png'],
    [/IOS|IPHONE|IPAD/, 'ios.png']
  ];
  for (const [re, file] of map) {
    if (re.test(v)) {
      return iconImg(file, os);
    }
  }
  return null;
}

type StatusKind = 'pass' | 'fail' | 'unknown' | 'ignored';

// A test that never reported its outcome is "unknown", not "failed". The boolean
// `success` can't tell those apart (both false), so key off status_id and fall
// back to the boolean only when it is absent (older API responses).
function statusOf(job: TestJob): { kind: StatusKind; label: string } {
  switch (job.status_id) {
    case 1: return { kind: 'pass', label: 'Passed' };
    case 0: return { kind: 'fail', label: 'Failed' };
    case 2: return { kind: 'unknown', label: 'Unknown' };
    case 3: return { kind: 'ignored', label: 'Ignored' };
    default:
      return job.success ? { kind: 'pass', label: 'Passed' } : { kind: 'fail', label: 'Failed' };
  }
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) {
    return '—';
  }
  const total = Math.round(seconds);
  if (total < 60) {
    return total + 's';
  }
  return Math.floor(total / 60) + 'm ' + (total % 60) + 's';
}

function formatStarted(iso: string | undefined): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  return isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

// Summary pills mirror the /mini build report ("N passed / N failed / N unknown").
// Ignored folds into the unknown bucket, matching TestingBot's success_group.
function renderSummary(jobs: TestJob[]): HTMLElement {
  const counts = { pass: 0, fail: 0, unknown: 0 };
  jobs.forEach((job) => {
    const kind = statusOf(job).kind;
    if (kind === 'pass') {
      counts.pass += 1;
    } else if (kind === 'fail') {
      counts.fail += 1;
    } else {
      counts.unknown += 1;
    }
  });

  const bar = document.createElement('div');
  bar.className = 'tb-summary';
  const add = (cls: string, text: string, show = true): void => {
    if (!show) {
      return;
    }
    const pill = document.createElement('span');
    pill.className = 'tb-status ' + cls;
    pill.textContent = text;
    bar.appendChild(pill);
  };
  add('pass', counts.pass + ' passed');
  add('fail', counts.fail + ' failed');
  add('unknown', counts.unknown + ' unknown', counts.unknown > 0);
  return bar;
}

function renderResults(
  buildInformation: BuildInformation,
  jobs: TestJob[],
  meta: BuildMeta,
  currentOffset: number,
  pageSize: number
): void {
  const el = container();
  el.textContent = '';
  el.style.height = '';
  el.style.overflow = '';

  const heading = document.createElement('h2');
  heading.textContent = buildInformation.TB_BUILD_NAME || 'TestingBot results';
  el.appendChild(heading);

  const subtitle = document.createElement('div');
  subtitle.className = 'tb-subtitle';
  subtitle.textContent = `${meta.total} test${meta.total === 1 ? '' : 's'}`;
  el.appendChild(subtitle);

  el.appendChild(renderSummary(jobs));

  const table = document.createElement('table');
  table.className = 'tb-table';
  table.innerHTML =
    '<thead><tr><th>Name</th><th>Status</th><th>Environment</th>' +
    '<th>Duration</th><th>Started at</th></tr></thead>';
  const tbody = document.createElement('tbody');

  jobs.forEach((job) => {
    const tr = document.createElement('tr');

    const nameCell = document.createElement('td');
    const link = document.createElement('a');
    link.className = 'tb-test-link';
    link.href = '#';
    link.textContent = job.name;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openTestEmbed(buildInformation, job, () =>
        renderResults(buildInformation, jobs, meta, currentOffset, pageSize)
      );
    });
    nameCell.appendChild(link);
    tr.appendChild(nameCell);

    const statusCell = document.createElement('td');
    const status = statusOf(job);
    const pill = document.createElement('span');
    pill.className = 'tb-status ' + status.kind;
    pill.textContent = status.label;
    statusCell.appendChild(pill);
    tr.appendChild(statusCell);

    const envCell = document.createElement('td');
    const env = document.createElement('span');
    env.className = 'tb-env';
    const browserI = browserIcon(job.browser);
    if (browserI) {
      env.appendChild(browserI);
    }
    const osI = osIcon(job.os);
    if (osI) {
      env.appendChild(osI);
    }
    const envText = document.createElement('span');
    envText.className = 'tb-env-label';
    const browserLabel = job.browser_version ? `${job.browser} ${job.browser_version}` : job.browser;
    envText.textContent = [browserLabel, job.os].filter(Boolean).join(' · ');
    env.appendChild(envText);
    envCell.appendChild(env);
    tr.appendChild(envCell);

    const durationCell = document.createElement('td');
    durationCell.className = 'tb-muted';
    durationCell.textContent = formatDuration(job.duration);
    tr.appendChild(durationCell);

    const startedCell = document.createElement('td');
    startedCell.className = 'tb-muted';
    startedCell.textContent = formatStarted(job.created_at);
    tr.appendChild(startedCell);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  el.appendChild(table);

  el.appendChild(renderPagination(buildInformation, meta, currentOffset, pageSize));
}

// pageSize is captured once from the first response; using the current page's
// count would corrupt links on a partial last page, and a count of 0 would spin.
function renderPagination(
  buildInformation: BuildInformation,
  meta: BuildMeta,
  currentOffset: number,
  pageSize: number
): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'tb-pager';
  if (!(pageSize > 0 && meta && meta.total > pageSize)) {
    return list;
  }

  for (let offset = 0; offset < meta.total; offset += pageSize) {
    const pageNumber = offset / pageSize + 1;
    const item = document.createElement('li');
    item.style.display = 'inline';
    item.style.marginRight = '8px';

    if (offset === currentOffset) {
      item.textContent = String(pageNumber);
    } else {
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = String(pageNumber);
      const targetOffset = offset;
      link.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          const response = await getBuildResponse(buildInformation, targetOffset);
          if (response) {
            renderResults(buildInformation, response.data, response.meta, targetOffset, pageSize);
          }
        } catch (err) {
          console.error('error loading page', err);
          renderMessage('Could not load TestingBot results for this page.');
        }
      });
      item.appendChild(link);
    }
    list.appendChild(item);
  }
  return list;
}

async function renderForBuild(buildId: number | undefined): Promise<void> {
  if (!buildId) {
    renderMessage('No test results found');
    return;
  }

  const attachments = await buildClient.getAttachments(projectId, buildId, ATTACHMENT_TYPE);
  if (!attachments.length) {
    renderMessage('No test results found');
    return;
  }

  const attachment = attachments[0];
  const href = attachment?._links?.self?.href;
  if (!href) {
    renderMessage('No test results found');
    return;
  }

  const buildInformation = await downloadAttachmentJson(buildId, href, attachment.name);
  const response = await getBuildResponse(buildInformation, 0);
  if (!response) {
    renderMessage('No test results found');
    return;
  }
  const pageSize = response.meta ? response.meta.count : 0;
  renderResults(buildInformation, response.data, response.meta, 0, pageSize);
}

function run(buildId: number | undefined): void {
  renderForBuild(buildId).catch((err) => {
    console.error('error', err);
    renderMessage('Could not load TestingBot results.');
  });
}

async function main(): Promise<void> {
  await SDK.init({ loaded: false });
  await SDK.ready();

  buildClient = getClient(BuildRestClient);
  endpointClient = getClient(ServiceEndpointRestClient);
  projectId = SDK.getWebContext().project.id;

  // A build-results tab receives an onBuildChanged callback in its configuration
  // (the reliable way to get the selected build here — getBuildPageData() does
  // not return the build in this iframe context). Fall back to it only if the
  // callback is missing.
  const config = SDK.getConfiguration();
  if (config && typeof config.onBuildChanged === 'function') {
    config.onBuildChanged((build: { id?: number }) => run(build?.id));
  } else {
    try {
      const buildPageService = await SDK.getService<IBuildPageDataService>(BuildServiceIds.BuildPageDataService);
      run(buildPageService.getBuildPageData()?.build?.id);
    } catch (err) {
      console.error('error', err);
      renderMessage('Could not load TestingBot results.');
    }
  }

  SDK.notifyLoadSucceeded();
}

main();
