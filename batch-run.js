import { splitFontBatch } from './src/font-split.js';
import { inferErrorType } from './src/mcp-response.js';

const WORKFLOW_PRESETS = ['safe-preview', 'reviewed-write', 'structure-first', 'source-layout', 'metadata-family', 'preserve-all'];
const BOOLEAN_TRUE_VALUES = ['1', 'true', 'yes', 'on'];
const BOOLEAN_FALSE_VALUES = ['0', 'false', 'no', 'off'];
const BATCH_RUN_ENUM_ENV_OPTIONS = {
  FONT_SPLIT_SKIP_MODE: {
    allowedValues: ['manifest', 'force'],
    requestedField: 'requestedSkipMode',
  },
  FONT_SPLIT_BATCH_GROUP_BY: {
    allowedValues: ['auto', 'source-dir', 'font-family'],
    requestedField: 'requestedBatchGroupBy',
  },
  FONT_SPLIT_BATCH_NAMING_MODE: {
    allowedValues: ['plain', 'numeric-suffix', 'source-suffix'],
    requestedField: 'requestedBatchNamingMode',
  },
  FONT_SPLIT_BATCH_DEDUPE_MODE: {
    allowedValues: ['none', 'same-path', 'font-identity'],
    requestedField: 'requestedBatchDedupeMode',
  },
  FONT_SPLIT_BATCH_ERROR_MODE: {
    allowedValues: ['collect', 'fail-fast', 'fail-after'],
    requestedField: 'requestedBatchErrorMode',
  },
  FONT_SPLIT_SPLIT_FAILURE_ACTION: {
    allowedValues: ['error', 'single-woff2'],
    requestedField: 'requestedSplitFailureAction',
  },
};
const COMPACT_ERROR_LIMIT = 20;

function hasEnv(name) {
  return process.env[name] !== undefined && process.env[name] !== '';
}

function buildInvalidWorkflowPresetError(value, fallback) {
  const error = new Error(`FONT_SPLIT_WORKFLOW_PRESET must be one of: ${WORKFLOW_PRESETS.join(', ')}. Omit it to use batch-run's ${fallback} default.`);
  error.name = 'BatchRunConfigurationError';
  error.details = {
    summaryType: 'configuration-error',
    option: 'FONT_SPLIT_WORKFLOW_PRESET',
    received: value,
    allowedValues: WORKFLOW_PRESETS,
    requestedField: 'requestedWorkflowPreset',
    defaultWhenOmitted: fallback,
    omitForDefaultBehavior: true,
    nonIntuitiveBehavior: 'default is not a named workflow preset; omit FONT_SPLIT_WORKFLOW_PRESET to use batch-run defaults.',
  };
  return error;
}

function buildInvalidBooleanEnvError(name, value, requestedField) {
  const allowedValues = [...BOOLEAN_TRUE_VALUES, ...BOOLEAN_FALSE_VALUES];
  const error = new Error(`${name} must be one of: ${allowedValues.join(', ')}. Omit it to leave the option unset and use CLI/preset defaults.`);
  error.name = 'BatchRunConfigurationError';
  error.details = {
    summaryType: 'configuration-error',
    option: name,
    source: 'env',
    received: value,
    allowedValues,
    requestedField,
    expectedType: 'boolean',
    omitForDefaultBehavior: true,
    nonIntuitiveBehavior: 'Invalid boolean batch-run environment variables are rejected instead of silently falling back.',
  };
  return error;
}

function buildInvalidPositiveIntegerError({ name, value, requestedField, targetField, source, defaultWhenOmitted }) {
  const error = new Error(`${name} must be a positive integer. Omit it to use ${defaultWhenOmitted}.`);
  error.name = 'BatchRunConfigurationError';
  error.details = {
    summaryType: 'configuration-error',
    option: name,
    source,
    received: value,
    requestedField,
    targetField,
    expectedType: 'positive-integer',
    min: 1,
    defaultWhenOmitted,
    omitForDefaultBehavior: true,
    nonIntuitiveBehavior: 'Invalid numeric batch-run configuration is rejected instead of silently falling back.',
  };
  return error;
}

