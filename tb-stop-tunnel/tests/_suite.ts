import * as assert from 'assert';
import * as path from 'path';
import * as ttm from 'azure-pipelines-task-lib/mock-test';

describe('TBStopTunnel (Stop TestingBot Tunnel)', function () {
  this.timeout(20000);

  it('is a graceful no-op when no tunnel pid is set', function (done) {
    const tr = new ttm.MockTestRunner(path.join(__dirname, 'no-pid.js'));
    tr.runAsync().then(() => {
      assert.strictEqual(tr.succeeded, true, 'task should have succeeded. stderr: ' + tr.stderr);
      assert.ok(tr.stdout.indexOf('was probably not started') >= 0, 'should report nothing to stop');
      done();
    }).catch((err) => done(err));
  });

  it('is a graceful no-op when the pid is not a number', function (done) {
    const tr = new ttm.MockTestRunner(path.join(__dirname, 'garbage-pid.js'));
    tr.runAsync().then(() => {
      assert.strictEqual(tr.succeeded, true, 'task should have succeeded. stderr: ' + tr.stderr);
      assert.ok(tr.stdout.indexOf('No valid') >= 0, 'should report no valid pid');
      done();
    }).catch((err) => done(err));
  });
});
