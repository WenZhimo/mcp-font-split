import fs from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { StaticWasm, fontSplit } from 'cn-font-split/dist/wasm/index.mjs';

const require = createRequire(import.meta.url);
const woff2Decompress = require('wawoff2/decompress');
const woff2Compress = require('wawoff2/compress');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..');
export const DEFAULT_WORKSPACE_ROOT = path.resolve(PROJECT_ROOT, '..');
const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.otc', '.woff', '.woff2']);
let wasmRuntimePromise;
let wasmPath;

async function getWasmRuntime() {
  if (!wasmPath) {
    wasmPath = path.resolve(PROJECT_ROOT, 'node_modules/cn-font-split/dist/libffi-wasm32-wasip1.wasm');
  }
  if (!wasmRuntimePromise) {
    wasmRuntimePromise = (async () => {
      const wasmBuffer = await fs.readFile(wasmPath);
      return new StaticWasm(wasmBuffer);
    })();
  }
  return wasmRuntimePromise;
}

function resetWasmRuntime() {
  wasmRuntimePromise = null;
}

function workspaceRoot() {
  return path.resolve(process.env.FONT_SPLIT_ROOT || DEFAULT_WORKSPACE_ROOT);
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolveWorkspacePath(inputPath, { mustExist = false } = {}) {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    throw new Error('Path must be a non-empty string.');
  }

  const root = workspaceRoot();
  const resolved = path.resolve(root, inputPath);
  if (!isInside(root, resolved)) {
    throw new Error(`Path is outside allowed font workspace: ${inputPath}`);
  }

  if (mustExist) {
    return fs.stat(resolved).then(() => resolved);
  }
  return Promise.resolve(resolved);
}

export function toRelativeWorkspacePath(absolutePath) {
  return path.relative(workspaceRoot(), absolutePath).replaceAll(path.sep, '/');
}

