const tf = require('@tensorflow/tfjs-node');
const use = require('@tensorflow-models/universal-sentence-encoder');

class EmbeddingBridge {
    constructor() {
        this.model = null;
    }

    async loadModel() {
        try {
            this.model = await use.load();
            console.log('Sentence encoder model loaded successfully.');
        } catch (error) {
            console.error('Failed to load the sentence encoder model:', error);
            // Fallback to a zero-vector or handle appropriately
            this.model = {
                embed: async (texts) => tf.zeros([texts.length, 512])
            };
        }
    }

    async encode(text) {
        if (!this.model) {
            await this.loadModel();
        }
        const embeddings = await this.model.embed([text]);
        return embeddings.array();
    }

    similarity(vec1, vec2) {
        const tensor1 = tf.tensor(vec1);
        const tensor2 = tf.tensor(vec2);
        const cosineSimilarity = tf.losses.cosineDistance(tensor1, tensor2, 0).mul(-1).add(1);
        return cosineSimilarity.dataSync()[0];
    }
}

module.exports = EmbeddingBridge;
