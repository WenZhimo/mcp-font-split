import {
  BATCH_DEDUPE_MODES,
  BATCH_ERROR_MODES,
  BATCH_GROUP_BY_MODES,
  BATCH_NAMING_MODES,
  OVERSIZED_KERN_ACTIONS,
  SKIP_MODES,
  SMALL_GLYPH_ACTIONS,
  SPLIT_FAILURE_ACTIONS,
  WORKFLOW_PRESET_NAMES,
  WORKFLOW_PRESETS,
} from './catalogs.js';

export const RAW_BATCH_OPTION_DEFAULTS = {
  dryRun: false,
  includeResults: true,
  skipMode: 'manifest',
  batchGroupBy: 'auto',
  batchNamingMode: 'numeric-suffix',
  batchDedupeMode: 'font-identity',
  batchErrorMode: 'fail-after',
  splitFailureAction: 'error',
};

export const RAW_ORGANIZATION_OPTION_DEFAULTS = {
  dryRun: true,
  includePlan: true,
  parseFonts: true,
  batchGroupBy: 'auto',
  batchNamingMode: 'numeric-suffix',
  batchDedupeMode: 'font-identity',
  copyInvalidFonts: false,
  overwriteExisting: false,
};

export function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function buildConfigurationError({ optionName, received, allowedValues, expectedType, min, max, defaultWhenOmitted }) {
  const allowedText = Array.isArray(allowedValues) && allowedValues.length > 0
    ? ` one of: ${allowedValues.join(', ')}`
    : ` a ${expectedType}`;
  const rangeText = min !== undefined || max !== undefined
    ? ` (${[
      min !== undefined ? `min ${min}` : null,
      max !== undefined ? `max ${max}` : null,
    ].filter(Boolean).join(', ')})`
    : '';
  const error = new Error(`${optionName} must be${allowedText}${rangeText}. Omit it to use the documented default.`);
  error.name = 'FontSplitConfigurationError';
  error.details = {
    summaryType: 'configuration-error',
    option: optionName,
    received,
    ...(allowedValues ? { allowedValues } : {}),
    expectedType,
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    defaultWhenOmitted,
    omitForDefaultBehavior: true,
    nonIntuitiveBehavior: 'Explicit invalid configuration values are rejected instead of silently falling back to defaults.',
  };
  return error;
}

export function normalizeEnumOption(args, optionName, allowedValues, defaultValue) {
  const value = args?.[optionName];
  if (value === undefined || value === null || value === '') return defaultValue;
  if (allowedValues.includes(value)) return value;
  throw buildConfigurationError({
    optionName,
    received: value,
    allowedValues,
    expectedType: 'enum',
    defaultWhenOmitted: defaultValue,
  });
}

export function normalizeBooleanOption(args, optionName, defaultValue) {
  const value = args?.[optionName];
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  throw buildConfigurationError({
    optionName,
    received: value,
    allowedValues: [true, false],
    expectedType: 'boolean',
    defaultWhenOmitted: defaultValue,
  });
}

export function normalizePositiveNumberOption(args, optionName, defaultValue, { integer = false, max } = {}) {
  const value = args?.[optionName];
  if (value === undefined || value === null || value === '') return defaultValue;
  const validNumber = typeof value === 'number'
    && Number.isFinite(value)
    && value > 0
    && (!integer || Number.isInteger(value))
    && (max === undefined || value <= max);
  if (validNumber) return value;
  throw buildConfigurationError({
    optionName,
    received: value,
    expectedType: integer ? 'positive-integer' : 'positive-number',
    min: integer ? 1 : undefined,
    max,
    defaultWhenOmitted: defaultValue,
  });
}

