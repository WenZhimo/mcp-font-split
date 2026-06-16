export function summarizeSourceLayoutMismatch(summary) {
  if (!summary || typeof summary !== 'object') return null;
  const copyOnlyStagingChecklistItem = (summary.decisionChecklist?.items || [])
    .find((item) => item.id === 'copy-only-staging');
  return {
    summaryType: summary.summaryType,
    appliesToTool: summary.appliesToTool,
    currentLayoutKind: summary.currentLayoutKind,
    requestedBatchGroupBy: summary.requestedBatchGroupBy,
    recommendedBatchGroupBy: summary.recommendedBatchGroupBy,
    sourceLayoutMatchesRecommendedGrouping: summary.sourceLayoutMatchesRecommendedGrouping,
    mismatchDetected: summary.mismatchDetected,
    reviewRecommended: summary.reviewRecommended,
    confidence: summary.confidence,
    directOriginalInputStatus: summary.directOriginalInput?.status,
    directPreviewRequiredBeforeWrite: summary.directOriginalInput?.previewRequiredBeforeWrite,
    copyOnlyStagingNeed: summary.copyOnlyStaging?.need,
    copyOnlyStagingSourceDestructive: summary.copyOnlyStaging?.sourceDestructive,
    copyOnlyStagingSourceFilesPreserved: summary.copyOnlyStaging?.sourceFilesPreserved,
    sourceFilesMovedDeletedOrRewritten: summary.copyOnlyStaging?.sourceFilesMovedDeletedOrRewritten,
    copyOnlyStagingSuggestedArgsField: summary.copyOnlyStaging?.suggestedArgsField,
    copyOnlyStagingSafePreviewInputDir: summary.copyOnlyStaging?.safePreviewArgs?.inputDir,
    copyOnlyStagingSafePreviewMaxFiles: summary.copyOnlyStaging?.safePreviewArgs?.maxFiles,
    decisionChecklistSummaryType: summary.decisionChecklist?.summaryType,
    decisionChecklistPrimaryRoute: summary.decisionChecklist?.primaryRoute,
    decisionChecklistSplitWriteReadiness: summary.decisionChecklist?.splitWriteReadiness,
    decisionChecklistCopyOnlyStagingReadiness: summary.decisionChecklist?.copyOnlyStagingReadiness,
    decisionChecklistItemIds: (summary.decisionChecklist?.items || []).map((item) => item.id),
    decisionChecklistSourceSafetyStatus: (summary.decisionChecklist?.items || []).find((item) => item.id === 'source-safety-preserved')?.status,
    decisionChecklistDirectPreviewStatus: (summary.decisionChecklist?.items || []).find((item) => item.id === 'direct-original-input-preview')?.status,
    decisionChecklistCopyOnlyStagingSuggestedArgsField: copyOnlyStagingChecklistItem?.suggestedArgsField,
    decisionChecklistCopyOnlyStagingSafePreviewInputDir: copyOnlyStagingChecklistItem?.safePreviewArgs?.inputDir,
    decisionChecklistCopyOnlyStagingSafePreviewMaxFiles: copyOnlyStagingChecklistItem?.safePreviewArgs?.maxFiles,
    decisionChecklistWarningsStatus: (summary.decisionChecklist?.items || []).find((item) => item.id === 'warnings-reviewed')?.status,
  };
}

export function sourceLayoutMismatchSummaryCovered(summary) {
  const copyOnlyWriteSafePreviewCovered = summary?.copyOnlyStagingNeed !== 'already-written-copy-only'
    || (
      summary.copyOnlyStagingSuggestedArgsField === 'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs'
      && typeof summary.copyOnlyStagingSafePreviewInputDir === 'string'
      && Number.isInteger(summary.copyOnlyStagingSafePreviewMaxFiles)
      && summary.decisionChecklistCopyOnlyStagingSuggestedArgsField === 'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs'
      && summary.decisionChecklistCopyOnlyStagingSafePreviewInputDir === summary.copyOnlyStagingSafePreviewInputDir
      && summary.decisionChecklistCopyOnlyStagingSafePreviewMaxFiles === summary.copyOnlyStagingSafePreviewMaxFiles
    );
  return Boolean(
    summary
    && summary.summaryType === 'source-layout-mismatch'
    && summary.appliesToTool === 'organize_font_directory'
    && summary.copyOnlyStagingSourceDestructive === false
    && summary.copyOnlyStagingSourceFilesPreserved === true
    && summary.sourceFilesMovedDeletedOrRewritten === false
    && summary.directPreviewRequiredBeforeWrite === true
    && summary.decisionChecklistSummaryType === 'source-layout-decision-checklist'
    && summary.decisionChecklistItemIds?.includes('source-safety-preserved')
    && summary.decisionChecklistItemIds?.includes('direct-original-input-preview')
    && summary.decisionChecklistItemIds?.includes('copy-only-staging')
    && summary.decisionChecklistItemIds?.includes('plan-detail-before-copy')
    && summary.decisionChecklistItemIds?.includes('warnings-reviewed')
    && summary.decisionChecklistItemIds?.includes('post-write-output-audit')
    && summary.decisionChecklistSourceSafetyStatus === 'pass'
    && copyOnlyWriteSafePreviewCovered
  );
}

