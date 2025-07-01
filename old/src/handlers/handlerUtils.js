const ApiError = require('../errors');

const VALID_STYLES = ['conversational', 'formal'];

function validateNonEmptyString(field, fieldName, errorCodePrefix) {
  if (!field || typeof field !== 'string' || field.trim() === '') {
    throw new ApiError(
      400,
      `Missing or invalid required field '${fieldName}'. Must be a non-empty string.`,
      `${errorCodePrefix}_INVALID_${fieldName.toUpperCase()}`
    );
  }
}

function validateOptionalString(field, fieldName, errorCodePrefix) {
  if (field && (typeof field !== 'string' || field.trim() === '')) {
    throw new ApiError(
      400,
      `Invalid optional field '${fieldName}'. Must be a non-empty string if provided.`,
      `${errorCodePrefix}_INVALID_${fieldName.toUpperCase()}`
    );
  }
}

function validateStyle(style, fieldName, errorCodePrefix) {
  if (style && !VALID_STYLES.includes(style.toLowerCase())) {
    throw new ApiError(
      400,
      `Invalid '${fieldName}'. Must be one of ${VALID_STYLES.join(', ')}.`,
      `${errorCodePrefix}_INVALID_${fieldName.toUpperCase()}`
    );
  }
}

module.exports = {
  validateNonEmptyString,
  validateOptionalString,
  validateStyle,
  VALID_STYLES,
};
