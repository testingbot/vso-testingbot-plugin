import ma = require('azure-pipelines-task-lib/mock-answer');
import tmrm = require('azure-pipelines-task-lib/mock-run');
import * as path from 'path';

// Mock scenario: valid credentials, tunnel disabled. The task should export the
// variables, write the (secret-free) attachment and succeed without touching Java.
const taskPath = path.join(__dirname, '..', 'index.js');
const tmr = new tmrm.TaskMockRunner(taskPath);

tmr.setInput('connectedServiceName', 'tb-conn');
tmr.setInput('tbTunnel', 'false');

// Endpoint auth (case-insensitive parameter lookup is exercised by the task).
process.env['ENDPOINT_URL_tb-conn'] = 'https://api.testingbot.com/v1/';
process.env['ENDPOINT_AUTH_tb-conn'] = JSON.stringify({
  scheme: 'UsernamePassword',
  parameters: { username: 'my-key', password: 'my-secret' }
});
process.env['BUILD_DEFINITIONNAME'] = 'My Build';
process.env['BUILD_BUILDID'] = '42';
process.env['AGENT_TEMPDIRECTORY'] = __dirname;

const answers: ma.TaskLibAnswers = {};
tmr.setAnswers(answers);

tmr.run();
