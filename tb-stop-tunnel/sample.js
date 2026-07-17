// Guard before touching the variable: in jobs where the tunnel was never
// started, TB_TUNNEL_PID is unset and reading .replace() on it would throw
// before we ever reach the friendly "not started" message.
var rawPid = process.env.TB_TUNNEL_PID;
if (!rawPid) {
  console.log('Unable to shut down TestingBot as no pid was found. Maybe the Tunnel was not started?');
  process.exit(0);
}

// Accept only the exact "pid_<positive-integer>" shape. parseInt would let
// "123abc" through and, worse, a negative value would make process.kill signal
// an entire process group, so validate strictly before killing anything.
var pidMatch = /^pid_([1-9][0-9]*)$/.exec(rawPid);
if (!pidMatch) {
  console.log('Unable to shut down TestingBot as no valid pid was found. Maybe the Tunnel failed to start?');
  process.exit(0);
}
var pid = parseInt(pidMatch[1], 10);
console.log('Getting TB Tunnel PID: ', pid);

console.log('Killing TestingBot Tunnel - ', pid);
try {
  process.kill(pid);
  console.log('Finished killing TestingBot Tunnel');
} catch (err) {
  if (err.code === 'ESRCH') {
    // The process is already gone; nothing left to do.
    console.log('TestingBot Tunnel process was already gone.');
  } else {
    throw err;
  }
}
