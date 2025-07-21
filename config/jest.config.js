module.exports = {
	roots: ['<rootDir>/tests', '<rootDir>/ui'],
	testMatch: [
		'**/__tests__/**/*.+(ts|tsx|js)',
		'**/?(*.)+(spec|test).+(ts|tsx|js)',
	],
	moduleNameMapper: {
		'../src/bridges/embeddingBridge':
			'<rootDir>/tests/__mocks__/embeddingBridge.js',
	},
	transform: {
		'^.+\\.(js|jsx)$': 'babel-jest',
		'^.+\\.m?js$': 'vite-jest',
	},
	transformIgnorePatterns: [
		'/node_modules/(?!yargs|yargs-parser|vitest|vite-jest)/',
	],
	globals: {
		self: {},
	},
	projects: [
		{
			displayName: 'node',
			testEnvironment: 'node',
			testMatch: ['<rootDir>/tests/**/*.js'],
		},
		{
			displayName: 'jsdom',
			testEnvironment: 'jsdom',
			testMatch: ['<rootDir>/ui/**/*.js'],
		},
	],
};
