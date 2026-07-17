// This task is intentionally dependency-free: it only needs to kill a pid, so it
// reads TB_TUNNEL_PID from the environment, calls process.kill, and emits the
// raw Azure Pipelines logging command itself instead of pulling in
// azure-pipelines-task-lib. Do not add runtime dependencies here.

function complete(result: 'Succeeded' | 'Failed', message: string): void {
  console.log(`##vso[task.complete result=${result};]${message}`);
}

function run(): void {
  // Guard before touching the variable: if the tunnel was never started the
  // variable is unset, and this should be a no-op rather than an error.
  const rawPid = process.env.TB_TUNNEL_PID;
  if (!rawPid) {
    console.log('No TestingBot Tunnel pid found. The tunnel was probably not started.');
    complete('Succeeded', 'Nothing to stop.');
    return;
  }

  // Accept only the exact "pid_<positive-integer>" shape. A negative value would
  // make process.kill signal an entire process group, and parseInt alone would
  // let "123abc" through, so validate strictly before killing anything.
  const match = /^pid_([1-9][0-9]*)$/.exec(rawPid);
  if (!match) {
    console.log('No valid TestingBot Tunnel pid found. The tunnel probably failed to start.');
    complete('Succeeded', 'Nothing to stop.');
    return;
  }
  const pid = parseInt(match[1], 10);

  try {
    console.log(`Stopping TestingBot Tunnel (pid ${pid})...`);
    process.kill(pid);
    console.log('TestingBot Tunnel stopped.');
    complete('Succeeded', 'TestingBot Tunnel stopped.');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
      // The process is already gone; nothing left to do.
      console.log('TestingBot Tunnel process was already gone.');
      complete('Succeeded', 'Tunnel already stopped.');
      return;
    }
    complete('Failed', `Could not stop TestingBot Tunnel: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

run();
