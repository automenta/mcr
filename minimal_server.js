// minimal_server.js
const express = require('express');
const app = express();
const PORT = 8080; // Use a common port, same as in config default

app.listen(PORT, '0.0.0.0', () => {
  console.log('Server is running'); // Direct console.log
});
