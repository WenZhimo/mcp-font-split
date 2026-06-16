import fs from 'node:fs/promises';
import path from 'node:path';
import {
  BATCH_DEDUPE_MODES,
  BATCH_ERROR_MODES,
  BATCH_GROUP_BY_MODES,
  BATCH_NAMING_MODES,
  FONT_EXTENSIONS,
  GUIDANCE_DETAIL_LEVELS,
  GUIDANCE_SECTION_NAMES,
  GUIDANCE_WORKFLOWS,
  OVERSIZED_KERN_ACTIONS,
  SKIP_MODES,
  SMALL_GLYPH_ACTIONS,
  SPLIT_FAILURE_ACTIONS,
  WORKFLOW_PRESET_NAMES,
} from './catalogs.js';
import {
  DEFAULT_WORKSPACE_ROOT,
  PROJECT_ROOT,
  isInside,
  resolveWorkspacePath,
  toRelativeWorkspacePath,
} from './path-utils.js';
import {
  RAW_BATCH_OPTION_DEFAULTS,
  applyWorkflowPreset,
  buildConfigurationTrace,
  buildEffectiveConfigSnapshot,
  normalizeBatchOptions,
  normalizeBooleanOption,
  normalizePositiveNumberOption,
  normalizeProcessingOptions,
} from './config.js';
import {
  buildBatchDedupeIdentity,
} from './font-identity.js';
import {
  scanFilesRecursive,
} from './file-scan.js';
import {
  buildInputCountGuide,
  buildUnsupportedFileDecision,
  buildUnsupportedFileSummary,
} from './input-summary.js';
import {
  buildSourceSafetyDecision,
} from './decision-diagnostics.js';
import {
  buildBatchNextActions,
} from './next-actions.js';
import {
  buildBatchPolicySummary,
  buildBatchSafetySummary,
  buildBatchWarnings,
  buildBatchDecision,
  buildBatchOutputNames,
  buildBatchError,
  compareBatchDedupeRepresentative,
  buildDedupeDecisionSummary,
  logBatchDecision,
  resolveBatchFamilyDirName,
  resolveStableBatchOutputNames,
  sanitizeDirName,
  shouldSkipExistingOutput,
} from './batch.js';
import {
  buildSplitManifest,
  writeSplitManifest,
} from './split-manifest.js';
import {
  PACKAGE_VERSION,
  resetWasmRuntime,
} from './runtime-status.js';
import { splitFont } from './single-runtime.js';

export {
  BATCH_DEDUPE_MODES,
  BATCH_ERROR_MODES,
  BATCH_GROUP_BY_MODES,
  BATCH_NAMING_MODES,
  GUIDANCE_DETAIL_LEVELS,
  GUIDANCE_SECTION_NAMES,
  GUIDANCE_WORKFLOWS,
  OVERSIZED_KERN_ACTIONS,
  SKIP_MODES,
  SMALL_GLYPH_ACTIONS,
  SPLIT_FAILURE_ACTIONS,
  WORKFLOW_PRESET_NAMES,
};

export {
  DEFAULT_WORKSPACE_ROOT,
  PROJECT_ROOT,
  resolveWorkspacePath,
  toRelativeWorkspacePath,
};

export { inspectSplitOutput } from './output-audit.js';
export { inspectFontInputs } from './input-preflight.js';
export { organizeFontDirectory } from './organization-runtime.js';
export { getRuntimeStatus } from './runtime-status.js';

export { getAgentGuidance } from './agent-guidance.js';

export { splitFont };

