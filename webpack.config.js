const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

// Host-provided AMD modules loaded by the VSS module loader at runtime. They
// must stay external so webpack does not try to bundle them.
const vssExternals = [
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
];

module.exports = {
  target: 'web',
  entry: {
    info: './tb-build-info/scripts/info.js',
    dialog: './tb-build-info/scripts/dialog.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'tb-build-info/scripts/[name].js',
    library: { type: 'amd' },
    clean: false
  },
  externalsType: 'amd',
  externals: vssExternals,
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: { presets: ['@babel/preset-env'] }
        }
      }
    ]
  },
  resolve: {
    // info.js still constructs a Basic auth header with Buffer; the browser has
    // no Buffer, so provide the polyfill until the tab is rewritten (Phase 3).
    fallback: { buffer: require.resolve('buffer/') }
  },
  plugins: [
    new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] }),
    new CopyPlugin({
      patterns: [
        { from: 'images', to: 'images' },
        { from: 'overview.md', to: 'overview.md' },
        { from: 'vss-extension.json', to: 'vss-extension.json' },
        {
          from: 'tb-main',
          to: 'tb-main',
          globOptions: { ignore: ['**/node_modules/**', '**/.DS_Store'] }
        },
        {
          from: 'tb-stop-tunnel',
          to: 'tb-stop-tunnel',
          globOptions: { ignore: ['**/.DS_Store'] }
        },
        {
          // Everything in tb-build-info except the scripts webpack bundles above.
          from: 'tb-build-info',
          to: 'tb-build-info',
          globOptions: { ignore: ['**/scripts/**', '**/.DS_Store'] }
        },
        {
          from: 'node_modules/vss-web-extension-sdk/lib/VSS.SDK.js',
          to: 'lib/VSS.SDK.js'
        }
      ]
    })
  ]
};
