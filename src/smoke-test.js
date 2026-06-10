import { inspectSplitOutput, splitFont } from './font-split.js';

const fontPath = process.argv[2] || '0xA000/0xA000-Regular.ttf';
const outDir = process.argv[3] || 'font-split-mcp/.font-split-smoke-output';

console.log('Splitting:', fontPath, '->', outDir);
const result = await splitFont({
  fontPath,
  outDir,
  testHtml: true,
  reporter: true,
  chunkSize: 70 * 1024,
  fontFamily: 'SmokeTestFont',
  silent: true,
});
console.log(JSON.stringify(result, null, 2));

console.log('\nInspecting output:');
console.log(JSON.stringify(await inspectSplitOutput({ outDir }), null, 2));
