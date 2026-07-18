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
      '**/*.js.map',
      // Third-party runtime, not ours to lint.
      'lib/**'
    ]
  },

  // TypeScript task sources + their tests.
  {
    files: ['tb-*/**/*.ts'],
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

  // Node build scripts.
  {
    files: ['scripts/**/*.js', 'webpack.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
      sourceType: 'commonjs'
    }
  },

  // Legacy browser tab scripts (slated for the SDK rewrite). Lint for real
  // errors only; the vendored MD5 implementation trips a lot of style rules.
  {
    files: ['tb-build-info/scripts/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.browser,
        VSS: 'readonly',
        $: 'readonly',
        jQuery: 'readonly',
        Buffer: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
      'no-inner-declarations': 'off',
      'no-empty': 'off',
      'no-func-assign': 'off'
    }
  }
);