async function listFilesRecursive(root, { maxFiles = 5000, excludeDirs = [] } = {}) {
  const results = [];
  const baseExclude = ['node_modules', '.git', 'font-split-mcp'];
  const shouldExclude = (name) => {
    if (baseExclude.includes(name)) return true;
    if (name === 'split-output' || name.startsWith('split-output-')) return true;
    return excludeDirs.includes(name);
  };
  async function walk(dir) {
    if (results.length >= maxFiles) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (shouldExclude(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
      if (results.length >= maxFiles) return;
    }
  }
  await walk(root);
  return results;
}

async function summarizeFiles(dir) {
  let files = [];
  try {
    files = await listFilesRecursive(dir);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const summaries = await Promise.all(files.map(async (file) => {
    const stat = await fs.stat(file);
    return {
      path: toRelativeWorkspacePath(file),
      sizeBytes: stat.size,
      extension: path.extname(file).toLowerCase(),
    };
  }));

  summaries.sort((a, b) => a.path.localeCompare(b.path));
  return summaries;
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function normalizeOptionalNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeOptionalBoolean(value) {
  return typeof value === 'boolean' ? value : undefined;
}

function normalizeProcessingOptions(args) {
  return {
    oversizedKernAction: args.oversizedKernAction === 'strip' ? 'strip' : 'preserve',
    smallGlyphAction: args.smallGlyphAction === 'single-woff2' ? 'single-woff2' : 'subset',
    smallGlyphThreshold: Number.isFinite(args.smallGlyphThreshold) && args.smallGlyphThreshold > 0
      ? Math.floor(args.smallGlyphThreshold)
      : 50,
    splitFailureAction: args.splitFailureAction === 'single-woff2' ? 'single-woff2' : 'error',
  };
}

function buildFontSplitConfig(input, outDir, args) {
  const css = {};
  if (normalizeOptionalString(args.fontFamily)) css.fontFamily = args.fontFamily;
  if (normalizeOptionalString(args.fontWeight)) css.fontWeight = args.fontWeight;
  if (normalizeOptionalString(args.fontStyle)) css.fontStyle = args.fontStyle;
  if (normalizeOptionalString(args.fontDisplay)) css.fontDisplay = args.fontDisplay;
  if (normalizeOptionalString(args.cssFileName)) css.fileName = args.cssFileName;

  const previewImage = {};
  if (normalizeOptionalString(args.previewText)) previewImage.text = args.previewText;
  if (normalizeOptionalString(args.previewName)) previewImage.name = args.previewName;

  const config = {
    input,
    outDir,
    silent: args.silent !== false,
  };

  if (Object.keys(css).length > 0) config.css = css;
  if (Object.keys(previewImage).length > 0) config.previewImage = previewImage;
  if (Array.isArray(args.subsets) && args.subsets.length > 0) config.subsets = args.subsets;

  const numericFields = [
    ['chunkSize', 'chunkSize'],
    ['chunkSizeTolerance', 'chunkSizeTolerance'],
    ['maxAllowSubsetsCount', 'maxAllowSubsetsCount'],
  ];
  for (const [argName, configName] of numericFields) {
    const value = normalizeOptionalNumber(args[argName]);
    if (value !== undefined) config[configName] = value;
  }

  const booleanFields = [
    ['languageAreas', 'languageAreas'],
    ['testHtml', 'testHtml'],
    ['reporter', 'reporter'],
    ['multiThreads', 'multiThreads'],
    ['fontFeature', 'fontFeature'],
    ['reduceMins', 'reduceMins'],
    ['autoSubset', 'autoSubset'],
    ['subsetRemainChars', 'subsetRemainChars'],
  ];
  for (const [argName, configName] of booleanFields) {
    const value = normalizeOptionalBoolean(args[argName]);
    if (value !== undefined) config[configName] = value;
  }

  if (normalizeOptionalString(args.renameOutputFont)) config.renameOutputFont = args.renameOutputFont;
  if (normalizeOptionalString(args.buildMode)) config.buildMode = args.buildMode;

  return config;
}

function readFontFamilyName(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0);
  let headerOffset = 0;

  // TTC/OTC: read first font offset
  if (magic === 0x74746366) {
    headerOffset = view.getUint32(12);
  }

  const numTables = view.getUint16(headerOffset + 4);
  let nameTableOffset = 0;

  for (let i = 0; i < numTables; i++) {
    const entryOffset = headerOffset + 12 + i * 16;
    const tag = String.fromCharCode(
      view.getUint8(entryOffset), view.getUint8(entryOffset + 1),
      view.getUint8(entryOffset + 2), view.getUint8(entryOffset + 3),
    );
    if (tag === 'name') {
      nameTableOffset = view.getUint32(entryOffset + 8);
      break;
    }
  }

  if (!nameTableOffset) return null;

  const nameCount = view.getUint16(nameTableOffset + 2);
  const stringOffset = nameTableOffset + view.getUint16(nameTableOffset + 4);

  // Prefer platformID=3 (Windows) encodingID=1 (Unicode BMP), nameID=1 (Font Family)
  // Fallback to platformID=1 (Mac) nameID=1
  let result = null;

  for (let i = 0; i < nameCount; i++) {
    const recordOffset = nameTableOffset + 6 + i * 12;
    const platformID = view.getUint16(recordOffset);
    const encodingID = view.getUint16(recordOffset + 2);
    const nameID = view.getUint16(recordOffset + 6);
    const length = view.getUint16(recordOffset + 8);
    const offset = view.getUint16(recordOffset + 10);

    if (nameID !== 1) continue;

    const strStart = stringOffset + offset;

    if (platformID === 3 && encodingID === 1) {
      // UTF-16 BE
      const chars = [];
      for (let j = 0; j < length; j += 2) {
        chars.push(view.getUint16(strStart + j));
      }
      return String.fromCharCode(...chars);
    }

    if (platformID === 1 && !result) {
      // Mac Roman
      const bytes = buffer.slice(strStart, strStart + length);
      result = new TextDecoder('latin1').decode(bytes);
    }
  }

  return result;
}

// WOFF has the sfnt tables wrapped; the name table offset is in the WOFF directory
function readFontFamilyNameFromWoff(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0);

  // wOFF (WOFF1)
  if (magic === 0x774F4646) {
    const numTables = view.getUint16(12);
    for (let i = 0; i < numTables; i++) {
      const entryOffset = 44 + i * 20;
      const tag = String.fromCharCode(
        view.getUint8(entryOffset), view.getUint8(entryOffset + 1),
        view.getUint8(entryOffset + 2), view.getUint8(entryOffset + 3),
      );
      if (tag === 'name') {
        const compOffset = view.getUint32(entryOffset + 4);
        const compLength = view.getUint32(entryOffset + 8);
        const origLength = view.getUint32(entryOffset + 12);
        if (compLength === origLength) {
          // uncompressed
          const nameTable = buffer.slice(compOffset, compOffset + origLength);
          return parseFontNameTable(nameTable);
        }
        return null; // compressed, skip
      }
    }
  }

  // wOF2 (WOFF2) — too complex to decompress inline, return null
  if (magic === 0x774F4632) return null;

  return null;
}

function parseFontNameTable(nameTableBuf) {
  const view = new DataView(nameTableBuf.buffer, nameTableBuf.byteOffset, nameTableBuf.byteLength);
  const nameCount = view.getUint16(2);
  const stringOffset = view.getUint16(4);
  let result = null;

  for (let i = 0; i < nameCount; i++) {
    const recordOffset = 6 + i * 12;
    const platformID = view.getUint16(recordOffset);
    const encodingID = view.getUint16(recordOffset + 2);
    const nameID = view.getUint16(recordOffset + 6);
    const length = view.getUint16(recordOffset + 8);
    const offset = view.getUint16(recordOffset + 10);
    if (nameID !== 1) continue;
    const strStart = stringOffset + offset;

    if (platformID === 3 && encodingID === 1) {
      const chars = [];
      for (let j = 0; j < length; j += 2) {
        chars.push(view.getUint16(strStart + j));
      }
      return String.fromCharCode(...chars);
    }
    if (platformID === 1 && !result) {
      result = new TextDecoder('latin1').decode(nameTableBuf.slice(strStart, strStart + length));
    }
  }
  return result;
}

function extractFontFamily(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0);

  // WOFF1 / WOFF2
  if (magic === 0x774F4646 || magic === 0x774F4632) {
    return readFontFamilyNameFromWoff(buffer);
  }

  // TTF/OTF/TTC
  return readFontFamilyName(buffer);
}

