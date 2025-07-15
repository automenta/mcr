import { generateEmbeddingBitmap } from '../utils/embeddingViz';

describe('embeddingViz', () => {
  it('returns null for empty embedding', () => {
    expect(generateEmbeddingBitmap([])).toBeNull();
  });

  it('returns a data URL for a valid embedding', () => {
    const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
    const dataURL = generateEmbeddingBitmap(embedding);
    expect(dataURL).toContain('data:image/png;base64,');
  });
});
