const use = jest.createMockFromModule(
	'@tensorflow-models/universal-sentence-encoder'
);

use.load = jest.fn().mockResolvedValue({
	embed: jest.fn(texts => {
		// Return a mock embedding for each text
		return {
			array: jest.fn().mockResolvedValue(texts.map(() => [0.1, 0.2, 0.3])),
		};
	}),
});

module.exports = use;