function buildInvalidEnumEnvError(name, value, allowedValues, requestedField) {
  const error = new Error(`${name} must be one of: ${allowedValues.join(', ')}. Omit it to leave the option unset and use preset/tool defaults.`);
  error.name = 'BatchRunConfigurationError';
  error.details = {
    summaryType: 'configuration-error',
    option: name,
    received: value,
    allowedValues,
    requestedField,
    omitForDefaultBehavior: true,
    nonIntuitiveBehavior: 'Invalid enum-like batch-run environment variables are rejected instead of silently falling back.',
  };
  return error;
}

function booleanEnvOption(name, requestedField) {
  if (!hasEnv(name)) return { value: undefined, error: null };
  const value = process.env[name];
  const normalized = String(value).toLowerCase();
  if (BOOLEAN_TRUE_VALUES.includes(normalized)) return { value: true, error: null };
  if (BOOLEAN_FALSE_VALUES.includes(normalized)) return { value: false, error: null };
  return {
    value: undefined,
    error: buildInvalidBooleanEnvError(name, value, requestedField),
  };
}

function enumEnvOption(name) {
  const config = BATCH_RUN_ENUM_ENV_OPTIONS[name];
  if (!config || !hasEnv(name)) return { value: undefined, error: null };
  const value = process.env[name];
  return config.allowedValues.includes(value)
    ? { value, error: null }
    : {
      value: undefined,
      error: buildInvalidEnumEnvError(name, value, config.allowedValues, config.requestedField),
    };
}

function positiveIntegerOption({ name, value, fallback, requestedField, targetField, source }) {
  if (value === undefined || value === null || value === '') {
    return { value: fallback, error: null };
  }
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return { value: parsed, error: null };
  }
  return {
    value: fallback,
    error: buildInvalidPositiveIntegerError({
      name,
      value,
      requestedField,
      targetField,
      source,
      defaultWhenOmitted: String(fallback),
    }),
  };
}

function limitArray(items, limit) {
  const source = Array.isArray(items) ? items : [];
  return {
    items: source.slice(0, limit),
    truncated: source.length > limit,
    omittedCount: Math.max(0, source.length - limit),
  };
}

function buildCompactBatchResult(result) {
  if (!result || typeof result !== 'object') return null;
  const omittedDetailFields = [];
  if (Object.hasOwn(result, 'planned')) omittedDetailFields.push('planned');
  if (Object.hasOwn(result, 'results')) omittedDetailFields.push('results');

  const compact = {
    ok: result.ok,
    inputDir: result.inputDir,
    outputRoot: result.outputRoot,
    workflowPreset: result.workflowPreset,
    safetySummary: result.safetySummary,
    sourceDestructive: result.sourceDestructive,
    sourceFilesPreserved: result.sourceFilesPreserved,
    writesSourceTree: result.writesSourceTree,
    writesOutputTree: result.writesOutputTree,
    outputTreeInsideInputTree: result.outputTreeInsideInputTree,
    mayOverwriteOutputTree: result.mayOverwriteOutputTree,
    dryRun: result.dryRun,
    skipMode: result.skipMode,
    batchGroupBy: result.batchGroupBy,
    batchNamingMode: result.batchNamingMode,
    batchDedupeMode: result.batchDedupeMode,
    batchErrorMode: result.batchErrorMode,
    scannedFileCount: result.scannedFileCount,
    maxFiles: result.maxFiles,
    maxFilesHit: result.maxFilesHit,
    unsupportedFileSummary: result.unsupportedFileSummary,
    discoveredFontCount: result.discoveredFontCount,
    deduplicatedCount: result.deduplicatedCount,
    skippedDuplicates: result.skippedDuplicates,
    selectedFontCount: result.selectedFontCount,
    skippedExisting: result.skippedExisting,
    skippedByManifest: result.skippedByManifest,
    reprocessedBecauseSourceChanged: result.reprocessedBecauseSourceChanged,
    reprocessedBecauseOptionsChanged: result.reprocessedBecauseOptionsChanged,
    processedFontCount: result.processedFontCount,
    errorCount: result.errorCount,
    batchWarningCount: result.batchWarningCount,
    batchWarnings: result.batchWarnings || [],
    recommendedNextActionCount: result.recommendedNextActionCount,
    recommendedNextActions: result.recommendedNextActions || [],
    resultsIncluded: result.resultsIncluded,
    processingSummary: result.processingSummary,
    plannedCount: result.plannedCount,
    wouldProcessCount: result.wouldProcessCount,
    planIncluded: result.planIncluded,
    omittedDetailFields,
  };
  const limitedErrors = limitArray(result.errors, COMPACT_ERROR_LIMIT);
  compact.errors = limitedErrors.items;
  compact.errorsTruncated = limitedErrors.truncated;
  compact.omittedErrorCount = limitedErrors.omittedCount;
  return compact;
}

