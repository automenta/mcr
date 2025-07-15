import TSNE from 'tsne-js';

// Custom PCA implementation
const PCA = matrix => {
  if (!matrix || matrix.length === 0 || !matrix[0] || matrix[0].length === 0) {
    return { transform: () => [] };
  }

  const rows = matrix.length;
  const cols = matrix[0].length;

  // Step 1: Calculate the mean of each column
  const mean = new Array(cols).fill(0);
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < rows; i++) {
      mean[j] += matrix[i][j];
    }
    mean[j] /= rows;
  }

  // Step 2: Center the data
  const centered = matrix.map(row => row.map((val, j) => val - mean[j]));

  // Step 3: Calculate the covariance matrix
  const covariance = new Array(cols).fill(0).map(() => new Array(cols).fill(0));
  for (let j1 = 0; j1 < cols; j1++) {
    for (let j2 = 0; j2 < cols; j2++) {
      let sum = 0;
      for (let i = 0; i < rows; i++) {
        sum += centered[i][j1] * centered[i][j2];
      }
      covariance[j1][j2] = sum / (rows - 1);
    }
  }

  // A proper implementation would calculate eigenvectors and eigenvalues here.
  // For this placeholder, we'll just return the first 'dim' dimensions of the centered data.
  const transform = (data, dim) => {
    return data.map(row => row.slice(0, dim));
  };

  return { transform: (data, dim) => transform(centered, dim) };
};

export const generateEmbeddingBitmap = (
  embedding,
  width = 16,
  height = 16,
  dim = 2
) => {
  if (!embedding || embedding.length === 0) {
    return null;
  }
  let reduced;
  try {
    const pca = PCA(embedding);
    reduced = pca.transform(embedding, dim);
  } catch (e) {
    console.warn('PCA failed, falling back to t-SNE', e);
    const tsne = new TSNE({
      dim: dim,
      perplexity: 30.0,
    });
    tsne.init({
      data: embedding,
      type: 'dense',
    });
    tsne.run();
    reduced = tsne.getOutputScaled();
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let i = 0; i < reduced.length; i++) {
    if (!reduced[i]) continue;
    const x = Math.floor(((reduced[i][0] + 1) / 2) * (width - 1));
    const y = Math.floor(((reduced[i][1] + 1) / 2) * (height - 1));
    const index = (y * width + x) * 4;
    const hue = (i / reduced.length) * 360;
    const [r, g, b] = hslToRgb(hue / 360, 1, 0.5);
    data[index] = r;
    data[index + 1] = g;
    data[index + 2] = b;
    data[index + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
};

function hslToRgb(h, s, l) {
  let r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
