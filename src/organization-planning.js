import path from 'node:path';
import { fileExists } from './path-utils.js';
import {
  appendCollisionSuffix,
  buildSourceSuffix,
  compareBatchDedupeRepresentative,
  resolveBatchFamilyDirName,
  sanitizeDirName,
} from './batch.js';
import { uniqueStrings } from './guidance-workflows.js';
import { buildSuggestedBatchPreviewArgs } from './suggested-args.js';

export function getOrganizationDedupeKey(entry, dedupeMode) {
  if (dedupeMode === 'none') return `unique:${entry.file}`;
  const ext = path.extname(entry.file).toLowerCase();
  if (dedupeMode === 'same-path') return `path:${entry.file.slice(0, -ext.length)}`;
  return entry.identityKey || `path:${entry.file.slice(0, -ext.length)}`;
}

export function dedupeOrganizationEntries(entries, dedupeMode) {
  if (dedupeMode === 'none') {
    return {
      selected: [...entries],
      duplicates: [],
    };
  }

  const byKey = new Map();
  const duplicates = [];
  for (const entry of entries) {
    const key = getOrganizationDedupeKey(entry, dedupeMode);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
      continue;
    }
    if (compareBatchDedupeRepresentative(entry.file, existing.file) < 0) {
      duplicates.push({
        path: existing.path,
        duplicateOf: entry.path,
        identityKey: key,
      });
      byKey.set(key, entry);
    } else {
      duplicates.push({
        path: entry.path,
        duplicateOf: existing.path,
        identityKey: key,
      });
    }
  }

  return {
    selected: [...byKey.values()].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true })),
    duplicates,
  };
}

export function buildOrganizationDecision({
  options,
  inputDirRelative,
  outputDirRelative,
  maxFiles,
  maxFilesHit,
  layout,
  invalidFontCount,
  selectedFontCount,
  copiedCount,
  errorCount,
  recommendedBatchPreviewArgs,
}) {
  const base = {
    sourceDestructive: false,
    writesBeforeReview: false,
    copyOnlyStagingRequired: false,
  };
  const make = (decision) => ({ ...base, ...decision });

  if (maxFilesHit) {
    return make({
      route: 'rerun-with-higher-maxFiles',
      preferredNextActionId: 'rerun-with-higher-maxFiles',
      nextTool: 'organize_font_directory',
      reason: 'The source scan was truncated, so layout and copy decisions may be incomplete.',
    });
  }

  if (!options.parseFonts) {
    return make({
      route: 'rerun-with-font-parsing',
      preferredNextActionId: 'rerun-with-font-parsing',
      nextTool: 'organize_font_directory',
      reason: 'This was a structure-only pass; rerun with font parsing before relying on invalid-font counts, identity dedupe, or metadata family grouping.',
    });
  }

  if (errorCount > 0) {
    return make({
      route: 'inspect-organization-errors',
      preferredNextActionId: 'inspect-organization-errors',
      nextTool: 'organize_font_directory',
      reason: 'The organization run recorded per-file errors that need inspection before continuing.',
    });
  }

  if (selectedFontCount === 0) {
    if (invalidFontCount > 0 && !options.copyInvalidFonts) {
      return make({
        route: 'decide-on-invalid-fonts',
        preferredNextActionId: 'decide-on-invalid-fonts',
        nextTool: 'organize_font_directory',
        reason: 'Only invalid supported-extension files were available for the current policy; decide whether preserving broken font-like files is intentional.',
      });
    }
    return make({
      route: 'no-copyable-fonts',
      preferredNextActionId: null,
      nextTool: null,
      reason: layout.layoutKind === 'empty'
        ? 'No supported font files were found in the scanned input.'
        : 'No fonts were selected for the current organization policy.',
    });
  }

  if (!options.dryRun) {
    if (copiedCount > 0) {
      return make({
        route: 'preview-organized-output',
        preferredNextActionId: 'preview-batch-split-organized-output',
        nextTool: 'split_font_batch',
        nextInputDir: outputDirRelative,
        safeBatchPreviewArgs: buildSuggestedBatchPreviewArgs({
          inputDir: outputDirRelative,
          recommendedBatchOptions: layout.recommendedBatchOptions,
          extraArgs: { maxFiles },
        }),
        reason: 'A copy-only staging directory was written; inspect or preview that organized output before splitting.',
      });
    }
    return make({
      route: 'review-existing-targets',
      preferredNextActionId: 'inspect-organized-output',
      nextTool: 'inspect_font_inputs',
      nextInputDir: outputDirRelative,
      reason: 'No files were copied by this write run, likely because output targets already existed or the plan selected no copy actions.',
    });
  }

  if (layout.layoutKind === 'mixed') {
    return make({
      route: 'review-mixed-layout',
      preferredNextActionId: 'review-mixed-layout-grouping',
      nextTool: 'split_font_batch',
      nextInputDir: inputDirRelative,
      safeBatchPreviewArgs: recommendedBatchPreviewArgs,
      copyOnlyStagingRequired: 'optional',
      optionalStagingActionId: 'copy-organized-staging-directory',
      reason: 'Fonts exist both at the input root and inside subdirectories; review grouping before direct splitting or staging.',
    });
  }

  return make({
    route: 'preview-original-layout',
    preferredNextActionId: 'preview-batch-split-original-layout',
    nextTool: 'split_font_batch',
    nextInputDir: inputDirRelative,
    safeBatchPreviewArgs: recommendedBatchPreviewArgs,
    copyOnlyStagingRequired: 'optional',
    optionalStagingActionId: 'copy-organized-staging-directory',
    reason: 'The current layout has copyable fonts; preview split_font_batch on the original input before any real batch write, and only copy a staging directory if the user wants one.',
  });
}

