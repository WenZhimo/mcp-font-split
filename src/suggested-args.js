import { WORKFLOW_PRESETS } from './catalogs.js';

function omitPresetDefaults(values, defaults = {}) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== undefined)
      .filter(([key, value]) => !Object.is(value, defaults[key])),
  );
}

export function buildSuggestedOrganizationArgs({
  inputDir,
  outputDir,
  workflowPreset,
  options,
  optionOverrides = {},
  extraArgs = {},
}) {
  const presetDefaults = WORKFLOW_PRESETS[workflowPreset]?.organize || {};
  const values = { ...options, ...optionOverrides };
  const presetOverrides = omitPresetDefaults({
    dryRun: values.dryRun,
    includePlan: values.includePlan,
    parseFonts: values.parseFonts,
    batchGroupBy: values.batchGroupBy,
    batchNamingMode: values.batchNamingMode,
    batchDedupeMode: values.batchDedupeMode,
    copyInvalidFonts: values.copyInvalidFonts,
    overwriteExisting: values.overwriteExisting,
  }, presetDefaults);

  return {
    inputDir,
    outputDir,
    workflowPreset,
    ...presetOverrides,
    ...extraArgs,
  };
}

export function buildSuggestedBatchPreviewArgs({ inputDir, recommendedBatchOptions = {}, extraArgs = {} }) {
  const presetDefaults = {
    batchGroupBy: 'auto',
    ...WORKFLOW_PRESETS['safe-preview'].batch,
  };
  return {
    inputDir,
    workflowPreset: 'safe-preview',
    ...omitPresetDefaults(recommendedBatchOptions, presetDefaults),
    ...extraArgs,
  };
}

export function buildSuggestedBatchWriteArgs({ inputDir, outputRoot, effectiveArgs, batchOptions }) {
  const presetDefaults = {
    batchGroupBy: 'auto',
    ...WORKFLOW_PRESETS['reviewed-write'].batch,
  };
  const overrides = omitPresetDefaults({
    skipMode: batchOptions.skipMode,
    batchGroupBy: batchOptions.batchGroupBy,
    batchNamingMode: batchOptions.batchNamingMode,
    batchDedupeMode: batchOptions.batchDedupeMode,
    batchErrorMode: batchOptions.batchErrorMode,
    splitFailureAction: effectiveArgs.splitFailureAction,
  }, presetDefaults);
  return {
    inputDir,
    outputRoot,
    workflowPreset: 'reviewed-write',
    ...(effectiveArgs.limit !== undefined ? { limit: effectiveArgs.limit } : {}),
    ...(effectiveArgs.maxFiles !== undefined ? { maxFiles: effectiveArgs.maxFiles } : {}),
    ...overrides,
  };
}

export function buildSuggestedBatchRerunArgs({ inputDir, outputRoot, workflowPreset, effectiveArgs, batchOptions }) {
  const presetDefaults = {
    batchGroupBy: 'auto',
    ...(WORKFLOW_PRESETS[workflowPreset]?.batch || {}),
  };
  const overrides = omitPresetDefaults({
    skipMode: batchOptions.skipMode,
    batchGroupBy: batchOptions.batchGroupBy,
    batchNamingMode: batchOptions.batchNamingMode,
    batchDedupeMode: batchOptions.batchDedupeMode,
    batchErrorMode: batchOptions.batchErrorMode,
    splitFailureAction: effectiveArgs.splitFailureAction,
  }, presetDefaults);
  return {
    inputDir,
    outputRoot,
    workflowPreset,
    ...(effectiveArgs.limit !== undefined ? { limit: effectiveArgs.limit } : {}),
    maxFiles: '<higher-than-current>',
    ...overrides,
  };
}

export function buildBatchAuditArgs({ outputRoot }) {
  return {
    outDir: outputRoot,
    includeFiles: false,
    includeFamilies: false,
    maxFiles: 200000,
  };
}
