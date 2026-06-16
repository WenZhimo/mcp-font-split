import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { FORMAT_PRIORITY, FORMAT_PRIORITY_ORDER } from './catalogs.js';
import { extractFontFamily, parseIdentityKey } from './font-identity.js';
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

export function buildBatchWarnings({
  dryRun,
  includeResults,
  inputScanTruncated,
  maxFiles,
  deduplicatedCount,
  selectedCount,
  skippedExisting,
  errorCount,
  batchErrorMode,
  outputTreeInsideInputTree,
}) {
  const warnings = [];
  const push = (code, message) => warnings.push({ code, message });

  if (dryRun) {
    push('dry-run-no-write', 'dryRun is true; no output files were written.');
  }
  if (outputTreeInsideInputTree) {
    push('output-inside-input', 'outputRoot is inside or equal to inputDir. Future scans should exclude that output directory unless reprocessing generated output is intentional.');
  }
  if (inputScanTruncated) {
    push('input-scan-truncated', `Input scan hit maxFiles (${maxFiles}); rerun with a higher maxFiles before treating counts as complete.`);
  }
  if (selectedCount < deduplicatedCount) {
    push('batch-limit-truncated', `Batch limit selected ${selectedCount} of ${deduplicatedCount} deduplicated fonts.`);
  }
  if (!includeResults) {
    push(
      dryRun ? 'batch-plan-omitted' : 'batch-results-omitted',
      dryRun
        ? 'Dry-run plan details are omitted because includeResults is false.'
        : 'Per-font result details are omitted because includeResults is false.',
    );
  }
  if (skippedExisting > 0) {
    push('existing-output-skipped', `${skippedExisting} selected fonts were skipped because existing output matched the selected skipMode.`);
  }
  if (errorCount > 0 && batchErrorMode === 'collect') {
    push('errors-collected', 'Per-font errors were collected in errors[]; inspect them before claiming the batch fully succeeded.');
  }

  return warnings;
}

export function buildBatchSafetySummary({ dryRun, selectedCount, outputTreeInsideInputTree }) {
  const writesOutputTree = dryRun !== true;
  const writesSourceTree = writesOutputTree && outputTreeInsideInputTree;
  const mayOverwriteOutputTree = writesOutputTree && selectedCount > 0;
  const writeScope = !writesOutputTree
    ? 'none'
    : outputTreeInsideInputTree ? 'output-tree-inside-input-tree' : 'output-tree-only';
  const overwriteScope = !mayOverwriteOutputTree
    ? 'none'
    : outputTreeInsideInputTree ? 'output-tree-inside-input-tree' : 'output-tree-only';
  const summary = dryRun
    ? 'Batch dry run; no output files were written and source files were only scanned.'
    : outputTreeInsideInputTree
      ? 'Batch output write; outputRoot is inside or equal to inputDir, so the input tree receives generated output files, but source font files are never moved, deleted, or rewritten.'
      : 'Batch output write; selected fonts are written only into outputRoot and source files are never moved, deleted, or rewritten.';
  return {
    operationMode: dryRun ? 'preview-only' : 'batch-output',
    sourceDestructive: false,
    sourceFilesPreserved: true,
    writesSourceTree,
    writesOutputTree,
    outputTreeInsideInputTree,
    mayOverwriteOutputTree,
    writeScope,
    overwriteScope,
    summary,
  };
}

function getDedupeIdentityBasis(identityKey, effectiveMode) {
  if (effectiveMode === 'none') return 'not-applicable';
  if (effectiveMode === 'same-path') return 'path-stem';
  if (!identityKey) return 'missing';
  if (String(identityKey).startsWith('path:')) return 'path-fallback';
  return parseIdentityKey(identityKey)?.basis || 'unknown';
}