export function buildSourceLayoutDecisionChecklist({
  options,
  safetySummary,
  organizationDecision,
  directStatus,
  directReason,
  recommendedBatchPreviewArgs,
  stagingNeed,
  stagingReason,
  outputDirRelative,
  warningCodes,
}) {
  const sortedWarningCodes = [...warningCodes].sort();
  const currentCallSourceSafe = safetySummary.sourceDestructive === false
    && safetySummary.sourceFilesPreserved === true;
  const directPreviewStatus = directStatus === 'safe-preview-available'
    ? 'ready'
    : directStatus === 'review-required'
      ? 'review-safe-preview'
      : directStatus === 'use-organized-output'
        ? 'use-organized-output'
        : directStatus === 'not-applicable'
          ? 'not-applicable'
          : 'blocked-until-route-resolution';
  const copyOnlyStagingStatus = stagingNeed === 'not-required-for-splitting'
    ? 'not-required'
    : stagingNeed === 'optional'
      ? 'optional'
      : stagingNeed === 'already-written-copy-only'
        ? 'already-written'
        : stagingNeed === 'defer-until-review'
          ? 'defer-until-route-resolution'
          : 'not-applicable';
  const planDetailStatus = options.includePlan
    ? 'visible'
    : options.dryRun
      ? 'summary-only-rerun-before-copy'
      : 'summary-only-after-copy';
  const splitWriteReadiness = directStatus === 'not-applicable'
    ? 'not-applicable'
    : directStatus === 'use-organized-output'
      ? 'requires-organized-output-safe-preview'
      : directPreviewStatus === 'blocked-until-route-resolution'
        ? 'blocked-until-route-resolution'
        : 'requires-original-input-safe-preview';
  const copyOnlyStagingReadiness = !options.dryRun
    ? 'already-wrote-copy-only-output'
    : copyOnlyStagingStatus === 'not-applicable'
      ? 'not-applicable'
      : copyOnlyStagingStatus === 'not-required'
        ? 'not-required-for-splitting'
        : copyOnlyStagingStatus === 'defer-until-route-resolution'
          ? 'blocked-until-route-resolution'
          : !options.includePlan
            ? 'rerun-with-includePlan-before-copy'
            : 'ready-after-plan-review';
  const directPreviewBlocked = directPreviewStatus === 'blocked-until-route-resolution';
  const directPreviewCanRun = directStatus !== 'not-applicable'
    && directStatus !== 'use-organized-output'
    && !directPreviewBlocked;
  const copyOnlyStagingSafePreviewArgs = stagingNeed === 'already-written-copy-only'
    ? organizationDecision.safeBatchPreviewArgs || null
    : null;

  return {
    summaryType: 'source-layout-decision-checklist',
    primaryRoute: organizationDecision.route,
    preferredNextActionId: organizationDecision.preferredNextActionId,
    splitWriteReadiness,
    copyOnlyStagingReadiness,
    items: [
      {
        id: 'source-safety-preserved',
        status: currentCallSourceSafe ? 'pass' : 'action-required',
        answer: currentCallSourceSafe
          ? 'The current organizer call preserves source font files.'
          : 'The current organizer safety fields must be reviewed before continuing.',
        requiredBeforeWrite: true,
        evidenceFields: [
          'safetySummary.sourceDestructive',
          'safetySummary.sourceFilesPreserved',
          'sourceLayoutMismatchSummary.copyOnlyStaging.sourceFilesPreserved',
        ],
      },
      {
        id: 'direct-original-input-preview',
        status: directPreviewStatus,
        answer: directReason,
        requiredBeforeSplitWrite: directPreviewCanRun,
        nextTool: directPreviewCanRun ? 'split_font_batch' : directPreviewBlocked ? organizationDecision.nextTool : null,
        suggestedArgsField: directPreviewCanRun
          ? 'sourceLayoutMismatchSummary.directOriginalInput.safePreviewArgs'
          : null,
        evidenceFields: [
          'sourceLayoutMismatchSummary.directOriginalInput.status',
          'recommendedBatchPreviewArgs',
          'organizationDecision',
        ],
        safePreviewArgs: directPreviewCanRun ? recommendedBatchPreviewArgs : null,
      },
      {
        id: 'copy-only-staging',
        status: copyOnlyStagingStatus,
        answer: stagingReason,
        requiredBeforeSplitWrite: false,
        nextTool: copyOnlyStagingStatus === 'optional'
          ? 'organize_font_directory'
          : copyOnlyStagingSafePreviewArgs
            ? 'split_font_batch'
            : null,
        suggestedArgsField: copyOnlyStagingSafePreviewArgs
          ? 'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs'
          : null,
        outputDir: outputDirRelative,
        sourceDestructive: false,
        safePreviewArgs: copyOnlyStagingSafePreviewArgs,
        evidenceFields: [
          'sourceLayoutMismatchSummary.copyOnlyStaging.need',
          'sourceLayoutMismatchSummary.copyOnlyStaging.outputDir',
          'sourceLayoutMismatchSummary.copyOnlyStaging.sourceDestructive',
          'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs',
        ],
      },
      {
        id: 'plan-detail-before-copy',
        status: planDetailStatus,
        answer: options.includePlan
          ? 'Detailed plan[] is available for copy target review.'
          : options.dryRun
            ? 'Only summary fields are visible; rerun with includePlan:true before a copy-only write when exact targets matter.'
            : 'This copy-only call already ran; use planActionSummary, copiedCount, errors, and organizationManifestPath as write evidence.',
        requiredBeforeCopyWrite: options.dryRun && !options.includePlan,
        nextTool: options.dryRun && !options.includePlan ? 'organize_font_directory' : null,
        evidenceFields: [
          'directoryWorkflowSummary.planVisibility',
          'planActionSummary',
          'plan',
        ],
      },
      {
        id: 'warnings-reviewed',
        status: sortedWarningCodes.length === 0 ? 'clear' : 'review-required',
        answer: sortedWarningCodes.length === 0
          ? 'No organization warning codes were emitted.'
          : 'Review organizationWarnings before relying on the preview, copy plan, or write result.',
        requiredBeforeWrite: sortedWarningCodes.length > 0,
        warningCodes: sortedWarningCodes,
        evidenceFields: ['organizationWarnings'],
      },
      {
        id: 'post-write-output-audit',
        status: 'required-after-reviewed-write',
        answer: 'After any reviewed split_font_batch write, inspect the output tree before reporting structural success.',
        requiredAfterSplitWrite: true,
        nextTool: 'inspect_split_output',
        evidenceFields: [
          'outputRoleDecision',
          'outputStructureDecision',
          'auditStatus',
          'auditPassed',
          'structureSummary',
          'maxFilesHit',
        ],
      },
    ],
  };
}

