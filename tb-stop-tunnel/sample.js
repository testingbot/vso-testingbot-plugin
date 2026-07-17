// Guard before touching the variable: in jobs where the tunnel was never
// started, TB_TUNNEL_PID is unset and reading .replace() on it would throw
// before we ever reach the friendly "not started" message.
var rawPid = process.env.TB_TUNNEL_PID;
if (!rawPid) {
  console.log('Unable to shut down TestingBot as no pid was found. Maybe the Tunnel was not started?');
  process.exit(0);
}

var pid = parseInt(rawPid.replace('pid_', ''), 10);
console.log('Getting TB Tunnel PID: ', pid);
if (isNaN(pid)) {
  console.log('Unable to shut down TestingBot as no valid pid was found. Maybe the Tunnel failed to start?');
  process.exit(0);
}

console.log('Killing TestingBot Tunnel - ', pid);
process.kill(pid);
console.log('Finished killing TestingBot Tunnel');
