// ui/src/index.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Styles are loaded via a <link> tag in public/index.html for simplicity with vanilla JS/CSS setup.
// If using a bundler like Vite or Webpack, you'd import './styles.css' here.

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
