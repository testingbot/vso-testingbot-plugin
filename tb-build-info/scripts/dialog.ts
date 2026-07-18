import * as SDK from 'azure-devops-extension-sdk';

// Only ever frame an https TestingBot URL. The url arrives as dialog
// configuration from the host, so validate it before framing anything.
function isAllowedUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' &&
      (parsed.hostname === 'testingbot.com' || parsed.hostname.endsWith('.testingbot.com'));
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  await SDK.init({ loaded: false });
  await SDK.ready();

  const config = SDK.getConfiguration();
  const url = config && config.url;

  if (isAllowedUrl(url)) {
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style.cssText = 'width: 100%; min-height: 100vh; border: 0';
    document.body.appendChild(iframe);
  } else {
    document.body.textContent = 'Unable to display this test: the requested URL is not a valid TestingBot address.';
  }

  SDK.notifyLoadSucceeded();
}

main();
