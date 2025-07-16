module.exports = {
	roots: ['<rootDir>/src'],
	testMatch: [
		'**/__tests__/**/*.+(ts|tsx|js)',
		'**/?(*.)+(spec|test).+(ts|tsx|js)',
	],
	testPathIgnorePatterns: ['/node_modules/', '/ui/'],
	moduleNameMapper: {
		'../src/bridges/embeddingBridge':
			'<rootDir>/tests/__mocks__/embeddingBridge.js',
	},
	silent: true,
};
