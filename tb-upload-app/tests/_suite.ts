import * as assert from 'assert';
import * as path from 'path';
import * as ttm from 'azure-pipelines-task-lib/mock-test';

describe('TBUploadApp (Upload App to TestingBot Storage)', function () {
  this.timeout(20000);

  it('uploads the app and exports the returned tb:// URL', function (done) {
    const tp = path.join(__dirname, 'upload.js');
    const tr = new ttm.MockTestRunner(tp);
    tr.runAsync().then(() => {
      assert.strictEqual(tr.succeeded, true, 'task should have succeeded. stderr: ' + tr.stderr);

      // The tb:// URL from the (stubbed) API is exported as a normal variable so a
      // later Appium step can read it as the 'app' capability.
      assert.ok(
        tr.stdout.indexOf('TB_APP_URL') >= 0 && tr.stdout.indexOf('tb://abc123def456abc123def456') >= 0,
        'should export TB_APP_URL with the returned app URL'
      );
      done();
    }).catch((err) => done(err));
  });
});
