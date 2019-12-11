var pid = process.env.TB_TUNNEL_PID.replace('pid_', '');
console.log('Getting TB Tunnel PID: ', pid);
if (!pid) {
  console.log('Unable to shut down TestingBot as no pid was found. Maybe the Tunnel was not started?');
  process.exit(0);
}
pid = pid.toString();

console.log('Killing TestingBot Tunnel - ', pid);
process.kill(pid);
console.log('Finished killing TestingBot Tunnel');