function sanitizeDirName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
}

function decompressWoff1(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const signature = view.getUint32(0);
  if (signature !== 0x774F4646) return buffer; // not WOFF1, return as-is

  const sfntFlavor = view.getUint32(4);
  const numTables = view.getUint16(12);
  const totalSfntSize = view.getUint32(16);

  // Build sfnt offset table
  const sfntHeaderSize = 12 + numTables * 16;
  const sfnt = new Uint8Array(totalSfntSize);
  const sfntView = new DataView(sfnt.buffer);

  // Write sfnt header
  sfntView.setUint32(0, sfntFlavor);
  sfntView.setUint16(4, numTables);
  // searchRange, entrySelector, rangeShift
  let searchRange = 1;
  let entrySelector = 0;
  while (searchRange * 2 <= numTables) { searchRange *= 2; entrySelector++; }
  searchRange *= 16;
  sfntView.setUint16(6, searchRange);
  sfntView.setUint16(8, entrySelector);
  sfntView.setUint16(10, numTables * 16 - searchRange);

  let dataOffset = sfntHeaderSize;

  for (let i = 0; i < numTables; i++) {
    const woffEntry = 44 + i * 20;
    const tag = view.getUint32(woffEntry);
    const offset = view.getUint32(woffEntry + 4);
    const compLength = view.getUint32(woffEntry + 8);
    const origLength = view.getUint32(woffEntry + 12);
    const origChecksum = view.getUint32(woffEntry + 16);

    let tableData;
    if (compLength === origLength) {
      tableData = buffer.slice(offset, offset + origLength);
    } else {
      tableData = inflateSync(buffer.slice(offset, offset + compLength));
    }

    // Write sfnt table record
    const recordOffset = 12 + i * 16;
    sfntView.setUint32(recordOffset, tag);
    sfntView.setUint32(recordOffset + 4, origChecksum);
    sfntView.setUint32(recordOffset + 8, dataOffset);
    sfntView.setUint32(recordOffset + 12, origLength);

    // Write table data
    sfnt.set(tableData instanceof Uint8Array ? tableData : new Uint8Array(tableData), dataOffset);

    // Align to 4 bytes
    dataOffset += origLength;
    while (dataOffset % 4 !== 0) dataOffset++;
  }

  return new Uint8Array(sfnt.buffer, 0, dataOffset);
}

