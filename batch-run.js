import { splitFontBatch } from './src/font-split.js';

const WORKFLOW_PRESETS = ['default', 'safe-preview', 'reviewed-write', 'structure-first', 'source-layout', 'metadata-family', 'preserve-all'];

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

const inputDir = process.env.FONT_SPLIT_INPUT_DIR || process.argv[2] || '.';
const outputRoot = process.env.FONT_SPLIT_OUTPUT_ROOT || process.argv[3] || 'split-output';
const limit = numberOption(process.env.FONT_SPLIT_LIMIT || process.argv[4], 50000);
const maxFiles = numberOption(process.env.FONT_SPLIT_MAX_FILES || process.argv[5], 50000);
const dryRunFlag = process.argv.includes('--dry-run');
const dryRunEnvProvided = hasEnv('FONT_SPLIT_DRY_RUN');
const dryRun = dryRunFlag || booleanEnv(process.env.FONT_SPLIT_DRY_RUN);
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

console.log('Starting batch font split...');
console.log(JSON.stringify(batchOptions, null, 2));

try {
  const result = await splitFontBatch({
    ...batchOptions,
    onProgress({ current, total, file, status }) {
      const pct = total > 0 ? ((current / total) * 100).toFixed(1) : '100.0';
      const icon = status === 'done' ? '+' : status === 'skipped' ? '-' : status === 'planned' ? '?' : '!';
      process.stdout.write(`\r[${current}/${total}] ${pct}% ${icon} ${file.slice(0, 60).padEnd(60)}`);
    },
  });

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
} catch (error) {
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
  process.exitCode = 1;
}
