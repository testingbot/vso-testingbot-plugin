var path = require('path');
var del = require('del');
var gulp = require('gulp');
var gutil = require('gulp-util');

var runSequence = require('run-sequence');

var webpack = require('webpack-stream');
var named = require('vinyl-named');

var tfx_extension_create = require('tfx-cli/_build/exec/extension/create');
var tfx_extension_publish = require('tfx-cli/_build/exec/extension/publish');
var jsonTransform = require('gulp-json-transform');
var copy = require('gulp-copy');
var jsonlint = require('gulp-jsonlint');
var plumber = require('gulp-plumber');

gulp = require('gulp-help')(gulp);

var pkg = require('./package.json');
console.log(pkg.version);

var myCustomJsonLintReporter = function (file) { gutil.log('File ' + file.path + ' is not valid JSON.'); };

var fileTasks = {
  'tb-build-info:js': ['./tb-build-info/scripts/*.js'],
  'copy': [
    'images/**/*',
    'overview.md',
    'tb-main/**/*',
    'tb-stop-tunnel/**/*',
    'tb-build-info/**/*',
    '!./tb-build-info/scripts/*.js',
    '!./tb-*/task.json'
  ],
  'copy:vss-web-extension-sdk': [
    'node_modules/vss-web-extension-sdk/lib/VSS.SDK.*js'
  ]
};
gulp.task('clean', function() {
  return del([
    './dist/*'
  ]);
});

gulp.task('vss-extension', function() {
  return gulp.src('./vss-extension.json')
  .pipe(jsonlint())
  .pipe(jsonlint.reporter(myCustomJsonLintReporter))
  .pipe(jsonlint.failOnError())
  .pipe(jsonTransform(function(data) {
    data.version = pkg.version;
    return data;
  }))
  .pipe(gulp.dest('./dist/'));
});

gulp.task('copy', ['copy:vss-web-extension-sdk'], function() {
  return gulp.src(fileTasks.copy)
  .pipe(copy('./dist'));
});

gulp.task('copy:vss-web-extension-sdk', function() {
  gulp.src(fileTasks['copy:vss-web-extension-sdk'])
  .pipe(gulp.dest('./dist/lib'));
});

var fix_task_version = function(data) {
  var vsSplit = pkg.version.split('.');
  data.version.Major = vsSplit[0];
  data.version.Minor = vsSplit[1];
  data.version.Patch = vsSplit[2];
  return data;
};

var handle_task = function(task_name) {
  return gulp.src('./' + task_name + '/task.json')
    .pipe(jsonlint())
    .pipe(jsonlint.reporter(myCustomJsonLintReporter))
    .pipe(jsonlint.failOnError())
    .pipe(jsonTransform(fix_task_version))
    .pipe(gulp.dest('./dist/' + task_name + '/'));
};

gulp.task('tb-main', ['copy'], function() {
  return handle_task('tb-main');
});

gulp.task('tb-stop-tunnel', ['copy'], function() {
  return handle_task('tb-stop-tunnel');
});

gulp.task('tb-build-info:js', function() {
  return gulp.src(fileTasks['tb-build-info:js'])
  .pipe(named())
  .pipe(plumber())
  .pipe(webpack({
    devtool: '#inline-source-map',
    output: {
      libraryTarget: 'amd'
    },
    resolveLoader: {
      root: path.join(__dirname, 'node_modules')
    },
    externals: [
      'TFS/Build/Contracts',
      'TFS/Build/ExtensionContracts',
      'TFS/Build/RestClient',
      'TFS/DistributedTask/TaskAgentRestClient',
      'TFS/DistributedTask/TaskRestClient',
      'TFS/DistributedTask/TaskAgentHttpClient',
      'VSS/Authentication/Services',
      'VSS/Controls',
      'VSS/Service',
      'react',
      'React'
    ],
    /*externals: {
    "vss-web-extension-sdk/lib/VSS.SDK.js": "VSS"
    },*/
    module: {
      loaders: [
        {
          test: /\.js$/,
          exclude: /(node_modules|bower_components)/,
          loader: 'babel',
          query: {
            presets: ['es2015'],
            plugins: ['transform-async-to-generator']
          }
        },
        { test: /\.css$/, loader: 'style!css' }
      ]
    }
  }))
  .pipe(gulp.dest('dist/tb-build-info/scripts'));
});

gulp.task('package', 'Creates a .vsix file with all the code', function(cb) {
  runSequence('clean', 'default', function() {
    var common = require('tfx-cli/_build/lib/common');
    var command = tfx_extension_create.getCommand([
      '--output-path', path.join(__dirname, 'Packages'),
      '--root', path.join(__dirname, 'dist'),
      '--manifests', path.join(__dirname, 'dist', 'vss-extension.json')
    ]);
    common.EXEC_PATH = ['extension', 'create'];
    command.exec().then(function() {
      console.log('then', arguments);
      cb();
    }, function(reason) {
      console.error('Unable to create package because ', reason);
      cb(reason);
    });
  });
});

gulp.task('publish', 'Creates and publishes a vsix file', function(cb) {
  runSequence('clean', 'default', function() {
    var common = require('tfx-cli/_build/lib/common');
    var command = tfx_extension_publish.getCommand([
      '--output-path', path.join(__dirname, 'Packages'),
      '--root', path.join(__dirname, 'dist'),
      '--manifests', path.join(__dirname, 'dist', 'vss-extension.json'),
      '--token', process.env.VSO_TOKEN
    ]);
    common.EXEC_PATH = ['extension', 'publish'];
    command.ensureInitialized()
      .then(command.exec.bind(command))
      .then(function() {
        console.log('then', arguments);
        cb();
      }, function(reason) {
        console.error('Unable to create publish because ', reason);
        cb(reason);
      });
  });
});

gulp.task('watch', function() {
  Object.keys(fileTasks).forEach(function(key) {
    gulp.watch(fileTasks[key], [key]);
  });
});

// define tasks here
gulp.task('default', [
  'vss-extension',
  'copy',
  'tb-main',
  'tb-stop-tunnel',
  'tb-build-info:js'
], function(){ });