function buildBatchRunSummary({ ok, startedAt, batchOptions, result, error, summaryOnly }) {
  const elapsedMs = Date.now() - startedAt;
  const errorName = error instanceof Error ? error.name : 'Error';
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorType = inferErrorType(error);
  const outputMode = summaryOnly ? 'json-summary' : 'json';
  return {
    ok,
    runner: {
      name: 'batch-run',
      outputMode,
      elapsedMs,
    },
    options: batchOptions,
    ...(result ? (summaryOnly ? { summary: buildCompactBatchResult(result) } : { result }) : {}),
    ...(error ? {
      name: errorName,
      ...(errorType ? { errorType } : {}),
      error: errorMessage,
      ...(summaryOnly && error.details?.summary ? { summary: buildCompactBatchResult(error.details.summary) } : {}),
      ...(summaryOnly && error.details?.errors ? {
        errors: limitArray(error.details.errors, COMPACT_ERROR_LIMIT).items,
        errorsTruncated: limitArray(error.details.errors, COMPACT_ERROR_LIMIT).truncated,
        omittedErrorCount: limitArray(error.details.errors, COMPACT_ERROR_LIMIT).omittedCount,
      } : {}),
      ...(summaryOnly && error.details && !error.details.summary ? { details: error.details } : {}),
      ...(!summaryOnly && error.details ? { details: error.details } : {}),
    } : {}),
  };
}

