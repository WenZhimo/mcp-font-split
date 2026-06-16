import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { FORMAT_PRIORITY } from './catalogs.js';
import { extractFontFamily } from './font-identity.js';
import { fileExists, toRelativeWorkspacePath } from './path-utils.js';
import { MANIFEST_VERSION, readSplitManifest } from './split-manifest.js';
import { stableStringify } from './stable-json.js';

export function sanitizeDirName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
}

export function appendCollisionSuffix(baseName, index) {
  return index === 0 ? baseName : `${baseName}-${index}`;
}

export function buildSourceSuffix(inputRelativePath, extension) {
  const normalizedInput = inputRelativePath.replaceAll('\\', '/');
  const sourceHash = createHash('sha1').update(normalizedInput).digest('hex').slice(0, 8);
  const extensionLabel = extension.replace(/^\./, '') || 'font';
  return `${extensionLabel}-${sourceHash}`;
}

export function buildBatchOutputNames({ inputRelativePath, fontBaseName, fontFileName }) {
  const extension = path.extname(fontFileName);
  const suffix = buildSourceSuffix(inputRelativePath, extension);
  const splitDirName = sanitizeDirName(`${fontBaseName}--${suffix}`);
  return {
    splitDirName,
    copiedOriginalFileName: `${splitDirName}${extension}`,
  };
}

export async function listExistingSplitDirNames(resolvedOutDir, fontBaseName) {
  let entries;
  try {
    entries = await fs.readdir(resolvedOutDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name === fontBaseName || name.startsWith(`${fontBaseName}-`))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function resolveStableBatchOutputNames({ resolvedOutDir, fontBaseName, fontFileName, inputRelativePath, reservedNames = new Set() }) {
  const extension = path.extname(fontFileName);
  const existingNames = await listExistingSplitDirNames(resolvedOutDir, fontBaseName);
  const seen = new Set([...existingNames, ...reservedNames]);

  for (const name of existingNames) {
    const manifest = await readSplitManifest(path.join(resolvedOutDir, name));
    if (manifest?.source?.input === inputRelativePath && !reservedNames.has(name)) {
      return {
        splitDirName: name,
        copiedOriginalFileName: `${name}${extension}`,
      };
    }
  }

  let index = 0;
  while (true) {
    const candidate = appendCollisionSuffix(fontBaseName, index);
    const candidateDir = path.join(resolvedOutDir, candidate);
    const manifest = await readSplitManifest(candidateDir);
    if (manifest?.source?.input === inputRelativePath && !reservedNames.has(candidate)) {
      return {
        splitDirName: candidate,
        copiedOriginalFileName: `${candidate}${extension}`,
      };
    }
    if (manifest) {
      index++;
      continue;
    }
    if (seen.has(candidate)) {
      index++;
      continue;
    }
    if (await fileExists(candidateDir)) {
      index++;
      continue;
    }
    return {
      splitDirName: candidate,
      copiedOriginalFileName: index === 0 ? fontFileName : `${candidate}${extension}`,
    };
  }
}

export function compareBatchDedupeRepresentative(candidate, existing) {
  const candidateExt = path.extname(candidate).toLowerCase();
  const existingExt = path.extname(existing).toLowerCase();
  const priorityDelta = (FORMAT_PRIORITY[candidateExt] ?? 9) - (FORMAT_PRIORITY[existingExt] ?? 9);
  if (priorityDelta !== 0) return priorityDelta;
  return toRelativeWorkspacePath(candidate).localeCompare(
    toRelativeWorkspacePath(existing),
    undefined,
    { numeric: true },
  );
}

export function logBatchDecision(enabled, event, details) {
  if (!enabled) return;
  console.log(JSON.stringify({ scope: 'batch-decision', event, ...details }));
}

export function buildBatchError({ mode, errors, summary }) {
  const error = new Error(`split_font_batch failed with ${errors.length} error(s) in ${mode} mode.`);
  error.name = 'BatchSplitError';
  error.details = { mode, errors, summary };
  return error;
}

export async function resolveBatchFamilyDirName({ file, inputDir, groupingMode }) {
  const relativeToInput = path.relative(inputDir, file);
  const segments = relativeToInput.split(path.sep);
  if (groupingMode === 'source-dir') {
    return segments.length > 1 ? segments[0] : path.basename(file, path.extname(file));
  }

  const inputBytes = new Uint8Array(await fs.readFile(file));
  const metadataFamily = extractFontFamily(inputBytes) || path.basename(file, path.extname(file));
  if (groupingMode === 'font-family') {
    return metadataFamily;
  }

  if (segments.length > 1) return segments[0];
  return metadataFamily;
}

export async function shouldSkipExistingOutput({
  skipMode,
  resolvedOutDir,
  splitDirName,
  inputRelativePath,
  inputStat,
  effectiveConfig,
  toolVersion,
}) {
  const splitDir = path.join(resolvedOutDir, splitDirName);
  if (skipMode === 'force') {
    return { shouldSkip: false, reason: 'force' };
  }

  const manifest = await readSplitManifest(splitDir);
  if (!manifest) return { shouldSkip: false, reason: 'missing-manifest' };
  const sameSource = manifest.source?.input === inputRelativePath
    && manifest.source?.sizeBytes === inputStat.size
    && manifest.source?.mtimeMs === inputStat.mtimeMs;
  const sameConfig = stableStringify(manifest.effectiveConfig) === stableStringify(effectiveConfig);
  const sameTool = manifest.toolVersion === toolVersion && manifest.manifestVersion === MANIFEST_VERSION;
  return { shouldSkip: sameSource && sameConfig && sameTool, reason: sameSource && sameConfig && sameTool ? 'manifest' : 'stale-manifest', manifest };
}
