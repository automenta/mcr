const tf = jest.createMockFromModule('@tensorflow/tfjs-node');

tf.zeros = jest.fn(() => ({ array: jest.fn().mockResolvedValue(new Array(512).fill(0)) }));
tf.tensor = jest.fn(() => ({}));
tf.losses = {
    cosineDistance: jest.fn(() => ({ mul: jest.fn(() => ({ add: jest.fn(() => ({ dataSync: jest.fn(() => [0.9]) })) })) })),
};

module.exports = tf;
