import { splitFontBatch } from './src/font-split.js';

const startedAt = Date.now();

console.log('Starting batch font split...');
const result = await splitFontBatch({
  inputDir: '.',
  outputRoot: 'split-output',
  limit: 2000,
  maxFiles: 50000,
  silent: true,
  chunkSize: 70 * 1024,
  onProgress({ current, total, file, status }) {
    const pct = ((current / total) * 100).toFixed(1);
    const icon = status === 'done' ? '+' : status === 'skipped' ? '-' : '!';
    process.stdout.write(`\r[${current}/${total}] ${pct}% ${icon} ${file.slice(0, 60).padEnd(60)}`);
  },
});

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\n\nDone in ${elapsed}s`);
console.log(`Discovered: ${result.discoveredFontCount} | After dedup: ${result.deduplicatedCount} (skipped ${result.skippedDuplicates} duplicates)`);
console.log(`Processed: ${result.processedFontCount} | Skipped existing: ${result.skippedExisting} | Errors: ${result.errorCount}`);

if (result.errors.length > 0) {
  console.log('\nFailed fonts:');
  for (const e of result.errors) {
    console.log(`  ${e.file}: ${e.error.slice(0, 80)}`);
  }
}
