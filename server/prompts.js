// new/src/prompts.js
const fs = require('fs');
const path = require('path');

// Helper function to fill templates (simple version)
function fillTemplate(template, variables) {
  let filled = template;
  for (const key in variables) {
    // eslint-disable-next-line no-prototype-builtins
    if (variables.hasOwnProperty(key)) {
      const placeholder = `{{${key}}}`;
      if (template.includes(placeholder)) {
        // Fixed: removed unnecessary escape for / in the character class
        const regex = new RegExp(
          placeholder.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'),
          'g'
        );
        filled = filled.replace(regex, variables[key]);
      }
    }
  }

  // After all replacements, check for any remaining {{...}} placeholders
  const remainingPlaceholders = filled.match(/\{\{.*?\}\}/g);
  if (remainingPlaceholders) {
    // More specific error: find first placeholder that was in original template but not replaced
    const originalPlaceholders = template.match(/\{\{([^{}]+)\}\}/g) || [];
    for (const origPlaceholder of originalPlaceholders) {
      const keyName = origPlaceholder.substring(2, origPlaceholder.length - 2);
      // eslint-disable-next-line no-prototype-builtins
      if (!variables.hasOwnProperty(keyName)) {
        throw new Error(
          `Placeholder '{{${keyName}}}' not found in input variables.`
        );
      }
    }
    // Fallback if the above doesn't pinpoint (e.g. if a variable replacement introduced a new placeholder)
    throw new Error(
      `Unresolved placeholders remain: ${remainingPlaceholders.join(', ')}`
    );
  }

  return filled;
}

const prompts = {};
const promptsDir = path.join(__dirname, '../prompts'); // Corrected path relative to src/

fs.readdirSync(promptsDir).forEach((file) => {
  if (file.endsWith('.js')) {
    const promptName = path.basename(file, '.js');
    prompts[promptName] = require(path.join(promptsDir, file));
  }
});

// Store dynamically added prompts
const dynamicPrompts = {};

function addOrUpdatePromptTemplate(name, templateObject) {
  if (
    !name ||
    typeof name !== 'string' ||
    !templateObject ||
    typeof templateObject !== 'object'
  ) {
    // Add basic validation if necessary, or let it be flexible
    console.warn(
      `[Prompts] Invalid attempt to add or update prompt template with name: ${name}`
    );
    return;
  }
  dynamicPrompts[name] = templateObject;
}

function getPromptTemplateByName(templateName) {
  // eslint-disable-next-line no-prototype-builtins
  if (prompts.hasOwnProperty(templateName)) {
    return prompts[templateName];
    // eslint-disable-next-line no-prototype-builtins
  } else if (dynamicPrompts.hasOwnProperty(templateName)) {
    return dynamicPrompts[templateName];
  }
  console.warn(`[Prompts] Prompt template "${templateName}" not found.`);
  return undefined; // Or throw an error if preferred
}

module.exports = {
  prompts, // This will now be the dynamically loaded prompts
  fillTemplate,
  getPromptTemplateByName,
  addOrUpdatePromptTemplate,
  // _dynamicPrompts: dynamicPrompts, // Consider if this direct exposure is needed
};
