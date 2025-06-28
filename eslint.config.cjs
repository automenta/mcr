const globals = require('globals');
const js = require('@eslint/js');
const pluginJest = require('eslint-plugin-jest');
const eslintConfigPrettier = require('eslint-config-prettier'); // To turn off ESLint rules that conflict with Prettier

module.exports = [
  js.configs.recommended, // ESLint recommended rules
  {
    // Global settings for all JS files
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'], // Explicitly include .cjs for the config itself if needed, though it should be fine
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs', // All project .js files are CommonJS
      globals: {
        ...globals.node,
        ...globals.commonjs,
      },
    },
    rules: {
      // Custom rules from the old config
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'warn', // Keep as warn for CLI, override for server if needed
      'consistent-return': 'warn',
      'no-undef': 'error',
      semi: ['error', 'always'],
      quotes: ['error', 'single', { avoidEscape: true }],
      'no-shadow': 'warn',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-template': 'warn',
      'arrow-body-style': ['warn', 'as-needed'],
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'FunctionDeclaration[async=false][id.name=/Async$/]',
          message: "Functions ending in 'Async' must be declared as async",
        },
        {
          selector: 'FunctionDeclaration[async=true][id.name!=/Async$/]',
          message: "Async functions must end in 'Async'",
        },
        {
          selector: 'MethodDefinition[key.name=/Async$/][value.async=false]',
          message: "Methods ending in 'Async' must be declared as async",
        },
        {
          selector: 'MethodDefinition[key.name!=/Async$/][value.async=true]',
          message: "Async methods must end in 'Async'",
        },
        {
          selector: 'Property[key.name=/Async$/][value.async=false]',
          message:
            "Functions expressions ending in 'Async' must be declared as async",
        },
        {
          selector: 'Property[key.name!=/Async$/][value.async=true]',
          message: "Async functions expressions must end in 'Async'",
        },
        {
          selector: 'VariableDeclarator[id.name=/Async$/][init.async=false]',
          message:
            "Functions expressions ending in 'Async' must be declared as async",
        },
        {
          selector: 'VariableDeclarator[id.name!=/Async$/][init.async=true]',
          message: "Async functions expressions must end in 'Async'",
        },
      ],
    },
  },
  {
    // Configuration for Jest tests
    files: ['**/*.test.js', '**/*.spec.js'],
    plugins: {
      jest: pluginJest,
    },
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      ...pluginJest.configs.recommended.rules,
      'no-restricted-syntax': 'off', // Allow different naming in tests
    },
  },
  eslintConfigPrettier, // Add Prettier config last to override other formatting rules
];