const flagArgs = new Set(['--dry-run', '--json', '--json-summary']);
const positionalArgs = process.argv.slice(2).filter((arg) => !flagArgs.has(arg));
const inputDir = process.env.FONT_SPLIT_INPUT_DIR || positionalArgs[0] || '.';
const outputRoot = process.env.FONT_SPLIT_OUTPUT_ROOT || positionalArgs[1] || 'split-output';
const dryRunFlag = process.argv.includes('--dry-run');
const jsonSummaryFlag = process.argv.includes('--json-summary');
const jsonFlag = process.argv.includes('--json');
const limitOption = positiveIntegerOption({
  name: hasEnv('FONT_SPLIT_LIMIT') ? 'FONT_SPLIT_LIMIT' : 'limit',
  value: hasEnv('FONT_SPLIT_LIMIT') ? process.env.FONT_SPLIT_LIMIT : positionalArgs[2],
  fallback: 50000,
  requestedField: 'requestedLimit',
  targetField: 'limit',
  source: hasEnv('FONT_SPLIT_LIMIT') ? 'env' : 'positional',
});
const maxFilesOption = positiveIntegerOption({
  name: hasEnv('FONT_SPLIT_MAX_FILES') ? 'FONT_SPLIT_MAX_FILES' : 'maxFiles',
  value: hasEnv('FONT_SPLIT_MAX_FILES') ? process.env.FONT_SPLIT_MAX_FILES : positionalArgs[3],
  fallback: 50000,
  requestedField: 'requestedMaxFiles',
  targetField: 'maxFiles',
  source: hasEnv('FONT_SPLIT_MAX_FILES') ? 'env' : 'positional',
});
const chunkSizeOption = positiveIntegerOption({
  name: 'FONT_SPLIT_CHUNK_SIZE',
  value: hasEnv('FONT_SPLIT_CHUNK_SIZE') ? process.env.FONT_SPLIT_CHUNK_SIZE : undefined,
  fallback: 70 * 1024,
  requestedField: 'requestedChunkSize',
  targetField: 'chunkSize',
  source: 'env',
});
const dryRunOption = booleanEnvOption('FONT_SPLIT_DRY_RUN', 'requestedDryRun');
const jsonSummaryOption = booleanEnvOption('FONT_SPLIT_JSON_SUMMARY', 'requestedJsonSummary');
const jsonOption = booleanEnvOption('FONT_SPLIT_JSON', 'requestedJson');
const includeResultsOption = booleanEnvOption('FONT_SPLIT_INCLUDE_RESULTS', 'requestedIncludeResults');
const limit = limitOption.value;
const maxFiles = maxFilesOption.value;
const dryRunEnvProvided = hasEnv('FONT_SPLIT_DRY_RUN') && !dryRunOption.error;
const dryRun = dryRunFlag || dryRunOption.value === true;
const jsonSummaryOutput = jsonSummaryFlag || jsonSummaryOption.value === true || Boolean(jsonSummaryOption.error);
const jsonOutput = jsonSummaryOutput || jsonFlag || jsonOption.value === true || Boolean(jsonOption.error);
const includeResults = includeResultsOption.value;
const chunkSize = chunkSizeOption.value;
const defaultWorkflowPreset = dryRun ? 'safe-preview' : 'reviewed-write';
const requestedWorkflowPreset = hasEnv('FONT_SPLIT_WORKFLOW_PRESET') ? process.env.FONT_SPLIT_WORKFLOW_PRESET : undefined;
const workflowPresetConfigurationError = requestedWorkflowPreset && !WORKFLOW_PRESETS.includes(requestedWorkflowPreset)
  ? buildInvalidWorkflowPresetError(requestedWorkflowPreset, defaultWorkflowPreset)
  : null;
const workflowPreset = workflowPresetConfigurationError ? defaultWorkflowPreset : (requestedWorkflowPreset || defaultWorkflowPreset);
const skipModeOption = enumEnvOption('FONT_SPLIT_SKIP_MODE');
const batchGroupByOption = enumEnvOption('FONT_SPLIT_BATCH_GROUP_BY');
const batchNamingModeOption = enumEnvOption('FONT_SPLIT_BATCH_NAMING_MODE');
const batchDedupeModeOption = enumEnvOption('FONT_SPLIT_BATCH_DEDUPE_MODE');
const batchErrorModeOption = enumEnvOption('FONT_SPLIT_BATCH_ERROR_MODE');
const splitFailureActionOption = enumEnvOption('FONT_SPLIT_SPLIT_FAILURE_ACTION');
const configurationError = workflowPresetConfigurationError
  || dryRunOption.error
  || jsonSummaryOption.error
  || jsonOption.error
  || includeResultsOption.error
  || limitOption.error
  || maxFilesOption.error
  || chunkSizeOption.error
  || skipModeOption.error
  || batchGroupByOption.error
  || batchNamingModeOption.error
  || batchDedupeModeOption.error
  || batchErrorModeOption.error
  || splitFailureActionOption.error;
