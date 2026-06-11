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

export function formatToolError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const payload = {
    ok: false,
    error: message,
  };

  if (error instanceof Error && error.name && error.name !== 'Error') {
    payload.name = error.name;
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
