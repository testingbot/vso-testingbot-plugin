import tmrm = require('azure-pipelines-task-lib/mock-run');
import * as path from 'path';

// Mock scenario: TB_TUNNEL_PID holds a non-numeric value (a failed spawn). The
// task must not attempt to kill it and must exit gracefully.
process.env['TB_TUNNEL_PID'] = 'pid_notanumber';

const tmr = new tmrm.TaskMockRunner(path.join(__dirname, '..', 'index.js'));
tmr.setAnswers({});
tmr.run();