function fileExists(filePath) {
  return fs.stat(filePath).then(() => true).catch(() => false);
}

async function decompressWoff2(buffer) {
  const result = await woff2Decompress(Buffer.from(buffer));
  return new Uint8Array(result);
}

async function compressWoff2(buffer) {
  const result = await woff2Compress(Buffer.from(buffer));
  return new Uint8Array(result);
}

function inspectOversizedKern(buffer, thresholdRatio = 0.8) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0);
  if (magic === 0x774F4646 || magic === 0x774F4632 || magic === 0x74746366) {
    return {
      supported: false,
      hasKern: false,
      kernBytes: 0,
      fontBytes: buffer.byteLength,
      ratio: 0,
      thresholdRatio,
      oversized: false,
    };
  }

  const numTables = view.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16;
    const tag = String.fromCharCode(buffer[off], buffer[off + 1], buffer[off + 2], buffer[off + 3]);
    if (tag !== 'kern') continue;
    const kernBytes = view.getUint32(off + 12);
    const ratio = buffer.byteLength > 0 ? kernBytes / buffer.byteLength : 0;
    return {
      supported: true,
      hasKern: true,
      kernBytes,
      fontBytes: buffer.byteLength,
      ratio,
      thresholdRatio,
      oversized: ratio >= thresholdRatio,
    };
  }

  return {
    supported: true,
    hasKern: false,
    kernBytes: 0,
    fontBytes: buffer.byteLength,
    ratio: 0,
    thresholdRatio,
    oversized: false,
  };
}

function stripOversizedKern(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0);
  if (magic === 0x774F4646 || magic === 0x774F4632 || magic === 0x74746366) {
    return { buffer, stripped: false };
  }

  const numTables = view.getUint16(4);
  let kernIndex = -1;
  let kernLength = 0;

  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16;
    const tag = String.fromCharCode(buffer[off], buffer[off + 1], buffer[off + 2], buffer[off + 3]);
    if (tag === 'kern') {
      kernIndex = i;
      kernLength = view.getUint32(off + 12);
      break;
    }
  }

  if (kernIndex === -1 || kernLength < buffer.byteLength * 0.8) {
    return { buffer, stripped: false };
  }

  // Rebuild sfnt without kern table
  const newNumTables = numTables - 1;
  const headerSize = 12 + newNumTables * 16;
  const tables = [];

  for (let i = 0; i < numTables; i++) {
    if (i === kernIndex) continue;
    const off = 12 + i * 16;
    const tableOffset = view.getUint32(off + 8);
    const tableLength = view.getUint32(off + 12);
    tables.push({
      tag: buffer.slice(off, off + 4),
      checksum: view.getUint32(off + 4),
      data: buffer.slice(tableOffset, tableOffset + tableLength),
    });
  }

  let totalSize = headerSize;
  for (const t of tables) {
    totalSize += t.data.byteLength;
    totalSize += (4 - (totalSize % 4)) % 4;
  }

  const result = new Uint8Array(totalSize);
  const rv = new DataView(result.buffer);
  rv.setUint32(0, magic);
  rv.setUint16(4, newNumTables);
  let sr = 1, es = 0;
  while (sr * 2 <= newNumTables) { sr *= 2; es++; }
  sr *= 16;
  rv.setUint16(6, sr);
  rv.setUint16(8, es);
  rv.setUint16(10, newNumTables * 16 - sr);

  let dataOffset = headerSize;
  for (let i = 0; i < tables.length; i++) {
    const recOff = 12 + i * 16;
    result.set(tables[i].tag, recOff);
    rv.setUint32(recOff + 4, tables[i].checksum);
    rv.setUint32(recOff + 8, dataOffset);
    rv.setUint32(recOff + 12, tables[i].data.byteLength);
    result.set(tables[i].data, dataOffset);
    dataOffset += tables[i].data.byteLength;
    dataOffset += (4 - (dataOffset % 4)) % 4;
  }

  return { buffer: result, stripped: true };
}

