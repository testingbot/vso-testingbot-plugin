import tl = require('azure-pipelines-task-lib/task');

function run(): void {
  // Guard before touching the variable: if the tunnel was never started the
  // variable is unset, and the configuration task's stop task should be a no-op
  // rather than an error.
  const rawPid = tl.getVariable('TB_TUNNEL_PID');
  if (!rawPid) {
    console.log('No TestingBot Tunnel pid found. The tunnel was probably not started.');
    tl.setResult(tl.TaskResult.Succeeded, 'Nothing to stop.');
    return;
  }

  const pid = parseInt(rawPid.replace('pid_', ''), 10);
  if (isNaN(pid)) {
    console.log('No valid TestingBot Tunnel pid found. The tunnel probably failed to start.');
    tl.setResult(tl.TaskResult.Succeeded, 'Nothing to stop.');
    return;
  }

  try {
    console.log(`Stopping TestingBot Tunnel (pid ${pid})...`);
    process.kill(pid);
    console.log('TestingBot Tunnel stopped.');
    tl.setResult(tl.TaskResult.Succeeded, 'TestingBot Tunnel stopped.');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
      // The process is already gone; nothing left to do.
      console.log('TestingBot Tunnel process was already gone.');
      tl.setResult(tl.TaskResult.Succeeded, 'Tunnel already stopped.');
      return;
    }
    tl.setResult(tl.TaskResult.Failed, `Could not stop TestingBot Tunnel: ${err instanceof Error ? err.message : String(err)}`);
  }
}

run();
