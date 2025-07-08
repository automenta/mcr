const js = require('@eslint/js');
const globals = require('globals');
const eslintPluginJest = require('eslint-plugin-jest');
const eslintPluginReact = require('eslint-plugin-react');

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.test.js'], // Apply Jest plugin only to test files
    plugins: {
      jest: eslintPluginJest,
    },
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      ...eslintPluginJest.configs.recommended.rules,
      // Add or override rules here
    },
  },
  {
    files: ['**/*.js', '**/*.jsx'], // Apply React plugin to js and jsx files
    plugins: {
      react: eslintPluginReact,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        // Add any other global variables your project uses
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true, // Enable JSX parsing
        },
      },
    },
    settings: {
      react: {
        version: 'detect', // Automatically detect React version
      },
    },
    rules: {
      ...eslintPluginReact.configs.recommended.rules,
      // Add or override rules here
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'off',
      'no-case-declarations': 'off', // Turning this off for now, will address later if necessary
      'react/react-in-jsx-scope': 'off', // Not needed with new JSX transform
      'react/prop-types': 'off', // Turning off prop-types for now
    },
  },
];
