export function jsonText(value) {
  return {
    structuredContent: value,
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorNameToType(name) {
  if (!name || name === 'Error') return null;
  const base = name.replace(/Error$/, '');
  const kebab = base
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
  return kebab ? `${kebab}-error` : null;
}

export function inferErrorType(error) {
  const details = error && typeof error === 'object' && Object.hasOwn(error, 'details') ? error.details : null;
  if (details && typeof details === 'object' && typeof details.summaryType === 'string' && details.summaryType.trim()) {
    return details.summaryType;
  }
  if (error instanceof Error) {
    return errorNameToType(error.name);
  }
  return null;
}

export function formatToolError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const payload = {
    ok: false,
    error: message,
  };

  if (error instanceof Error && error.name && error.name !== 'Error') {
    payload.name = error.name;
  }
  const errorType = inferErrorType(error);
  if (errorType) {
    payload.errorType = errorType;
  }
  if (error && typeof error === 'object' && Object.hasOwn(error, 'details')) {
    payload.details = error.details;
  }

  return payload;
}

function parseMcpValidationError(message) {
  if (typeof message !== 'string') {
    return null;
  }
  const validationStart = message.indexOf('Input validation error: Invalid arguments for tool ');
  if (validationStart < 0) {
    return null;
  }
  const validationMessage = message.slice(validationStart);
  const match = validationMessage.match(/^Input validation error: Invalid arguments for tool ([^:]+): ([\s\S]*)$/);
  if (!match) return null;
  const [, toolName, validationText] = match;
  let validationIssues = null;
  try {
    validationIssues = JSON.parse(validationText);
  } catch {
    validationIssues = null;
  }
  return {
    summaryType: 'mcp-schema-validation-error',
    toolName,
    validationIssues,
    validationMessage: validationText,
  };
}

export function formatMcpServerErrorMessage(message) {
  const payload = {
    ok: false,
    error: message,
  };
  const validationDetails = parseMcpValidationError(message);
  if (validationDetails) {
    payload.errorType = validationDetails.summaryType;
    payload.details = validationDetails;
  }
  return payload;
}

function stringifyErrorPayload(payload) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    return JSON.stringify({
      ok: false,
      error: payload.error,
      detailSerializationError: error instanceof Error ? error.message : String(error),
    }, null, 2);
  }
}

export function errorText(error) {
  const payload = formatToolError(error);
  return {
    isError: true,
    structuredContent: payload,
    content: [
      {
        type: 'text',
        text: stringifyErrorPayload(payload),
      },
    ],
  };
}

export function errorMessageText(message) {
  const payload = formatMcpServerErrorMessage(message);
  return {
    isError: true,
    structuredContent: payload,
    content: [
      {
        type: 'text',
        text: stringifyErrorPayload(payload),
      },
    ],
  };
}
