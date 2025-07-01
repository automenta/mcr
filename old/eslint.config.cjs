const globals = require('globals');
const js = require('@eslint/js');
const pluginJest = require('eslint-plugin-jest');
const eslintPluginReact = require('eslint-plugin-react');
const eslintConfigPrettier = require('eslint-config-prettier'); // To turn off ESLint rules that conflict with Prettier

module.exports = [
  js.configs.recommended, // ESLint recommended rules
  {
    // Global settings for all JS files
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs', // Default, can be overridden for specific files if needed
      globals: {
        ...globals.node,
        ...globals.commonjs,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
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
    // Configuration for files potentially using React/JSX (e.g., TUI commands)
    files: ['src/cli/commands/chatCommand.js'], // Add other files if they use JSX
    plugins: {
      react: eslintPluginReact,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser, // React components might use browser-like globals
      },
    },
    settings: {
      react: {
        version: 'detect', // Automatically detect React version
      },
    },
    rules: {
      ...eslintPluginReact.configs.recommended.rules,
      // Disable specific React rules if they are too noisy or conflict
      // e.g. 'react/react-in-jsx-scope': 'off', // Not needed with new JSX transform, but good for explicit control
      'react/prop-types': 'off', // If not using prop-types
      'react/jsx-key': 'warn', // Important for lists
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
  {
    // Configuration for mock files
    files: ['src/__mocks__/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      // Potentially relax or add specific rules for mocks if needed
    },
  },
  eslintConfigPrettier, // Add Prettier config last to override other formatting rules
];
