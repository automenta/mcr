module.exports = {
	roots: ['<rootDir>/tests'],
	testMatch: [
		'**/__tests__/**/*.+(ts|tsx|js)',
		'**/?(*.)+(spec|test).+(ts|tsx|js)',
	],
	moduleNameMapper: {
		'../src/bridges/embeddingBridge':
			'<rootDir>/tests/__mocks__/embeddingBridge.js',
	},
	silent: true,
};