export function normalizeOptionalPositiveNumberOption(args, optionName, { integer = false } = {}) {
  const value = args?.[optionName];
  if (value === undefined || value === null || value === '') return undefined;
  const validNumber = typeof value === 'number'
    && Number.isFinite(value)
    && value > 0
    && (!integer || Number.isInteger(value));
  if (validNumber) return value;
  throw buildConfigurationError({
    optionName,
    received: value,
    expectedType: integer ? 'positive-integer' : 'positive-number',
    min: integer ? 1 : undefined,
    defaultWhenOmitted: 'unset',
  });
}

function getWorkflowPresetName(value) {
  return typeof value === 'string' && WORKFLOW_PRESET_NAMES.includes(value) ? value : null;
}

function dropUndefinedOptions(args = {}) {
  return Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined));
}

export function applyWorkflowPreset(args = {}, scope) {
  const workflowPreset = normalizeEnumOption(args, 'workflowPreset', WORKFLOW_PRESET_NAMES, null);
  const preset = workflowPreset ? WORKFLOW_PRESETS[workflowPreset] : null;
  const scopePreset = preset?.[scope] || {};
  const explicitArgs = dropUndefinedOptions({ ...args, workflowPreset: undefined });
  return {
    workflowPreset,
    presetDefaults: scopePreset,
    explicitArgs,
    args: {
      ...scopePreset,
      ...explicitArgs,
      workflowPreset,
    },
  };
}

export function buildConfigurationTrace({
  appliesToTool,
  workflowPreset,
  rawDefaults,
  presetDefaults = {},
  explicitArgs = {},
  effectiveValues = {},
}) {
  const fieldNames = Object.keys(rawDefaults);
  const fields = fieldNames.map((optionName) => {
    const hasPresetDefault = Object.hasOwn(presetDefaults, optionName);
    const hasExplicitValue = Object.hasOwn(explicitArgs, optionName);
    const rawDefault = rawDefaults[optionName];
    const presetDefault = presetDefaults[optionName];
    const explicitValue = explicitArgs[optionName];
    const effectiveValue = effectiveValues[optionName];
    const source = hasExplicitValue
      ? 'explicit-argument'
      : hasPresetDefault
        ? 'workflow-preset'
        : 'raw-default';
    return {
      optionName,
      source,
      rawDefault,
      ...(hasPresetDefault ? { presetDefault } : {}),
      ...(hasExplicitValue ? { explicitValue } : {}),
      effectiveValue,
      presetOverridden: hasExplicitValue && hasPresetDefault && !Object.is(explicitValue, presetDefault),
      changedFromRawDefault: !Object.is(effectiveValue, rawDefault),
    };
  });
  const explicitOverrideFields = fields
    .filter((field) => field.source === 'explicit-argument')
    .map((field) => field.optionName);
  const presetDefaultFields = fields
    .filter((field) => field.source === 'workflow-preset')
    .map((field) => field.optionName);
  return {
    summaryType: 'configuration-trace',
    appliesToTool,
    workflowPreset,
    presetApplied: Boolean(workflowPreset),
    explicitOptionsOverridePreset: true,
    rawDefaultSource: 'raw-tool-defaults',
    presetDefaultSource: workflowPreset ? `workflowPreset:${workflowPreset}` : null,
    optionCount: fields.length,
    explicitOverrideCount: explicitOverrideFields.length,
    presetDefaultCount: presetDefaultFields.length,
    explicitOverrideFields,
    presetDefaultFields,
    effectiveValues: Object.fromEntries(fields.map((field) => [field.optionName, field.effectiveValue])),
    fields,
    nonIntuitiveBehavior: 'workflowPreset values are applied before explicit arguments; explicit arguments with undefined are ignored and do not erase preset defaults.',
  };
}

export function normalizeProcessingOptions(args) {
  return {
    oversizedKernAction: normalizeEnumOption(args, 'oversizedKernAction', OVERSIZED_KERN_ACTIONS, 'preserve'),
    smallGlyphAction: normalizeEnumOption(args, 'smallGlyphAction', SMALL_GLYPH_ACTIONS, 'subset'),
    smallGlyphThreshold: normalizePositiveNumberOption(args, 'smallGlyphThreshold', 50, { integer: true }),
    splitFailureAction: normalizeEnumOption(args, 'splitFailureAction', SPLIT_FAILURE_ACTIONS, 'error'),
  };
}

