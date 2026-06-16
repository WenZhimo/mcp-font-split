import fs from 'node:fs/promises';
import path from 'node:path';
import { fontSplit } from 'cn-font-split/dist/wasm/index.mjs';
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
  fileExists,
  isInside,
  resolveWorkspacePath,
  toRelativeWorkspacePath,
} from './path-utils.js';
import {
  RAW_BATCH_OPTION_DEFAULTS,
  RAW_ORGANIZATION_OPTION_DEFAULTS,
  applyWorkflowPreset,
  buildConfigurationTrace,
  buildEffectiveConfigSnapshot,
  normalizeBatchOptions,
  normalizeBooleanOption,
  normalizeOrganizationOptions,
  normalizePositiveNumberOption,
  normalizeProcessingOptions,
} from './config.js';
import {
  buildBatchDedupeIdentity,
  decompressWoff1,
  decompressWoff2,
  extractFontFamily,
  getGlyphCount,
  inspectOversizedKern,
  stripOversizedKern,
} from './font-identity.js';
import {
  scanFilesRecursive,
  summarizeFiles,
} from './file-scan.js';
import {
  buildInputCountGuide,
  buildUnsupportedFileDecision,
  buildUnsupportedFileSummary,
} from './input-summary.js';
import {
  buildDirectoryLayoutSummary,
  ensureFontFile,
  inspectInputFontFile,
} from './input-inspection.js';
import {
  buildOrganizationWarnings,
  buildSourceSafetyDecision,
  buildWarnings,
} from './decision-diagnostics.js';
import {
  buildSuggestedBatchPreviewArgs,
} from './suggested-args.js';
import {
  buildBatchNextActions,
  buildOrganizationNextActions,
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
  manifestPathForSplitDir,
  writeSplitManifest,
} from './split-manifest.js';
import { ORGANIZATION_MANIFEST_FILE_NAME } from './output-audit.js';
import {
  PACKAGE_VERSION,
  getWasmRuntime,
  resetWasmRuntime,
} from './runtime-status.js';
import { buildFontSplitConfig } from './split-config.js';
import {
  classifyResultType,
  clearSplitDirForCopyOriginal,
  emitSmallGlyphFallback,
  writeGeneratedFiles,
} from './single-split-output.js';
import {
  buildOrganizationManifest,
  buildPlanActionSummary,
  writeOrganizationManifest,
} from './organization-manifest.js';
import {
  buildDirectoryWorkflowSummary,
  buildLayoutDecision,
  buildOrganizationDecision,
  buildStagingDirectoryDecision,
  chooseOrganizationTargetPath,
  dedupeOrganizationEntries,
  getOrganizationDedupeKey,
  resolveOrganizationGroupName,
} from './organization-planning.js';

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
export { getRuntimeStatus } from './runtime-status.js';

export { getAgentGuidance } from './agent-guidance.js';

