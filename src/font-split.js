import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StaticWasm, fontSplit } from 'cn-font-split/dist/wasm/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..');
export const DEFAULT_WORKSPACE_ROOT = path.resolve(PROJECT_ROOT, '..');
const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.otc', '.woff', '.woff2']);
let wasmRuntimePromise;

async function getWasmRuntime() {
  if (!wasmRuntimePromise) {
    wasmRuntimePromise = (async () => {
      const wasmPath = path.resolve(PROJECT_ROOT, 'node_modules/cn-font-split/dist/libffi-wasm32-wasip1.wasm');
      const wasmBuffer = await fs.readFile(wasmPath);
      return new StaticWasm(wasmBuffer);
    })();
  }
  return wasmRuntimePromise;
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

async function listFilesRecursive(root, { maxFiles = 5000 } = {}) {
  const results = [];
  async function walk(dir) {
    if (results.length >= maxFiles) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
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
  const input = await ensureFontFile(args.fontPath);
  const fontBaseName = path.basename(input, path.extname(input));
  const fontFileName = path.basename(input);
  const inputBytes = new Uint8Array(await fs.readFile(input));

  // Determine root directory name: prefer font family from binary, fallback to file base name
  const familyName = args.fontFamily || extractFontFamily(inputBytes) || fontBaseName;
  const safeFamilyName = sanitizeDirName(familyName);

  // Output layout:
  //   <outputRoot>/<familyName>/
  //     ├── <fontFileName>          ← original font file
  //     └── <fontBaseName>/         ← split output subfolder
  //           ├── *.woff2
  //           ├── result.css
  //           └── ...
  const rootDir = await resolveWorkspacePath(
    args.outDir || path.join('split-output', safeFamilyName),
  );
  const splitDir = path.join(rootDir, fontBaseName);
  await fs.mkdir(splitDir, { recursive: true });

  // Copy original font to root
  const destFontPath = path.join(rootDir, fontFileName);
  await fs.copyFile(input, destFontPath);

  const before = new Set((await summarizeFiles(rootDir)).map((file) => file.path));
  const config = buildFontSplitConfig(inputBytes, splitDir, args);
  const wasm = await getWasmRuntime();
  const generated = (await fontSplit(config, wasm.WasiHandle, { logger: () => {} })).filter(Boolean);

  for (const item of generated) {
    const outputPath = path.resolve(splitDir, item.name);
    if (!isInside(splitDir, outputPath)) {
      throw new Error(`Generated file path escapes output directory: ${item.name}`);
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, item.data);
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
    fileCount: files.length,
    createdFileCount: createdFiles.length,
    files,
    createdFiles,
  };
}

export async function splitFontBatch(args) {
  const inputDir = await resolveWorkspacePath(args.inputDir || '.', { mustExist: true });
  const stat = await fs.stat(inputDir);
  if (!stat.isDirectory()) throw new Error(`inputDir is not a directory: ${args.inputDir}`);

  const allFiles = await listFilesRecursive(inputDir, { maxFiles: args.maxFiles || 5000 });
  const fontFiles = allFiles.filter((file) => FONT_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const selected = fontFiles.slice(0, args.limit || 20);
  const outputRoot = args.outputRoot || 'split-output';

  const results = [];
  for (const file of selected) {
    const relative = toRelativeWorkspacePath(file);
    // Read font to extract family name for directory grouping
    const inputBytes = new Uint8Array(await fs.readFile(file));
    const familyName = extractFontFamily(inputBytes) || path.basename(file, path.extname(file));
    const safeFamilyName = sanitizeDirName(familyName);

    const result = await splitFont({
      ...args,
      fontPath: relative,
      outDir: path.join(outputRoot, safeFamilyName),
    });
    results.push(result);
  }

  return {
    ok: true,
    inputDir: toRelativeWorkspacePath(inputDir),
    outputRoot,
    discoveredFontCount: fontFiles.length,
    processedFontCount: results.length,
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