export function normalizeBatchOptions(args) {
  return {
    workflowPreset: getWorkflowPresetName(args.workflowPreset),
    skipMode: normalizeEnumOption(args, 'skipMode', SKIP_MODES, 'manifest'),
    batchGroupBy: normalizeEnumOption(args, 'batchGroupBy', BATCH_GROUP_BY_MODES, 'auto'),
    batchNamingMode: normalizeEnumOption(args, 'batchNamingMode', BATCH_NAMING_MODES, 'numeric-suffix'),
    batchDedupeMode: normalizeEnumOption(args, 'batchDedupeMode', BATCH_DEDUPE_MODES, 'font-identity'),
    batchErrorMode: normalizeEnumOption(args, 'batchErrorMode', BATCH_ERROR_MODES, 'fail-after'),
    debugBatchDecisions: normalizeBooleanOption(args, 'debugBatchDecisions', false),
  };
}

export function normalizeOrganizationOptions(args) {
  return {
    workflowPreset: getWorkflowPresetName(args.workflowPreset),
    dryRun: normalizeBooleanOption(args, 'dryRun', true),
    includePlan: normalizeBooleanOption(args, 'includePlan', true),
    parseFonts: normalizeBooleanOption(args, 'parseFonts', true),
    batchGroupBy: normalizeEnumOption(args, 'batchGroupBy', BATCH_GROUP_BY_MODES, 'auto'),
    batchNamingMode: normalizeEnumOption(args, 'batchNamingMode', BATCH_NAMING_MODES, 'numeric-suffix'),
    batchDedupeMode: normalizeEnumOption(args, 'batchDedupeMode', BATCH_DEDUPE_MODES, 'font-identity'),
    copyInvalidFonts: normalizeBooleanOption(args, 'copyInvalidFonts', false),
    overwriteExisting: normalizeBooleanOption(args, 'overwriteExisting', false),
  };
}

export function buildEffectiveConfigSnapshot(args, processingOptions) {
  const snapshot = {
    processingOptions,
  };

  if (BATCH_NAMING_MODES.includes(args.batchNamingMode)) {
    snapshot.batchNamingMode = args.batchNamingMode;
  }
  if (BATCH_DEDUPE_MODES.includes(args.batchDedupeMode)) {
    snapshot.batchDedupeMode = args.batchDedupeMode;
  }
  if (BATCH_ERROR_MODES.includes(args.batchErrorMode)) {
    snapshot.batchErrorMode = args.batchErrorMode;
  }
  const optionalStrings = [
    'fontFamily', 'fontWeight', 'fontStyle', 'fontDisplay', 'cssFileName',
    'previewText', 'previewName', 'renameOutputFont', 'buildMode',
  ];
  for (const key of optionalStrings) {
    const value = normalizeOptionalString(args[key]);
    if (value !== undefined) snapshot[key] = value;
  }

  const optionalNumbers = [
    ['chunkSize', { integer: true }],
    ['chunkSizeTolerance', { integer: false }],
    ['maxAllowSubsetsCount', { integer: true }],
  ];
  for (const [key, numericOptions] of optionalNumbers) {
    const value = normalizeOptionalPositiveNumberOption(args, key, numericOptions);
    if (value !== undefined) snapshot[key] = value;
  }

  const optionalBooleans = [
    'languageAreas', 'testHtml', 'reporter', 'multiThreads', 'fontFeature',
    'reduceMins', 'autoSubset', 'subsetRemainChars',
  ];
  for (const key of optionalBooleans) {
    const value = normalizeBooleanOption(args, key, undefined);
    if (value !== undefined) snapshot[key] = value;
  }

  if (Array.isArray(args.subsets) && args.subsets.length > 0) {
    snapshot.subsets = args.subsets;
  }

  return snapshot;
}
