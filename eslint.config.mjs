import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '**/node_modules/**',
      'dist/**',
      'Packages/**',
      // Compiled TypeScript output (emitted next to the sources).
      'tb-*/index.js',
      'tb-*/index.js.map',
      'tb-*/tests/**/*.js',
      '**/*.js.map'
    ]
  },

  // TypeScript agent tasks (run on the build agent, Node) + their tests.
  {
    files: ['tb-main/**/*.ts', 'tb-stop-tunnel/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.mocha }
    },
    rules: {
      // azure-pipelines-task-lib and testingbot-tunnel-launcher use `export =`,
      // for which `import x = require(...)` is the idiomatic TypeScript form.
      '@typescript-eslint/no-require-imports': 'off'
    }
  },

  // TypeScript results-tab scripts (run in the browser via the extension SDK).
  {
    files: ['tb-build-info/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.browser
    }
  },

  // Node build scripts.
  {
    files: ['scripts/**/*.js', 'webpack.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
      sourceType: 'commonjs'
    }
  }
);
