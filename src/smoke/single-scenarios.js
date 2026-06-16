import fs from 'node:fs/promises';
import path from 'node:path';
import {
  inspectSplitOutput,
  splitFont,
} from '../font-split.js';
import { buildMinimalTtf } from './fixtures.js';

async function runSingleSmoke() {
  const usesGeneratedInput = !process.argv[3];
  const inputDir = '.font-split-single-input';
  const fontPath = process.argv[3] || path.join(inputDir, 'SingleSmoke-Regular.ttf');
  const outDir = process.argv[4] || '.font-split-smoke-output';
  console.log('Splitting:', fontPath, '->', outDir);
  if (usesGeneratedInput) {
    await fs.rm(inputDir, { recursive: true, force: true });
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(fontPath, buildMinimalTtf({
      familyName: 'Single Smoke',
      subfamilyName: 'Regular',
      glyphCount: 5,
    }));
  }
  const result = await splitFont({
    fontPath,
    outDir,
    testHtml: true,
    reporter: true,
    chunkSize: 70 * 1024,
    fontFamily: 'SmokeTestFont',
    smallGlyphAction: usesGeneratedInput ? 'copy-original' : undefined,
    smallGlyphThreshold: usesGeneratedInput ? 1000000 : undefined,
    silent: true,
  });
  console.log(JSON.stringify(result, null, 2));

  console.log('\nInspecting output:');
  console.log(JSON.stringify(await inspectSplitOutput({ outDir }), null, 2));
}

async function runSmallCopyOriginalSmoke() {
  const usesGeneratedInput = !process.argv[3];
  const smallInputDir = '.font-split-small-copy-original-input';
  const smallFontPath = process.argv[3] || path.join(smallInputDir, 'SmallCopyOriginal-Regular.ttf');
  const smallOutDir = process.argv[4] || '.font-split-small-copy-original-output';

  console.log('Small glyph copy-original smoke:', smallFontPath, '->', smallOutDir);
  if (usesGeneratedInput) {
    await fs.rm(smallInputDir, { recursive: true, force: true });
    await fs.rm(smallOutDir, { recursive: true, force: true });
    await fs.mkdir(smallInputDir, { recursive: true });
    await fs.writeFile(smallFontPath, buildMinimalTtf({
      familyName: 'Small Copy Original Smoke',
      subfamilyName: 'Regular',
      glyphCount: 3,
    }));
  }
  const result = await splitFont({
    fontPath: smallFontPath,
    outDir: smallOutDir,
    smallGlyphAction: 'copy-original',
    smallGlyphThreshold: 1000000,
    fontFamily: 'SmallCopyOriginalSmokeFont',
    silent: true,
  });
  console.log(JSON.stringify(result, null, 2));
  console.log('\nInspecting output:');
  console.log(JSON.stringify(await inspectSplitOutput({ outDir: smallOutDir }), null, 2));
}

export {
  runSingleSmoke,
  runSmallCopyOriginalSmoke,
};
