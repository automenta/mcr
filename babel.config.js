module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          node: '18', // Align with package.json "engines"
        },
      },
    ],
    '@babel/preset-react', // Add this for React/JSX support
  ],
};
