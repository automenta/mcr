module.exports = jest.fn().mockImplementation(() => {
    return {
      loadModel: jest.fn().mockResolvedValue(true),
      encode: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      similarity: jest.fn().mockResolvedValue(0.95),
    };
  });