const skipMode = skipModeOption.value;
const batchGroupBy = batchGroupByOption.value;
const batchNamingMode = batchNamingModeOption.value;
const batchDedupeMode = batchDedupeModeOption.value;
const batchErrorMode = batchErrorModeOption.value;
const splitFailureAction = splitFailureActionOption.value;
const startedAt = Date.now();
const batchOptions = {
  inputDir,
  outputRoot,
  limit: configurationError?.details?.targetField === 'limit' ? null : limit,
  maxFiles: configurationError?.details?.targetField === 'maxFiles' ? null : maxFiles,
  ...(workflowPresetConfigurationError ? { workflowPreset: null, requestedWorkflowPreset } : { workflowPreset }),
  ...(!workflowPresetConfigurationError && configurationError?.details?.requestedField
    ? { [configurationError.details.requestedField]: configurationError.details.received }
    : {}),
  silent: true,
  chunkSize: configurationError?.details?.targetField === 'chunkSize' ? null : chunkSize,
  ...(dryRunFlag || dryRunEnvProvided ? { dryRun } : {}),
  ...(includeResults !== undefined && !includeResultsOption.error ? { includeResults } : {}),
  ...(skipMode ? { skipMode } : {}),
  ...(batchGroupBy ? { batchGroupBy } : {}),
  ...(batchNamingMode ? { batchNamingMode } : {}),
  ...(batchDedupeMode ? { batchDedupeMode } : {}),
  ...(batchErrorMode ? { batchErrorMode } : {}),
  ...(splitFailureAction ? { splitFailureAction } : {}),
};

if (!jsonOutput && !configurationError) {
  console.log('Starting batch font split...');
  console.log(JSON.stringify(batchOptions, null, 2));
}

if (configurationError) {
  if (jsonOutput) {
    console.log(JSON.stringify(buildBatchRunSummary({
      ok: false,
      startedAt,
      batchOptions,
      error: configurationError,
      summaryOnly: jsonSummaryOutput,
    }), null, 2));
  } else {
    console.error('\nBatch run configuration failed.');
    console.error(configurationError.message);
    console.error(JSON.stringify(configurationError.details, null, 2));
  }
  process.exitCode = 1;
} else {
  try {
    const runOptions = {
      ...batchOptions,
    };
    if (!jsonOutput) {
      runOptions.onProgress = ({ current, total, file, status }) => {
        const pct = total > 0 ? ((current / total) * 100).toFixed(1) : '100.0';
        const icon = status === 'done' ? '+' : status === 'skipped' ? '-' : status === 'planned' ? '?' : '!';
        process.stdout.write(`\r[${current}/${total}] ${pct}% ${icon} ${file.slice(0, 60).padEnd(60)}`);
      };
    }

    const result = await splitFontBatch(runOptions);

    if (jsonOutput) {
      console.log(JSON.stringify(buildBatchRunSummary({
        ok: true,
        startedAt,
        batchOptions,
        result,
        summaryOnly: jsonSummaryOutput,
      }), null, 2));
    } else {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`\n\nDone in ${elapsed}s`);
      console.log(`Scanned: ${result.scannedFileCount}/${result.maxFiles} | maxFilesHit: ${result.maxFilesHit}`);
      console.log(`Discovered: ${result.discoveredFontCount} | After dedupe: ${result.deduplicatedCount} (skipped ${result.skippedDuplicates} duplicates)`);
      console.log(`Processed: ${result.processedFontCount} | Skipped existing: ${result.skippedExisting} | Errors: ${result.errorCount}`);
      console.log(`Mode: ${result.dryRun ? 'dry-run' : 'write'} | Results included: ${result.resultsIncluded}`);
      console.log(`Batch warnings: ${result.batchWarningCount}`);

      if (result.batchWarnings?.length > 0) {
        console.log('\nBatch warning details:');
        for (const warning of result.batchWarnings) {
          console.log(`  ${warning.code}: ${warning.message}`);
        }
      }

      if (result.errors.length > 0) {
        console.log('\nFailed fonts:');
        for (const error of result.errors) {
          console.log(`  ${error.file}: ${error.error.slice(0, 120)}`);
        }
      }
    }
  } catch (error) {
    if (jsonOutput) {
      console.log(JSON.stringify(buildBatchRunSummary({
        ok: false,
        startedAt,
        batchOptions,
        error,
        summaryOnly: jsonSummaryOutput,
      }), null, 2));
    } else {
      console.error('\nBatch run failed.');
      if (error?.details) {
        console.error(JSON.stringify({
          name: error.name,
          error: error.message,
          details: error.details,
        }, null, 2));
      } else {
        console.error(error instanceof Error ? error.message : String(error));
      }
    }
    process.exitCode = 1;
  }
}
