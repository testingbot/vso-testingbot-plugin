/* global Promise */
var tl = require('vsts-task-lib');
var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;
var EventEmitter = require('events').EventEmitter;

var version = require('./task.json').version;
version = [version.Major, version.Minor, version.Patch].join('.');

var main = function main(cb) {
  // The endpoint stores the auth details as JSON. Unfortunately the structure of the JSON has changed through time, namely the keys were sometimes upper-case.
  // To work around this, we can perform case insensitive checks in the property dictionary of the object. Note that the PowerShell implementation does not suffer from this problem.
  // See https://github.com/Microsoft/vso-agent/blob/bbabbcab3f96ef0cfdbae5ef8237f9832bef5e9a/src/agent/plugins/release/artifact/jenkinsArtifact.ts for a similar implementation
  var getAuthParameter = function getAuthParameter(endpoint, paramName) {

    var paramValue = null;
    var auth = tl.getEndpointAuthorization(endpoint, false);

    if (auth.scheme !== 'UsernamePassword') {
      throw new Error('The authorization scheme ' + auth.scheme + ' is not supported for a SonarQube endpoint. Please use a username and a password.');
    }

    var parameters = Object.getOwnPropertyNames(auth['parameters']);

    var keyName;
    parameters.some(function (key) {

      if (key.toLowerCase() === paramName.toLowerCase()) {
        keyName = key;

        return true;
      }
    });

    paramValue = auth['parameters'][keyName];

    return paramValue;
  };

  var getEndpointDetails = function getEndpointDetails(endpointInputFieldName) {
    var errorMessage = 'Could not decode the credentials endpoint. Please ensure you are running the latest agent (min version 0.3.0)';
    if (!tl.getEndpointUrl) {
      throw new Error(errorMessage);
    }

    var genericEndpoint = tl.getInput(endpointInputFieldName);
    if (!genericEndpoint) {
      throw new Error(errorMessage);
    }

    var hostUrl = tl.getInput('endpointUrl') || tl.getEndpointUrl(genericEndpoint, false);
    var secret = tl.getInput('endpointAuthToken') || getAuthParameter(genericEndpoint, 'password');
    var key = tl.getInput('endpointUsername') || getAuthParameter(genericEndpoint, 'username');

    return { url: hostUrl, secret, key };
  };

  var credentials = getEndpointDetails('connectedServiceName');
  tl.setVariable('TB_KEY', credentials.key);
  tl.setVariable('TESTINGBOT_KEY', credentials.key);
  tl.setVariable('TB_SECRET', credentials.secret);
  tl.setVariable('TESTINGBOT_SECRET', credentials.secret);
  tl.setVariable('TB_API_ENDPOINT', 'api.testingbot.com');
  tl.setVariable('SELENIUM_HOST', 'hub.testingbot.com');
  tl.setVariable('SELENIUM_PORT', '80');
  tl.setVariable('TB_BUILD_NAME', [
    tl.getVariable('BUILD_DEFINITIONNAME'),
    tl.getVariable('BUILD_BUILDID')
  ].join('_').replace(/ /g, '_'));
  cb(credentials);
};

var startTunnel = function startTunnel(credentials, resolve, tunnelOptions) {
  var self_path = __dirname;
  var tunnel_path = path.join(self_path, 'tunnel');
  var tunnel_bin = path.join(tunnel_path, '2.30.jar');

  console.log('Running TestingBot Tunnel: ', tunnel_bin);

  var pid_path = path.join((process.env.BUILD_STAGINGDIRECTORY || self_path), 'testingbot-tunnel.pid');
  tl.setVariable('TB_TUNNEL_PID_PATH', pid_path);
  console.log('Setting PID path', pid_path);

  var tunnel_bin = spawn(
    'java',
    [
      '-jar',
      tunnel_bin,
      credentials.key,
      credentials.secret
    ].concat(tunnelOptions.split(' ')),
    {
      detached: true,
      cwd: self_path
    }
  );

  tl.setVariable('TB_TUNNEL_PID', 'pid_' + tunnel_bin.pid);

  var lineEmitter = new EventEmitter();
  lineEmitter.on('stdout', function(line) {
    console.log('Tunnel stdout: ' + line.toString());
    if (/You may start your tests/.test(line)) {
      return resolve();
    }
  });
  lineEmitter.on('stderr', function(line) {
    console.error('Tunnel stderr: ' + line.toString());
    if (/You may start your tests/.test(line)) {
      return resolve();
    }
  });

  var dataHolders = {};
  ['stdout', 'stderr'].forEach(function(channel) {
    dataHolders[channel] = [];
    tunnel_bin[channel].on('data', function (data) {
      data.toString().split('').forEach(function(char) {
        if (char === '\n' || char === '\r') {
          if (dataHolders[channel].length !== 0) {
            lineEmitter.emit(channel, dataHolders[channel].join(''));
            dataHolders[channel] = [];
          }
          return;
        }
        dataHolders[channel].push(char);
      });
    });
  });

  tunnel_bin.on('close', function(code) {
    return process.exit(code);
  });
};

main(function(credentials) {
  var shouldStartTunnel = JSON.parse(tl.getInput('tbTunnel'));
  var tunnelOptions = tl.getInput('tbTunnelOptions');
  if (tunnelOptions === null) {
    console.log('tunnelOptions = null')
    tunnelOptions = '';
  }
  new Promise(function(resolve) {
    if (shouldStartTunnel) {
      startTunnel(credentials, resolve, tunnelOptions);
    } else {
      resolve(true);
    }
  }).then(function(skipTunnel) {
    var data = [
      'TB_KEY',
      'TB_SECRET',
      'TB_API_ENDPOINT',
      'SELENIUM_PORT',
      'SELENIUM_HOST',
      'TB_BUILD_NAME'
    ].filter(function(key) {
      if (skipTunnel) {
        return !/^TB_TUNNEL_/.test(key);
      } else {
        return true;
      }
    }).reduce(function (ret, key) {
      ret[key] = tl.getVariable(key);
      return ret;
    }, {});
    data.CONNECTED_SERVICE_NAME = tl.getInput('connectedServiceName');
    fs.writeFileSync('testingbot.json', JSON.stringify(data));
    tl.command('task.addattachment', { type: 'TestingBotBuildResult', name: 'buildresults' }, path.resolve('testingbot.json'));
    return true;
  }).then(function() {
    console.log('all started');
    process.exit(0); // SUCCESS
  }).catch(function(err) {
    console.log('error starting', err);
    throw err;
  });
});
