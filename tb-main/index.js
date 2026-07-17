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
const tl = require("azure-pipelines-task-lib/task");
const tunnelLauncher = require("testingbot-tunnel-launcher");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const taskVersion = (() => {
    // task.json sits next to the compiled index.js in the packaged task.
    const v = require('./task.json').version;
    return [v.Major, v.Minor, v.Patch].join('.');
})();
// The endpoint stores auth as JSON whose key casing has drifted over time
// (username vs Username). Match the parameter name case-insensitively.
function getAuthParameter(endpoint, paramName) {
    const auth = tl.getEndpointAuthorization(endpoint, false);
    if (!auth) {
        throw new Error('Could not read the TestingBot credentials endpoint authorization. Please check the service connection.');
    }
    if (auth.scheme !== 'UsernamePassword') {
        throw new Error(`The authorization scheme ${auth.scheme} is not supported for the TestingBot endpoint. Please use a username and a password.`);
    }
    const key = Object.getOwnPropertyNames(auth.parameters).find((name) => name.toLowerCase() === paramName.toLowerCase());
    return key ? auth.parameters[key] : undefined;
}
function getEndpointDetails(fieldName) {
    const endpoint = tl.getInput(fieldName, true);
    if (!endpoint) {
        throw new Error('No TestingBot service connection was provided.');
    }
    const secret = tl.getInput('endpointAuthToken') || getAuthParameter(endpoint, 'password');
    const key = tl.getInput('endpointUsername') || getAuthParameter(endpoint, 'username');
    if (!key || !secret) {
        throw new Error('The TestingBot service connection is missing a key or secret.');
    }
    return { key, secret };
}
function exportVariables(credentials) {
    // Register the secret so it is masked in logs, then export it as a secret
    // pipeline variable. The key is not sensitive and stays a normal variable.
    tl.setSecret(credentials.secret);
    tl.setVariable('TB_KEY', credentials.key);
    tl.setVariable('TESTINGBOT_KEY', credentials.key);
    tl.setVariable('TB_SECRET', credentials.secret, true);
    tl.setVariable('TESTINGBOT_SECRET', credentials.secret, true);
    tl.setVariable('TB_API_ENDPOINT', 'api.testingbot.com');
    tl.setVariable('SELENIUM_HOST', 'hub.testingbot.com');
    tl.setVariable('SELENIUM_PORT', '80');
    // Build runs expose Build.*, release runs expose Release.* instead.
    const buildName = [
        tl.getVariable('Build.DefinitionName') || tl.getVariable('Release.DefinitionName'),
        tl.getVariable('Build.BuildId') || tl.getVariable('Release.ReleaseId')
    ].filter(Boolean).join('_').replace(/ /g, '_');
    tl.setVariable('TB_BUILD_NAME', buildName);
}
function defaultTunnelIdentifier() {
    const id = tl.getVariable('Build.BuildId') || tl.getVariable('Release.ReleaseId') || 'local';
    const attempt = tl.getVariable('System.JobAttempt') || tl.getVariable('Release.AttemptNumber') || '1';
    return `azure-${id}-${attempt}`;
}
function tunnelOptions(credentials) {
    const options = {
        apiKey: credentials.key,
        apiSecret: credentials.secret,
        tunnelIdentifier: tl.getInput('tunnelIdentifier') || defaultTunnelIdentifier(),
        // Log to a file so the tunnel does not depend on this task's stdout pipe,
        // which closes once the task exits and the tunnel keeps running.
        logfile: path.join(agentTemp(), 'testingbot-tunnel.log')
    };
    const sePort = tl.getInput('sePort');
    if (sePort) {
        options['se-port'] = parseInt(sePort, 10);
    }
    const proxy = tl.getInput('proxy');
    if (proxy) {
        options.proxy = proxy;
    }
    const readyTimeout = tl.getInput('readyTimeout');
    if (readyTimeout) {
        options.timeout = parseInt(readyTimeout, 10);
    }
    if (tl.getBoolInput('noBump', false)) {
        options.noBump = true;
    }
    if (tl.getBoolInput('noCache', false)) {
        options.noCache = true;
    }
    if (tl.getBoolInput('sharedTunnel', false)) {
        options.shared = true;
    }
    if (tl.getInput('tbTunnelOptions')) {
        tl.warning('tbTunnelOptions is deprecated and ignored. Use the dedicated tunnel inputs (tunnelIdentifier, sePort, proxy, readyTimeout, noBump, noCache, sharedTunnel) instead.');
    }
    return options;
}
async function startTunnel(credentials) {
    const options = tunnelOptions(credentials);
    console.log(`Starting TestingBot Tunnel (identifier: ${options.tunnelIdentifier})...`);
    // Rejects on a Java version problem, download failure, timeout, invalid
    // credentials or an exhausted account, so a pre-ready exit fails the task.
    const tunnel = await tunnelLauncher.downloadAndRunAsync(options);
    if (!tunnel || !tunnel.pid) {
        throw new Error('TestingBot Tunnel failed to start.');
    }
    // The stop task (a separate process) kills it by pid; also record the
    // identifier so the tunnel can be cleaned up via the API if needed.
    tl.setVariable('TB_TUNNEL_PID', `pid_${tunnel.pid}`);
    tl.setVariable('TB_TUNNEL_IDENTIFIER', String(options.tunnelIdentifier));
    // Let the tunnel outlive this task; do not keep our event loop alive for it.
    if (typeof tunnel.unref === 'function') {
        tunnel.unref();
    }
    console.log(`TestingBot Tunnel is ready (pid ${tunnel.pid}).`);
}
function agentTemp() {
    return tl.getVariable('Agent.TempDirectory') || os.tmpdir();
}
function writeAttachment(credentials) {
    // The results tab needs the key/secret to sign TestingBot /mini share URLs so
    // developers can watch the test video/logs embedded in the build view. Those
    // credentials therefore travel in this build attachment.
    //
    // SECURITY (finding #1): build attachments are readable by anyone with
    // build-read access, so this still exposes the secret. The Phase 3 tab
    // redesign removes it from the browser by signing the /mini URL server-side
    // through a TestingBot API data source, keeping the embedded viewer.
    const data = {
        TB_KEY: credentials.key,
        TB_SECRET: credentials.secret,
        TB_BUILD_NAME: tl.getVariable('TB_BUILD_NAME'),
        TB_API_ENDPOINT: tl.getVariable('TB_API_ENDPOINT'),
        SELENIUM_HOST: tl.getVariable('SELENIUM_HOST'),
        SELENIUM_PORT: tl.getVariable('SELENIUM_PORT'),
        CONNECTED_SERVICE_NAME: tl.getInput('connectedServiceName'),
        TASK_VERSION: taskVersion
    };
    const file = path.join(agentTemp(), 'testingbot.json');
    fs.writeFileSync(file, JSON.stringify(data));
    tl.command('task.addattachment', { type: 'TestingBotBuildResult', name: 'buildresults' }, file);
}
async function run() {
    try {
        const credentials = getEndpointDetails('connectedServiceName');
        exportVariables(credentials);
        if (tl.getBoolInput('tbTunnel', false)) {
            await startTunnel(credentials);
        }
        writeAttachment(credentials);
        tl.setResult(tl.TaskResult.Succeeded, 'TestingBot configured.');
        // Exit explicitly: a running tunnel child keeps the event loop alive.
        process.exit(0);
    }
    catch (err) {
        tl.setResult(tl.TaskResult.Failed, err instanceof Error ? err.message : String(err));
        process.exit(1);
    }
}
run();
//# sourceMappingURL=index.js.map