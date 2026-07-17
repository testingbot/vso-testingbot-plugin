import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as ttm from 'azure-pipelines-task-lib/mock-test';

describe('TBMain (TestingBot Configuration)', function () {
  this.timeout(20000);

  it('registers the secret, exports variables and writes the attachment when the tunnel is off', function (done) {
    const tp = path.join(__dirname, 'no-tunnel.js');
    const tr = new ttm.MockTestRunner(tp);
    tr.runAsync().then(() => {
      assert.strictEqual(tr.succeeded, true, 'task should have succeeded. stderr: ' + tr.stderr);

      // Build name falls back / joins correctly.
      assert.ok(tr.stdout.indexOf('My_Build_42') >= 0, 'TB_BUILD_NAME should be My_Build_42');

      // Secret is registered (masked in logs) and set as a secret variable.
      assert.ok(tr.stdout.indexOf('task.setsecret') >= 0, 'secret should be registered with setSecret');
      assert.ok(
        tr.stdout.indexOf('TB_SECRET;isOutput=false;issecret=true;') >= 0,
        'TB_SECRET should be a secret variable'
      );
      // ...and never exported as a non-secret variable.
      assert.ok(
        tr.stdout.indexOf('issecret=false;]my-secret') < 0,
        'the secret must not be exported as a non-secret variable'
      );

      // Attachment is written and still carries the credentials the results tab
      // needs to sign TestingBot /mini share URLs.
      assert.ok(tr.stdout.indexOf('task.addattachment') >= 0, 'should add the build-result attachment');
      const attachment = JSON.parse(fs.readFileSync(path.join(__dirname, 'testingbot.json'), 'utf8'));
      assert.strictEqual(attachment.TB_KEY, 'my-key');
      assert.strictEqual(attachment.TB_SECRET, 'my-secret');
      assert.strictEqual(attachment.TB_BUILD_NAME, 'My_Build_42');

      done();
    }).catch((err) => done(err));
  });
});
