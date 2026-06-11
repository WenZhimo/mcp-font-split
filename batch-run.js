import { splitFontBatch } from './src/font-split.js';

function numberOption(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
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
const dryRun = process.argv.includes('--dry-run') || booleanEnv(process.env.FONT_SPLIT_DRY_RUN);
const strictMode = booleanOption(process.env.FONT_SPLIT_STRICT_MODE, true);
const includeResults = booleanOption(process.env.FONT_SPLIT_INCLUDE_RESULTS, false);
const chunkSize = numberOption(process.env.FONT_SPLIT_CHUNK_SIZE, 70 * 1024);
const skipMode = enumOption(process.env.FONT_SPLIT_SKIP_MODE, ['legacy-css', 'manifest', 'force'], undefined);
const batchGroupBy = enumOption(process.env.FONT_SPLIT_BATCH_GROUP_BY, ['auto', 'source-dir', 'font-family'], undefined);
const batchNamingMode = enumOption(process.env.FONT_SPLIT_BATCH_NAMING_MODE, ['plain', 'numeric-suffix', 'source-suffix'], 'numeric-suffix');
const batchDedupeMode = enumOption(process.env.FONT_SPLIT_BATCH_DEDUPE_MODE, ['none', 'same-path', 'font-identity'], 'font-identity');
const batchErrorMode = enumOption(process.env.FONT_SPLIT_BATCH_ERROR_MODE, ['collect', 'fail-fast', 'fail-after'], undefined);
const splitFailureAction = enumOption(process.env.FONT_SPLIT_SPLIT_FAILURE_ACTION, ['error', 'single-woff2'], 'single-woff2');
const startedAt = Date.now();
const batchOptions = {
  inputDir,
  outputRoot,
  limit,
  maxFiles,
  dryRun,
  includeResults,
  strictMode,
  batchNamingMode,
  batchDedupeMode,
  splitFailureAction,
  silent: true,
  chunkSize,
  ...(skipMode ? { skipMode } : {}),
  ...(batchGroupBy ? { batchGroupBy } : {}),
  ...(batchErrorMode ? { batchErrorMode } : {}),
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