export function summarizeSourceSafetyDecision(decision) {
  if (!decision || typeof decision !== 'object') return null;
  return {
    summaryType: decision.summaryType,
    appliesToTool: decision.appliesToTool,
    status: decision.status,
    operationMode: decision.operationMode,
    sourceDestructive: decision.sourceDestructive,
    sourceFilesPreserved: decision.sourceFilesPreserved,
    sourceFilesMovedDeletedOrRewritten: decision.sourceFilesMovedDeletedOrRewritten,
    sourceBackupRequired: decision.sourceBackupRequired,
    writesFiles: decision.writesFiles,
    writesSourceTree: decision.writesSourceTree,
    writesOutputTree: decision.writesOutputTree,
    outputTreeInsideInputTree: decision.outputTreeInsideInputTree,
    mayOverwriteOutputTree: decision.mayOverwriteOutputTree,
    outputPathRole: decision.outputPathRole,
    requiresOutputAudit: decision.requiresOutputAudit,
    mustInspectFields: decision.mustInspectFields,
  };
}

export function sourceSafetyDecisionCovered(summary, {
  appliesToTool,
  status,
  writesFiles,
  writesSourceTree,
  outputPathRole,
  requiresOutputAudit,
}) {
  return Boolean(
    summary
    && summary.summaryType === 'source-safety-decision'
    && summary.appliesToTool === appliesToTool
    && summary.status === status
    && summary.sourceDestructive === false
    && summary.sourceFilesPreserved === true
    && summary.sourceFilesMovedDeletedOrRewritten === false
    && summary.sourceBackupRequired === false
    && summary.writesFiles === writesFiles
    && summary.writesOutputTree === writesFiles
    && summary.writesSourceTree === writesSourceTree
    && summary.outputPathRole === outputPathRole
    && summary.requiresOutputAudit === requiresOutputAudit
    && Array.isArray(summary.mustInspectFields)
    && summary.mustInspectFields.includes('sourceSafetyDecision')
    && summary.mustInspectFields.includes('safetySummary')
  );
}

export function summarizeInputCountGuide(guide) {
  if (!guide || typeof guide !== 'object') return null;
  return {
    summaryType: guide.summaryType,
    appliesToTool: guide.appliesToTool,
    scannedFileCount: guide.scannedFileCount,
    supportedFontCount: guide.supportedFontCount,
    supportedFieldName: guide.supportedFieldName,
    unsupportedFileCount: guide.unsupportedFileCount,
    unsupportedFieldName: guide.unsupportedFieldName,
    maxFilesHit: guide.maxFilesHit,
    countCompleteness: guide.countCompleteness,
    fileDetailsVisibility: guide.fileDetailsVisibility,
    unsupportedFilesHandling: guide.unsupportedFilesHandling,
    recommendedAction: guide.recommendedAction,
    mustInspectFields: guide.mustInspectFields,
  };
}

