// ESLint flat config — syntax / parse error detection のみ。
// スタイル・命名規則の強制は行わず、実用的なエラー検出に限定する。
export default [
  {
    files: ['src/**/*.js', 'ui-next/**/*.js', 'tests/**/*.js', 'scripts/**/*.js'],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Node.js
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        URL: 'readonly',
        structuredClone: 'readonly',
      },
    },
    rules: {
      // 構文エラー相当を検出する最小限のルール
      'no-undef': 'off',          // 型定義なしのプロジェクトでは誤検知が多いので off
      'no-unused-vars': 'off',    // 同上
      'no-unreachable': 'error',
      'no-duplicate-case': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-dupe-class-members': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'valid-typeof': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'use-isnan': 'error',
      'getter-return': 'error',
      'no-setter-return': 'error',
      'constructor-super': 'error',
      'no-this-before-super': 'error',
    },
  },
  {
    // テスト・スクリプトに node:test グローバルを追加
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        test: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
  },
];
