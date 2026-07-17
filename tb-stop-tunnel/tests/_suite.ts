import * as assert from 'assert';
import * as path from 'path';
import { spawnSync, spawn } from 'child_process';

// The stop task is dependency-free, so we exercise the compiled index.js
// directly as a child process rather than through task-lib's MockTestRunner.
const taskPath = path.join(__dirname, '..', 'index.js');

function runStop(tunnelPid: string | undefined): { stdout: string; status: number | null } {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  if (tunnelPid === undefined) {
    delete env.TB_TUNNEL_PID;
  } else {
    env.TB_TUNNEL_PID = tunnelPid;
  }
  const res = spawnSync(process.execPath, [taskPath], { env, encoding: 'utf8' });
  return { stdout: res.stdout || '', status: res.status };
}

describe('TBStopTunnel (Stop TestingBot Tunnel)', function () {
  this.timeout(10000);

  it('is a graceful no-op when no pid is set', function () {
    const { stdout, status } = runStop(undefined);
    assert.strictEqual(status, 0);
    assert.ok(stdout.indexOf('was probably not started') >= 0, stdout);
    assert.ok(stdout.indexOf('##vso[task.complete result=Succeeded;]') >= 0, stdout);
  });

  for (const bad of ['pid_0', 'pid_-1', 'pid_12abc', 'not_a_pid']) {
    it(`rejects the malformed pid ${bad} without killing anything`, function () {
      const { stdout, status } = runStop(bad);
      assert.strictEqual(status, 0);
      assert.ok(stdout.indexOf('No valid') >= 0, stdout);
    });
  }

  it('treats an already-gone pid as success (ESRCH)', function () {
    // 2^31-1: valid shape, extremely unlikely to be a live process.
    const { stdout, status } = runStop('pid_2147483647');
    assert.strictEqual(status, 0);
    assert.ok(stdout.indexOf('already gone') >= 0, stdout);
  });

  it('actually kills a running process', function (done) {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    child.on('spawn', () => {
      const { status } = runStop(`pid_${child.pid}`);
      assert.strictEqual(status, 0);
      // Give the signal a moment, then confirm the process is gone.
      setTimeout(() => {
        let alive = true;
        try {
          process.kill(child.pid as number, 0);
        } catch (err) {
          alive = (err as NodeJS.ErrnoException).code !== 'ESRCH';
        }
        assert.strictEqual(alive, false, 'child process should have been killed');
        done();
      }, 200);
    });
  });
});
