import { splitFontBatch } from './src/font-split.js';

function numberOption(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function booleanEnv(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

const inputDir = process.env.FONT_SPLIT_INPUT_DIR || process.argv[2] || '.';
const outputRoot = process.env.FONT_SPLIT_OUTPUT_ROOT || process.argv[3] || 'split-output';
const limit = numberOption(process.env.FONT_SPLIT_LIMIT || process.argv[4], 50000);
const maxFiles = numberOption(process.env.FONT_SPLIT_MAX_FILES || process.argv[5], 50000);
const dryRun = process.argv.includes('--dry-run') || booleanEnv(process.env.FONT_SPLIT_DRY_RUN);
const startedAt = Date.now();

console.log('Starting batch font split...');
console.log(JSON.stringify({
  inputDir,
  outputRoot,
  limit,
  maxFiles,
  dryRun,
  strictMode: true,
  includeResults: false,
  batchNamingMode: 'numeric-suffix',
  batchDedupeMode: 'font-identity',
}, null, 2));

try {
  const result = await splitFontBatch({
    inputDir,
    outputRoot,
    limit,
    maxFiles,
    dryRun,
    includeResults: false,
    strictMode: true,
    batchNamingMode: 'numeric-suffix',
    batchDedupeMode: 'font-identity',
    splitFailureAction: 'single-woff2',
    silent: true,
    chunkSize: 70 * 1024,
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