export function inputCountGuideCovered(summary, { appliesToTool, fileDetailsVisibility } = {}) {
  return Boolean(
    summary
    && summary.summaryType === 'input-count-guide'
    && summary.appliesToTool === appliesToTool
    && Number.isInteger(summary.scannedFileCount)
    && Number.isInteger(summary.supportedFontCount)
    && Number.isInteger(summary.unsupportedFileCount)
    && summary.scannedFileCount === summary.supportedFontCount + summary.unsupportedFileCount
    && summary.maxFilesHit === false
    && summary.countCompleteness === 'complete-for-scanned-root'
    && (!fileDetailsVisibility || summary.fileDetailsVisibility === fileDetailsVisibility)
    && summary.unsupportedFilesHandling?.unsupportedFilesIgnored === true
    && summary.unsupportedFilesHandling?.unsupportedFilesCopiedByOrganization === false
    && summary.unsupportedFilesHandling?.unsupportedFilesSplitByBatch === false
    && summary.unsupportedFilesHandling?.archivesExtracted === false
    && summary.recommendedAction === 'continue'
    && Array.isArray(summary.mustInspectFields)
    && summary.mustInspectFields.includes('inputCountGuide')
    && summary.mustInspectFields.includes('maxFilesHit')
    && summary.mustInspectFields.includes('unsupportedFileDecision')
    && summary.mustInspectFields.includes('unsupportedFileSummary')
  );
}

export function summarizeInputDirectoryDecision(decision) {
  if (!decision || typeof decision !== 'object') return null;
  return {
    summaryType: decision.summaryType,
    appliesToTool: decision.appliesToTool,
    recommendedMode: decision.recommendedMode,
    preferredNextTool: decision.preferredNextTool,
    preferredNextActionId: decision.preferredNextActionId,
    writesFilesBeforeReview: decision.writesFilesBeforeReview,
    sourceDestructive: decision.sourceDestructive,
    sourceFilesPreserved: decision.sourceFilesPreserved,
    layoutKind: decision.layoutKind,
    directoryStructureRisk: decision.directoryStructureRisk,
    recommendedBatchGroupBy: decision.recommendedBatchGroupBy,
    safeBatchPreviewWorkflowPreset: decision.safeBatchPreviewArgs?.workflowPreset,
    safeOrganizationPreviewWorkflowPreset: decision.safeOrganizationPreviewArgs?.workflowPreset,
    directoryOrganizationSafety: decision.directoryOrganizationSafety,
    suggestedArgsWorkflowPreset: decision.suggestedArgs?.workflowPreset,
    mustInspectFields: decision.mustInspectFields,
    nonIntuitiveBehaviorCount: decision.nonIntuitiveBehavior?.length,
    evidence: decision.evidence,
  };
}

export function inputDirectoryDecisionCovered(summary) {
  return Boolean(
    summary
    && summary.summaryType === 'input-directory-decision'
    && summary.appliesToTool === 'inspect_font_inputs'
    && typeof summary.recommendedMode === 'string'
    && summary.writesFilesBeforeReview === false
    && summary.sourceDestructive === false
    && summary.sourceFilesPreserved === true
    && typeof summary.layoutKind === 'string'
    && typeof summary.recommendedBatchGroupBy === 'string'
    && summary.safeBatchPreviewWorkflowPreset === 'safe-preview'
    && summary.safeOrganizationPreviewWorkflowPreset === 'safe-preview'
    && summary.directoryOrganizationSafety?.summaryType === 'directory-organization-safety'
    && summary.directoryOrganizationSafety?.helperTool === 'organize_font_directory'
    && summary.directoryOrganizationSafety?.helperToolDefaultMode === 'safe-preview-plan-only'
    && summary.directoryOrganizationSafety?.helperToolWriteMode === 'copy-only-outputDir'
    && summary.directoryOrganizationSafety?.sourceDestructive === false
    && summary.directoryOrganizationSafety?.sourceFilesMovedDeletedOrRewritten === false
    && summary.directoryOrganizationSafety?.isSplitOutput === false
    && summary.directoryOrganizationSafety?.safePreviewArgs?.workflowPreset === 'safe-preview'
    && summary.directoryOrganizationSafety?.inspectAfterCopyTool === 'inspect_font_inputs'
    && summary.directoryOrganizationSafety?.previewAfterCopyTool === 'split_font_batch'
    && Array.isArray(summary.mustInspectFields)
    && summary.mustInspectFields.includes('inputDirectoryDecision')
    && summary.mustInspectFields.includes('inputDirectoryDecision.directoryOrganizationSafety')
    && summary.mustInspectFields.includes('layout')
    && summary.mustInspectFields.includes('recommendedBatchPreviewArgs')
    && summary.mustInspectFields.includes('unsupportedFileDecision')
    && Number.isInteger(summary.evidence?.supportedFontCount)
    && Number.isInteger(summary.evidence?.unsupportedFileCount)
  );
}