export async function splitFont(args) {
  const startedAt = Date.now();
  const processingOptions = normalizeProcessingOptions(args);
  const input = await ensureFontFile(args.fontPath);
  const inputStat = await fs.stat(input);
  const inputRelativePath = toRelativeWorkspacePath(input);
  const fontBaseName = path.basename(input, path.extname(input));
  const fontFileName = path.basename(input);
  const splitDirName = args.splitDirName || fontBaseName;
  const copiedOriginalFileName = args.copiedOriginalFileName || fontFileName;
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
  const groupName = args.groupName || safeFamilyName;

  const rootDir = await resolveWorkspacePath(
    args.outDir || path.join('split-output', groupName),
  );
  const splitDir = path.join(rootDir, splitDirName);
  await fs.mkdir(splitDir, { recursive: true });

  const destFontPath = path.join(rootDir, copiedOriginalFileName);
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
  const shouldCopyOriginalSmallGlyph = (
    glyphCount > 0
    && glyphCount <= processingOptions.smallGlyphThreshold
    && processingOptions.smallGlyphAction === 'copy-original'
  );

  if (shouldCopyOriginalSmallGlyph) {
    await clearSplitDirForCopyOriginal(splitDir);
    generated = [];
    skipped = true;
    skipReason = 'small glyph copy-original explicitly enabled';
    outputMode = 'copy-original';
  } else if (shouldEmitSmallGlyphFallback) {
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

  const usedFallback = outputMode === 'single-woff2';
  const performedSplit = outputMode === 'subset';
  const resultType = classifyResultType({ outputMode, splitFailureFallbackApplied, skipReason });
  const warnings = buildWarnings({
    decompressedFrom,
    oversizedKernDetected: kernInspection.oversized,
    oversizedKernStripped,
    usedFallback,
    skipped,
    skipReason,
  });
  const effectiveConfig = buildEffectiveConfigSnapshot(args, processingOptions);

  const files = await summarizeFiles(rootDir);
  const createdFiles = files.filter((file) => !before.has(file.path));

  const result = {
    ok: true,
    input: inputRelativePath,
    fontFamily: familyName,
    groupName,
    outDir: toRelativeWorkspacePath(rootDir),
    splitDir: toRelativeWorkspacePath(splitDir),
    durationMs: Date.now() - startedAt,
    generatedFileCount: generated.length,
    glyphCount,
    skipped,
    skipReason,
    outputMode,
    resultType,
    performedSplit,
    usedFallback,
    copiedOriginalPath: toRelativeWorkspacePath(destFontPath),
    warnings,
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
        matchedThreshold: glyphCount > 0 && glyphCount <= processingOptions.smallGlyphThreshold,
        downgraded: resultType === 'single-woff2-small-glyph',
        skippedSplit: resultType === 'copy-original-small-glyph',
      },
      splitFailure: {
        action: processingOptions.splitFailureAction,
        fallbackApplied: splitFailureFallbackApplied,
        failureMessage: splitFailureMessage,
      },
    },
  };

  const manifest = buildSplitManifest({
    toolVersion: PACKAGE_VERSION,
    inputRelativePath,
    inputStat,
    groupName,
    outDirRelative: result.outDir,
    splitDirRelative: result.splitDir,
    effectiveConfig,
    result,
  });
  await writeSplitManifest(splitDir, manifest);
  result.manifestPath = toRelativeWorkspacePath(manifestPathForSplitDir(splitDir));
  result.manifestWritten = true;

  return result;
}

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

