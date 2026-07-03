import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { FORMAT_PRIORITY, FORMAT_PRIORITY_ORDER } from './catalogs.js';
import { extractFontFamily, parseIdentityKey } from './font-identity.js';
import { fileExists, toRelativeWorkspacePath } from './path-utils.js';
import { MANIFEST_VERSION, readSplitManifest } from './split-manifest.js';
import { stableStringify } from './stable-json.js';
import {
  buildBatchAuditArgs,
  buildSuggestedBatchRerunArgs,
  buildSuggestedBatchWriteArgs,
} from './suggested-args.js';

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

export function buildBatchDecision({
  dryRun,
  inputDirRelative,
  outputRoot,
  effectiveArgs,
  batchOptions,
  maxFilesHit,
  discoveredFontCount,
  selectedFontCount,
  processedFontCount,
  skippedExisting,
  errorCount,
  safetySummary,
}) {
  const base = {
    sourceDestructive: false,
    sourceFilesPreserved: true,
    writesSourceTree: safetySummary.writesSourceTree,
    writesOutputTree: safetySummary.writesOutputTree,
    outputTreeInsideInputTree: safetySummary.outputTreeInsideInputTree,
    requiresOutputAudit: false,
  };
  const make = (decision) => ({ ...base, ...decision });

  if (maxFilesHit) {
    return make({
      route: 'rerun-batch-with-higher-maxFiles',
      preferredNextActionId: 'rerun-batch-with-higher-maxFiles',
      nextTool: 'split_font_batch',
      nextInputDir: inputDirRelative,
      rerunArgs: buildSuggestedBatchRerunArgs({
        inputDir: inputDirRelative,
        outputRoot,
        workflowPreset: dryRun ? 'safe-preview' : 'reviewed-write',
        effectiveArgs,
        batchOptions,
      }),
      reason: 'The batch scan was truncated, so counts, plans, and output decisions may be incomplete.',
    });
  }

  if (errorCount > 0) {
    return make({
      route: 'inspect-batch-errors',
      preferredNextActionId: 'inspect-batch-errors',
      nextTool: 'split_font_batch',
      nextInputDir: inputDirRelative,
      requiresOutputAudit: safetySummary.writesOutputTree,
      reason: 'The batch response contains per-font errors that need inspection before reporting success.',
    });
  }

  if (discoveredFontCount === 0) {
    return make({
      route: 'no-supported-fonts',
      preferredNextActionId: null,
      nextTool: null,
      nextInputDir: inputDirRelative,
      reason: 'No supported font files were found in the scanned input.',
    });
  }

  if (selectedFontCount === 0) {
    return make({
      route: 'no-selected-fonts',
      preferredNextActionId: null,
      nextTool: null,
      nextInputDir: inputDirRelative,
      reason: 'Supported fonts were discovered, but none were selected for this batch policy and limit.',
    });
  }

  if (dryRun) {
    return make({
      route: 'review-dry-run-plan',
      preferredNextActionId: 'run-reviewed-batch-write',
      nextTool: 'split_font_batch',
      nextInputDir: inputDirRelative,
      reviewedWriteArgs: buildSuggestedBatchWriteArgs({
        inputDir: inputDirRelative,
        outputRoot,
        effectiveArgs,
        batchOptions,
      }),
      reason: 'This batch dry-run wrote no files; review planned paths, warnings, and skips before running a reviewed write.',
    });
  }

  if (safetySummary.writesOutputTree && processedFontCount > 0) {
    return make({
      route: 'audit-written-output',
      preferredNextActionId: 'audit-split-output',
      nextTool: 'inspect_split_output',
      nextInputDir: outputRoot,
      auditArgs: buildBatchAuditArgs({ outputRoot }),
      requiresOutputAudit: true,
      reason: 'The batch wrote output files; audit the output directory before reporting structural success.',
    });
  }

  if (safetySummary.writesOutputTree && skippedExisting > 0) {
    return make({
      route: 'review-existing-output-skips',
      preferredNextActionId: 'audit-split-output',
      nextTool: 'inspect_split_output',
      nextInputDir: outputRoot,
      auditArgs: buildBatchAuditArgs({ outputRoot }),
      requiresOutputAudit: true,
      reason: 'The batch wrote no new files because selected outputs were skipped; audit existing output if relying on it.',
    });
  }

  return make({
    route: 'review-batch-summary',
    preferredNextActionId: null,
    nextTool: null,
    nextInputDir: inputDirRelative,
    reason: 'Review batch counts, warnings, and recommendedNextActions before deciding whether more work is needed.',
  });
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

export const BATCH_POLICY_GUIDE = [
  {
    id: 'grouping-policy',
    optionName: 'batchGroupBy',
    appliesTo: ['split_font_batch', 'organize_font_directory'],
    defaultValue: 'auto',
    purpose: 'Choose the first-level family/group directory for batch output or organized copies.',
    values: [
      {
        value: 'auto',
        useWhen: 'The caller wants the tool to infer grouping from source shape: nested sources usually preserve source directories, flat sources lean on font metadata.',
        avoidWhen: 'The user explicitly says source folders are authoritative, or explicitly wants internal font metadata to decide groups.',
        inspectFields: ['layout', 'recommendedBatchPreviewArgs', 'batchGroupBy', 'planned', 'batchWarnings'],
        successCriteria: 'Preview shows the intended family/group directories, with layout warnings reviewed before any write.',
      },
      {
        value: 'source-dir',
        useWhen: 'Each source folder already represents a family, vendor package, or archive-derived grouping that should be preserved.',
        avoidWhen: 'The source is a flat dump or folder names are download artifacts rather than family names.',
        inspectFields: ['layout', 'recommendedBatchPreviewArgs', 'batchGroupBy', 'planned', 'batchWarnings'],
        successCriteria: 'Preview paths preserve the intended source folder grouping and do not mix unrelated root-level files unexpectedly.',
      },
      {
        value: 'font-family',
        useWhen: 'The source layout is flat or unreliable and internal font family metadata should decide grouping.',
        avoidWhen: 'parseFonts is false, font metadata is missing/unreliable, or user wants original source folders preserved.',
        inspectFields: ['parsedFontMetadata', 'missingIdentityCount', 'invalidFontCount', 'batchGroupBy', 'planned', 'batchWarnings'],
        successCriteria: 'Metadata has been parsed, missing/invalid font counts are acceptable or disclosed, and preview paths use the intended font-family groups.',
      },
    ],
  },
  {
    id: 'naming-policy',
    optionName: 'batchNamingMode',
    appliesTo: ['split_font_batch', 'organize_font_directory'],
    defaultValue: 'numeric-suffix',
    purpose: 'Choose how per-font output directories or organized copy filenames avoid collisions inside a group.',
    values: [
      {
        value: 'numeric-suffix',
        useWhen: 'Default agent-safe behavior: keep bare names unless a real same-group output name conflict exists.',
        avoidWhen: 'The user demands exact bare names even if outputs collide, or wants source-derived suffixes for traceability.',
        inspectFields: ['batchNamingMode', 'planned', 'batchWarnings', 'outputTreeInsideInputTree'],
        successCriteria: 'Preview shows bare names when there is no real conflict and numeric suffixes only where collisions require them.',
      },
      {
        value: 'plain',
        useWhen: 'The user explicitly wants bare names and accepts that same-group collisions may overwrite/merge poorly or require manual handling.',
        avoidWhen: 'The source contains multiple styles/files with the same stem inside one group or the run should be collision-safe by default.',
        inspectFields: ['batchNamingMode', 'planned', 'batchWarnings', 'errorCount', 'errors'],
        successCriteria: 'Plain naming is explicitly intentional, planned paths have been reviewed for collisions, and any collision/error risk is disclosed.',
      },
      {
        value: 'source-suffix',
        useWhen: 'The user explicitly wants source-derived suffixes to preserve traceability across folders or similarly named files.',
        avoidWhen: 'Default behavior is desired, because source suffixes make names longer and should not appear implicitly.',
        inspectFields: ['batchNamingMode', 'planned', 'batchWarnings'],
        successCriteria: 'Source suffixes are intentionally requested and preview paths demonstrate the desired traceability without surprising extra suffixes.',
      },
    ],
  },
  {
    id: 'dedupe-policy',
    optionName: 'batchDedupeMode',
    appliesTo: ['split_font_batch', 'organize_font_directory'],
    defaultValue: 'font-identity',
    purpose: 'Choose whether equivalent source fonts are collapsed before processing or copying.',
    values: [
      {
        value: 'font-identity',
        useWhen: 'Default behavior: dedupe equivalent fonts across formats when they represent the same effective font.',
        avoidWhen: 'Every supported source font file must be preserved, even when only format/container differs.',
        inspectFields: ['batchDedupeMode', 'dedupeDecisionSummary', 'skippedDuplicates', 'planned', 'batchWarnings', 'dedupeLimitedByParsing'],
        successCriteria: 'Duplicate skips match user intent; if parsing was skipped, rerun with parseFonts true before trusting identity dedupe.',
      },
      {
        value: 'same-path',
        useWhen: 'A fast structure/path-level dedupe is enough, or parseFonts is intentionally disabled for a structure-first pass.',
        avoidWhen: 'Equivalent fonts may appear across arbitrary folders/formats and should be deduped semantically.',
        inspectFields: ['batchDedupeMode', 'effectiveBatchDedupeMode', 'dedupeLimitedByParsing', 'dedupeDecisionSummary', 'skippedDuplicates', 'planned'],
        successCriteria: 'The caller accepts path/stem-level dedupe limits and does not rely on it as semantic font identity.',
      },
      {
        value: 'none',
        useWhen: 'The user wants to preserve every supported source font file, including apparent duplicates or alternate containers.',
        avoidWhen: 'The goal is one representative output per effective font.',
        inspectFields: ['batchDedupeMode', 'dedupeDecisionSummary', 'skippedDuplicates', 'planned', 'batchWarnings', 'outputTreeInsideInputTree'],
        successCriteria: 'Preview intentionally keeps every selected supported font, skippedDuplicates is zero, and naming collisions are handled or disclosed.',
      },
    ],
  },
  {
    id: 'error-policy',
    optionName: 'batchErrorMode',
    appliesTo: ['split_font_batch'],
    defaultValue: 'fail-after',
    purpose: 'Choose how per-font processing errors affect the batch tool result.',
    values: [
      {
        value: 'fail-after',
        useWhen: 'Default behavior: process selected fonts, then fail the batch if any per-font errors occurred.',
        avoidWhen: 'The caller wants a best-effort ok:true response with collected errors, or wants to stop immediately on the first error.',
        inspectFields: ['batchErrorMode', 'errorCount', 'errors', 'batchDecision', 'recommendedNextActions'],
        successCriteria: 'errorCount is zero before claiming success, or the thrown/returned batch failure is reported with errors[] details.',
      },
      {
        value: 'fail-fast',
        useWhen: 'The first per-font failure should stop the batch immediately to save time or avoid partial output.',
        avoidWhen: 'The caller wants a complete list of all failing files in one run.',
        inspectFields: ['batchErrorMode', 'errorCount', 'errors', 'batchDecision'],
        successCriteria: 'The first failure is treated as blocking and partial output, if any, is audited or disclosed.',
      },
      {
        value: 'collect',
        useWhen: 'The caller intentionally wants ok:true best-effort output plus errors[] for later inspection.',
        avoidWhen: 'An agent might forget to check errors[] and incorrectly report full success.',
        inspectFields: ['batchErrorMode', 'errorCount', 'errors', 'batchDecision', 'recommendedNextActions'],
        successCriteria: 'Every errors[] entry is inspected, resolved, or disclosed; errorCount must be zero before reporting full success.',
      },
    ],
  },
];

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function getBatchPolicyGuideValue(optionName, value) {
  const policy = BATCH_POLICY_GUIDE.find((item) => item.optionName === optionName);
  const selectedValue = policy?.values?.find((item) => item.value === value);
  return { policy, selectedValue };
}

export function buildBatchPolicySummary({ appliesToTool, workflowPreset, values, effectiveValues = {}, availableInspectFields = null, notes = [] }) {
  const selectedPolicies = Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([optionName, value]) => {
      const { policy, selectedValue } = getBatchPolicyGuideValue(optionName, value);
      const effectiveValue = effectiveValues[optionName];
      return {
        optionName,
        value,
        ...(effectiveValue !== undefined ? { effectiveValue } : {}),
        ...(policy?.defaultValue !== undefined ? { defaultValue: policy.defaultValue, isDefault: value === policy.defaultValue } : {}),
        inspectFields: selectedValue?.inspectFields || [],
        successCriteria: selectedValue?.successCriteria || 'Inspect the resolved policy fields and verify they match user intent before continuing.',
      };
    });
  const policyGuideInspectFields = uniqueStrings(selectedPolicies.flatMap((policy) => policy.inspectFields));
  const availableInspectFieldSet = Array.isArray(availableInspectFields) ? new Set(availableInspectFields) : null;
  const inspectFields = availableInspectFieldSet
    ? policyGuideInspectFields.filter((fieldName) => availableInspectFieldSet.has(fieldName))
    : policyGuideInspectFields;

  const effectiveEntries = Object.fromEntries(
    Object.entries(effectiveValues).filter(([, value]) => value !== undefined),
  );
  const derivedNotes = selectedPolicies
    .filter((policy) => policy.effectiveValue !== undefined && policy.effectiveValue !== policy.value)
    .map((policy) => `${policy.optionName} requested ${policy.value} but effectively uses ${policy.effectiveValue}.`);

  return {
    policySource: 'get_agent_guidance.batchPolicyGuide',
    appliesToTool,
    workflowPreset,
    values,
    ...(Object.keys(effectiveEntries).length > 0 ? { effectiveValues: effectiveEntries } : {}),
    selectedPolicies,
    inspectFields,
    policyGuideInspectFields,
    policySuccessCriteria: selectedPolicies.map((policy) => ({
      optionName: policy.optionName,
      value: policy.value,
      ...(policy.effectiveValue !== undefined ? { effectiveValue: policy.effectiveValue } : {}),
      successCriteria: policy.successCriteria,
    })),
    notes: uniqueStrings([...derivedNotes, ...notes]),
  };
}
