module.exports = {
  "roots": [
    "<rootDir>/tests"
  ],
  "testMatch": [
    "**/__tests__/**/*.+(ts|tsx|js)",
    "**/?(*.)+(spec|test).+(ts|tsx|js)"
  ],
  "transform": {
    "^.+\\.(ts|tsx)$": "ts-jest"
  },
  "moduleNameMapper": {
    "../src/bridges/embeddingBridge": "<rootDir>/tests/__mocks__/embeddingBridge.js"
  }
}