export function buildSourceLayoutMismatchSummary({
  options,
  layout,
  safetySummary,
  organizationDecision,
  recommendedBatchPreviewArgs,
  outputDirRelative,
  effectiveDedupeMode,
  warnings,
}) {
  const warningCodes = new Set((warnings || []).map((warning) => warning.code));
  const requestedBatchGroupBy = options.batchGroupBy || 'auto';
  const recommendedBatchGroupBy = layout.recommendedBatchOptions?.batchGroupBy || null;
  const effectiveBatchGroupByForReview = requestedBatchGroupBy === 'auto'
    ? recommendedBatchGroupBy
    : requestedBatchGroupBy;
  const requestedGroupingMatchesRecommendation = requestedBatchGroupBy === 'auto'
    || requestedBatchGroupBy === recommendedBatchGroupBy;

  const mismatchReasons = [];
  const reviewReasons = [];
  const layoutNotes = [];

  if (layout.layoutKind === 'mixed') {
    mismatchReasons.push('mixed-root-and-nested-fonts');
    reviewReasons.push('mixed-layout-review-required');
    layoutNotes.push('Fonts were found both at the input root and inside nested directories.');
  }
  if (!requestedGroupingMatchesRecommendation) {
    mismatchReasons.push('requested-grouping-differs-from-detected-layout');
    reviewReasons.push('requested-grouping-review-required');
  }
  if (layout.layoutKind === 'flat') {
    layoutNotes.push('Flat sources have no source-directory family signal, so metadata-family grouping is the usual recommendation.');
  }
  if (!options.parseFonts && effectiveBatchGroupByForReview === 'font-family') {
    reviewReasons.push('metadata-grouping-not-parsed');
  }
  if (warningCodes.has('input-scan-truncated')) {
    reviewReasons.push('input-scan-truncated');
  }
  if (warningCodes.has('invalid-fonts-skipped')) {
    reviewReasons.push('invalid-fonts-skipped');
  }
  if (warningCodes.has('duplicate-fonts-skipped')) {
    reviewReasons.push('duplicates-skipped');
  }
  if (warningCodes.has('output-inside-input')) {
    reviewReasons.push('output-tree-inside-input-tree');
  }

  const mismatchDetected = mismatchReasons.length > 0;
  const sourceLayoutMatchesRecommendedGrouping = !mismatchDetected
    && requestedGroupingMatchesRecommendation
    && layout.layoutKind !== 'mixed'
    && layout.layoutKind !== 'empty';
  const confidence = warningCodes.has('input-scan-truncated')
    ? 'incomplete'
    : !options.parseFonts && effectiveBatchGroupByForReview === 'font-family'
      ? 'provisional-until-font-parsing'
      : mismatchDetected ? 'review-required' : 'high';

  let directStatus = 'safe-preview-available';
  let directReason = 'Preview split_font_batch on the original input before any reviewed write.';
  if (layout.layoutKind === 'empty' || organizationDecision.route === 'no-copyable-fonts') {
    directStatus = 'not-applicable';
    directReason = 'No copyable supported fonts are available for direct batch preview.';
  } else if (organizationDecision.route === 'rerun-with-font-parsing') {
    directStatus = 'available-but-rerun-organization-first';
    directReason = 'Metadata-sensitive grouping or dedupe is provisional until organize_font_directory is rerun with font parsing.';
  } else if (organizationDecision.route === 'decide-on-invalid-fonts') {
    directStatus = 'available-after-invalid-font-decision';
    directReason = 'Decide whether invalid supported-extension files should be preserved before treating direct preview as complete.';
  } else if (organizationDecision.route === 'review-mixed-layout') {
    directStatus = 'review-required';
    directReason = 'Mixed root and nested fonts can make direct grouping surprising; review the safe-preview plan before writing.';
  } else if (organizationDecision.route === 'preview-organized-output') {
    directStatus = 'use-organized-output';
    directReason = 'A copy-only staging directory was written; preview that organized output before splitting.';
  } else if (mismatchDetected) {
    directStatus = 'review-required';
    directReason = 'The requested grouping differs from the detected layout recommendation; review the safe-preview plan before writing.';
  }

  let stagingNeed = 'optional';
  let stagingReason = 'Copy-only staging is optional; use it only when the user wants a cleaner source-like directory before splitting.';
  if (layout.layoutKind === 'empty' || organizationDecision.route === 'no-copyable-fonts') {
    stagingNeed = 'not-applicable';
    stagingReason = 'There are no copyable supported fonts for a staging directory.';
  } else if (!options.dryRun && organizationDecision.route === 'preview-organized-output') {
    stagingNeed = 'already-written-copy-only';
    stagingReason = 'This call already copied selected fonts into outputDir; inspect or batch-preview that staged output next.';
  } else if (organizationDecision.route === 'rerun-with-font-parsing' || organizationDecision.route === 'decide-on-invalid-fonts') {
    stagingNeed = 'defer-until-review';
    stagingReason = 'Resolve the preferred organization decision before running a copy-only staging write.';
  } else if (!mismatchDetected && layout.layoutKind !== 'mixed') {
    stagingNeed = 'not-required-for-splitting';
    stagingReason = 'The original input can be previewed directly; staging is only for users who want a cleaner copied directory.';
  }
  const copyOnlyStagingSafePreviewArgs = stagingNeed === 'already-written-copy-only'
    ? organizationDecision.safeBatchPreviewArgs || null
    : null;

  const decisionChecklist = buildSourceLayoutDecisionChecklist({
    options,
    safetySummary,
    organizationDecision,
    directStatus,
    directReason,
    recommendedBatchPreviewArgs,
    stagingNeed,
    stagingReason,
    outputDirRelative,
    warningCodes,
  });

  return {
    summaryType: 'source-layout-mismatch',
    appliesToTool: 'organize_font_directory',
    currentLayoutKind: layout.layoutKind,
    requestedBatchGroupBy,
    recommendedBatchGroupBy,
    effectiveBatchGroupByForReview,
    requestedGroupingMatchesRecommendation,
    sourceLayoutMatchesRecommendedGrouping,
    mismatchDetected,
    mismatchReasons,
    reviewRecommended: reviewReasons.length > 0,
    reviewReasons: uniqueStrings(reviewReasons),
    layoutNotes,
    confidence,
    directOriginalInput: {
      status: directStatus,
      previewTool: 'split_font_batch',
      previewRequiredBeforeWrite: true,
      safePreviewArgs: directStatus === 'use-organized-output' ? null : recommendedBatchPreviewArgs,
      reason: directReason,
    },
    copyOnlyStaging: {
      need: stagingNeed,
      outputDir: outputDirRelative,
      writeBehavior: options.dryRun ? 'no-write-until-dryRun-false' : 'copy-only-outputDir',
      sourceDestructive: false,
      sourceFilesPreserved: true,
      sourceFilesMovedDeletedOrRewritten: false,
      writesSourceTree: safetySummary.writesSourceTree,
      outputTreeInsideInputTree: safetySummary.outputTreeInsideInputTree,
      mayOverwriteOutputTree: safetySummary.mayOverwriteOutputTree,
      nextActionId: organizationDecision.optionalStagingActionId || (
        organizationDecision.route === 'preview-organized-output'
          ? 'preview-batch-split-organized-output'
          : null
      ),
      suggestedArgsField: copyOnlyStagingSafePreviewArgs
        ? 'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs'
        : null,
      safePreviewArgs: copyOnlyStagingSafePreviewArgs,
      reason: stagingReason,
    },
    decisionChecklist,
    policySnapshot: {
      requestedBatchDedupeMode: options.batchDedupeMode,
      effectiveBatchDedupeMode: effectiveDedupeMode,
      batchNamingMode: options.batchNamingMode,
    },
    successCriteria: [
      'Treat this summary as routing guidance, not proof of success.',
      'Before writing split output, run split_font_batch with safe-preview arguments and inspect planned paths, warnings, maxFilesHit, and errors.',
      'Before copy-only staging, review planActionSummary and plan[] when available; if plan[] was omitted, rerun the organization dry-run with includePlan:true.',
      'After any reviewed batch write, run inspect_split_output and require outputRoleDecision.auditAppliesToThisDirectory not false, outputStructureDecision.status pass, auditStatus pass, auditPassed true, structureSummary.conforms true, and maxFilesHit false.',
    ],
    nonIntuitiveBehavior: [
      'copyOnlyStaging is never source-destructive: dryRun:false copies selected fonts to outputDir and does not move, delete, or rewrite source fonts.',
      'A direct original-input batch preview is usually enough when the user only wants split output; staging is for a cleaner copied source layout.',
      'requestedGroupingMatchesRecommendation only compares policy shape; it does not prove that every font family name or output path is correct.',
    ],
  };
}

