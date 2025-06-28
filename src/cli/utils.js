const fs = require('fs');
const path = require('path');

const readOntologyFile = (filePath) => {
  if (!filePath) return null;
  const ontologyPath = path.resolve(filePath);
  if (!fs.existsSync(ontologyPath)) {
    console.error(`Error: Ontology file not found: ${ontologyPath}`);
    process.exit(1);
  }
  console.log(`Using ontology: ${ontologyPath}`);
  return fs.readFileSync(ontologyPath, 'utf8');
};

const printJson = (data) => {
  console.log(JSON.stringify(data, null, 2));
};

module.exports = {
  readOntologyFile,
  printJson,
};