function buildDedupeIdentityEvidenceSummary({
  effectiveMode,
  identityEvidenceItems = [],
  duplicateEvidenceItems = [],
  maxExamples = 3,
}) {
  const basisCounts = new Map();
  for (const item of identityEvidenceItems) {
    const basis = getDedupeIdentityBasis(item.identityKey, effectiveMode);
    basisCounts.set(basis, (basisCounts.get(basis) || 0) + 1);
  }
  const identityBasisCounts = [...basisCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([basis, count]) => ({ basis, count }));
  const duplicateExamples = duplicateEvidenceItems.slice(0, maxExamples).map((item) => {
    const identityBasis = getDedupeIdentityBasis(item.identityKey, effectiveMode);
    return {
      path: item.path,
      duplicateOf: item.duplicateOf,
      identityBasis,
      ...(identityBasis !== 'path-stem' && identityBasis !== 'path-fallback' && item.identityKey
        ? { identityKey: item.identityKey }
        : {}),
    };
  });
  const semanticBasisCount = identityBasisCounts
    .filter((item) => !['not-applicable', 'path-stem', 'path-fallback', 'missing'].includes(item.basis))
    .reduce((sum, item) => sum + item.count, 0);
  const notes = [];
  if (effectiveMode === 'none') {
    notes.push('No identity evidence is produced because dedupe is disabled.');
  } else if (effectiveMode === 'same-path') {
    notes.push('Evidence is path/stem-level only and does not prove semantic font identity.');
  } else {
    notes.push('Identity evidence is compact: basis counts cover selected and duplicate inputs, while examples are capped.');
    notes.push('Path fallback examples omit the raw identity key to avoid exposing resolved local paths.');
  }

  return {
    summaryType: 'dedupe-identity-evidence',
    available: effectiveMode !== 'none',
    identityDedupeEvidenceAvailable: effectiveMode === 'font-identity' && semanticBasisCount > 0,
    identityBasisCounts,
    duplicateExampleCount: duplicateEvidenceItems.length,
    duplicateExamples,
    duplicateExamplesTruncated: duplicateEvidenceItems.length > duplicateExamples.length,
    nonIntuitiveBehavior: notes,
  };
}

export function buildDedupeDecisionSummary({
  appliesToTool,
  requestedMode,
  effectiveMode = requestedMode,
  inputFontCount = 0,
  deduplicatedCount = 0,
  skippedDuplicateCount = 0,
  identityKeyMissingCount = 0,
  pathFallbackCount = 0,
  dedupeLimitedByParsing = false,
  identityEvidenceItems = [],
  duplicateEvidenceItems = [],
}) {
  const requestedIdentity = requestedMode === 'font-identity';
  const effectiveIdentity = effectiveMode === 'font-identity';
  const pathFallbackUsed = requestedIdentity && (
    dedupeLimitedByParsing
    || pathFallbackCount > 0
    || !effectiveIdentity
  );
  const keyStrategy = effectiveMode === 'none'
    ? 'none'
    : effectiveMode === 'same-path'
      ? 'path-stem'
      : 'font-identity';
  const notes = [];
  if (effectiveMode === 'none') {
    notes.push('Dedupe is disabled; every supported input selected before limit remains eligible.');
  } else if (effectiveMode === 'same-path') {
    notes.push('Dedupe compares normalized source path stems only; it does not prove semantic font identity.');
  } else {
    notes.push('Dedupe compares normalized font identity and keeps the highest-priority representative format.');
  }
  if (dedupeLimitedByParsing) {
    notes.push('Requested identity dedupe could not run because font metadata parsing was skipped.');
  }
  if (pathFallbackCount > 0) {
    notes.push('Some fonts lacked a usable identity key and fell back to source path stem keys.');
  }

  return {
    summaryType: 'dedupe-decision-summary',
    appliesToTool,
    requestedMode,
    effectiveMode,
    keyStrategy,
    inputFontCount,
    deduplicatedCount,
    skippedDuplicateCount,
    identityKeyMissingCount,
    pathFallbackCount,
    dedupeLimitedByParsing,
    pathFallbackUsed,
    identityDedupeAvailable: effectiveIdentity && !dedupeLimitedByParsing,
    representativePriority: FORMAT_PRIORITY_ORDER,
    identityEvidenceSummary: buildDedupeIdentityEvidenceSummary({
      effectiveMode,
      identityEvidenceItems,
      duplicateEvidenceItems,
    }),
    nonIntuitiveBehavior: notes,
  };
}