export async function resolveOrganizationGroupName({ entry, inputDir, groupingMode }) {
  if (entry.metadataParsed === false) {
    const relativeToInput = path.relative(inputDir, entry.file);
    const segments = relativeToInput.split(path.sep).filter(Boolean);
    if (groupingMode === 'font-family') return path.basename(entry.file, path.extname(entry.file));
    return segments.length > 1 ? segments[0] : path.basename(entry.file, path.extname(entry.file));
  }
  if (entry.status === 'invalid') {
    const relativeToInput = path.relative(inputDir, entry.file);
    const segments = relativeToInput.split(path.sep).filter(Boolean);
    return segments.length > 1 ? segments[0] : path.basename(entry.file, path.extname(entry.file));
  }
  return resolveBatchFamilyDirName({ file: entry.file, inputDir, groupingMode });
}

function normalizeTargetBaseName(file) {
  return sanitizeDirName(path.basename(file, path.extname(file))) || 'font';
}

export async function chooseOrganizationTargetPath({
  outputDir,
  groupName,
  entry,
  namingMode,
  usedTargets,
  overwriteExisting,
}) {
  const extension = path.extname(entry.file);
  const baseName = normalizeTargetBaseName(entry.file);
  const safeGroupName = sanitizeDirName(groupName) || 'Fonts';
  const targetDir = path.join(outputDir, safeGroupName);
  const inputRelativePath = entry.path;
  const makeTarget = (name) => {
    const targetPath = path.join(targetDir, name);
    const relativeTarget = path.relative(outputDir, targetPath).replaceAll(path.sep, '/');
    return { targetPath, relativeTarget };
  };

  if (namingMode === 'source-suffix') {
    const suffix = buildSourceSuffix(inputRelativePath, extension);
    const target = makeTarget(`${sanitizeDirName(`${baseName}--${suffix}`)}${extension}`);
    usedTargets.add(target.relativeTarget);
    return target;
  }

  if (namingMode === 'plain') {
    const target = makeTarget(`${baseName}${extension}`);
    usedTargets.add(target.relativeTarget);
    return target;
  }

  let index = 0;
  while (true) {
    const candidate = `${appendCollisionSuffix(baseName, index)}${extension}`;
    const target = makeTarget(candidate);
    const exists = await fileExists(target.targetPath);
    if (!usedTargets.has(target.relativeTarget) && (overwriteExisting || !exists)) {
      usedTargets.add(target.relativeTarget);
      return target;
    }
    index++;
  }
}