export function summarizeLayoutDecision(decision) {
  if (!decision || typeof decision !== 'object') return null;
  return {
    summaryType: decision.summaryType,
    appliesToTool: decision.appliesToTool,
    shortAnswer: decision.shortAnswer,
    layoutKind: decision.layoutKind,
    recommendedBatchGroupBy: decision.recommendedBatchGroupBy,
    route: decision.route,
    directoryHandling: decision.directoryHandling,
    recommendedNextActionId: decision.recommendedNextActionId,
    nextTool: decision.nextTool,
    nextInputDir: decision.nextInputDir,
    operationMode: decision.operationMode,
    sourceDestructive: decision.sourceDestructive,
    sourceFilesPreserved: decision.sourceFilesPreserved,
    writesSourceTree: decision.writesSourceTree,
    writesOutputTree: decision.writesOutputTree,
    outputTreeInsideInputTree: decision.outputTreeInsideInputTree,
    directOriginalInputStatus: decision.directOriginalInput?.status,
    directPreviewRequiredBeforeWrite: decision.directOriginalInput?.previewRequiredBeforeWrite,
    copyOnlyStagingNeed: decision.copyOnlyStaging?.need,
    copyOnlyStagingSourceDestructive: decision.copyOnlyStaging?.sourceDestructive,
    copyOnlyStagingSourceFilesPreserved: decision.copyOnlyStaging?.sourceFilesPreserved,
    sourceFilesMovedDeletedOrRewritten: decision.copyOnlyStaging?.sourceFilesMovedDeletedOrRewritten,
    mustInspectFields: decision.mustInspectFields,
    successCriteriaCount: decision.successCriteria?.length,
    nonIntuitiveBehaviorCount: decision.nonIntuitiveBehavior?.length,
  };
}

export function layoutDecisionCovered(summary) {
  return Boolean(
    summary
    && summary.summaryType === 'layout-decision'
    && summary.appliesToTool === 'organize_font_directory'
    && typeof summary.shortAnswer === 'string'
    && summary.shortAnswer.length > 0
    && typeof summary.layoutKind === 'string'
    && typeof summary.route === 'string'
    && summary.directoryHandling?.summaryType === 'directory-handling-decision'
    && typeof summary.directoryHandling?.recommendedMode === 'string'
    && typeof summary.directoryHandling?.shortAnswer === 'string'
    && summary.directoryHandling?.helperTool === 'organize_font_directory'
    && summary.directoryHandling?.helperToolDefaultMode === 'dry-run-plan-only'
    && summary.directoryHandling?.helperToolWriteMode === 'copy-only-outputDir'
    && summary.directoryHandling?.sourceDestructive === false
    && summary.directoryHandling?.sourceFilesPreserved === true
    && summary.directoryHandling?.copyOnlyStagingIsDestructive === false
    && Array.isArray(summary.directoryHandling?.mustInspectFields)
    && summary.directoryHandling.mustInspectFields.includes('layoutDecision')
    && summary.directoryHandling.mustInspectFields.includes('sourceSafetyDecision')
    && typeof summary.operationMode === 'string'
    && summary.sourceDestructive === false
    && summary.sourceFilesPreserved === true
    && summary.copyOnlyStagingSourceDestructive === false
    && summary.copyOnlyStagingSourceFilesPreserved === true
    && summary.sourceFilesMovedDeletedOrRewritten === false
    && Array.isArray(summary.mustInspectFields)
    && summary.mustInspectFields.includes('safetySummary')
    && summary.mustInspectFields.includes('layout')
    && summary.mustInspectFields.includes('layoutDecision')
    && summary.mustInspectFields.includes('stagingDirectoryDecision')
    && summary.mustInspectFields.includes('organizationDecision')
    && summary.mustInspectFields.includes('sourceLayoutMismatchSummary')
    && summary.mustInspectFields.includes('directoryWorkflowSummary.planVisibility')
  );
}

