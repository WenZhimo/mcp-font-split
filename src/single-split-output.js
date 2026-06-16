import fs from 'node:fs/promises';
import path from 'node:path';
import { compressWoff2 } from './font-identity.js';
import { isInside } from './path-utils.js';

export function classifyResultType({ outputMode, splitFailureFallbackApplied, skipReason }) {
  if (outputMode === 'copy-original') return 'copy-original-small-glyph';
  if (outputMode !== 'single-woff2') return 'subset';
  if (splitFailureFallbackApplied) return 'single-woff2-split-failure';
  if (skipReason === 'small glyph fallback explicitly enabled') return 'single-woff2-small-glyph';
  return 'single-woff2';
}

export async function writeGeneratedFiles(baseDir, generated) {
  for (const item of generated) {
    const outputPath = path.resolve(baseDir, item.name);
    if (!isInside(baseDir, outputPath)) {
      throw new Error(`Generated file path escapes output directory: ${item.name}`);
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, item.data);
  }
}

export async function emitSmallGlyphFallback({
  inputBytes,
  splitDir,
  fontFamily,
  fontBaseName,
  args,
  reason = 'too few glyphs for useful subsetting',
}) {
  const woff2Name = `${fontBaseName}.woff2`;
  const cssName = args.cssFileName || 'result.css';
  const css = [
    '@font-face {',
    `  font-family: ${JSON.stringify(fontFamily)};`,
    `  src: url("./${woff2Name}") format("woff2");`,
    args.fontWeight ? `  font-weight: ${args.fontWeight};` : null,
    args.fontStyle ? `  font-style: ${args.fontStyle};` : null,
    `  font-display: ${args.fontDisplay || 'swap'};`,
    '}',
    '',
  ].filter(Boolean).join('\n');

  const generated = [
    { name: woff2Name, data: await compressWoff2(inputBytes) },
    { name: cssName, data: Buffer.from(css, 'utf8') },
  ];

  if (args.testHtml) {
    const previewText = args.previewText || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789';
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${fontFamily}</title>
  <link rel="stylesheet" href="./${cssName}" />
  <style>body { font-family: ${JSON.stringify(fontFamily)}, sans-serif; padding: 24px; white-space: pre-wrap; }</style>
</head>
<body>${previewText.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</body>
</html>`;
    generated.push({ name: 'index.html', data: Buffer.from(html, 'utf8') });
  }

  await writeGeneratedFiles(splitDir, generated);
  return { generated, skipped: true, reason };
}

export async function clearSplitDirForCopyOriginal(splitDir) {
  await fs.rm(splitDir, { recursive: true, force: true });
  await fs.mkdir(splitDir, { recursive: true });
}