export async function organizeFontDirectory(args = {}) {
  const presetContext = applyWorkflowPreset(args, 'organize');
  const effectiveArgs = presetContext.args;
  const inputDir = await resolveWorkspacePath(effectiveArgs.inputDir || '.', { mustExist: true });
  const stat = await fs.stat(inputDir);
  if (!stat.isDirectory()) throw new Error(`inputDir is not a directory: ${effectiveArgs.inputDir}`);

  const options = normalizeOrganizationOptions(effectiveArgs);
  const outputDir = await resolveWorkspacePath(effectiveArgs.outputDir || 'organized-fonts');
  if (path.resolve(inputDir) === path.resolve(outputDir)) {
    throw new Error('outputDir must be different from inputDir.');
  }

  const maxFiles = normalizePositiveNumberOption(effectiveArgs, 'maxFiles', 50000, { integer: true, max: 50000 });
  const scan = await scanFilesRecursive(inputDir, {
    maxFiles,
    excludeDirs: [path.basename(outputDir)],
  });
  const allFiles = scan.files;
  const fontFiles = allFiles.filter((file) => FONT_EXTENSIONS.has(path.extname(file).toLowerCase()));
  const unsupportedFileSummary = buildUnsupportedFileSummary(allFiles);
  const unsupportedFileDecision = buildUnsupportedFileDecision(unsupportedFileSummary);
  const inputCountGuide = buildInputCountGuide({
    appliesToTool: 'organize_font_directory',
    scannedFileCount: allFiles.length,
    supportedFontCount: fontFiles.length,
    unsupportedFileCount: unsupportedFileSummary.total,
    maxFiles,
    maxFilesHit: scan.truncated,
    supportedFieldName: 'supportedFontCount',
    unsupportedFieldName: 'unsupportedFileCount',
    unsupportedFileSummary,
    unsupportedFileDecision,
  });
  const layout = buildDirectoryLayoutSummary({ inputDir, allFiles, fontFiles });
  const entries = [];

  for (const file of fontFiles) {
    if (options.parseFonts) {
      entries.push({
        ...(await inspectInputFontFile(file)),
        file,
        metadataParsed: true,
      });
    } else {
      const stat = await fs.stat(file);
      entries.push({
        path: toRelativeWorkspacePath(file),
        extension: path.extname(file).toLowerCase(),
        sizeBytes: stat.size,
        status: 'not-parsed',
        container: null,
        glyphCount: null,
        identity: null,
        identityBasis: null,
        identityKey: null,
        metadataParsed: false,
        file,
      });
    }
  }

  const validEntries = entries.filter((entry) => entry.status !== 'invalid');
  const invalidEntries = entries.filter((entry) => entry.status === 'invalid');
  const effectiveDedupeMode = options.parseFonts ? options.batchDedupeMode : options.batchDedupeMode === 'none' ? 'none' : 'same-path';
  const dedupe = dedupeOrganizationEntries(validEntries, effectiveDedupeMode);
  const identityKeyMissingCount = options.parseFonts && effectiveDedupeMode === 'font-identity'
    ? validEntries.filter((entry) => !entry.identityKey).length
    : 0;
  const pathFallbackCount = options.batchDedupeMode === 'font-identity'
    ? options.parseFonts ? identityKeyMissingCount : validEntries.length
    : 0;
  const dedupeDecisionSummary = buildDedupeDecisionSummary({
    appliesToTool: 'organize_font_directory',
    requestedMode: options.batchDedupeMode,
    effectiveMode: effectiveDedupeMode,
    inputFontCount: validEntries.length,
    deduplicatedCount: dedupe.selected.length,
    skippedDuplicateCount: dedupe.duplicates.length,
    identityKeyMissingCount,
    pathFallbackCount,
    dedupeLimitedByParsing: !options.parseFonts && options.batchDedupeMode === 'font-identity',
    identityEvidenceItems: options.batchDedupeMode === 'none'
      ? []
      : validEntries.map((entry) => ({ identityKey: getOrganizationDedupeKey(entry, effectiveDedupeMode) })),
    duplicateEvidenceItems: dedupe.duplicates,
  });
  const selectedEntries = [
    ...dedupe.selected,
    ...(options.copyInvalidFonts ? invalidEntries : []),
  ].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

  const plan = [];
  const errors = [];
  const usedTargets = new Set();
  let copiedCount = 0;
  let skippedTargetExists = 0;

  for (const duplicate of dedupe.duplicates) {
    plan.push({
      source: duplicate.path,
      action: 'skipped-duplicate',
      reason: 'deduped by effective batchDedupeMode',
      duplicateOf: duplicate.duplicateOf,
      identityKey: duplicate.identityKey,
    });
  }

  if (!options.copyInvalidFonts) {
    for (const entry of invalidEntries) {
      plan.push({
        source: entry.path,
        action: 'skipped-invalid',
        reason: entry.error || 'font metadata could not be parsed',
      });
    }
  }

  for (const entry of selectedEntries) {
    try {
      const groupName = sanitizeDirName(await resolveOrganizationGroupName({
        entry,
        inputDir,
        groupingMode: options.batchGroupBy,
      })) || 'Fonts';
      const target = await chooseOrganizationTargetPath({
        outputDir,
        groupName,
        entry,
        namingMode: options.batchNamingMode,
        usedTargets,
        overwriteExisting: options.overwriteExisting,
      });
      const targetExists = await fileExists(target.targetPath);
      const action = options.dryRun
        ? targetExists && !options.overwriteExisting ? 'would-skip-target-exists' : 'would-copy'
        : targetExists && !options.overwriteExisting ? 'skipped-target-exists' : 'copied';
      const planItem = {
        source: entry.path,
        target: target.relativeTarget,
        targetPath: toRelativeWorkspacePath(target.targetPath),
        groupName,
        action,
        status: entry.status,
        identityKey: entry.identityKey,
        glyphCount: entry.glyphCount,
      };
      plan.push(planItem);

      if (options.dryRun || action === 'would-skip-target-exists') {
        continue;
      }
      if (action === 'skipped-target-exists') {
        skippedTargetExists++;
        continue;
      }
      await fs.mkdir(path.dirname(target.targetPath), { recursive: true });
      await fs.copyFile(entry.file, target.targetPath);
      copiedCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ file: entry.path, error: message });
      plan.push({
        source: entry.path,
        action: 'error',
        reason: message,
      });
    }
  }

  const inputDirRelative = toRelativeWorkspacePath(inputDir);
  const outputDirRelative = toRelativeWorkspacePath(outputDir);
  const planActionSummary = buildPlanActionSummary(plan);
  const skippedCount = plan.filter((item) => item.action.startsWith('skipped') || item.action === 'would-skip-target-exists').length;
  const outputDirInsideInput = isInside(inputDir, outputDir);
  const sourceDestructive = false;
  const writesOutputTree = !options.dryRun;
  const writesSourceTree = writesOutputTree && outputDirInsideInput;
  const mayOverwriteOutputTree = !options.dryRun && options.overwriteExisting;
  const operationMode = options.dryRun ? 'plan-only' : 'copy-only';
  const writeScope = !writesOutputTree
    ? 'none'
    : outputDirInsideInput ? 'output-tree-inside-input-tree' : 'output-tree-only';
  const overwriteScope = !mayOverwriteOutputTree
    ? 'none'
    : outputDirInsideInput ? 'output-tree-inside-input-tree' : 'output-tree-only';
  const summary = options.dryRun
    ? 'Plan-only dry run; no files are written and source files are only scanned.'
    : outputDirInsideInput
      ? 'Copy-only organization; outputDir is inside or equal to inputDir, so the input tree receives organized copies, but source font files are never moved, deleted, or rewritten.'
      : mayOverwriteOutputTree
        ? 'Copy-only organization; selected fonts are copied into outputDir and existing output files may be replaced, but source files are never moved, deleted, or rewritten.'
        : 'Copy-only organization; selected fonts are copied into outputDir without replacing existing output files, and source files are never moved, deleted, or rewritten.';
  const safetySummary = {
    operationMode,
    sourceDestructive,
    sourceFilesPreserved: true,
    writesSourceTree,
    writesOutputTree,
    outputTreeInsideInputTree: outputDirInsideInput,
    mayOverwriteOutputTree,
    writeScope,
    overwriteScope,
    summary,
  };
  const sourceSafetyDecision = buildSourceSafetyDecision({
    appliesToTool: 'organize_font_directory',
    safetySummary,
    inputPath: inputDirRelative,
    outputPath: outputDirRelative,
    outputPathRole: 'outputDir',
    requiresOutputAudit: false,
  });
  const warnings = buildOrganizationWarnings({
    dryRun: options.dryRun,
    overwriteExisting: options.overwriteExisting,
    inputScanTruncated: scan.truncated,
    maxFiles,
    parseFonts: options.parseFonts,
    unsupportedFileCount: layout.unsupportedFileCount,
    invalidFontCount: invalidEntries.length,
    copyInvalidFonts: options.copyInvalidFonts,
    skippedDuplicateCount: dedupe.duplicates.length,
    layoutKind: layout.layoutKind,
    outputDirInsideInput,
  });
  const recommendedBatchPreviewArgs = buildSuggestedBatchPreviewArgs({
    inputDir: inputDirRelative,
    recommendedBatchOptions: layout.recommendedBatchOptions,
    extraArgs: { maxFiles },
  });
  const recommendedNextActions = buildOrganizationNextActions({
    options,
    inputDirRelative,
    outputDirRelative,
    maxFiles,
    maxFilesHit: scan.truncated,
    layout,
    warnings,
    errorCount: errors.length,
    selectedFontCount: selectedEntries.length,
    copiedCount,
  });
  const organizationDecision = buildOrganizationDecision({
    options,
    inputDirRelative,
    outputDirRelative,
    maxFiles,
    maxFilesHit: scan.truncated,
    layout,
    invalidFontCount: invalidEntries.length,
    selectedFontCount: selectedEntries.length,
    copiedCount,
    errorCount: errors.length,
    recommendedBatchPreviewArgs,
  });
  const batchPolicySummary = buildBatchPolicySummary({
    appliesToTool: 'organize_font_directory',
    workflowPreset: options.workflowPreset,
    values: {
      batchGroupBy: options.batchGroupBy,
      batchNamingMode: options.batchNamingMode,
      batchDedupeMode: options.batchDedupeMode,
    },
    effectiveValues: {
      batchDedupeMode: effectiveDedupeMode,
    },
    availableInspectFields: [
      'layout',
      'recommendedBatchPreviewArgs',
      'batchGroupBy',
      'batchNamingMode',
      'batchDedupeMode',
      'parsedFontMetadata',
      'invalidFontCount',
      'effectiveBatchDedupeMode',
      'dedupeLimitedByParsing',
      'skippedDuplicates',
      'dedupeDecisionSummary',
      'plan',
      'organizationWarnings',
      'planActionSummary',
    ],
    notes: !options.parseFonts && options.batchDedupeMode === 'font-identity'
      ? ['Identity dedupe is limited because parseFonts is false; rerun with parseFonts true before trusting semantic dedupe.']
      : [],
  });
  const configurationTrace = buildConfigurationTrace({
    appliesToTool: 'organize_font_directory',
    workflowPreset: options.workflowPreset,
    rawDefaults: RAW_ORGANIZATION_OPTION_DEFAULTS,
    presetDefaults: presetContext.presetDefaults,
    explicitArgs: presetContext.explicitArgs,
    effectiveValues: {
      dryRun: options.dryRun,
      includePlan: options.includePlan,
      parseFonts: options.parseFonts,
      batchGroupBy: options.batchGroupBy,
      batchNamingMode: options.batchNamingMode,
      batchDedupeMode: options.batchDedupeMode,
      copyInvalidFonts: options.copyInvalidFonts,
      overwriteExisting: options.overwriteExisting,
    },
  });
  const directoryWorkflowSummary = buildDirectoryWorkflowSummary({
    options,
    inputDirRelative,
    layout,
    safetySummary,
    organizationDecision,
    recommendedBatchPreviewArgs,
    recommendedNextActions,
    warnings,
    outputDirRelative,
    effectiveDedupeMode,
  });
  const layoutDecision = buildLayoutDecision({
    layout,
    safetySummary,
    organizationDecision,
    directoryWorkflowSummary,
  });
  const organizationManifestPath = options.dryRun
    ? null
    : toRelativeWorkspacePath(path.join(outputDir, ORGANIZATION_MANIFEST_FILE_NAME));
  const stagingDirectoryDecision = buildStagingDirectoryDecision({
    options,
    outputDirRelative,
    layout,
    copiedCount,
    skippedTargetExists,
    selectedFontCount: selectedEntries.length,
    errorCount: errors.length,
    organizationManifestPath,
    safePreviewArgs: organizationDecision.safeBatchPreviewArgs || buildSuggestedBatchPreviewArgs({
      inputDir: outputDirRelative,
      recommendedBatchOptions: layout.recommendedBatchOptions,
    }),
  });

  const result = {
    ok: errors.length === 0,
    workflowPreset: options.workflowPreset,
    dryRun: options.dryRun,
    inputDir: inputDirRelative,
    outputDir: outputDirRelative,
    maxFiles,
    maxFilesHit: scan.truncated,
    scannedFileCount: allFiles.length,
    supportedFontCount: fontFiles.length,
    inputCountGuide,
    parsedFontMetadata: options.parseFonts,
    unparsedFontCount: options.parseFonts ? 0 : entries.length,
    validFontCount: options.parseFonts ? validEntries.length : null,
    invalidFontCount: options.parseFonts ? invalidEntries.length : null,
    unsupportedFileCount: layout.unsupportedFileCount,
    unsupportedFileDecision,
    unsupportedFileSummary,
    deduplicatedCount: dedupe.selected.length,
    skippedDuplicates: dedupe.duplicates.length,
    dedupeDecisionSummary,
    selectedFontCount: selectedEntries.length,
    copiedCount,
    skippedTargetExists,
    skippedCount,
    errorCount: errors.length,
    errors,
    safetySummary,
    sourceSafetyDecision,
    sourceDestructive,
    writesSourceTree,
    writesOutputTree,
    outputTreeInsideInputTree: safetySummary.outputTreeInsideInputTree,
    mayOverwriteOutputTree,
    sourceFilesPreserved: true,
    operationMode,
    parseFonts: options.parseFonts,
    requestedBatchDedupeMode: options.batchDedupeMode,
    effectiveBatchDedupeMode: effectiveDedupeMode,
    dedupeLimitedByParsing: !options.parseFonts && options.batchDedupeMode === 'font-identity',
    batchGroupBy: options.batchGroupBy,
    batchNamingMode: options.batchNamingMode,
    batchDedupeMode: options.batchDedupeMode,
    configurationTrace,
    batchPolicySummary,
    copyInvalidFonts: options.copyInvalidFonts,
    overwriteExisting: options.overwriteExisting,
    layout,
    recommendedBatchOptions: layout.recommendedBatchOptions,
    recommendedBatchPreviewArgs,
    recommendedNextActionCount: recommendedNextActions.length,
    recommendedNextActions,
    layoutDecision,
    stagingDirectoryDecision,
    organizationDecision,
    directoryWorkflowSummary,
    sourceLayoutMismatchSummary: directoryWorkflowSummary.sourceLayoutMismatchSummary,
    organizationWarningCount: warnings.length,
    organizationWarnings: warnings,
    planActionSummary,
    planIncluded: options.includePlan,
    ...(options.includePlan ? { plan } : {}),
  };

  if (!options.dryRun) {
    await fs.mkdir(outputDir, { recursive: true });
    const manifest = buildOrganizationManifest({
      inputDirRelative,
      outputDirRelative,
      options,
      result: {
        ...result,
        plan,
      },
    });
    await writeOrganizationManifest(outputDir, manifest);
    result.organizationManifestPath = organizationManifestPath;
    result.organizationManifestWritten = true;
  } else {
    result.organizationManifestWritten = false;
  }

  return result;
}
