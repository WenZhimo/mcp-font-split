import { splitFontBatch } from './src/font-split.js';

const WORKFLOW_PRESETS = ['default', 'safe-preview', 'reviewed-write', 'structure-first', 'source-layout', 'metadata-family', 'preserve-all'];
const COMPACT_ERROR_LIMIT = 20;

function numberOption(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function hasEnv(name) {
  return process.env[name] !== undefined && process.env[name] !== '';
}

function booleanEnv(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function booleanOption(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function enumOption(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
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
    skippedLegacy: result.skippedLegacy,
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
      error: errorMessage,
      ...(summaryOnly && error.details?.summary ? { summary: buildCompactBatchResult(error.details.summary) } : {}),
      ...(summaryOnly && error.details?.errors ? {
        errors: limitArray(error.details.errors, COMPACT_ERROR_LIMIT).items,
        errorsTruncated: limitArray(error.details.errors, COMPACT_ERROR_LIMIT).truncated,
        omittedErrorCount: limitArray(error.details.errors, COMPACT_ERROR_LIMIT).omittedCount,
      } : {}),
      ...(!summaryOnly && error.details ? { details: error.details } : {}),
    } : {}),
  };
}

const flagArgs = new Set(['--dry-run', '--json', '--json-summary']);
const positionalArgs = process.argv.slice(2).filter((arg) => !flagArgs.has(arg));
const inputDir = process.env.FONT_SPLIT_INPUT_DIR || positionalArgs[0] || '.';
const outputRoot = process.env.FONT_SPLIT_OUTPUT_ROOT || positionalArgs[1] || 'split-output';
const limit = numberOption(process.env.FONT_SPLIT_LIMIT || positionalArgs[2], 50000);
const maxFiles = numberOption(process.env.FONT_SPLIT_MAX_FILES || positionalArgs[3], 50000);
const dryRunFlag = process.argv.includes('--dry-run');
const dryRunEnvProvided = hasEnv('FONT_SPLIT_DRY_RUN');
const dryRun = dryRunFlag || booleanEnv(process.env.FONT_SPLIT_DRY_RUN);
const jsonSummaryOutput = process.argv.includes('--json-summary') || booleanEnv(process.env.FONT_SPLIT_JSON_SUMMARY);
const jsonOutput = jsonSummaryOutput || process.argv.includes('--json') || booleanEnv(process.env.FONT_SPLIT_JSON);
const includeResults = booleanOption(process.env.FONT_SPLIT_INCLUDE_RESULTS, undefined);
const chunkSize = numberOption(process.env.FONT_SPLIT_CHUNK_SIZE, 70 * 1024);
const workflowPreset = enumOption(process.env.FONT_SPLIT_WORKFLOW_PRESET, WORKFLOW_PRESETS, dryRun ? 'safe-preview' : 'reviewed-write');
const skipMode = enumOption(process.env.FONT_SPLIT_SKIP_MODE, ['legacy-css', 'manifest', 'force'], undefined);
const batchGroupBy = enumOption(process.env.FONT_SPLIT_BATCH_GROUP_BY, ['auto', 'source-dir', 'font-family'], undefined);
const batchNamingMode = enumOption(process.env.FONT_SPLIT_BATCH_NAMING_MODE, ['plain', 'numeric-suffix', 'source-suffix'], undefined);
const batchDedupeMode = enumOption(process.env.FONT_SPLIT_BATCH_DEDUPE_MODE, ['none', 'same-path', 'font-identity'], undefined);
const batchErrorMode = enumOption(process.env.FONT_SPLIT_BATCH_ERROR_MODE, ['collect', 'fail-fast', 'fail-after'], undefined);
const splitFailureAction = enumOption(process.env.FONT_SPLIT_SPLIT_FAILURE_ACTION, ['error', 'single-woff2'], undefined);
const startedAt = Date.now();
const batchOptions = {
  inputDir,
  outputRoot,
  limit,
  maxFiles,
  workflowPreset,
  silent: true,
  chunkSize,
  ...(dryRunFlag || dryRunEnvProvided ? { dryRun } : {}),
  ...(includeResults !== undefined ? { includeResults } : {}),
  ...(skipMode ? { skipMode } : {}),
  ...(batchGroupBy ? { batchGroupBy } : {}),
  ...(batchNamingMode ? { batchNamingMode } : {}),
  ...(batchDedupeMode ? { batchDedupeMode } : {}),
  ...(batchErrorMode ? { batchErrorMode } : {}),
  ...(splitFailureAction ? { splitFailureAction } : {}),
};

if (!jsonOutput) {
  console.log('Starting batch font split...');
  console.log(JSON.stringify(batchOptions, null, 2));
}

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
