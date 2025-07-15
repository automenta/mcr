import { PCA } from 'ml-pca';

export const generateEmbeddingBitmap = (embedding, width = 16, height = 16) => {
  if (!embedding || embedding.length === 0) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Reduce dimensionality to 3 for RGB channels
  let reducedEmbedding;
  try {
    const pca = new PCA([embedding]);
    reducedEmbedding = pca.predict([embedding]).to1DArray();
  } catch (e) {
    console.error('Error reducing embedding dimensions:', e);
    // Fallback to a simple visualization if PCA fails
    reducedEmbedding = embedding.slice(0, 3);
  }

  // Normalize to 0-255
  const normalize = (val, min, max) => {
    return Math.floor(((val - min) / (max - min)) * 255);
  };

  const min = Math.min(...reducedEmbedding);
  const max = Math.max(...reducedEmbedding);

  const r = normalize(reducedEmbedding[0] || 0, min, max);
  const g = normalize(reducedEmbedding[1] || 0, min, max);
  const b = normalize(reducedEmbedding[2] || 0, min, max);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const randomFactor = Math.random() * 30 - 15;
      ctx.fillStyle = `rgb(${r + randomFactor}, ${g + randomFactor}, ${b + randomFactor})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  return canvas.toDataURL();
};
