const js = require('@eslint/js');
const globals = require('globals');
const eslintPluginJest = require('eslint-plugin-jest');
const eslintPluginReact = require('eslint-plugin-react');

module.exports = [
	{
		ignores: [
			'dist/',
			'node_modules/',
			'coverage/',
			'.DS_Store',
			'*.log',
			'ui/coverage/',
		],
	},
	js.configs.recommended,
	// Configuration for server-side JavaScript files (CommonJS)
	{
		files: [
			'src/core/**/*.js',
			'src/server/**/*.js',
			'src/api/**/*.js',
			'src/bridges/**/*.js',
			'src/demo/**/*.js',
			'src/llm/**/*.js',
			'src/reason/**/*.js',
			'src/store/**/*.js',
			'src/strategies/**/*.js',
			'src/util/**/*.js',
			'src/interfaces/**/*.js',
			'src/neurosymbolic/**/*.js',
			'src/evalCases/**/*.js',
			'src/evaluation/**/*.js',
			'src/prompts/**/*.js',
			'tests/**/*.js',
			'*.js', // Root level JS files like mcr.js, babel.config.js, etc.
			'prompts/**/*.js',
			'scripts/**/*.js', // If you have any scripts
			'src/*.js',
		],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'commonjs',
			globals: {
				...globals.node,
				process: 'readonly',
			},
		},
		rules: {
			'no-unused-vars': [
				'warn',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
			],
			'no-console': 'off',
			'no-case-declarations': 'off',
		},
	},
	// Configuration for Jest test files (applies to server-side tests)
	{
		files: ['tests/**/*.test.js'],
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
			'jest/no-conditional-expect': 'warn', // Downgrade to warn for now
		},
	},
	// Configuration for UI files (React, JSX, ES Modules)
	{
		files: ['ui/**/*.{js,jsx}'],
		plugins: {
			react: eslintPluginReact,
		},
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module', // UI code uses ES Modules
			globals: {
				...globals.browser, // Add browser globals
				...globals.node, // Some Vite/tooling related files in UI might need node globals
				HTMLElement: 'readonly',
				document: 'readonly',
				customElements: 'readonly',
				setTimeout: 'readonly',
				CustomEvent: 'readonly',
				navigator: 'readonly',
				console: 'readonly',
				alert: 'readonly',
				confirm: 'readonly',
				prompt: 'readonly',
				vis: 'readonly',
				Chart: 'readonly',
				hljs: 'readonly',
				WebSocket: 'readonly',
				window: 'readonly',
				KeyboardEvent: 'readonly',
			},
			parserOptions: {
				ecmaFeatures: {
					jsx: true,
				},
			},
		},
		settings: {
			react: {
				version: 'detect',
			},
		},
		rules: {
			...eslintPluginReact.configs.recommended.rules,
			'react/react-in-jsx-scope': 'off',
			'react/prop-types': 'off', // Keep this off as per original config
			'no-unused-vars': [
				'warn',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
			],
			'no-console': 'off', // Consistent with server-side
		},
	},
	// Configuration for demo files
	{
		files: ['src/demo/**/*.js'],
		languageOptions: {
			sourceType: 'module',
		},
	},
	// Configuration for UI test files (Vitest, React Testing Library)
	// This assumes Vitest tests are also in ui/src and might use JSX
	{
		files: ['ui/src/**/*.test.{js,jsx}'],
		// Vitest often uses Jest-like syntax and globals.
		// If specific Vitest ESLint plugin is used, it would go here.
		// For now, ensure browser and module context is set.
		languageOptions: {
			globals: {
				...globals.jest, // Vitest is Jest-compatible
				...globals.node, // For test setup files if they use Node features
			},
		},
		rules: {
			// any specific rules for UI tests
		},
	},
	// Configuration for config files
	{
		files: ['config/**/*.js'],
		languageOptions: {
			globals: {
				...globals.node,
				module: 'readonly',
				require: 'readonly',
			},
		},
	},
	// Configuration for mock files
	{
		files: ['**/__mocks__/**/*.js'],
		languageOptions: {
			globals: {
				...globals.jest,
				jest: 'readonly',
				console: 'readonly',
				module: 'readonly',
			},
		},
	},
	// Configuration for neurosymbolic files
	{
		files: ['src/neurosymbolic/**/*.js'],
		languageOptions: {
			sourceType: 'module',
		},
	},
];
