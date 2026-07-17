import tmrm = require('azure-pipelines-task-lib/mock-run');
import * as path from 'path';

// Mock scenario: TB_TUNNEL_PID is unset (tunnel never started). The task must be
// a graceful no-op rather than crashing.
delete process.env['TB_TUNNEL_PID'];

const tmr = new tmrm.TaskMockRunner(path.join(__dirname, '..', 'index.js'));
tmr.setAnswers({});
tmr.run();
