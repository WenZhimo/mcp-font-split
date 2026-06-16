import path from 'node:path';
import {
  DIRECTORY_HANDLING_MODE_BY_ORGANIZATION_ROUTE,
  DIRECTORY_HANDLING_MUST_INSPECT_FIELDS,
  DIRECTORY_HANDLING_SHORT_ANSWER_BY_MODE,
} from './catalogs.js';
import { fileExists } from './path-utils.js';
import {
  appendCollisionSuffix,
  buildSourceSuffix,
  compareBatchDedupeRepresentative,
  resolveBatchFamilyDirName,
  sanitizeDirName,
} from './batch.js';
import {
  attachSourceLayoutDecisionChecklistFields,
  uniqueStrings,
} from './guidance-workflows.js';
import {
  OUTPUT_AUDIT_COMPLETION_CRITERIA,
  OUTPUT_AUDIT_MINIMUM_PASS_TEXT,
  OUTPUT_AUDIT_PASS_CONDITIONS_TEXT,
} from './output-audit-criteria.js';
import {
  buildSuggestedBatchPreviewArgs,
  buildSuggestedOrganizationArgs,
} from './suggested-args.js';

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
      `After any reviewed batch write, run inspect_split_output and require ${OUTPUT_AUDIT_PASS_CONDITIONS_TEXT}.`,
    ],
    nonIntuitiveBehavior: [
      'copyOnlyStaging is never source-destructive: dryRun:false copies selected fonts to outputDir and does not move, delete, or rewrite source fonts.',
      'A direct original-input batch preview is usually enough when the user only wants split output; staging is for a cleaner copied source layout.',
      'requestedGroupingMatchesRecommendation only compares policy shape; it does not prove that every font family name or output path is correct.',
    ],
  };
}

