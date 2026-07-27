import ma = require('azure-pipelines-task-lib/mock-answer');
import tmrm = require('azure-pipelines-task-lib/mock-run');
import * as path from 'path';

// Mock scenario: a valid .apk and credentials. The global fetch is stubbed so the
// task never touches the network; it should export TB_APP_URL with the returned
// tb:// URL. This mock-run file runs in the same process the task is required in,
// so overriding global.fetch here reaches the task's uploadApp().
const taskPath = path.join(__dirname, '..', 'index.js');
const tmr = new tmrm.TaskMockRunner(taskPath);

const appFile = path.join(__dirname, 'sample.apk');

tmr.setInput('connectedServiceName', 'tb-conn');
tmr.setInput('appFile', appFile);
tmr.setInput('overwrite', 'false');

process.env['ENDPOINT_AUTH_tb-conn'] = JSON.stringify({
  scheme: 'UsernamePassword',
  parameters: { username: 'my-key', password: 'my-secret' }
});

(global as unknown as { fetch: unknown }).fetch = async () => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  text: async () => JSON.stringify({ app_url: 'tb://abc123def456abc123def456' })
});

const answers: ma.TaskLibAnswers = {
  checkPath: { [appFile]: true }
};
tmr.setAnswers(answers);

tmr.run();
