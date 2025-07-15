console.log('mcrService mock loaded');
module.exports = {
  setSessionKnowledgeBase: jest.fn().mockResolvedValue(true),
};