export async function splitFontBatch(args = {}) {
  const presetContext = applyWorkflowPreset(args, 'batch');
  const effectiveArgs = presetContext.args;
  const inputDir = await resolveWorkspacePath(effectiveArgs.inputDir || '.', { mustExist: true });
  const stat = await fs.stat(inputDir);
  if (!stat.isDirectory()) throw new Error(`inputDir is not a directory: ${effectiveArgs.inputDir}`);

  const batchOptions = normalizeBatchOptions(effectiveArgs);
  const processingOptions = normalizeProcessingOptions(effectiveArgs);
  const includeResults = normalizeBooleanOption(effectiveArgs, 'includeResults', true);
  const dryRun = normalizeBooleanOption(effectiveArgs, 'dryRun', false);
  const outputRoot = effectiveArgs.outputRoot || 'split-output';
  const outputRootName = path.basename(outputRoot);
  const resolvedOutputRoot = await resolveWorkspacePath(outputRoot);
  const outputTreeInsideInputTree = isInside(inputDir, resolvedOutputRoot);

  const maxFiles = normalizePositiveNumberOption(effectiveArgs, 'maxFiles', 5000, { integer: true, max: 50000 });
  const limit = normalizePositiveNumberOption(effectiveArgs, 'limit', 20, { integer: true, max: 50000 });
  const inputScan = await scanFilesRecursive(inputDir, {
    maxFiles,
    excludeDirs: [outputRootName],
  });
  const allFiles = inputScan.files;
  const fontFiles = allFiles.filter((file) => FONT_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const unsupportedFileSummary = buildUnsupportedFileSummary(allFiles);
  const unsupportedFileDecision = buildUnsupportedFileDecision(unsupportedFileSummary);
  const inputCountGuide = buildInputCountGuide({
    appliesToTool: 'split_font_batch',
    scannedFileCount: allFiles.length,
    supportedFontCount: fontFiles.length,
    unsupportedFileCount: unsupportedFileSummary.total,
    maxFiles,
    maxFilesHit: inputScan.truncated,
    supportedFieldName: 'discoveredFontCount',
    unsupportedFieldName: 'unsupportedFileSummary.total',
    unsupportedFileSummary,
    unsupportedFileDecision,
  });

  let deduplicated;
  let identityKeyMissingCount = 0;
  let pathFallbackCount = 0;
  const identityEvidenceItems = [];
  const duplicateEvidenceItems = [];
  if (batchOptions.batchDedupeMode === 'none') {
    deduplicated = [...fontFiles];
  } else if (batchOptions.batchDedupeMode === 'same-path') {
    const byBaseName = new Map();
    for (const file of fontFiles) {
      const ext = path.extname(file).toLowerCase();
      const base = file.slice(0, -ext.length);
      const key = `path:${base}`;
      identityEvidenceItems.push({ identityKey: key });
      const existing = byBaseName.get(base);
      if (!existing || compareBatchDedupeRepresentative(file, existing) < 0) {
        if (existing) {
          duplicateEvidenceItems.push({
            path: toRelativeWorkspacePath(existing),
            duplicateOf: toRelativeWorkspacePath(file),
            identityKey: key,
          });
          logBatchDecision(batchOptions.debugBatchDecisions, 'dedupe-replace', {
            mode: batchOptions.batchDedupeMode,
            winner: toRelativeWorkspacePath(file),
            loser: toRelativeWorkspacePath(existing),
            reason: 'same-path-priority',
          });
        }
        byBaseName.set(base, file);
      } else {
        duplicateEvidenceItems.push({
          path: toRelativeWorkspacePath(file),
          duplicateOf: toRelativeWorkspacePath(existing),
          identityKey: key,
        });
        logBatchDecision(batchOptions.debugBatchDecisions, 'dedupe-drop', {
          mode: batchOptions.batchDedupeMode,
          winner: toRelativeWorkspacePath(existing),
          loser: toRelativeWorkspacePath(file),
          reason: 'same-path-priority',
        });
      }
    }
    deduplicated = [...byBaseName.values()];
  } else {
    const byIdentity = new Map();
    for (const file of fontFiles) {
      const ext = path.extname(file).toLowerCase();
      const identityKey = await buildBatchDedupeIdentity(file);
      if (!identityKey) {
        identityKeyMissingCount++;
        pathFallbackCount++;
      }
      const key = identityKey || `path:${file.slice(0, -ext.length)}`;
      identityEvidenceItems.push({ identityKey: key });
      const existing = byIdentity.get(key);
      if (!existing || compareBatchDedupeRepresentative(file, existing) < 0) {
        if (existing) {
          duplicateEvidenceItems.push({
            path: toRelativeWorkspacePath(existing),
            duplicateOf: toRelativeWorkspacePath(file),
            identityKey: key,
          });
          logBatchDecision(batchOptions.debugBatchDecisions, 'dedupe-replace', {
            mode: batchOptions.batchDedupeMode,
            winner: toRelativeWorkspacePath(file),
            loser: toRelativeWorkspacePath(existing),
            identityKey: key,
            reason: identityKey ? 'font-identity-priority' : 'path-fallback-priority',
          });
        }
        byIdentity.set(key, file);
      } else {
        duplicateEvidenceItems.push({
          path: toRelativeWorkspacePath(file),
          duplicateOf: toRelativeWorkspacePath(existing),
          identityKey: key,
        });
        logBatchDecision(batchOptions.debugBatchDecisions, 'dedupe-drop', {
          mode: batchOptions.batchDedupeMode,
          winner: toRelativeWorkspacePath(existing),
          loser: toRelativeWorkspacePath(file),
          identityKey: key,
          reason: identityKey ? 'font-identity-priority' : 'path-fallback-priority',
        });
      }
    }
    deduplicated = [...byIdentity.values()];
  }

  const deduplicatedCount = deduplicated.length;
  const skippedCount = fontFiles.length - deduplicatedCount;
  const dedupeDecisionSummary = buildDedupeDecisionSummary({
    appliesToTool: 'split_font_batch',
    requestedMode: batchOptions.batchDedupeMode,
    effectiveMode: batchOptions.batchDedupeMode,
    inputFontCount: fontFiles.length,
    deduplicatedCount,
    skippedDuplicateCount: skippedCount,
    identityKeyMissingCount,
    pathFallbackCount,
    identityEvidenceItems,
    duplicateEvidenceItems,
  });
  const selected = deduplicated.slice(0, limit);

  const results = [];
  const planned = [];
  const errors = [];
  const processingSummary = {
    decompressedInputs: 0,
    oversizedKernDetected: 0,
    oversizedKernStripped: 0,
    smallGlyphDowngrades: 0,
    smallGlyphCopyOriginals: 0,
    failureFallbacks: 0,
    subsetOutputs: 0,
    singleWoff2Outputs: 0,
    copyOriginalOutputs: 0,
  };
  let skippedExisting = 0;
  let skippedByManifest = 0;
  let reprocessedBecauseSourceChanged = 0;
  let reprocessedBecauseOptionsChanged = 0;
  let wouldProcessCount = 0;
  const batchOutputNameReservations = new Map();

  for (const file of selected) {
    const relative = toRelativeWorkspacePath(file);
    try {
      const groupName = sanitizeDirName(await resolveBatchFamilyDirName({
        file,
        inputDir,
        groupingMode: batchOptions.batchGroupBy,
      }));
      const outDir = path.join(outputRoot, groupName);
      const fontBaseName = path.basename(file, path.extname(file));
      const fontFileName = path.basename(file);
      const resolvedOutDir = await resolveWorkspacePath(outDir);
      let batchOutputNames;
      if (batchOptions.batchNamingMode === 'plain') {
        batchOutputNames = {
          splitDirName: fontBaseName,
          copiedOriginalFileName: fontFileName,
        };
      } else if (batchOptions.batchNamingMode === 'source-suffix') {
        batchOutputNames = buildBatchOutputNames({
          inputRelativePath: relative,
          fontBaseName,
          fontFileName,
        });
      } else {
        const reservationKey = path.resolve(resolvedOutDir);
        const reservedNames = batchOutputNameReservations.get(reservationKey) || new Set();
        batchOutputNames = await resolveStableBatchOutputNames({
          resolvedOutDir,
          fontBaseName,
          fontFileName,
          inputRelativePath: relative,
          reservedNames,
        });
        reservedNames.add(batchOutputNames.splitDirName);
        batchOutputNameReservations.set(reservationKey, reservedNames);
      }
      logBatchDecision(batchOptions.debugBatchDecisions, 'naming', {
        mode: batchOptions.batchNamingMode,
        input: relative,
        groupName,
        splitDirName: batchOutputNames.splitDirName,
        copiedOriginalFileName: batchOutputNames.copiedOriginalFileName,
      });

      const inputStat = await fs.stat(file);
      const effectiveConfig = buildEffectiveConfigSnapshot({ ...effectiveArgs, ...batchOptions, groupName }, processingOptions);
      const skipDecision = await shouldSkipExistingOutput({
        skipMode: batchOptions.skipMode,
        resolvedOutDir,
        splitDirName: batchOutputNames.splitDirName,
        inputRelativePath: relative,
        inputStat,
        effectiveConfig,
        toolVersion: PACKAGE_VERSION,
      });
      logBatchDecision(batchOptions.debugBatchDecisions, 'skip-check', {
        mode: batchOptions.skipMode,
        input: relative,
        splitDirName: batchOutputNames.splitDirName,
        reason: skipDecision.reason,
        shouldSkip: skipDecision.shouldSkip,
      });

      if (skipDecision.shouldSkip) {
        skippedExisting++;
        if (skipDecision.reason === 'manifest') skippedByManifest++;
        if (dryRun) {
          planned.push({
            input: relative,
            groupName,
            outDir: toRelativeWorkspacePath(resolvedOutDir),
            splitDir: toRelativeWorkspacePath(path.join(resolvedOutDir, batchOutputNames.splitDirName)),
            copiedOriginalPath: toRelativeWorkspacePath(path.join(resolvedOutDir, batchOutputNames.copiedOriginalFileName)),
            splitDirName: batchOutputNames.splitDirName,
            copiedOriginalFileName: batchOutputNames.copiedOriginalFileName,
            wouldProcess: false,
            skipReason: skipDecision.reason,
          });
        }
        effectiveArgs.onProgress?.({ current: results.length + errors.length + skippedExisting, total: selected.length, file: relative, status: 'skipped' });
        continue;
      }
      if (skipDecision.reason === 'stale-manifest' && skipDecision.manifest) {
        const sameSource = skipDecision.manifest.source?.input === relative
          && skipDecision.manifest.source?.sizeBytes === inputStat.size
          && skipDecision.manifest.source?.mtimeMs === inputStat.mtimeMs;
        if (sameSource) {
          reprocessedBecauseOptionsChanged++;
        } else {
          reprocessedBecauseSourceChanged++;
        }
      }

      if (dryRun) {
        wouldProcessCount++;
        planned.push({
          input: relative,
          groupName,
          outDir: toRelativeWorkspacePath(resolvedOutDir),
          splitDir: toRelativeWorkspacePath(path.join(resolvedOutDir, batchOutputNames.splitDirName)),
          copiedOriginalPath: toRelativeWorkspacePath(path.join(resolvedOutDir, batchOutputNames.copiedOriginalFileName)),
          splitDirName: batchOutputNames.splitDirName,
          copiedOriginalFileName: batchOutputNames.copiedOriginalFileName,
          wouldProcess: true,
          skipReason: skipDecision.reason,
        });
        effectiveArgs.onProgress?.({ current: planned.length + errors.length, total: selected.length, file: relative, status: 'planned' });
        continue;
      }

      const result = await splitFont({
        ...effectiveArgs,
        fontPath: relative,
        outDir,
        groupName,
        splitDirName: batchOutputNames.splitDirName,
        copiedOriginalFileName: batchOutputNames.copiedOriginalFileName,
        batchNamingMode: batchOptions.batchNamingMode,
        batchDedupeMode: batchOptions.batchDedupeMode,
      });
      results.push(result);
      if (result.decompressedFrom) processingSummary.decompressedInputs++;
      if (result.oversizedKernDetected) processingSummary.oversizedKernDetected++;
      if (result.oversizedKernStripped) processingSummary.oversizedKernStripped++;
      if (result.splitFailureFallbackApplied) processingSummary.failureFallbacks++;
      if (result.outputMode === 'single-woff2') {
        processingSummary.singleWoff2Outputs++;
        if (result.processing?.smallGlyph?.downgraded) processingSummary.smallGlyphDowngrades++;
      } else if (result.outputMode === 'copy-original') {
        processingSummary.copyOriginalOutputs++;
        if (result.processing?.smallGlyph?.skippedSplit) processingSummary.smallGlyphCopyOriginals++;
      } else {
        processingSummary.subsetOutputs++;
      }
      effectiveArgs.onProgress?.({ current: results.length + errors.length + skippedExisting, total: selected.length, file: relative, status: 'done' });
    } catch (error) {
      resetWasmRuntime();
      logBatchDecision(batchOptions.debugBatchDecisions, 'error', {
        input: relative,
        message: error instanceof Error ? error.message : String(error),
      });
      errors.push({ file: relative, error: error instanceof Error ? error.message : String(error) });
      effectiveArgs.onProgress?.({ current: results.length + errors.length + skippedExisting, total: selected.length, file: relative, status: 'error' });
      if (batchOptions.batchErrorMode === 'fail-fast') {
        const fastFailSafetySummary = buildBatchSafetySummary({
          dryRun,
          selectedCount: selected.length,
          outputTreeInsideInputTree,
        });
        const fastFailInputDirRelative = toRelativeWorkspacePath(inputDir);
        const fastFailSourceSafetyDecision = buildSourceSafetyDecision({
          appliesToTool: 'split_font_batch',
          safetySummary: fastFailSafetySummary,
          inputPath: fastFailInputDirRelative,
          outputPath: outputRoot,
          outputPathRole: 'outputRoot',
          requiresOutputAudit: fastFailSafetySummary.writesOutputTree,
        });
        throw buildBatchError({
          mode: batchOptions.batchErrorMode,
          errors,
          summary: {
            inputDir: fastFailInputDirRelative,
            outputRoot,
            safetySummary: fastFailSafetySummary,
            sourceSafetyDecision: fastFailSourceSafetyDecision,
            sourceDestructive: fastFailSafetySummary.sourceDestructive,
            sourceFilesPreserved: fastFailSafetySummary.sourceFilesPreserved,
            writesSourceTree: fastFailSafetySummary.writesSourceTree,
            writesOutputTree: fastFailSafetySummary.writesOutputTree,
            outputTreeInsideInputTree: fastFailSafetySummary.outputTreeInsideInputTree,
            mayOverwriteOutputTree: fastFailSafetySummary.mayOverwriteOutputTree,
            dryRun,
            inputCountGuide,
            discoveredFontCount: fontFiles.length,
            deduplicatedCount,
            selectedFontCount: selected.length,
            processedFontCount: results.length,
            skippedExisting,
          },
        });
      }
    }
  }

  const batchWarnings = buildBatchWarnings({
    dryRun,
    includeResults,
    inputScanTruncated: inputScan.truncated,
    maxFiles,
    deduplicatedCount,
    selectedCount: selected.length,
    skippedExisting,
    errorCount: errors.length,
    batchErrorMode: batchOptions.batchErrorMode,
    outputTreeInsideInputTree,
  });
  const safetySummary = buildBatchSafetySummary({
    dryRun,
    selectedCount: selected.length,
    outputTreeInsideInputTree,
  });
  const inputDirRelative = toRelativeWorkspacePath(inputDir);
  const sourceSafetyDecision = buildSourceSafetyDecision({
    appliesToTool: 'split_font_batch',
    safetySummary,
    inputPath: inputDirRelative,
    outputPath: outputRoot,
    outputPathRole: 'outputRoot',
    requiresOutputAudit: safetySummary.writesOutputTree,
  });
  const recommendedNextActions = buildBatchNextActions({
    dryRun,
    inputDirRelative,
    outputRoot,
    effectiveArgs,
    batchOptions,
    maxFiles,
    maxFilesHit: inputScan.truncated,
    selectedFontCount: selected.length,
    errorCount: errors.length,
    writesOutputTree: safetySummary.writesOutputTree,
  });
  const batchDecision = buildBatchDecision({
    dryRun,
    inputDirRelative,
    outputRoot,
    effectiveArgs,
    batchOptions,
    maxFilesHit: inputScan.truncated,
    discoveredFontCount: fontFiles.length,
    selectedFontCount: selected.length,
    processedFontCount: results.length,
    skippedExisting,
    errorCount: errors.length,
    safetySummary,
  });
  const batchPolicySummary = buildBatchPolicySummary({
    appliesToTool: 'split_font_batch',
    workflowPreset: batchOptions.workflowPreset,
    values: {
      batchGroupBy: batchOptions.batchGroupBy,
      batchNamingMode: batchOptions.batchNamingMode,
      batchDedupeMode: batchOptions.batchDedupeMode,
      batchErrorMode: batchOptions.batchErrorMode,
    },
    availableInspectFields: [
      'batchGroupBy',
      'batchNamingMode',
      'batchDedupeMode',
      'batchErrorMode',
      'planned',
      'batchWarnings',
      'skippedDuplicates',
      'dedupeDecisionSummary',
      'errorCount',
      'errors',
      'batchDecision',
      'recommendedNextActions',
      'outputTreeInsideInputTree',
    ],
  });
  const configurationTrace = buildConfigurationTrace({
    appliesToTool: 'split_font_batch',
    workflowPreset: batchOptions.workflowPreset,
    rawDefaults: RAW_BATCH_OPTION_DEFAULTS,
    presetDefaults: presetContext.presetDefaults,
    explicitArgs: presetContext.explicitArgs,
    effectiveValues: {
      dryRun,
      includeResults,
      skipMode: batchOptions.skipMode,
      batchGroupBy: batchOptions.batchGroupBy,
      batchNamingMode: batchOptions.batchNamingMode,
      batchDedupeMode: batchOptions.batchDedupeMode,
      batchErrorMode: batchOptions.batchErrorMode,
      splitFailureAction: processingOptions.splitFailureAction,
    },
  });

  const response = {
    ok: true,
    inputDir: inputDirRelative,
    outputRoot,
    workflowPreset: batchOptions.workflowPreset,
    safetySummary,
    sourceSafetyDecision,
    sourceDestructive: safetySummary.sourceDestructive,
    sourceFilesPreserved: safetySummary.sourceFilesPreserved,
    writesSourceTree: safetySummary.writesSourceTree,
    writesOutputTree: safetySummary.writesOutputTree,
    outputTreeInsideInputTree: safetySummary.outputTreeInsideInputTree,
    mayOverwriteOutputTree: safetySummary.mayOverwriteOutputTree,
    dryRun,
    skipMode: batchOptions.skipMode,
    batchGroupBy: batchOptions.batchGroupBy,
    batchNamingMode: batchOptions.batchNamingMode,
    batchDedupeMode: batchOptions.batchDedupeMode,
    batchErrorMode: batchOptions.batchErrorMode,
    configurationTrace,
    batchPolicySummary,
    scannedFileCount: allFiles.length,
    maxFiles,
    maxFilesHit: inputScan.truncated,
    inputCountGuide,
    unsupportedFileDecision,
    unsupportedFileSummary,
    discoveredFontCount: fontFiles.length,
    deduplicatedCount,
    skippedDuplicates: skippedCount,
    dedupeDecisionSummary,
    selectedFontCount: selected.length,
    skippedExisting,
    skippedByManifest,
    reprocessedBecauseSourceChanged,
    reprocessedBecauseOptionsChanged,
    processedFontCount: results.length,
    errorCount: errors.length,
    errors,
    batchWarningCount: batchWarnings.length,
    batchWarnings,
    batchDecision,
    recommendedNextActionCount: recommendedNextActions.length,
    recommendedNextActions,
    resultsIncluded: includeResults,
    processingSummary,
    ...(dryRun ? {
      plannedCount: planned.length,
      wouldProcessCount,
      planIncluded: includeResults,
    } : {}),
    ...(includeResults && dryRun ? { planned } : {}),
    ...(includeResults && !dryRun ? { results } : {}),
  };

  if (errors.length > 0 && batchOptions.batchErrorMode === 'fail-after') {
    throw buildBatchError({
      mode: batchOptions.batchErrorMode,
      errors,
      summary: response,
    });
  }

  return response;
}
