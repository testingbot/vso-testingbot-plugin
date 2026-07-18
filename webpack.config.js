const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

// The agent tasks are TypeScript compiled in-place by tsc; this copy step picks
// up the emitted index.js. The .ts sources, tests, tsconfig and dev node_modules
// are excluded; the production node_modules are installed into dist/ afterwards.
const taskIgnore = [
  '**/node_modules/**',
  '**/.DS_Store',
  '**/*.ts',
  '**/tsconfig.json',
  '**/tests/**',
  '**/*.js.map'
];

module.exports = {
  target: 'web',
  entry: {
    info: './tb-build-info/scripts/info.ts',
    dialog: './tb-build-info/scripts/dialog.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'tb-build-info/scripts/[name].js',
    clean: false
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-typescript']
          }
        }
      }
    ]
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'images', to: 'images' },
        { from: 'overview.md', to: 'overview.md' },
        { from: 'vss-extension.json', to: 'vss-extension.json' },
        {
          from: 'tb-main',
          to: 'tb-main',
          globOptions: { ignore: taskIgnore }
        },
        {
          from: 'tb-stop-tunnel',
          to: 'tb-stop-tunnel',
          globOptions: { ignore: taskIgnore }
        },
        {
          // Everything in tb-build-info except the scripts webpack bundles above.
          from: 'tb-build-info',
          to: 'tb-build-info',
          globOptions: { ignore: ['**/scripts/**', '**/.DS_Store'] }
        }
      ]
    })
  ]
};
