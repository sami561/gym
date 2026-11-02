// ESLint for the backend: type-aware rules on the NestJS apps and libs (tsconfig.json covers both,
// specs included), the plain recommended rules on the Node helper scripts.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist/', 'coverage/']),

  {
    name: 'meliora/javascript',
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    name: 'meliora/scripts',
    files: ['scripts/**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
  },

  {
    name: 'meliora/typescript',
    files: ['apps/**/*.ts', 'libs/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      eqeqeq: ['error', 'smart'],
      // Services log through Nest's Logger.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',

      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',
      // A promise returned without await inside try escapes its catch / finally.
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      // A switch over a union without a default must handle every member (a new enum value is caught).
      '@typescript-eslint/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: true }],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true, allowAny: false, allowNullish: false, allowRegExp: false },
      ],
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/prefer-promise-reject-errors': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          // `const { passwordHash, ...dto } = user` drops fields on purpose.
          ignoreRestSiblings: true,
        },
      ],

      // Contracts are typed; `any` left at the edges (raw SQL rows, socket payloads) is reported, not blocking.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-declaration-merging': 'warn',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-unary-minus': 'warn',
    },
  },
  {
    name: 'meliora/specs',
    files: ['**/*.spec.ts'],
    rules: {
      // Test doubles implement async contracts without awaiting anything.
      '@typescript-eslint/require-await': 'off',
      // expect(mock.method) and Reflect.getMetadata(…, Class.prototype.method) never call the method.
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
