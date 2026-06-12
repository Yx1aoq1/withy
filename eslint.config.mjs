import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const appFiles = ['packages/app/**/*.{js,jsx,ts,tsx}'];
const appNextSettings = {
  next: {
    rootDir: 'packages/app/',
  },
};

const appNextConfig = [...nextVitals, ...nextTs].map(config => ({
  ...config,
  files: appFiles,
  settings: {
    ...config.settings,
    ...appNextSettings,
  },
}));

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/coverage/**',
    '**/.tuteur/runtime/**',
    '**/*.tsbuildinfo',
    'packages/app/next-env.d.ts',
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  ...appNextConfig,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  prettier,
]);
