"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ttm = __importStar(require("azure-pipelines-task-lib/mock-test"));
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
            assert.ok(tr.stdout.indexOf('TB_SECRET;isOutput=false;issecret=true;') >= 0, 'TB_SECRET should be a secret variable');
            // ...and never exported as a non-secret variable.
            assert.ok(tr.stdout.indexOf('issecret=false;]my-secret') < 0, 'the secret must not be exported as a non-secret variable');
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
//# sourceMappingURL=_suite.js.map