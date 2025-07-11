import js from '@eslint/js';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react'; // Renamed for clarity
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y'; // Added
// defineConfig and globalIgnores are not standard exports from 'eslint/config' in flat config.
// They are typically part of ESLint's internal API or older config systems.
// For flat config, we just export an array. Global ignores can be specified directly.

export default [ // Flat config is an array
  {
    ignores: ['dist/**'], // Global ignores
  },
  {
    files: ['**/*.{js,jsx}'],
    // Recommended way to apply plugins and their recommended configs in flat config
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      ecmaVersion: 'latest', // Simplified from 2020
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node, // Added for Vite config files, tests, etc.
        vi: 'readonly', // For Vitest globals
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules, // For the new JSX transform
      ...reactHooks.configs.recommended.rules, // reactHooks.configs['recommended-latest'] is not standard
      ...jsxA11y.configs.recommended.rules,
      // reactRefresh.configs.vite might not be a direct rules object.
      // Typically, reactRefresh.rules['react-refresh/only-export-components'] is the main rule.
      'react-refresh/only-export-components': 'warn',

      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^[A-Z_]' }],
      'react/prop-types': 'off', // Turning off as this project doesn't use PropTypes. Consider for future.
      'react/react-in-jsx-scope': 'off', // Not needed with new JSX transform
      'no-console': ['warn', { allow: ['warn', 'error', 'debug'] }], // Added 'debug'
    },
    settings: { // Settings are usually per-plugin
      react: {
        version: 'detect', // Automatically detect React version
      },
    },
  },
];