export function summarizeStagingDirectoryDecision(decision) {
  if (!decision || typeof decision !== 'object') return null;
  return {
    summaryType: decision.summaryType,
    appliesToTool: decision.appliesToTool,
    status: decision.status,
    shortAnswer: decision.shortAnswer,
    recommendedAction: decision.recommendedAction,
    outputDir: decision.outputDir,
    outputDirRole: decision.outputDirRole,
    isSplitOutput: decision.isSplitOutput,
    sourceDestructive: decision.sourceDestructive,
    sourceFilesPreserved: decision.sourceFilesPreserved,
    sourceFilesMovedDeletedOrRewritten: decision.sourceFilesMovedDeletedOrRewritten,
    operationMode: decision.operationMode,
    copiedCount: decision.copiedCount,
    selectedFontCount: decision.selectedFontCount,
    layoutKind: decision.layoutKind,
    recommendedBatchGroupBy: decision.recommendedBatchGroupBy,
    organizationManifestPath: decision.organizationManifestPath,
    inspectTool: decision.inspectTool,
    inspectArgs: decision.inspectArgs,
    previewTool: decision.previewTool,
    safePreviewArgs: decision.safePreviewArgs,
    auditToolAfterSplitWrite: decision.auditToolAfterSplitWrite,
    mustInspectFields: decision.mustInspectFields,
    successCriteria: decision.successCriteria,
    nonIntuitiveBehavior: decision.nonIntuitiveBehavior,
  };
}

export function stagingDirectoryDecisionCovered(summary, {
  status,
  operationMode,
} = {}) {
  return Boolean(
    summary
    && summary.summaryType === 'staging-directory-decision'
    && summary.appliesToTool === 'organize_font_directory'
    && (!status || summary.status === status)
    && typeof summary.shortAnswer === 'string'
    && summary.shortAnswer.length > 0
    && typeof summary.recommendedAction === 'string'
    && typeof summary.outputDir === 'string'
    && summary.outputDir.length > 0
    && summary.outputDirRole === 'organized-font-source-staging'
    && summary.isSplitOutput === false
    && summary.sourceDestructive === false
    && summary.sourceFilesPreserved === true
    && summary.sourceFilesMovedDeletedOrRewritten === false
    && (!operationMode || summary.operationMode === operationMode)
    && Number.isInteger(summary.copiedCount)
    && Number.isInteger(summary.selectedFontCount)
    && typeof summary.layoutKind === 'string'
    && summary.inspectTool === 'inspect_font_inputs'
    && summary.inspectArgs?.inputDir === summary.outputDir
    && summary.previewTool === 'split_font_batch'
    && summary.safePreviewArgs?.workflowPreset === 'safe-preview'
    && summary.auditToolAfterSplitWrite === 'inspect_split_output'
    && Array.isArray(summary.mustInspectFields)
    && summary.mustInspectFields.includes('stagingDirectoryDecision')
    && summary.mustInspectFields.includes('inputCountGuide')
    && summary.mustInspectFields.includes('organizationManifestPath')
    && Array.isArray(summary.successCriteria)
    && summary.successCriteria.some((item) => item.includes('inspect_font_inputs'))
    && summary.successCriteria.some((item) => item.includes('split_font_batch'))
    && summary.successCriteria.some((item) => item.includes('inspect_split_output'))
    && Array.isArray(summary.nonIntuitiveBehavior)
    && summary.nonIntuitiveBehavior.some((item) => item.includes('not split output'))
    && summary.nonIntuitiveBehavior.some((item) => item.includes('never moves, deletes, or rewrites source font files'))
  );
}

export function assertRealCorpusStagingDirectoryDecision(decision, context, expected = {}) {
  if (!stagingDirectoryDecisionCovered(summarizeStagingDirectoryDecision(decision), expected)) {
    throw new Error(`${context}: expected stagingDirectoryDecision to expose source-like staging routing and non-split-output semantics.`);
  }
}

export function assertRealCorpusLayoutDecision(decision, context) {
  if (!layoutDecisionCovered(summarizeLayoutDecision(decision))) {
    throw new Error(`${context}: expected layoutDecision to expose compact route, source-safety, and required inspection fields.`);
  }
}

export function assertRealCorpusSourceLayoutMismatchSummary(summary, context) {
  if (!sourceLayoutMismatchSummaryCovered(summarizeSourceLayoutMismatch(summary))) {
    throw new Error(`${context}: expected sourceLayoutMismatchSummary to expose layout guidance, direct-preview requirements, and source-safe copy-only staging.`);
  }
}
