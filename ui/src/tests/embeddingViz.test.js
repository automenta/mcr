import { generateEmbeddingBitmap } from '../utils/embeddingViz';

describe('embeddingViz', () => {
	it('returns null for empty embedding', () => {
		expect(generateEmbeddingBitmap([])).toBeNull();
	});

	it('returns a data URL for a valid embedding', () => {
		const embedding = [
			[1, 2, 3],
			[4, 5, 6],
			[7, 8, 9],
		];
		const dataURL = generateEmbeddingBitmap(embedding);
		expect(dataURL).toContain('data:image/png;base64,');
	});
});
