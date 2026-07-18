import * as SDK from 'azure-devops-extension-sdk';
import { getClient, CommonServiceIds, IHostPageLayoutService } from 'azure-devops-extension-api/Common';
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

async function openTestDialog(buildInformation: BuildInformation, job: TestJob): Promise<void> {
  const auth = md5(buildInformation.TB_KEY + ':' + buildInformation.TB_SECRET + ':' + job.session_id);
  const url = 'https://testingbot.com/mini/' + job.session_id + '?auth=' + auth;
  const ctx = SDK.getExtensionContext();
  const layoutService = await SDK.getService<IHostPageLayoutService>(CommonServiceIds.HostPageLayoutService);
  layoutService.openCustomDialog(`${ctx.publisherId}.${ctx.extensionId}.embed-dialog`, {
    title: 'Test Information',
    configuration: { url }
  });
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
  el.style.height = '400px';
  el.style.overflow = 'auto';

  const heading = document.createElement('h2');
  heading.textContent = `TestingBot results (${meta.total} tests)`;
  el.appendChild(heading);

  const table = document.createElement('table');
  table.style.minWidth = '800px';
  table.innerHTML = '<thead><tr><th align="left">Test Name</th><th align="left">OS/Browser</th><th align="left">Pass/Fail</th></tr></thead>';
  const tbody = document.createElement('tbody');

  jobs.forEach((job) => {
    const tr = document.createElement('tr');

    const nameCell = document.createElement('td');
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = job.name;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openTestDialog(buildInformation, job).catch((err) => console.error('dialog error', err));
    });
    nameCell.appendChild(link);
    tr.appendChild(nameCell);

    const envCell = document.createElement('td');
    envCell.textContent = `${job.os} ${job.browser}`;
    tr.appendChild(envCell);

    const resultCell = document.createElement('td');
    resultCell.textContent = job.success ? 'Passed' : 'Failed';
    tr.appendChild(resultCell);

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
  list.style.paddingLeft = '0';
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
