export function buildWarnings({ decompressedFrom, oversizedKernDetected, oversizedKernStripped, usedFallback, skipped, skipReason }) {
  const warnings = [];
  if (decompressedFrom) warnings.push(`input was decompressed from ${decompressedFrom}`);
  if (oversizedKernDetected && !oversizedKernStripped) warnings.push('oversized kern table detected but preserved');
  if (oversizedKernStripped) warnings.push('oversized kern table stripped before splitting');
  if ((usedFallback || skipped) && skipReason) warnings.push(skipReason);
  return warnings;
}

export function buildSourceSafetyDecision({
  appliesToTool,
  safetySummary,
  inputPath,
  outputPath,
  outputPathRole,
  requiresOutputAudit = false,
}) {
  const sourceSafe = safetySummary.sourceDestructive === false
    && safetySummary.sourceFilesPreserved === true;
  const writesFiles = safetySummary.writesOutputTree === true;
  const outputInsideInput = safetySummary.outputTreeInsideInputTree === true;
  const status = !sourceSafe
    ? 'action-required'
    : !writesFiles
      ? 'source-safe-no-write'
      : outputInsideInput
        ? 'source-safe-output-inside-input-tree'
        : 'source-safe-output-tree-write';
  const shortAnswer = !sourceSafe
    ? 'Review safety fields before continuing; source preservation could not be confirmed.'
    : !writesFiles
      ? 'Source font files are preserved and this call writes no output files.'
      : outputInsideInput
        ? 'Source font files are preserved, but generated output is written inside the input directory tree.'
        : 'Source font files are preserved; writes are limited to the configured output tree.';
  const nonIntuitiveBehavior = [
    'sourceDestructive false means source font files are not moved, deleted, or rewritten.',
  ];
  if (outputInsideInput) {
    if (safetySummary.writesSourceTree === true) {
      nonIntuitiveBehavior.push('writesSourceTree true means generated output is inside the input tree; it does not mean source font files are modified.');
    } else {
      nonIntuitiveBehavior.push('outputTreeInsideInputTree true only identifies the configured output location; when writesFiles is false, no output files are written.');
    }
  }
  if (safetySummary.mayOverwriteOutputTree) {
    nonIntuitiveBehavior.push('mayOverwriteOutputTree applies to generated output paths, not source font files.');
  }

  return {
    summaryType: 'source-safety-decision',
    appliesToTool,
    status,
    shortAnswer,
    operationMode: safetySummary.operationMode,
    sourceDestructive: safetySummary.sourceDestructive,
    sourceFilesPreserved: safetySummary.sourceFilesPreserved,
    sourceFilesMovedDeletedOrRewritten: safetySummary.sourceDestructive === true,
    sourceBackupRequired: false,
    writesFiles,
    writesSourceTree: safetySummary.writesSourceTree,
    writesOutputTree: safetySummary.writesOutputTree,
    outputTreeInsideInputTree: safetySummary.outputTreeInsideInputTree,
    mayOverwriteOutputTree: safetySummary.mayOverwriteOutputTree,
    writeScope: safetySummary.writeScope,
    overwriteScope: safetySummary.overwriteScope,
    inputPath,
    outputPath,
    outputPathRole,
    requiresOutputAudit,
    mustInspectFields: [
      'sourceSafetyDecision',
      'safetySummary',
      'sourceDestructive',
      'sourceFilesPreserved',
      'writesSourceTree',
      'writesOutputTree',
      'outputTreeInsideInputTree',
      'mayOverwriteOutputTree',
    ],
    nonIntuitiveBehavior,
  };
}

export function buildInputInspectionWarnings({ maxFilesHit, maxFiles, includeFiles, invalidFontCount, missingIdentityCount }) {
  const warnings = [];
  const push = (code, message) => warnings.push({ code, message });

  if (maxFilesHit) {
    push('input-scan-truncated', `Input inspection hit maxFiles (${maxFiles}); rerun with a higher maxFiles before treating counts as complete.`);
  }
  if (!includeFiles) {
    push('input-files-omitted', 'Per-font inspection entries are omitted because includeFiles is false.');
  }
  if (invalidFontCount > 0) {
    push('invalid-fonts-found', `${invalidFontCount} supported-extension files could not be parsed as fonts.`);
  }
  if (missingIdentityCount > 0) {
    push('font-identity-missing', `${missingIdentityCount} parseable fonts do not have a usable batch identity key.`);
  }

  return warnings;
}

export function buildOrganizationWarnings({
  dryRun,
  parseFonts,
  overwriteExisting,
  inputScanTruncated,
  maxFiles,
  unsupportedFileCount,
  invalidFontCount,
  copyInvalidFonts,
  skippedDuplicateCount,
  layoutKind,
  outputDirInsideInput,
}) {
  const warnings = [];
  const push = (code, message) => warnings.push({ code, message });

  if (dryRun) {
    push('organization-dry-run', 'dryRun is true; no directories or files were written.');
  } else {
    push('organization-writes-output', 'dryRun is false; this tool may create directories and copy files into outputDir, but it never moves or deletes source files.');
  }
  if (!parseFonts) {
    push('font-parsing-skipped', 'parseFonts is false; the organizer did not read font metadata, so identity dedupe, glyph counts, invalid-font detection, and font-family grouping are limited.');
  }
  if (overwriteExisting) {
    push('output-overwrite-enabled', 'overwriteExisting is true; matching files in outputDir may be replaced, but source files are still not modified.');
  }
  if (inputScanTruncated) {
    push('input-scan-truncated', `Directory organization scan hit maxFiles (${maxFiles}); rerun with a higher maxFiles before treating the plan as complete.`);
  }
  if (unsupportedFileCount > 0) {
    push('unsupported-files-ignored', `${unsupportedFileCount} non-font files were ignored. This organizer only plans supported font extensions.`);
  }
  if (invalidFontCount > 0 && !copyInvalidFonts) {
    push('invalid-fonts-skipped', `${invalidFontCount} supported-extension files could not be parsed as fonts and were skipped. Set copyInvalidFonts true only if preserving broken font-like files is intentional.`);
  }
  if (skippedDuplicateCount > 0) {
    push('duplicate-fonts-skipped', `${skippedDuplicateCount} equivalent fonts were skipped by the selected batchDedupeMode.`);
  }
  if (layoutKind === 'mixed') {
    push('mixed-layout-detected', 'Fonts were found both at the input root and inside nested folders. Review recommendedBatchPreviewArgs before splitting.');
  }
  if (outputDirInsideInput) {
    push('output-inside-input', 'outputDir is inside or equal to inputDir. Future scans should exclude that output directory to avoid reprocessing organized copies.');
  }

  return warnings;
}
