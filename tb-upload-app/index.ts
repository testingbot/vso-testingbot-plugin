import tl = require('azure-pipelines-task-lib/task');
import * as fs from 'fs';
import * as path from 'path';

interface Credentials {
  key: string;
  secret: string;
}

// TestingBot Storage accepts native app builds only; the API rejects anything
// else. Fail fast with a clear message instead of waiting for the upload.
const ALLOWED_EXTENSIONS = ['.apk', '.aab', '.ipa', '.zip'];

// The endpoint stores auth as JSON whose key casing has drifted over time
// (username vs Username). Match the parameter name case-insensitively.
function getAuthParameter(endpoint: string, paramName: string): string | undefined {
  const auth = tl.getEndpointAuthorization(endpoint, false);
  if (!auth) {
    throw new Error('Could not read the TestingBot credentials endpoint authorization. Please check the service connection.');
  }
  if (auth.scheme !== 'UsernamePassword') {
    throw new Error(`The authorization scheme ${auth.scheme} is not supported for the TestingBot endpoint. Please use a username and a password.`);
  }

  const key = Object.getOwnPropertyNames(auth.parameters).find(
    (name) => name.toLowerCase() === paramName.toLowerCase()
  );
  return key ? auth.parameters[key] : undefined;
}

function getEndpointDetails(fieldName: string): Credentials {
  const endpoint = tl.getInput(fieldName, true);
  if (!endpoint) {
    throw new Error('No TestingBot service connection was provided.');
  }

  const secret = getAuthParameter(endpoint, 'password');
  const key = getAuthParameter(endpoint, 'username');

  if (!key || !secret) {
    throw new Error('The TestingBot service connection is missing a key or secret.');
  }
  return { key, secret };
}

// The overwrite endpoint keeps the same tb:// URL, so downstream Appium
// capabilities never change between builds. The user identifies the app by its
// tb:// URL or bare appkey; normalise both to the appkey.
function appKeyFromInput(value: string): string {
  return value.trim().replace(/^tb:\/\//, '');
}

async function uploadApp(credentials: Credentials, appFile: string, overwriteKey: string | undefined): Promise<string> {
  const filename = path.basename(appFile);
  const buffer = fs.readFileSync(appFile);

  const form = new FormData();
  form.append('file', new Blob([buffer]), filename);

  const auth = Buffer.from(`${credentials.key}:${credentials.secret}`).toString('base64');
  const url = overwriteKey
    ? `https://api.testingbot.com/v1/storage/${encodeURIComponent(overwriteKey)}`
    : 'https://api.testingbot.com/v1/storage';

  console.log(`${overwriteKey ? 'Overwriting' : 'Uploading'} ${filename} on TestingBot Storage...`);
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}` },
    body: form
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`TestingBot Storage upload failed (HTTP ${response.status}): ${body || response.statusText}`);
  }

  let parsed: { app_url?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`TestingBot Storage returned an unexpected response: ${body}`);
  }
  if (!parsed.app_url) {
    throw new Error(`TestingBot Storage upload did not return an app_url: ${body}`);
  }
  return parsed.app_url;
}

async function run(): Promise<void> {
  try {
    const appFile = tl.getPathInput('appFile', true, true);
    if (!appFile) {
      throw new Error('No app file was provided.');
    }
    const ext = path.extname(appFile).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new Error(`Unsupported app file "${path.basename(appFile)}". TestingBot Storage accepts ${ALLOWED_EXTENSIONS.join(', ')}.`);
    }

    let overwriteKey: string | undefined;
    if (tl.getBoolInput('overwrite', false)) {
      const appId = tl.getInput('appId', true);
      if (!appId) {
        throw new Error('Overwrite is enabled but no existing app (tb:// URL or appkey) was provided.');
      }
      overwriteKey = appKeyFromInput(appId);
    }

    const credentials = getEndpointDetails('connectedServiceName');
    const appUrl = await uploadApp(credentials, appFile, overwriteKey);

    const outputVariable = tl.getInput('outputVariable') || 'TB_APP_URL';
    tl.setVariable(outputVariable, appUrl);
    console.log(`TestingBot Storage app URL exported as ${outputVariable}=${appUrl}`);

    tl.setResult(tl.TaskResult.Succeeded, `Uploaded to TestingBot Storage (${appUrl}).`);
  } catch (err) {
    tl.setResult(tl.TaskResult.Failed, err instanceof Error ? err.message : String(err));
  }
}

run();