export function buildDirectoryWorkflowSummary({
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
}) {
  const sourceLayoutMismatchSummary = buildSourceLayoutMismatchSummary({
    options,
    layout,
    safetySummary,
    organizationDecision,
    recommendedBatchPreviewArgs,
    outputDirRelative,
    effectiveDedupeMode,
    warnings,
  });
  const warningCodes = new Set(warnings.map((warning) => warning.code));
  const actionById = new Map((recommendedNextActions || []).map((action) => [action.id, action]));
  const reviewReasons = [];
  if (layout.layoutKind === 'mixed') {
    reviewReasons.push('mixed-root-and-nested-fonts');
  }
  if (!options.parseFonts) {
    reviewReasons.push('metadata-not-parsed');
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

  const workflowSteps = [
    {
      id: 'review-source-layout',
      status: 'current-response',
      tool: 'organize_font_directory',
      writesFiles: safetySummary.writesOutputTree,
      sourceDestructive: false,
      inspectFields: [
        'inputCountGuide',
        'sourceSafetyDecision',
        'safetySummary',
        'layout',
        'layoutDecision',
        'layoutDecision.directoryHandling',
        'batchPolicySummary',
        'stagingDirectoryDecision',
        'organizationDecision',
        'directoryWorkflowSummary',
        'sourceLayoutMismatchSummary',
        'sourceLayoutMismatchSummary.decisionChecklist',
        'recommendedBatchPreviewArgs',
        'organizationWarnings',
        'planActionSummary',
        'plan',
      ],
      successCriteria: 'Confirm sourceDestructive false, review layout and organizationWarnings, and decide whether original input or copy-only staging should be previewed next.',
    },
  ];

  const rerunParsingAction = actionById.get('rerun-with-font-parsing');
  if (rerunParsingAction) {
    workflowSteps.push({
      id: 'rerun-with-font-parsing',
      status: organizationDecision.preferredNextActionId === 'rerun-with-font-parsing' ? 'preferred-next' : 'available-next',
      tool: 'organize_font_directory',
      writesFiles: false,
      sourceDestructive: false,
      suggestedArgs: rerunParsingAction.suggestedArgs,
      inspectFields: rerunParsingAction.inspectFields,
      successCriteria: rerunParsingAction.successCriteria,
    });
  }

  const originalPreviewAction = actionById.get('preview-batch-split-original-layout') || actionById.get('review-mixed-layout-grouping');
  if (originalPreviewAction) {
    workflowSteps.push({
      id: 'preview-batch-split-original-layout',
      status: organizationDecision.preferredNextActionId === originalPreviewAction?.id ? 'preferred-next' : 'available-next',
      tool: 'split_font_batch',
      writesFiles: false,
      sourceDestructive: false,
      suggestedArgs: originalPreviewAction.suggestedArgs,
      suggestedArgsField: 'recommendedBatchPreviewArgs',
      inspectFields: originalPreviewAction.inspectFields,
      successCriteria: originalPreviewAction.successCriteria,
    });
  }

  const copyStagingAction = actionById.get('copy-organized-staging-directory');
  if (copyStagingAction) {
    workflowSteps.push({
      id: 'copy-organized-staging-directory',
      status: organizationDecision.optionalStagingActionId === 'copy-organized-staging-directory' ? 'optional-next' : 'available-next',
      tool: 'organize_font_directory',
      writesFiles: true,
      sourceDestructive: false,
      suggestedArgs: copyStagingAction.suggestedArgs,
      inspectFields: copyStagingAction.inspectFields,
      successCriteria: copyStagingAction.successCriteria,
    });
  }

  const organizedPreviewAction = actionById.get('preview-batch-split-organized-output');
  if (organizedPreviewAction) {
    workflowSteps.push({
      id: 'preview-batch-split-organized-output',
      status: organizationDecision.preferredNextActionId === 'preview-batch-split-organized-output' ? 'preferred-next' : 'available-next',
      tool: 'split_font_batch',
      writesFiles: false,
      sourceDestructive: false,
      suggestedArgs: organizedPreviewAction.suggestedArgs,
      suggestedArgsField: sourceLayoutMismatchSummary.copyOnlyStaging?.safePreviewArgs
        ? 'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs'
        : 'organizationDecision.safeBatchPreviewArgs',
      inspectFields: organizedPreviewAction.inspectFields,
      successCriteria: organizedPreviewAction.successCriteria,
    });
  }

  workflowSteps.push(
    {
      id: 'reviewed-batch-write',
      status: 'after-reviewed-preview',
      tool: 'split_font_batch',
      writesFiles: true,
      sourceDestructive: false,
      suggestedArgsHint: {
        inputDir: '<reviewed original inputDir or organized outputDir>',
        outputRoot: '<reviewed split output root>',
        workflowPreset: 'reviewed-write',
      },
      inspectFields: ['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'batchDecision', 'batchWarnings', 'dedupeDecisionSummary', 'errorCount', 'errors', 'recommendedNextActions'],
      successCriteria: 'Only run after the safe-preview plan is acceptable; require sourceDestructive false, maxFilesHit false, and errorCount zero.',
    },
    {
      id: 'audit-split-output',
      status: 'after-reviewed-write',
      tool: 'inspect_split_output',
      writesFiles: false,
      sourceDestructive: false,
      suggestedArgsHint: {
        outDir: '<reviewed split output root>',
        includeFiles: false,
        includeFamilies: false,
        maxFiles: 200000,
      },
      inspectFields: ['outputRoleDecision', 'outputStructureDecision', 'auditStatus', 'auditPassed', 'auditBlockingReasons', 'maxFilesHit', 'inspectionWarnings', 'structureSummary'],
      successCriteria: OUTPUT_AUDIT_COMPLETION_CRITERIA,
    },
  );

  const nonIntuitiveBehavior = [
    'organize_font_directory never moves, deletes, or rewrites source font files; dryRun:false is copy-only into outputDir.',
    'recommendedBatchOptions is only a policy fragment; use recommendedBatchPreviewArgs or a workflowSteps suggestedArgs object for a copyable safe-preview call that preserves the current scan maxFiles.',
  ];
  if (!options.parseFonts) {
    nonIntuitiveBehavior.push('parseFonts:false makes identity dedupe and metadata-family grouping provisional until rerun with parsing.');
  }
  if (layout.layoutKind === 'mixed') {
    nonIntuitiveBehavior.push('mixed layout means fonts were found both at input root and nested directories, so direct grouping can surprise users.');
  }
  if (safetySummary.outputTreeInsideInputTree) {
    nonIntuitiveBehavior.push('outputDir is inside inputDir; future broad scans can reprocess organized copies unless the next input is scoped intentionally.');
  }
  if (safetySummary.writesSourceTree) {
    nonIntuitiveBehavior.push('writesSourceTree true means the output tree is inside the input tree, not that source font files are modified.');
  }

  const planVisibility = {
    planIncluded: options.includePlan,
    detailsOmitted: options.includePlan ? [] : ['plan'],
    availableSummaryFields: [
      'planActionSummary',
      'layoutDecision',
      'layoutDecision.directoryHandling',
      'stagingDirectoryDecision',
      'organizationDecision',
      'directoryWorkflowSummary',
      'sourceLayoutMismatchSummary',
      'sourceLayoutMismatchSummary.decisionChecklist',
      'recommendedNextActions',
      'organizationWarnings',
      'layout',
      'safetySummary',
      'batchPolicySummary',
    ],
    summaryUse: options.includePlan
      ? 'plan[] is available for exact per-file copy, skip, dedupe, and target review.'
      : 'plan[] is omitted; planActionSummary and routing fields are suitable for triage but not exact per-file target review.',
    rerunWithPlanBeforeWrite: options.dryRun && !options.includePlan,
    rerunWithPlanArgs: options.dryRun && !options.includePlan
      ? buildSuggestedOrganizationArgs({
        inputDir: inputDirRelative,
        outputDir: outputDirRelative,
        workflowPreset: 'safe-preview',
        options,
        optionOverrides: { dryRun: true, includePlan: true },
        extraArgs: { includePlan: true },
      })
      : null,
    successCriteria: options.includePlan
      ? 'Detailed plan[] is visible; review it with organizationWarnings before any copy-only write.'
      : 'For large/noisy triage, inspect availableSummaryFields; before copy-only writes that depend on exact targets, rerun the dry-run with includePlan:true.',
  };

  return attachSourceLayoutDecisionChecklistFields({
    summaryType: 'directory-layout-workflow',
    appliesToTool: 'organize_font_directory',
    currentStep: options.dryRun ? 'layout-plan' : 'copy-only-staging',
    planVisibility,
    sourceLayoutMismatchSummary,
    sourceLayout: {
      layoutKind: layout.layoutKind,
      recommendedBatchGroupBy: layout.recommendedBatchOptions?.batchGroupBy,
      reviewRecommended: reviewReasons.length > 0,
      reviewReasons,
    },
    currentCallSafety: {
      operationMode: safetySummary.operationMode,
      sourceDestructive: false,
      sourceFilesPreserved: true,
      writesSourceTree: safetySummary.writesSourceTree,
      writesOutputTree: safetySummary.writesOutputTree,
      outputTreeInsideInputTree: safetySummary.outputTreeInsideInputTree,
      mayOverwriteOutputTree: safetySummary.mayOverwriteOutputTree,
    },
    policySnapshot: {
      batchGroupBy: options.batchGroupBy,
      batchNamingMode: options.batchNamingMode,
      requestedBatchDedupeMode: options.batchDedupeMode,
      effectiveBatchDedupeMode: effectiveDedupeMode,
    },
    route: {
      route: organizationDecision.route,
      preferredNextActionId: organizationDecision.preferredNextActionId,
      nextTool: organizationDecision.nextTool,
      nextInputDir: organizationDecision.nextInputDir,
      copyOnlyStagingRequired: organizationDecision.copyOnlyStagingRequired,
      optionalStagingActionId: organizationDecision.optionalStagingActionId,
    },
    directBatchPreviewArgs: recommendedBatchPreviewArgs,
    stagingOutputDir: outputDirRelative,
    workflowSteps,
    successCriteria: [
      'Do not treat organization as complete until sourceDestructive is false, organizationWarnings are reviewed, and planActionSummary or plan matches user intent.',
      'Run a split_font_batch safe-preview before any reviewed batch write.',
      `After any reviewed batch write, require inspect_split_output to report ${OUTPUT_AUDIT_PASS_CONDITIONS_TEXT} before reporting structural success.`,
    ],
    nonIntuitiveBehavior,
  });
}

export function buildDirectoryHandlingDecision({
  layout,
  safetySummary,
  organizationDecision,
  directOriginalInput,
  copyOnlyStaging,
}) {
  const directStatus = directOriginalInput.status || null;
  const originalInputPreviewRunnable = ['safe-preview-available', 'review-required'].includes(directStatus)
    && Boolean(directOriginalInput.safePreviewArgs);
  const copyOnlyStagingNeed = copyOnlyStaging.need || null;
  const route = organizationDecision.route;
  const recommendedMode = DIRECTORY_HANDLING_MODE_BY_ORGANIZATION_ROUTE[route] || 'review-organization-decision';
  const useOrganizedOutput = recommendedMode === 'preview-organized-output';
  const suggestedArgsField = useOrganizedOutput
    ? 'organizationDecision.safeBatchPreviewArgs'
    : originalInputPreviewRunnable
      ? 'layoutDecision.directOriginalInput.safePreviewArgs'
      : null;
  const safePreviewArgs = useOrganizedOutput
    ? organizationDecision.safeBatchPreviewArgs || null
    : originalInputPreviewRunnable
      ? directOriginalInput.safePreviewArgs || null
      : null;

  return {
    summaryType: 'directory-handling-decision',
    recommendedMode,
    shortAnswer: DIRECTORY_HANDLING_SHORT_ANSWER_BY_MODE[recommendedMode],
    layoutKind: layout.layoutKind,
    recommendedBatchGroupBy: layout.recommendedBatchOptions?.batchGroupBy || null,
    originalInputPreviewStatus: directStatus,
    originalInputPreviewRunnable,
    copyOnlyStagingNeed,
    helperTool: 'organize_font_directory',
    helperToolDefaultMode: 'dry-run-plan-only',
    helperToolWriteMode: 'copy-only-outputDir',
    sourceDestructive: false,
    sourceFilesPreserved: true,
    copyOnlyStagingIsDestructive: false,
    copyOnlyStagingWritesWhen: 'only when organize_font_directory is called with dryRun:false',
    writesSourceTree: safetySummary.writesSourceTree,
    writesOutputTree: safetySummary.writesOutputTree,
    outputTreeInsideInputTree: safetySummary.outputTreeInsideInputTree,
    nextTool: organizationDecision.nextTool || (originalInputPreviewRunnable ? 'split_font_batch' : null),
    nextInputDir: organizationDecision.nextInputDir || null,
    suggestedArgsField,
    safePreviewArgs,
    mustInspectFields: [...DIRECTORY_HANDLING_MUST_INSPECT_FIELDS],
  };
}

export function buildLayoutDecision({
  layout,
  safetySummary,
  organizationDecision,
  directoryWorkflowSummary,
}) {
  const sourceLayoutMismatchSummary = directoryWorkflowSummary.sourceLayoutMismatchSummary;
  const directOriginalInput = sourceLayoutMismatchSummary.directOriginalInput || {};
  const copyOnlyStaging = sourceLayoutMismatchSummary.copyOnlyStaging || {};
  const directoryHandling = buildDirectoryHandlingDecision({
    layout,
    safetySummary,
    organizationDecision,
    directOriginalInput,
    copyOnlyStaging,
  });
  return {
    summaryType: 'layout-decision',
    appliesToTool: 'organize_font_directory',
    shortAnswer: directoryHandling.shortAnswer,
    layoutKind: layout.layoutKind,
    recommendedBatchGroupBy: layout.recommendedBatchOptions?.batchGroupBy || null,
    route: organizationDecision.route,
    directoryHandling,
    recommendedNextActionId: organizationDecision.preferredNextActionId || organizationDecision.optionalStagingActionId || null,
    nextTool: organizationDecision.nextTool || null,
    nextInputDir: organizationDecision.nextInputDir || null,
    reason: organizationDecision.reason,
    operationMode: safetySummary.operationMode,
    sourceDestructive: false,
    sourceFilesPreserved: true,
    writesSourceTree: safetySummary.writesSourceTree,
    writesOutputTree: safetySummary.writesOutputTree,
    outputTreeInsideInputTree: safetySummary.outputTreeInsideInputTree,
    mayOverwriteOutputTree: safetySummary.mayOverwriteOutputTree,
    directOriginalInput: {
      status: directOriginalInput.status || null,
      previewTool: directOriginalInput.previewTool || 'split_font_batch',
      previewRequiredBeforeWrite: directOriginalInput.previewRequiredBeforeWrite === true,
      safePreviewArgs: directOriginalInput.safePreviewArgs || null,
      reason: directOriginalInput.reason || null,
    },
    copyOnlyStaging: {
      need: copyOnlyStaging.need || null,
      outputDir: copyOnlyStaging.outputDir || null,
      sourceDestructive: false,
      sourceFilesPreserved: true,
      sourceFilesMovedDeletedOrRewritten: false,
      writeBehavior: copyOnlyStaging.writeBehavior || null,
      nextActionId: copyOnlyStaging.nextActionId || null,
      suggestedArgsField: copyOnlyStaging.suggestedArgsField || null,
      safePreviewArgs: copyOnlyStaging.safePreviewArgs || null,
      reason: copyOnlyStaging.reason || null,
    },
    mustInspectFields: [
      'safetySummary',
      'layout',
      'layoutDecision',
      'layoutDecision.directoryHandling',
      'stagingDirectoryDecision',
      'organizationDecision',
      'sourceLayoutMismatchSummary',
      'sourceLayoutMismatchSummary.decisionChecklist',
      'directoryWorkflowSummary.planVisibility',
      'recommendedNextActions',
      'organizationWarnings',
      'planActionSummary',
    ],
    successCriteria: [
      'Use layoutDecision only as a compact route summary; it is not proof that organization or splitting is complete.',
      'Before any copy-only write, confirm sourceDestructive false and review planActionSummary, organizationWarnings, and plan[] when available.',
      'Before any reviewed batch write, run split_font_batch with safe-preview arguments and inspect planned paths, warnings, maxFilesHit, and errors.',
      `After any reviewed batch write, run inspect_split_output and require ${OUTPUT_AUDIT_MINIMUM_PASS_TEXT}.`,
    ],
    nonIntuitiveBehavior: [
      'organize_font_directory never moves, deletes, or rewrites source font files; dryRun:false is copy-only into outputDir.',
      'writesSourceTree true means the output tree is inside the input tree, not that source font files are modified.',
      'copyOnlyStaging is optional unless the route or user intent requires a cleaner staging directory.',
    ],
  };
}

export function buildStagingDirectoryDecision({
  options,
  outputDirRelative,
  layout,
  copiedCount,
  skippedTargetExists,
  selectedFontCount,
  errorCount,
  organizationManifestPath,
  safePreviewArgs,
}) {
  let status = 'not-written-dry-run';
  let recommendedAction = 'review-plan-before-copying';
  let shortAnswer = 'No staging directory was written; review the plan before deciding whether copy-only organization is needed.';

  if (!options.dryRun && errorCount > 0) {
    status = 'organization-errors';
    recommendedAction = 'inspect-organization-errors';
    shortAnswer = 'The copy-only organization run reported errors; resolve them before using outputDir as a split source.';
  } else if (!options.dryRun && copiedCount > 0) {
    status = 'ready-for-source-preflight';
    recommendedAction = 'inspect-staging-with-inspect_font_inputs';
    shortAnswer = 'The organizer wrote a source-like staging directory; inspect it as input, then run split_font_batch safe-preview before any split write.';
  } else if (!options.dryRun && skippedTargetExists > 0) {
    status = 'review-existing-targets';
    recommendedAction = 'inspect-existing-staging-targets';
    shortAnswer = 'No new files were copied because targets already existed; inspect outputDir before deciding whether to reuse or overwrite it.';
  } else if (!options.dryRun && selectedFontCount === 0) {
    status = 'no-copyable-fonts';
    recommendedAction = 'adjust-organization-policy-or-stop';
    shortAnswer = 'No copyable fonts were selected, so outputDir is not a useful staging source yet.';
  } else if (!options.dryRun) {
    status = 'no-new-copies';
    recommendedAction = 'inspect-outputDir-before-reuse';
    shortAnswer = 'The organization call wrote no new font copies; inspect outputDir before using it as the next input.';
  }

  return {
    summaryType: 'staging-directory-decision',
    appliesToTool: 'organize_font_directory',
    status,
    shortAnswer,
    recommendedAction,
    outputDir: outputDirRelative,
    outputDirRole: 'organized-font-source-staging',
    isSplitOutput: false,
    sourceDestructive: false,
    sourceFilesPreserved: true,
    sourceFilesMovedDeletedOrRewritten: false,
    operationMode: options.dryRun ? 'plan-only' : 'copy-only',
    copiedCount,
    skippedTargetExists,
    selectedFontCount,
    layoutKind: layout.layoutKind,
    recommendedBatchGroupBy: layout.recommendedBatchOptions?.batchGroupBy || null,
    organizationManifestPath,
    inspectTool: 'inspect_font_inputs',
    inspectArgs: {
      inputDir: outputDirRelative,
      includeFiles: false,
    },
    previewTool: 'split_font_batch',
    safePreviewArgs,
    auditToolAfterSplitWrite: 'inspect_split_output',
    mustInspectFields: [
      'stagingDirectoryDecision',
      'inputCountGuide',
      'supportedFontCount',
      'unsupportedFileDecision',
      'unsupportedFileSummary',
      'invalidFontCount',
      'missingIdentityCount',
      'inspectionWarnings',
      'organizationManifestPath',
      'planActionSummary',
      'organizationWarnings',
    ],
    successCriteria: [
      'If status is ready-for-source-preflight, run inspect_font_inputs on outputDir and require maxFilesHit false before using it as split input.',
      'Before any reviewed split write, run split_font_batch safe-preview on outputDir and review planned paths, warnings, dedupe, maxFilesHit, and errors.',
      `After any reviewed split write, run inspect_split_output on the split outputRoot and require ${OUTPUT_AUDIT_MINIMUM_PASS_TEXT}.`,
    ],
    nonIntuitiveBehavior: [
      'The organizer outputDir is source-like staging, not split output; inspect_split_output applies only after split_font or split_font_batch writes generated output.',
      'organize_font_directory dryRun:false copies fonts into outputDir; it never moves, deletes, or rewrites source font files.',
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