function getGlyphCount(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0);
  let headerOffset = 0;
  if (magic === 0x74746366) headerOffset = view.getUint32(12);

  const numTables = view.getUint16(headerOffset + 4);
  for (let i = 0; i < numTables; i++) {
    const off = headerOffset + 12 + i * 16;
    const tag = String.fromCharCode(buffer[off], buffer[off + 1], buffer[off + 2], buffer[off + 3]);
    if (tag === 'maxp') {
      const tableOffset = view.getUint32(off + 8);
      return view.getUint16(tableOffset + 4);
    }
  }
  return -1;
}

async function writeGeneratedFiles(baseDir, generated) {
  for (const item of generated) {
    const outputPath = path.resolve(baseDir, item.name);
    if (!isInside(baseDir, outputPath)) {
      throw new Error(`Generated file path escapes output directory: ${item.name}`);
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, item.data);
  }
}

async function emitSmallGlyphFallback({ inputBytes, splitDir, fontFamily, fontBaseName, args, reason = 'too few glyphs for useful subsetting' }) {
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

async function ensureFontFile(fontPath) {
  const resolved = await resolveWorkspacePath(fontPath, { mustExist: true });
  const stat = await fs.stat(resolved);
  if (!stat.isFile()) throw new Error(`Font path is not a file: ${fontPath}`);
  const ext = path.extname(resolved).toLowerCase();
  if (!FONT_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported font extension ${ext || '(none)'} for ${fontPath}`);
  }
  return resolved;
}

export async function splitFont(args) {
  const startedAt = Date.now();
  const processingOptions = normalizeProcessingOptions(args);
  const input = await ensureFontFile(args.fontPath);
  const fontBaseName = path.basename(input, path.extname(input));
  const fontFileName = path.basename(input);
  let inputBytes = new Uint8Array(await fs.readFile(input));
  const inputFormat = path.extname(input).toLowerCase().slice(1) || 'unknown';

  let decompressedFrom = null;
  const magic = new DataView(inputBytes.buffer, inputBytes.byteOffset, 4).getUint32(0);
  if (magic === 0x774F4646) {
    inputBytes = decompressWoff1(inputBytes);
    decompressedFrom = 'woff';
  } else if (magic === 0x774F4632) {
    inputBytes = await decompressWoff2(inputBytes);
    decompressedFrom = 'woff2';
  }

  const kernInspection = inspectOversizedKern(inputBytes);
  let oversizedKernStripped = false;
  if (processingOptions.oversizedKernAction === 'strip' && kernInspection.oversized) {
    const kernNormalized = stripOversizedKern(inputBytes);
    inputBytes = kernNormalized.buffer;
    oversizedKernStripped = kernNormalized.stripped;
  }

  const familyName = args.fontFamily || extractFontFamily(inputBytes) || fontBaseName;
  const safeFamilyName = sanitizeDirName(familyName);

  const rootDir = await resolveWorkspacePath(
    args.outDir || path.join('split-output', safeFamilyName),
  );
  const splitDir = path.join(rootDir, fontBaseName);
  await fs.mkdir(splitDir, { recursive: true });

  const destFontPath = path.join(rootDir, fontFileName);
  await fs.copyFile(input, destFontPath);

  const before = new Set((await summarizeFiles(rootDir)).map((file) => file.path));

  const glyphCount = getGlyphCount(inputBytes);
  let generated;
  let skipped = false;
  let skipReason = null;
  let outputMode = 'subset';
  let splitFailureFallbackApplied = false;
  let splitFailureMessage = null;

  const shouldEmitSmallGlyphFallback = (
    glyphCount > 0
    && glyphCount <= processingOptions.smallGlyphThreshold
    && processingOptions.smallGlyphAction === 'single-woff2'
  );

  if (shouldEmitSmallGlyphFallback) {
    const fallback = await emitSmallGlyphFallback({
      inputBytes,
      splitDir,
      fontFamily: familyName,
      fontBaseName,
      args,
      reason: 'small glyph fallback explicitly enabled',
    });
    generated = fallback.generated;
    skipped = fallback.skipped;
    skipReason = fallback.reason;
    outputMode = 'single-woff2';
  } else {
    const config = buildFontSplitConfig(inputBytes, splitDir, args);
    const wasm = await getWasmRuntime();
    try {
      generated = (await fontSplit(config, wasm.WasiHandle, { logger: () => {} })).filter(Boolean);
      await writeGeneratedFiles(splitDir, generated);
    } catch (error) {
      splitFailureMessage = error instanceof Error ? error.message : String(error);
      if (processingOptions.splitFailureAction === 'single-woff2') {
        const fallback = await emitSmallGlyphFallback({
          inputBytes,
          splitDir,
          fontFamily: familyName,
          fontBaseName,
          args,
          reason: 'split failure fallback explicitly enabled',
        });
        generated = fallback.generated;
        skipped = fallback.skipped;
        skipReason = fallback.reason;
        outputMode = 'single-woff2';
        splitFailureFallbackApplied = true;
      } else {
        throw error;
      }
    }
  }

  const files = await summarizeFiles(rootDir);
  const createdFiles = files.filter((file) => !before.has(file.path));

  return {
    ok: true,
    input: toRelativeWorkspacePath(input),
    fontFamily: familyName,
    outDir: toRelativeWorkspacePath(rootDir),
    splitDir: toRelativeWorkspacePath(splitDir),
    durationMs: Date.now() - startedAt,
    generatedFileCount: generated.length,
    glyphCount,
    skipped,
    skipReason,
    outputMode,
    decompressedFrom,
    oversizedKernDetected: kernInspection.oversized,
    oversizedKernStripped,
    splitFailureFallbackApplied,
    fileCount: files.length,
    createdFileCount: createdFiles.length,
    files,
    createdFiles,
    processing: {
      inputFormat,
      decompressedFrom,
      oversizedKern: {
        ...kernInspection,
        action: processingOptions.oversizedKernAction,
        stripped: oversizedKernStripped,
      },
      smallGlyph: {
        glyphCount,
        threshold: processingOptions.smallGlyphThreshold,
        action: processingOptions.smallGlyphAction,
        downgraded: outputMode === 'single-woff2' && skipReason === 'small glyph fallback explicitly enabled',
      },
      splitFailure: {
        action: processingOptions.splitFailureAction,
        fallbackApplied: splitFailureFallbackApplied,
        failureMessage: splitFailureMessage,
      },
    },
  };
}

export async function splitFontBatch(args) {
  const inputDir = await resolveWorkspacePath(args.inputDir || '.', { mustExist: true });
  const stat = await fs.stat(inputDir);
  if (!stat.isDirectory()) throw new Error(`inputDir is not a directory: ${args.inputDir}`);

  const outputRoot = args.outputRoot || 'split-output';
  const outputRootName = path.basename(outputRoot);

  const allFiles = await listFilesRecursive(inputDir, {
    maxFiles: args.maxFiles || 5000,
    excludeDirs: [outputRootName],
  });
  const fontFiles = allFiles.filter((file) => FONT_EXTENSIONS.has(path.extname(file).toLowerCase()));

  const FORMAT_PRIORITY = { '.otf': 0, '.ttf': 1, '.woff2': 2, '.ttc': 3, '.otc': 4, '.woff': 5 };
  const byBaseName = new Map();
  for (const file of fontFiles) {
    const ext = path.extname(file).toLowerCase();
    const base = file.slice(0, -ext.length);
    const existing = byBaseName.get(base);
    if (!existing || (FORMAT_PRIORITY[ext] ?? 9) < (FORMAT_PRIORITY[path.extname(existing).toLowerCase()] ?? 9)) {
      byBaseName.set(base, file);
    }
  }
  const deduplicated = [...byBaseName.values()];
  const skippedCount = fontFiles.length - deduplicated.length;
  const selected = deduplicated.slice(0, args.limit || 20);

  const results = [];
  const errors = [];
  const processingSummary = {
    decompressedInputs: 0,
    oversizedKernDetected: 0,
    oversizedKernStripped: 0,
    smallGlyphDowngrades: 0,
    failureFallbacks: 0,
    subsetOutputs: 0,
    singleWoff2Outputs: 0,
  };
  let skippedExisting = 0;
  for (const file of selected) {
    const relative = toRelativeWorkspacePath(file);
    try {
      const relativeToInput = path.relative(inputDir, file);
      const segments = relativeToInput.split(path.sep);
      let familyDirName;
      if (segments.length > 1) {
        familyDirName = segments[0];
      } else {
        const inputBytes = new Uint8Array(await fs.readFile(file));
        familyDirName = extractFontFamily(inputBytes) || path.basename(file, path.extname(file));
      }
      const safeFamilyName = sanitizeDirName(familyDirName);
      const outDir = path.join(outputRoot, safeFamilyName);
      const fontBaseName = path.basename(file, path.extname(file));

      const resolvedOutDir = await resolveWorkspacePath(outDir);
      const marker = path.join(resolvedOutDir, fontBaseName, 'result.css');
      if (await fileExists(marker)) {
        skippedExisting++;
        args.onProgress?.({ current: results.length + errors.length + skippedExisting, total: selected.length, file: relative, status: 'skipped' });
        continue;
      }

      const result = await splitFont({
        ...args,
        fontPath: relative,
        outDir,
      });
      results.push(result);
      if (result.decompressedFrom) processingSummary.decompressedInputs++;
      if (result.oversizedKernDetected) processingSummary.oversizedKernDetected++;
      if (result.oversizedKernStripped) processingSummary.oversizedKernStripped++;
      if (result.splitFailureFallbackApplied) processingSummary.failureFallbacks++;
      if (result.outputMode === 'single-woff2') {
        processingSummary.singleWoff2Outputs++;
        if (result.processing?.smallGlyph?.downgraded) processingSummary.smallGlyphDowngrades++;
      } else {
        processingSummary.subsetOutputs++;
      }
      args.onProgress?.({ current: results.length + errors.length + skippedExisting, total: selected.length, file: relative, status: 'done' });
    } catch (error) {
      resetWasmRuntime();
      errors.push({ file: relative, error: error instanceof Error ? error.message : String(error) });
      args.onProgress?.({ current: results.length + errors.length + skippedExisting, total: selected.length, file: relative, status: 'error' });
    }
  }

  return {
    ok: true,
    inputDir: toRelativeWorkspacePath(inputDir),
    outputRoot,
    discoveredFontCount: fontFiles.length,
    deduplicatedCount: deduplicated.length,
    skippedDuplicates: skippedCount,
    skippedExisting,
    processedFontCount: results.length,
    errorCount: errors.length,
    errors,
    processingSummary,
    results,
  };
}

export async function inspectSplitOutput(args) {
  const outDir = await resolveWorkspacePath(args.outDir || 'split-output', { mustExist: true });
  const files = await summarizeFiles(outDir);
  const byExtension = {};
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.sizeBytes;
    byExtension[file.extension || '(none)'] = (byExtension[file.extension || '(none)'] || 0) + 1;
  }

  return {
    ok: true,
    outDir: toRelativeWorkspacePath(outDir),
    fileCount: files.length,
    totalBytes,
    byExtension,
    files,
  };
}
