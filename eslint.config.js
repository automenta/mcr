const js = require('@eslint/js');
const globals = require('globals');
const eslintPluginJest = require('eslint-plugin-jest');

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
			'src/**/*.js',
			'tests/**/*.js',
			'*.js', // Root level JS files like mcr.js, babel.config.js, etc.
			'prompts/**/*.js',
			'scripts/**/*.js', // If you have any scripts
		],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'commonjs',
			globals: {
				...globals.node,
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
	// Configuration for UI test files (Vitest)
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
];
