export function jsonText(value) {
  return {
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

function inferErrorType(error) {
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
    content: [
      {
        type: 'text',
        text: Object.hasOwn(payload, 'details') ? stringifyErrorPayload(payload) : payload.error,
      },
    ],
  };
}
