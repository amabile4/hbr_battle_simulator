function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkType(expectedType, value) {
  switch (expectedType) {
    case 'object':
      return isPlainObject(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function addError(errors, path, message) {
  errors.push(`${path}: ${message}`);
}

function validatePrimitive(schema, value, path, errors) {
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      addError(errors, path, `must be >= ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      addError(errors, path, `must be <= ${schema.maximum}`);
    }
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      addError(errors, path, `length must be >= ${schema.minLength}`);
    }

    if (typeof schema.pattern === 'string') {
      const pattern = new RegExp(schema.pattern);
      if (!pattern.test(value)) {
        addError(errors, path, `must match pattern ${schema.pattern}`);
      }
    }

    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) {
      addError(errors, path, 'must be a valid date-time string');
    }
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    addError(errors, path, `must be one of: ${schema.enum.join(', ')}`);
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'const') && value !== schema.const) {
    addError(errors, path, `must equal const ${JSON.stringify(schema.const)}`);
  }
}

function validateArray(schema, value, path, errors) {
  if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
    addError(errors, path, `must contain at least ${schema.minItems} items`);
  }

  if (schema.items) {
    value.forEach((item, index) => {
      validateBySchema(schema.items, item, `${path}[${index}]`, errors);
    });
  }
}

function validateObject(schema, value, path, errors) {
  const required = schema.required ?? [];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      addError(errors, path, `missing required property "${key}"`);
    }
  }

  const properties = schema.properties ?? {};
  for (const [key, childSchema] of Object.entries(properties)) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      validateBySchema(childSchema, value[key], `${path}.${key}`, errors);
    }
  }

  const additionalProperties = schema.additionalProperties;
  if (additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) {
        addError(errors, `${path}.${key}`, 'is not allowed (additionalProperties=false)');
      }
    }
  } else if (isPlainObject(additionalProperties)) {
    for (const key of Object.keys(value)) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) {
        validateBySchema(additionalProperties, value[key], `${path}.${key}`, errors);
      }
    }
  }
}

export function validateBySchema(schema, value, path = '$', errors = []) {
  if (!schema || typeof schema !== 'object') {
    return errors;
  }

  const declaredType = schema.type;
  if (declaredType) {
    const acceptedTypes = Array.isArray(declaredType) ? declaredType : [declaredType];
    const typeValid = acceptedTypes.some((type) => checkType(type, value));

    if (!typeValid) {
      addError(errors, path, `must be of type ${acceptedTypes.join(' | ')}`);
      return errors;
    }
  }

  validatePrimitive(schema, value, path, errors);

  if (Array.isArray(value)) {
    validateArray(schema, value, path, errors);
  } else if (isPlainObject(value)) {
    validateObject(schema, value, path, errors);
  }

  return errors;
}

export function validateDocument(schema, data) {
  const errors = validateBySchema(schema, data, '$', []);
  return {
    valid: errors.length === 0,
    errors,
  };
}
