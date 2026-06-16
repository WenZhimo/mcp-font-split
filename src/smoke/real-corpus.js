import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isInsidePath } from './assertions.js';

const execFileAsync = promisify(execFile);

async function fsExists(filePath) {
  return fs.access(filePath).then(() => true).catch(() => false);
}

const REAL_CORPUS_FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.otc', '.woff', '.woff2']);
const DEFAULT_REAL_CORPUS_TARGETS = ['aexpective', 'tiny5', 'agu_display', 'architectural'];
const DEFAULT_REAL_CORPUS_TARGET_SAMPLE_COUNT = 10;
const REQUIRED_REAL_CORPUS_TOOL_COVERAGE = [
  'get_agent_guidance',
  'get_runtime_status',
  'inspect_font_inputs',
  'organize_font_directory',
  'split_font',
  'split_font_batch',
  'inspect_split_output',
];
const REAL_CORPUS_TARGET_EXPECTATIONS = {
  aexpective: {
    supportedFontCount: 4,
    unsupportedTotal: 2,
    layoutKind: 'nested',
    batchGroupBy: 'source-dir',
    discoveredFontCount: 4,
    deduplicatedCount: 1,
    skippedDuplicates: 3,
  },
  tiny5: {
    supportedFontCount: 28,
    unsupportedTotal: 2,
    layoutKind: 'nested',
    batchGroupBy: 'source-dir',
    discoveredFontCount: 28,
    deduplicatedCount: 10,
    skippedDuplicates: 18,
  },
  agu_display: {
    supportedFontCount: 11,
    unsupportedTotal: 3,
    layoutKind: 'nested',
    batchGroupBy: 'source-dir',
    discoveredFontCount: 11,
    deduplicatedCount: 3,
    skippedDuplicates: 8,
  },
  architectural: {
    supportedFontCount: 37,
    unsupportedTotal: 38,
    layoutKind: 'nested',
    batchGroupBy: 'source-dir',
    discoveredFontCount: 37,
    deduplicatedCount: 12,
    skippedDuplicates: 25,
  },
};

function parseSmokeJsonOutput(stdout) {
  const trimmed = (stdout || '').trim();
  let index = trimmed.indexOf('{');
  while (index !== -1) {
    try {
      return JSON.parse(trimmed.slice(index));
    } catch {
      index = trimmed.indexOf('{', index + 1);
    }
  }
  return null;
}

function summarizeSourceLayoutMismatch(summary) {
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

function sourceLayoutMismatchSummaryCovered(summary) {
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

function summarizeSourceSafetyDecision(decision) {
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

function sourceSafetyDecisionCovered(summary, {
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

function summarizeInputCountGuide(guide) {
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

function inputCountGuideCovered(summary, { appliesToTool, fileDetailsVisibility } = {}) {
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

function summarizeInputDirectoryDecision(decision) {
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
    suggestedArgsWorkflowPreset: decision.suggestedArgs?.workflowPreset,
    mustInspectFields: decision.mustInspectFields,
    nonIntuitiveBehaviorCount: decision.nonIntuitiveBehavior?.length,
    evidence: decision.evidence,
  };
}

function inputDirectoryDecisionCovered(summary) {
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
    && Array.isArray(summary.mustInspectFields)
    && summary.mustInspectFields.includes('inputDirectoryDecision')
    && summary.mustInspectFields.includes('layout')
    && summary.mustInspectFields.includes('recommendedBatchPreviewArgs')
    && summary.mustInspectFields.includes('unsupportedFileDecision')
    && Number.isInteger(summary.evidence?.supportedFontCount)
    && Number.isInteger(summary.evidence?.unsupportedFileCount)
  );
}

function summarizeLayoutDecision(decision) {
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

function layoutDecisionCovered(summary) {
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

function summarizeStagingDirectoryDecision(decision) {
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

function stagingDirectoryDecisionCovered(summary, {
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

function assertRealCorpusStagingDirectoryDecision(decision, context, expected = {}) {
  if (!stagingDirectoryDecisionCovered(summarizeStagingDirectoryDecision(decision), expected)) {
    throw new Error(`${context}: expected stagingDirectoryDecision to expose source-like staging routing and non-split-output semantics.`);
  }
}

function assertRealCorpusLayoutDecision(decision, context) {
  if (!layoutDecisionCovered(summarizeLayoutDecision(decision))) {
    throw new Error(`${context}: expected layoutDecision to expose compact route, source-safety, and required inspection fields.`);
  }
}

function assertRealCorpusSourceLayoutMismatchSummary(summary, context) {
  if (!sourceLayoutMismatchSummaryCovered(summarizeSourceLayoutMismatch(summary))) {
    throw new Error(`${context}: expected sourceLayoutMismatchSummary to expose layout guidance, direct-preview requirements, and source-safe copy-only staging.`);
  }
}

function summarizeRealCorpusSubprocess(scenario, result) {
  if (!result || typeof result !== 'object') return null;
  if (scenario === 'real-corpus-readonly') {
    return {
      corpusSupportedFontCount: result.corpus?.supportedFontCount,
      corpusUnsupportedFileCount: result.corpus?.unsupportedFileSummary?.total,
      corpusInputCountGuide: result.corpus?.inputCountGuide,
      corpusInputDirectoryDecision: result.corpus?.inputDirectoryDecision,
      corpusUnsupportedFileDecision: result.corpus?.unsupportedFileDecision,
      corpusUnsupportedByExtension: result.corpus?.unsupportedFileSummary?.byExtension,
      corpusUnsupportedByCategory: result.corpus?.unsupportedFileSummary?.byCategory,
      corpusUnsupportedHandlingSummary: result.corpus?.unsupportedFileSummary?.handlingSummary,
      corpusUnsupportedArchiveCount: getUnsupportedCategoryCount(result.corpus?.unsupportedFileSummary, 'archive'),
      corpusMaxFilesHit: result.corpus?.maxFilesHit,
      sampleInputDir: result.sample?.inputDir,
      sampleSupportedFontCount: result.inspection?.supportedFontCount,
      sampleUnsupportedFileCount: result.inspection?.unsupportedFileSummary?.total,
      sampleInputCountGuide: result.inspection?.inputCountGuide,
      sampleInputDirectoryDecision: result.inspection?.inputDirectoryDecision,
      sampleUnsupportedFileDecision: result.inspection?.unsupportedFileDecision,
      organizationInputCountGuide: result.organization?.inputCountGuide,
      layoutDecision: result.organization?.layoutDecision,
      stagingDirectoryDecision: result.organization?.stagingDirectoryDecision,
      sourceLayoutMismatchSummary: result.organization?.sourceLayoutMismatchSummary,
      organizationSourceSafetyDecision: result.organization?.sourceSafetyDecision,
      batchPreviewInputCountGuide: result.batchPreview?.inputCountGuide,
      batchPreviewSourceSafetyDecision: result.batchPreview?.sourceSafetyDecision,
    };
  }
  if (scenario === 'real-corpus-targets') {
    const targetLayoutDecisionSummaries = (result.targets || []).map((target) => ({
      inputDir: target.inputDir,
      summary: target.layoutDecision,
    }));
    const targetSourceLayoutMismatchSummaries = (result.targets || []).map((target) => ({
      inputDir: target.inputDir,
      summary: target.sourceLayoutMismatchSummary,
    }));
    const targetStagingDirectoryDecisionSummaries = (result.targets || []).map((target) => ({
      inputDir: target.inputDir,
      summary: target.stagingDirectoryDecision,
    }));
    const targetOrganizationSourceSafetyDecisions = (result.targets || []).map((target) => ({
      inputDir: target.inputDir,
      summary: target.organizationSourceSafetyDecision,
    }));
    const targetBatchPreviewSourceSafetyDecisions = (result.targets || []).map((target) => ({
      inputDir: target.inputDir,
      summary: target.batchPreviewSourceSafetyDecision,
    }));
    return {
      corpusSupportedFontCount: result.corpus?.supportedFontCount,
      corpusUnsupportedFileCount: result.corpus?.unsupportedFileSummary?.total,
      corpusInputCountGuide: result.corpus?.inputCountGuide,
      corpusUnsupportedFileDecision: result.corpus?.unsupportedFileDecision,
      corpusUnsupportedByExtension: result.corpus?.unsupportedFileSummary?.byExtension,
      corpusUnsupportedByCategory: result.corpus?.unsupportedFileSummary?.byCategory,
      corpusUnsupportedHandlingSummary: result.corpus?.unsupportedFileSummary?.handlingSummary,
      corpusUnsupportedArchiveCount: getUnsupportedCategoryCount(result.corpus?.unsupportedFileSummary, 'archive'),
      corpusMaxFilesHit: result.corpus?.maxFilesHit,
      selectionMode: result.selection?.mode,
      availableTargetCount: result.selection?.availableTargetCount,
      selectedTargetCount: result.selection?.selectedTargetCount,
      sampleCount: result.selection?.sampleCount,
      selectedTargets: (result.targets || []).map((target) => target.inputDir),
      targetInputCountGuides: (result.targets || []).map((target) => ({
        inputDir: target.inputDir,
        inspection: target.inputCountGuide,
        organization: target.organizationInputCountGuide,
        batchPreview: target.batchPreviewInputCountGuide,
      })),
      targetLayoutDecisionSummaries,
      targetSourceLayoutMismatchSummaries,
      targetStagingDirectoryDecisionSummaries,
      targetOrganizationSourceSafetyDecisions,
      targetBatchPreviewSourceSafetyDecisions,
    };
  }
  if (scenario === 'real-corpus-integration') {
    return {
      corpusSupportedFontCount: result.corpus?.supportedFontCount,
      corpusUnsupportedFileCount: result.corpus?.unsupportedFileSummary?.total,
      corpusInputCountGuide: result.corpus?.inputCountGuide,
      corpusUnsupportedFileDecision: result.corpus?.unsupportedFileDecision,
      corpusUnsupportedByExtension: result.corpus?.unsupportedFileSummary?.byExtension,
      corpusUnsupportedByCategory: result.corpus?.unsupportedFileSummary?.byCategory,
      corpusUnsupportedHandlingSummary: result.corpus?.unsupportedFileSummary?.handlingSummary,
      corpusUnsupportedArchiveCount: getUnsupportedCategoryCount(result.corpus?.unsupportedFileSummary, 'archive'),
      corpusMaxFilesHit: result.corpus?.maxFilesHit,
      sampleInputDir: result.sample?.inputDir,
      sampleFontPath: result.sampleFontPath,
      outputRoot: result.outputRoot,
      singleOutputRoleDecision: result.singleAudit?.outputRoleDecision,
      singleOutputStructureDecision: result.singleAudit?.outputStructureDecision,
      singleAuditStatus: result.singleAudit?.auditStatus,
      singleAuditPassed: result.singleAudit?.auditPassed,
      singleStructureConforms: result.singleAudit?.structureSummary?.conforms,
      singleStructureLayoutKind: result.singleAudit?.structureSummary?.layoutKind,
      singleManifestCoverageOk: result.singleAudit?.structureSummary?.manifestCoverageOk,
      singleStructureIssueCount: result.singleAudit?.structureSummary?.issueCount,
      batchOutputRoleDecision: result.batchAudit?.outputRoleDecision,
      batchOutputStructureDecision: result.batchAudit?.outputStructureDecision,
      batchAuditStatus: result.batchAudit?.auditStatus,
      batchAuditPassed: result.batchAudit?.auditPassed,
      batchStructureConforms: result.batchAudit?.structureSummary?.conforms,
      batchStructureLayoutKind: result.batchAudit?.structureSummary?.layoutKind,
      batchManifestCoverageOk: result.batchAudit?.structureSummary?.manifestCoverageOk,
      batchStructureIssueCount: result.batchAudit?.structureSummary?.issueCount,
      organizationPreviewLayoutDecision: result.organization?.preview?.layoutDecision,
      organizationWriteLayoutDecision: result.organization?.write?.layoutDecision,
      organizationPreviewStagingDirectoryDecision: result.organization?.preview?.stagingDirectoryDecision,
      organizationWriteStagingDirectoryDecision: result.organization?.write?.stagingDirectoryDecision,
      organizationPreviewSourceLayoutMismatchSummary: result.organization?.preview?.sourceLayoutMismatchSummary,
      organizationWriteSourceLayoutMismatchSummary: result.organization?.write?.sourceLayoutMismatchSummary,
      organizationPreviewSourceSafetyDecision: result.organization?.preview?.sourceSafetyDecision,
      organizationWriteSourceSafetyDecision: result.organization?.write?.sourceSafetyDecision,
      organizationPreviewInputCountGuide: result.organization?.preview?.inputCountGuide,
      organizationWriteInputCountGuide: result.organization?.write?.inputCountGuide,
      organizedInspectionInputCountGuide: result.organization?.organizedInspection?.inputCountGuide,
      batchPreviewInputCountGuide: result.batchPreview?.inputCountGuide,
      batchWriteInputCountGuide: result.batchWrite?.inputCountGuide,
      batchPreviewSourceSafetyDecision: result.batchPreview?.sourceSafetyDecision,
      batchWriteSourceSafetyDecision: result.batchWrite?.sourceSafetyDecision,
    };
  }
  return null;
}

function getUnsupportedCategoryCount(summary, category) {
  return (summary?.byCategory || []).find((item) => item.category === category)?.count ?? 0;
}

function buildUnsupportedFileCategoryCoverage({ total, byCategory, byExtension, handlingSummary } = {}) {
  const categoryEntries = Array.isArray(byCategory) ? byCategory : [];
  const extensionEntries = Array.isArray(byExtension) ? byExtension : [];
  const categories = categoryEntries.map((item) => item.category).filter(Boolean);
  const extensions = extensionEntries.map((item) => item.extension).filter(Boolean);
  const extensionsBeyondZipTxt = extensions.filter((extension) => extension !== '.zip' && extension !== '.txt');
  return {
    summaryType: 'unsupported-file-category-coverage',
    totalUnsupportedFileCount: total,
    categoryCount: categories.length,
    categories,
    extensionCount: extensions.length,
    extensions,
    extensionsBeyondZipTxt,
    extensionsBeyondZipTxtCount: extensionsBeyondZipTxt.length,
    archiveCount: categoryEntries.find((item) => item.category === 'archive')?.count ?? 0,
    nonArchiveCategoryCount: categoryEntries.filter((item) => item.category !== 'archive').length,
    hasMultipleCategories: categories.length > 1,
    hasExtensionsBeyondZipTxt: extensionsBeyondZipTxt.length > 0,
    handlingSummary,
  };
}

function buildArchiveHandlingScope({ archiveCount = 0 } = {}) {
  return {
    summaryType: 'archive-handling-scope',
    scopeKind: 'counted-ignored-archives-only',
    sourceField: 'coverageSummary.unsupportedFileCategoryCoverage.archiveCount',
    archiveCount,
    archivesPresent: archiveCount > 0,
    archivesCountedAsIgnored: true,
    archivesExtracted: false,
    archiveContentsScanned: false,
    archiveInternalFontsCovered: false,
    supportedFontCountIncludesArchiveContents: false,
    recommendedAction: 'extract-archives-outside-this-tool-if-needed',
    meaning: 'Archive files found in the corpus are counted as ignored/non-font files only; this suite does not extract archives or test fonts that may exist inside them.',
  };
}

function buildRealCorpusToolCoverageSummary(functionalCoverage = []) {
  const tools = REQUIRED_REAL_CORPUS_TOOL_COVERAGE.map((tool) => {
    const coveredByFunctionalCoverageIds = functionalCoverage
      .filter((item) => item.covered === true && (item.toolPaths || []).includes(tool))
      .map((item) => item.id)
      .filter(Boolean);
    return {
      tool,
      covered: coveredByFunctionalCoverageIds.length > 0,
      coveredByFunctionalCoverageIds,
    };
  });
  const uncoveredTools = tools
    .filter((item) => item.covered !== true)
    .map((item) => item.tool);
  return {
    summaryType: 'real-corpus-tool-coverage-summary',
    purpose: 'Shows which public MCP tool surfaces were exercised by the representative real-corpus suite.',
    evidenceSource: 'coverageSummary.functionalCoverage[].toolPaths',
    requiredTools: REQUIRED_REAL_CORPUS_TOOL_COVERAGE,
    requiredToolCount: REQUIRED_REAL_CORPUS_TOOL_COVERAGE.length,
    coveredRequiredToolCount: tools.length - uncoveredTools.length,
    allRequiredToolsCovered: uncoveredTools.length === 0,
    uncoveredTools,
    tools,
    scopeClarification: {
      representativeReliabilityGate: true,
      perDirectoryAcceptanceAudit: false,
      perFontManualAudit: false,
      meaning: 'A covered tool was exercised on full-corpus scan, representative samples, or the bounded write/audit path; this does not mean every corpus directory or every font was manually accepted.',
    },
  };
}

function buildRealCorpusSuiteCoverageSummary(runs, suiteOptions = {}) {
  const runByScenario = Object.fromEntries((runs || []).map((run) => [run.scenario, run || {}]));
  const byScenario = Object.fromEntries((runs || []).map((run) => [run.scenario, run.summary || {}]));
  const readonlyRun = runByScenario['real-corpus-readonly'] || {};
  const targetsRun = runByScenario['real-corpus-targets'] || {};
  const integrationRun = runByScenario['real-corpus-integration'] || {};
  const readonly = byScenario['real-corpus-readonly'] || {};
  const targets = byScenario['real-corpus-targets'] || {};
  const integration = byScenario['real-corpus-integration'] || {};
  const selectedTargetSet = new Set(targets.selectedTargets || []);
  const fixedRegressionTargetsCovered = DEFAULT_REAL_CORPUS_TARGETS.every((target) => selectedTargetSet.has(target));
  const corpusSupportedFontCount = readonly.corpusSupportedFontCount ?? targets.corpusSupportedFontCount ?? integration.corpusSupportedFontCount;
  const corpusUnsupportedFileCount = readonly.corpusUnsupportedFileCount ?? targets.corpusUnsupportedFileCount ?? integration.corpusUnsupportedFileCount;
  const corpusUnsupportedFileDecision = readonly.corpusUnsupportedFileDecision ?? targets.corpusUnsupportedFileDecision ?? integration.corpusUnsupportedFileDecision;
  const corpusUnsupportedByExtension = readonly.corpusUnsupportedByExtension ?? targets.corpusUnsupportedByExtension ?? integration.corpusUnsupportedByExtension;
  const corpusUnsupportedByCategory = readonly.corpusUnsupportedByCategory ?? targets.corpusUnsupportedByCategory ?? integration.corpusUnsupportedByCategory;
  const corpusUnsupportedHandlingSummary = readonly.corpusUnsupportedHandlingSummary ?? targets.corpusUnsupportedHandlingSummary ?? integration.corpusUnsupportedHandlingSummary;
  const corpusUnsupportedArchiveCount = readonly.corpusUnsupportedArchiveCount ?? targets.corpusUnsupportedArchiveCount ?? integration.corpusUnsupportedArchiveCount;
  const corpusMaxFilesHit = readonly.corpusMaxFilesHit ?? targets.corpusMaxFilesHit ?? integration.corpusMaxFilesHit;
  const unsupportedFileCategoryCoverage = buildUnsupportedFileCategoryCoverage({
    total: corpusUnsupportedFileCount,
    byCategory: corpusUnsupportedByCategory,
    byExtension: corpusUnsupportedByExtension,
    handlingSummary: corpusUnsupportedHandlingSummary,
  });
  const archiveHandlingScope = buildArchiveHandlingScope({
    archiveCount: unsupportedFileCategoryCoverage.archiveCount,
  });
  const outputStructureAuditSummary = {
    summaryType: 'real-corpus-output-structure-audit',
    sampleInputDir: integration.sampleInputDir,
    outputRoot: integration.outputRoot,
    singleOutputRoleDecision: integration.singleOutputRoleDecision,
    singleOutputRoleDecisionStatus: integration.singleOutputRoleDecision?.status,
    singleOutputRoleAuditApplies: integration.singleOutputRoleDecision?.auditAppliesToThisDirectory,
    singleOutputStructureDecision: integration.singleOutputStructureDecision,
    singleAuditStatus: integration.singleAuditStatus,
    singleAuditPassed: integration.singleAuditPassed,
    singleStructureConforms: integration.singleStructureConforms,
    singleStructureLayoutKind: integration.singleStructureLayoutKind,
    singleManifestCoverageOk: integration.singleManifestCoverageOk,
    singleStructureIssueCount: integration.singleStructureIssueCount,
    batchOutputRoleDecision: integration.batchOutputRoleDecision,
    batchOutputRoleDecisionStatus: integration.batchOutputRoleDecision?.status,
    batchOutputRoleAuditApplies: integration.batchOutputRoleDecision?.auditAppliesToThisDirectory,
    batchOutputStructureDecision: integration.batchOutputStructureDecision,
    batchAuditStatus: integration.batchAuditStatus,
    batchAuditPassed: integration.batchAuditPassed,
    batchStructureConforms: integration.batchStructureConforms,
    batchStructureLayoutKind: integration.batchStructureLayoutKind,
    batchManifestCoverageOk: integration.batchManifestCoverageOk,
    batchStructureIssueCount: integration.batchStructureIssueCount,
  };
  const inputDirectoryDecisionEvidence = {
    corpus: readonly.corpusInputDirectoryDecision,
    sample: readonly.sampleInputDirectoryDecision,
  };
  const selectedTargets = targets.selectedTargets || [];
  const targetSourceLayoutMismatchSummaries = targets.targetSourceLayoutMismatchSummaries || [];
  const targetSourceLayoutMismatchSummaryCount = targetSourceLayoutMismatchSummaries
    .filter((item) => sourceLayoutMismatchSummaryCovered(item.summary))
    .length;
  const targetLayoutDecisionSummaries = targets.targetLayoutDecisionSummaries || [];
  const targetLayoutDecisionSummaryCount = targetLayoutDecisionSummaries
    .filter((item) => layoutDecisionCovered(item.summary))
    .length;
  const targetStagingDirectoryDecisionSummaries = targets.targetStagingDirectoryDecisionSummaries || [];
  const targetStagingDirectoryDecisionSummaryCount = targetStagingDirectoryDecisionSummaries
    .filter((item) => stagingDirectoryDecisionCovered(item.summary, {
      status: 'not-written-dry-run',
      operationMode: 'plan-only',
    }))
    .length;
  const sourceLayoutMismatchSummaryEvidence = {
    readonly: readonly.sourceLayoutMismatchSummary,
    targetSummaryCount: targetSourceLayoutMismatchSummaryCount,
    targetSelectedCount: targets.selectedTargetCount,
    targetSamples: targetSourceLayoutMismatchSummaries.slice(0, 3),
    integrationPreview: integration.organizationPreviewSourceLayoutMismatchSummary,
    integrationWrite: integration.organizationWriteSourceLayoutMismatchSummary,
  };
  const layoutDecisionEvidence = {
    readonly: readonly.layoutDecision,
    targetSummaryCount: targetLayoutDecisionSummaryCount,
    targetSelectedCount: targets.selectedTargetCount,
    targetSamples: targetLayoutDecisionSummaries.slice(0, 3),
    integrationPreview: integration.organizationPreviewLayoutDecision,
    integrationWrite: integration.organizationWriteLayoutDecision,
  };
  const stagingDirectoryDecisionEvidence = {
    readonly: readonly.stagingDirectoryDecision,
    targetSummaryCount: targetStagingDirectoryDecisionSummaryCount,
    targetSelectedCount: targets.selectedTargetCount,
    targetSamples: targetStagingDirectoryDecisionSummaries.slice(0, 3),
    integrationPreview: integration.organizationPreviewStagingDirectoryDecision,
    integrationWrite: integration.organizationWriteStagingDirectoryDecision,
  };
  const targetOrganizationSourceSafetyDecisions = targets.targetOrganizationSourceSafetyDecisions || [];
  const targetBatchPreviewSourceSafetyDecisions = targets.targetBatchPreviewSourceSafetyDecisions || [];
  const targetOrganizationSourceSafetyDecisionCount = targetOrganizationSourceSafetyDecisions
    .filter((item) => sourceSafetyDecisionCovered(item.summary, {
      appliesToTool: 'organize_font_directory',
      status: 'source-safe-no-write',
      writesFiles: false,
      writesSourceTree: false,
      outputPathRole: 'outputDir',
      requiresOutputAudit: false,
    }))
    .length;
  const targetBatchPreviewSourceSafetyDecisionCount = targetBatchPreviewSourceSafetyDecisions
    .filter((item) => sourceSafetyDecisionCovered(item.summary, {
      appliesToTool: 'split_font_batch',
      status: 'source-safe-no-write',
      writesFiles: false,
      writesSourceTree: false,
      outputPathRole: 'outputRoot',
      requiresOutputAudit: false,
    }))
    .length;
  const sourceSafetyDecisionEvidence = {
    readonlyOrganization: readonly.organizationSourceSafetyDecision,
    readonlyBatchPreview: readonly.batchPreviewSourceSafetyDecision,
    targetOrganizationCount: targetOrganizationSourceSafetyDecisionCount,
    targetBatchPreviewCount: targetBatchPreviewSourceSafetyDecisionCount,
    targetSelectedCount: targets.selectedTargetCount,
    targetOrganizationSamples: targetOrganizationSourceSafetyDecisions.slice(0, 3),
    targetBatchPreviewSamples: targetBatchPreviewSourceSafetyDecisions.slice(0, 3),
    integrationOrganizationPreview: integration.organizationPreviewSourceSafetyDecision,
    integrationOrganizationWrite: integration.organizationWriteSourceSafetyDecision,
    integrationBatchPreview: integration.batchPreviewSourceSafetyDecision,
    integrationBatchWrite: integration.batchWriteSourceSafetyDecision,
  };
  const targetInputCountGuides = targets.targetInputCountGuides || [];
  const targetInputCountGuideCount = targetInputCountGuides.filter((item) => (
    inputCountGuideCovered(item.inspection, {
      appliesToTool: 'inspect_font_inputs',
      fileDetailsVisibility: 'omitted-by-request',
    })
    && inputCountGuideCovered(item.organization, {
      appliesToTool: 'organize_font_directory',
      fileDetailsVisibility: 'not-returned-by-this-tool',
    })
    && inputCountGuideCovered(item.batchPreview, {
      appliesToTool: 'split_font_batch',
      fileDetailsVisibility: 'not-returned-by-this-tool',
    })
  )).length;
  const inputCountGuideEvidence = {
    readonlyCorpus: readonly.corpusInputCountGuide,
    readonlySample: readonly.sampleInputCountGuide,
    readonlyOrganization: readonly.organizationInputCountGuide,
    readonlyBatchPreview: readonly.batchPreviewInputCountGuide,
    targetSummaryCount: targetInputCountGuideCount,
    targetSelectedCount: targets.selectedTargetCount,
    targetSamples: targetInputCountGuides.slice(0, 3),
    integrationCorpus: integration.corpusInputCountGuide,
    integrationOrganizationPreview: integration.organizationPreviewInputCountGuide,
    integrationOrganizationWrite: integration.organizationWriteInputCountGuide,
    integrationOrganizedInspection: integration.organizedInspectionInputCountGuide,
    integrationBatchPreview: integration.batchPreviewInputCountGuide,
    integrationBatchWrite: integration.batchWriteInputCountGuide,
  };
  const testScope = {
    corpusScan: {
      scopeKind: 'full-root-bounded-scan',
      meaning: 'Full corpus root is scanned up to maxFiles; corpusSupportedFontCount and corpusUnsupportedFileCount come from this root-level scan.',
      maxFiles: suiteOptions.maxFiles,
      maxFilesHit: corpusMaxFilesHit,
      supportedFontCount: corpusSupportedFontCount,
      unsupportedFileCount: corpusUnsupportedFileCount,
      unsupportedFileDecisionStatus: corpusUnsupportedFileDecision?.status,
      unsupportedCategoryCount: unsupportedFileCategoryCoverage.categoryCount,
      unsupportedCategories: unsupportedFileCategoryCoverage.categories,
      unsupportedExtensionCount: unsupportedFileCategoryCoverage.extensionCount,
      unsupportedExtensionsBeyondZipTxt: unsupportedFileCategoryCoverage.extensionsBeyondZipTxt,
      archiveHandlingScope,
    },
    targetSampling: {
      scopeKind: 'fixed-regression-plus-adaptive-sampling',
      meaning: 'Selected target directories exercise dry-run naming, dedupe, layout, and next-action behavior; this is representative sampling, not every available target.',
      targetLimit: suiteOptions.targetLimit,
      requestedSampleCount: suiteOptions.sampleCount,
      fixedRegressionTargetCount: DEFAULT_REAL_CORPUS_TARGETS.length,
      fixedRegressionTargets: DEFAULT_REAL_CORPUS_TARGETS,
      availableTargetCount: targets.availableTargetCount,
      selectedTargetCount: targets.selectedTargetCount,
      selectedTargets,
      perDirectoryAcceptanceAudit: false,
    },
    representativeWriteAudit: {
      scopeKind: 'single-representative-write-and-audit',
      meaning: 'One selected sample directory runs real organization, single-font, batch write, and output-structure audits.',
      integrationLimit: suiteOptions.integrationLimit,
      sampleInputDir: integration.sampleInputDir,
      sampleFontPath: integration.sampleFontPath,
      outputRoot: integration.outputRoot,
      singleOutputRoleDecisionStatus: integration.singleOutputRoleDecision?.status,
      singleOutputRoleAuditApplies: integration.singleOutputRoleDecision?.auditAppliesToThisDirectory,
      singleOutputStructureDecisionStatus: integration.singleOutputStructureDecision?.status,
      singleAuditStatus: integration.singleAuditStatus,
      singleAuditPassed: integration.singleAuditPassed,
      singleStructureConforms: integration.singleStructureConforms,
      batchOutputRoleDecisionStatus: integration.batchOutputRoleDecision?.status,
      batchOutputRoleAuditApplies: integration.batchOutputRoleDecision?.auditAppliesToThisDirectory,
      batchOutputStructureDecisionStatus: integration.batchOutputStructureDecision?.status,
      batchAuditStatus: integration.batchAuditStatus,
      batchAuditPassed: integration.batchAuditPassed,
      batchStructureConforms: integration.batchStructureConforms,
    },
  };
  const functionalCoverage = [
    {
      id: 'full-root-input-scan',
      covered: Boolean(readonlyRun.ok && readonly.corpusSupportedFontCount > 0 && readonly.corpusMaxFilesHit === false),
      toolPaths: ['inspect_font_inputs'],
      evidence: {
        supportedFontCount: readonly.corpusSupportedFontCount,
        unsupportedFileCount: readonly.corpusUnsupportedFileCount,
        maxFilesHit: readonly.corpusMaxFilesHit,
      },
    },
    {
      id: 'input-count-guide',
      covered: Boolean(
        readonlyRun.ok
        && targetsRun.ok
        && integrationRun.ok
        && inputCountGuideCovered(readonly.corpusInputCountGuide, {
          appliesToTool: 'inspect_font_inputs',
          fileDetailsVisibility: 'omitted-by-request',
        })
        && inputCountGuideCovered(readonly.sampleInputCountGuide, {
          appliesToTool: 'inspect_font_inputs',
          fileDetailsVisibility: 'omitted-by-request',
        })
        && inputCountGuideCovered(readonly.organizationInputCountGuide, {
          appliesToTool: 'organize_font_directory',
          fileDetailsVisibility: 'not-returned-by-this-tool',
        })
        && inputCountGuideCovered(readonly.batchPreviewInputCountGuide, {
          appliesToTool: 'split_font_batch',
          fileDetailsVisibility: 'not-returned-by-this-tool',
        })
        && targetInputCountGuideCount === targets.selectedTargetCount
        && targets.selectedTargetCount > 0
        && inputCountGuideCovered(integration.corpusInputCountGuide, {
          appliesToTool: 'inspect_font_inputs',
          fileDetailsVisibility: 'omitted-by-request',
        })
        && inputCountGuideCovered(integration.organizationPreviewInputCountGuide, {
          appliesToTool: 'organize_font_directory',
          fileDetailsVisibility: 'not-returned-by-this-tool',
        })
        && inputCountGuideCovered(integration.organizationWriteInputCountGuide, {
          appliesToTool: 'organize_font_directory',
          fileDetailsVisibility: 'not-returned-by-this-tool',
        })
        && inputCountGuideCovered(integration.organizedInspectionInputCountGuide, {
          appliesToTool: 'inspect_font_inputs',
          fileDetailsVisibility: 'omitted-by-request',
        })
        && inputCountGuideCovered(integration.batchPreviewInputCountGuide, {
          appliesToTool: 'split_font_batch',
          fileDetailsVisibility: 'not-returned-by-this-tool',
        })
        && inputCountGuideCovered(integration.batchWriteInputCountGuide, {
          appliesToTool: 'split_font_batch',
          fileDetailsVisibility: 'not-returned-by-this-tool',
        })
      ),
      toolPaths: ['inspect_font_inputs', 'organize_font_directory', 'split_font_batch'],
      evidence: inputCountGuideEvidence,
    },
    {
      id: 'input-directory-decision',
      covered: Boolean(
        readonlyRun.ok
        && inputDirectoryDecisionCovered(readonly.corpusInputDirectoryDecision)
        && inputDirectoryDecisionCovered(readonly.sampleInputDirectoryDecision)
      ),
      toolPaths: ['inspect_font_inputs'],
      evidence: inputDirectoryDecisionEvidence,
    },
    {
      id: 'unsupported-noise-classification',
      covered: Boolean(
        readonlyRun.ok
        && Array.isArray(readonly.corpusUnsupportedByCategory)
        && readonly.corpusUnsupportedByCategory.length > 0
        && readonly.corpusUnsupportedFileDecision?.summaryType === 'unsupported-file-decision'
        && readonly.corpusUnsupportedFileDecision?.totalUnsupportedFileCount === readonly.corpusUnsupportedFileCount
        && readonly.corpusUnsupportedFileDecision?.handlingSummary?.archivesExtracted === false
        && unsupportedFileCategoryCoverage.categoryCount > 0
        && unsupportedFileCategoryCoverage.extensionCount > 0
        && readonly.corpusUnsupportedHandlingSummary?.unsupportedFilesIgnored === true
        && readonly.corpusUnsupportedHandlingSummary?.archivesExtracted === false
      ),
      toolPaths: ['inspect_font_inputs', 'organize_font_directory', 'split_font_batch'],
      evidence: {
        byCategory: readonly.corpusUnsupportedByCategory,
        byExtension: readonly.corpusUnsupportedByExtension,
        decision: readonly.corpusUnsupportedFileDecision,
        coverage: unsupportedFileCategoryCoverage,
        archiveCount: readonly.corpusUnsupportedArchiveCount,
        archiveHandlingScope,
        handlingSummary: readonly.corpusUnsupportedHandlingSummary,
      },
    },
    {
      id: 'source-safe-organization-preview',
      covered: readonlyRun.ok === true,
      toolPaths: ['organize_font_directory'],
      evidence: {
        sampleInputDir: readonly.sampleInputDir,
        writesFiles: false,
      },
    },
    {
      id: 'source-safety-decision',
      covered: Boolean(
        readonlyRun.ok
        && targetsRun.ok
        && integrationRun.ok
        && sourceSafetyDecisionCovered(readonly.organizationSourceSafetyDecision, {
          appliesToTool: 'organize_font_directory',
          status: 'source-safe-no-write',
          writesFiles: false,
          writesSourceTree: false,
          outputPathRole: 'outputDir',
          requiresOutputAudit: false,
        })
        && sourceSafetyDecisionCovered(readonly.batchPreviewSourceSafetyDecision, {
          appliesToTool: 'split_font_batch',
          status: 'source-safe-no-write',
          writesFiles: false,
          writesSourceTree: false,
          outputPathRole: 'outputRoot',
          requiresOutputAudit: false,
        })
        && targetOrganizationSourceSafetyDecisionCount === targets.selectedTargetCount
        && targetBatchPreviewSourceSafetyDecisionCount === targets.selectedTargetCount
        && targets.selectedTargetCount > 0
        && sourceSafetyDecisionCovered(integration.organizationPreviewSourceSafetyDecision, {
          appliesToTool: 'organize_font_directory',
          status: 'source-safe-no-write',
          writesFiles: false,
          writesSourceTree: false,
          outputPathRole: 'outputDir',
          requiresOutputAudit: false,
        })
        && sourceSafetyDecisionCovered(integration.organizationWriteSourceSafetyDecision, {
          appliesToTool: 'organize_font_directory',
          status: 'source-safe-output-tree-write',
          writesFiles: true,
          writesSourceTree: false,
          outputPathRole: 'outputDir',
          requiresOutputAudit: false,
        })
        && sourceSafetyDecisionCovered(integration.batchPreviewSourceSafetyDecision, {
          appliesToTool: 'split_font_batch',
          status: 'source-safe-no-write',
          writesFiles: false,
          writesSourceTree: false,
          outputPathRole: 'outputRoot',
          requiresOutputAudit: false,
        })
        && sourceSafetyDecisionCovered(integration.batchWriteSourceSafetyDecision, {
          appliesToTool: 'split_font_batch',
          status: 'source-safe-output-tree-write',
          writesFiles: true,
          writesSourceTree: false,
          outputPathRole: 'outputRoot',
          requiresOutputAudit: true,
        })
      ),
      toolPaths: ['organize_font_directory', 'split_font_batch'],
      evidence: sourceSafetyDecisionEvidence,
    },
    {
      id: 'source-layout-mismatch-summary',
      covered: Boolean(
        readonlyRun.ok
        && targetsRun.ok
        && integrationRun.ok
        && sourceLayoutMismatchSummaryCovered(readonly.sourceLayoutMismatchSummary)
        && targetSourceLayoutMismatchSummaryCount === targets.selectedTargetCount
        && targets.selectedTargetCount > 0
        && sourceLayoutMismatchSummaryCovered(integration.organizationPreviewSourceLayoutMismatchSummary)
        && sourceLayoutMismatchSummaryCovered(integration.organizationWriteSourceLayoutMismatchSummary)
      ),
      toolPaths: ['organize_font_directory'],
      evidence: sourceLayoutMismatchSummaryEvidence,
    },
    {
      id: 'layout-decision-route-summary',
      covered: Boolean(
        readonlyRun.ok
        && targetsRun.ok
        && integrationRun.ok
        && layoutDecisionCovered(readonly.layoutDecision)
        && targetLayoutDecisionSummaryCount === targets.selectedTargetCount
        && targets.selectedTargetCount > 0
        && layoutDecisionCovered(integration.organizationPreviewLayoutDecision)
        && layoutDecisionCovered(integration.organizationWriteLayoutDecision)
      ),
      toolPaths: ['organize_font_directory'],
      evidence: layoutDecisionEvidence,
    },
    {
      id: 'staging-directory-decision',
      covered: Boolean(
        readonlyRun.ok
        && targetsRun.ok
        && integrationRun.ok
        && stagingDirectoryDecisionCovered(readonly.stagingDirectoryDecision, {
          status: 'not-written-dry-run',
          operationMode: 'plan-only',
        })
        && targetStagingDirectoryDecisionSummaryCount === targets.selectedTargetCount
        && targets.selectedTargetCount > 0
        && stagingDirectoryDecisionCovered(integration.organizationPreviewStagingDirectoryDecision, {
          status: 'not-written-dry-run',
          operationMode: 'plan-only',
        })
        && stagingDirectoryDecisionCovered(integration.organizationWriteStagingDirectoryDecision, {
          status: 'ready-for-source-preflight',
          operationMode: 'copy-only',
        })
      ),
      toolPaths: ['organize_font_directory'],
      evidence: stagingDirectoryDecisionEvidence,
    },
    {
      id: 'batch-preview-and-next-action',
      covered: Boolean(readonlyRun.ok && readonly.sampleSupportedFontCount > 0),
      toolPaths: ['split_font_batch'],
      evidence: {
        sampleInputDir: readonly.sampleInputDir,
        sampleSupportedFontCount: readonly.sampleSupportedFontCount,
      },
    },
    {
      id: 'targeted-naming-and-dedupe-regressions',
      covered: Boolean(targetsRun.ok && fixedRegressionTargetsCovered && targets.selectedTargetCount >= DEFAULT_REAL_CORPUS_TARGETS.length),
      toolPaths: ['inspect_font_inputs', 'organize_font_directory', 'split_font_batch'],
      evidence: {
        fixedRegressionTargets: DEFAULT_REAL_CORPUS_TARGETS,
        selectedTargets: targets.selectedTargets,
        availableTargetCount: targets.availableTargetCount,
        selectedTargetCount: targets.selectedTargetCount,
      },
    },
    {
      id: 'adaptive-real-corpus-sampling',
      covered: Boolean(targetsRun.ok && targets.selectionMode === 'auto' && targets.selectedTargetCount > DEFAULT_REAL_CORPUS_TARGETS.length),
      toolPaths: ['inspect_font_inputs', 'organize_font_directory', 'split_font_batch'],
      evidence: {
        selectionMode: targets.selectionMode,
        selectedTargetCount: targets.selectedTargetCount,
        targetSampleCount: targets.sampleCount,
      },
    },
    {
      id: 'runtime-and-agent-guidance',
      covered: integrationRun.ok === true,
      toolPaths: ['get_runtime_status', 'get_agent_guidance'],
      evidence: {
        sampleInputDir: integration.sampleInputDir,
      },
    },
    {
      id: 'copy-only-organization-write',
      covered: integrationRun.ok === true,
      toolPaths: ['organize_font_directory'],
      evidence: {
        outputRoot: integration.outputRoot,
        sourceDestructive: false,
      },
    },
    {
      id: 'single-font-write-and-audit',
      covered: Boolean(integrationRun.ok && integration.singleAuditStatus === 'pass' && integration.singleStructureConforms === true),
      toolPaths: ['split_font', 'inspect_split_output'],
      evidence: {
        sampleFontPath: integration.sampleFontPath,
        auditStatus: integration.singleAuditStatus,
        structureConforms: integration.singleStructureConforms,
      },
    },
    {
      id: 'batch-reviewed-write-and-audit',
      covered: Boolean(integrationRun.ok && integration.batchAuditStatus === 'pass' && integration.batchStructureConforms === true),
      toolPaths: ['split_font_batch', 'inspect_split_output'],
      evidence: {
        outputRoot: integration.outputRoot,
        auditStatus: integration.batchAuditStatus,
        structureConforms: integration.batchStructureConforms,
      },
    },
  ];
  const toolCoverageSummary = buildRealCorpusToolCoverageSummary(functionalCoverage);
  return {
    testStrategy: 'full-root compact scan plus representative target sampling plus one bounded write/audit path',
    perDirectoryAcceptanceAudit: false,
    testScope,
    functionalCoverage,
    toolCoverageSummary,
    corpusSupportedFontCount,
    corpusUnsupportedFileCount,
    corpusUnsupportedFileDecision,
    corpusUnsupportedByExtension,
    corpusUnsupportedByCategory,
    corpusUnsupportedHandlingSummary,
    corpusUnsupportedArchiveCount,
    unsupportedFileCategoryCoverage,
    archiveHandlingScope,
    corpusMaxFilesHit,
    fixedRegressionTargets: DEFAULT_REAL_CORPUS_TARGETS,
    targetSelectionMode: targets.selectionMode,
    availableTargetCount: targets.availableTargetCount,
    selectedTargetCount: targets.selectedTargetCount,
    targetSampleCount: targets.sampleCount,
    selectedTargets,
    representativeReadonlySample: readonly.sampleInputDir,
    representativeWriteSample: integration.sampleInputDir,
    outputStructureAuditSummary,
    singleAuditStatus: integration.singleAuditStatus,
    batchAuditStatus: integration.batchAuditStatus,
  };
}

function buildRealCorpusSuiteHumanSummary(coverageSummary) {
  const corpusScan = coverageSummary.testScope?.corpusScan || {};
  const targetSampling = coverageSummary.testScope?.targetSampling || {};
  const writeAudit = coverageSummary.testScope?.representativeWriteAudit || {};
  const ignoredCoverage = coverageSummary.unsupportedFileCategoryCoverage || {};
  const archiveScope = coverageSummary.archiveHandlingScope || {};
  const ignoredCategoryText = (ignoredCoverage.categories || []).join(', ') || 'none';
  const structureAudit = coverageSummary.outputStructureAuditSummary || {};
  const toolCoverage = coverageSummary.toolCoverageSummary || {};
  const fixedCount = targetSampling.fixedRegressionTargetCount ?? coverageSummary.fixedRegressionTargets?.length;
  const selectedCount = targetSampling.selectedTargetCount ?? coverageSummary.selectedTargetCount;
  const availableCount = targetSampling.availableTargetCount ?? coverageSummary.availableTargetCount;
  const functionalCoverage = coverageSummary.functionalCoverage || [];
  const coveredCount = functionalCoverage.filter((item) => item.covered === true).length;
  const totalCoverageCount = functionalCoverage.length;
  const lines = [
    `Full corpus scan: ${corpusScan.supportedFontCount ?? 'unknown'} supported font files and ${corpusScan.unsupportedFileCount ?? 'unknown'} ignored/non-font files; maxFilesHit=${corpusScan.maxFilesHit}.`,
    `Ignored-file coverage: ${ignoredCoverage.categoryCount ?? 'unknown'} categories (${ignoredCategoryText}), ${ignoredCoverage.extensionCount ?? 'unknown'} extension types, ${ignoredCoverage.extensionsBeyondZipTxtCount ?? 'unknown'} extension types beyond .zip/.txt.`,
    `Archive handling scope: ${archiveScope.archiveCount ?? 'unknown'} archives counted as ignored files; archivesExtracted=${archiveScope.archivesExtracted}, archiveInternalFontsCovered=${archiveScope.archiveInternalFontsCovered}.`,
    `Target sampling: ${fixedCount ?? 'unknown'} fixed regression targets and ${selectedCount ?? 'unknown'} selected representative targets out of ${availableCount ?? 'unknown'} available target directories; this is not per-directory acceptance.`,
    `Representative write audit: sample=${writeAudit.sampleInputDir || 'unknown'}, single=${writeAudit.singleAuditStatus || 'unknown'} structureConforms=${structureAudit.singleStructureConforms}, batch=${writeAudit.batchAuditStatus || 'unknown'} structureConforms=${structureAudit.batchStructureConforms}.`,
    `Interpretation: small numbers such as ${fixedCount ?? 'fixed'} or ${selectedCount ?? 'selected'} are target counts, not the full corpus font count; use testScope.corpusScan.supportedFontCount for the root-level font total.`,
    `Functional coverage: ${coveredCount}/${totalCoverageCount} real-corpus feature paths covered.`,
    `Tool coverage: ${toolCoverage.coveredRequiredToolCount ?? 'unknown'}/${toolCoverage.requiredToolCount ?? 'unknown'} public MCP tools covered in representative real-corpus paths; perDirectoryAcceptanceAudit=false.`,
  ];
  return {
    summaryType: 'real-corpus-suite-human-summary',
    purpose: 'Short human-readable explanation of the representative real-corpus gate.',
    lines,
    fullCorpusSupportedFontCount: corpusScan.supportedFontCount,
    fullCorpusUnsupportedFileCount: corpusScan.unsupportedFileCount,
    ignoredFileCategoryCount: ignoredCoverage.categoryCount,
    ignoredFileExtensionCount: ignoredCoverage.extensionCount,
    ignoredFileExtensionsBeyondZipTxtCount: ignoredCoverage.extensionsBeyondZipTxtCount,
    archiveCount: archiveScope.archiveCount,
    archivesExtracted: archiveScope.archivesExtracted,
    archiveInternalFontsCovered: archiveScope.archiveInternalFontsCovered,
    fixedRegressionTargetCount: fixedCount,
    selectedTargetCount: selectedCount,
    availableTargetCount: availableCount,
    representativeWriteSample: writeAudit.sampleInputDir,
    singleAuditStatus: writeAudit.singleAuditStatus,
    singleStructureConforms: structureAudit.singleStructureConforms,
    batchAuditStatus: writeAudit.batchAuditStatus,
    batchStructureConforms: structureAudit.batchStructureConforms,
    coveredRequiredToolCount: toolCoverage.coveredRequiredToolCount,
    requiredToolCount: toolCoverage.requiredToolCount,
    allRequiredToolsCovered: toolCoverage.allRequiredToolsCovered,
    perDirectoryAcceptanceAudit: false,
  };
}

function buildRealCorpusCountGuide(coverageSummary, humanSummary) {
  const corpusScan = coverageSummary.testScope?.corpusScan || {};
  const targetSampling = coverageSummary.testScope?.targetSampling || {};
  const writeAudit = coverageSummary.testScope?.representativeWriteAudit || {};
  const supportedFontCount = corpusScan.supportedFontCount ?? coverageSummary.corpusSupportedFontCount;
  const unsupportedFileCount = corpusScan.unsupportedFileCount ?? coverageSummary.corpusUnsupportedFileCount;
  const fixedRegressionTargetCount = targetSampling.fixedRegressionTargetCount ?? humanSummary?.fixedRegressionTargetCount;
  const selectedTargetCount = targetSampling.selectedTargetCount ?? humanSummary?.selectedTargetCount;
  const availableTargetCount = targetSampling.availableTargetCount ?? humanSummary?.availableTargetCount;
  return {
    summaryType: 'real-corpus-count-guide',
    purpose: 'Disambiguates full corpus counts from representative target counts in real-corpus suite output.',
    directAnswer: `Full corpus scan counted ${supportedFontCount ?? 'unknown'} supported font files; target counts such as ${fixedRegressionTargetCount ?? 'fixed'} fixed regression targets and ${selectedTargetCount ?? 'selected'} selected representative targets are sampling counts, not full corpus counts.`,
    fullCorpus: {
      source: 'testScope.corpusScan',
      scopeKind: corpusScan.scopeKind,
      supportedFontCountField: 'testScope.corpusScan.supportedFontCount',
      supportedFontCount,
      unsupportedFileCountField: 'testScope.corpusScan.unsupportedFileCount',
      unsupportedFileCount,
      maxFilesHitField: 'testScope.corpusScan.maxFilesHit',
      maxFilesHit: corpusScan.maxFilesHit,
      archiveHandlingScopeField: 'coverageSummary.archiveHandlingScope',
      archiveInternalFontsCovered: coverageSummary.archiveHandlingScope?.archiveInternalFontsCovered,
      meaning: 'Use these fields when answering how many supported font files or ignored/non-font files the bounded root scan saw.',
    },
    representativeTargets: {
      source: 'testScope.targetSampling',
      scopeKind: targetSampling.scopeKind,
      fixedRegressionTargetCountField: 'testScope.targetSampling.fixedRegressionTargetCount',
      fixedRegressionTargetCount,
      selectedTargetCountField: 'testScope.targetSampling.selectedTargetCount',
      selectedTargetCount,
      availableTargetCountField: 'testScope.targetSampling.availableTargetCount',
      availableTargetCount,
      targetCountsAreFullCorpusCounts: false,
      perDirectoryAcceptanceAudit: false,
      meaning: 'Use these fields to understand which directories were sampled for representative regression coverage, not as full corpus totals.',
    },
    representativeWriteAudit: {
      source: 'testScope.representativeWriteAudit',
      sampleInputDirField: 'testScope.representativeWriteAudit.sampleInputDir',
      sampleInputDir: writeAudit.sampleInputDir,
      meaning: 'This is one bounded real write and output audit sample, not a per-directory write test.',
    },
    readOrder: [
      'reliabilityGateDecision',
      'corpusCountGuide.fullCorpus',
      'corpusCountGuide.representativeTargets',
      'coverageSummary.functionalCoverage',
      'coverageSummary.toolCoverageSummary',
      'coverageSummary.outputStructureAuditSummary',
    ],
    nonIntuitiveBehavior: 'Small target counts are expected because this suite combines a full root scan with representative target sampling; they are not evidence that the full corpus scan only saw a few fonts.',
  };
}

function buildCompactOutputStructureAuditSummary(summary = {}) {
  return {
    summaryType: summary.summaryType,
    sampleInputDir: summary.sampleInputDir,
    outputRoot: summary.outputRoot,
    singleOutputRoleDecisionStatus: summary.singleOutputRoleDecision?.status,
    singleOutputRoleAuditApplies: summary.singleOutputRoleDecision?.auditAppliesToThisDirectory,
    singleOutputStructureDecisionStatus: summary.singleOutputStructureDecision?.status,
    singleAuditStatus: summary.singleAuditStatus,
    singleAuditPassed: summary.singleAuditPassed,
    singleStructureConforms: summary.singleStructureConforms,
    singleStructureLayoutKind: summary.singleStructureLayoutKind,
    singleManifestCoverageOk: summary.singleManifestCoverageOk,
    singleStructureIssueCount: summary.singleStructureIssueCount,
    batchOutputRoleDecisionStatus: summary.batchOutputRoleDecision?.status,
    batchOutputRoleAuditApplies: summary.batchOutputRoleDecision?.auditAppliesToThisDirectory,
    batchOutputStructureDecisionStatus: summary.batchOutputStructureDecision?.status,
    batchAuditStatus: summary.batchAuditStatus,
    batchAuditPassed: summary.batchAuditPassed,
    batchStructureConforms: summary.batchStructureConforms,
    batchStructureLayoutKind: summary.batchStructureLayoutKind,
    batchManifestCoverageOk: summary.batchManifestCoverageOk,
    batchStructureIssueCount: summary.batchStructureIssueCount,
  };
}

function buildCompactRealCorpusCoverageSummary(coverageSummary = {}) {
  return {
    summaryType: 'real-corpus-suite-compact-coverage',
    testStrategy: coverageSummary.testStrategy,
    perDirectoryAcceptanceAudit: coverageSummary.perDirectoryAcceptanceAudit,
    corpusSupportedFontCount: coverageSummary.corpusSupportedFontCount,
    corpusUnsupportedFileCount: coverageSummary.corpusUnsupportedFileCount,
    corpusMaxFilesHit: coverageSummary.corpusMaxFilesHit,
    selectedTargetCount: coverageSummary.selectedTargetCount,
    availableTargetCount: coverageSummary.availableTargetCount,
    selectedTargets: coverageSummary.selectedTargets,
    fixedRegressionTargets: coverageSummary.fixedRegressionTargets,
    representativeWriteSample: coverageSummary.testScope?.representativeWriteAudit?.sampleInputDir,
    unsupportedFileCategoryCoverage: coverageSummary.unsupportedFileCategoryCoverage,
    archiveHandlingScope: coverageSummary.archiveHandlingScope,
    toolCoverageSummary: coverageSummary.toolCoverageSummary,
    outputStructureAuditSummary: buildCompactOutputStructureAuditSummary(coverageSummary.outputStructureAuditSummary),
    functionalCoverage: (coverageSummary.functionalCoverage || []).map((item) => ({
      id: item.id,
      covered: item.covered,
      toolPaths: item.toolPaths,
      evidenceOmitted: true,
    })),
    omittedDetailFields: [
      'coverageSummary.functionalCoverage[].evidence',
      'coverageSummary.outputStructureAuditSummary.singleOutputRoleDecision',
      'coverageSummary.outputStructureAuditSummary.singleOutputStructureDecision',
      'coverageSummary.outputStructureAuditSummary.batchOutputRoleDecision',
      'coverageSummary.outputStructureAuditSummary.batchOutputStructureDecision',
    ],
    detailHint: 'Rerun with --verbose to include full per-child summaries and coverage evidence.',
  };
}

function buildRealCorpusReliabilityGateDecision(coverageSummary, humanSummary) {
  const functionalCoverage = coverageSummary.functionalCoverage || [];
  const uncoveredFunctionalCoverageIds = functionalCoverage
    .filter((item) => item.covered !== true)
    .map((item) => item.id)
    .filter(Boolean);
  const outputAudit = coverageSummary.outputStructureAuditSummary || {};
  const archiveHandlingScope = coverageSummary.archiveHandlingScope || {};
  const toolCoverageSummary = coverageSummary.toolCoverageSummary || {};
  const targetSampling = coverageSummary.testScope?.targetSampling || {};
  const corpusScan = coverageSummary.testScope?.corpusScan || {};
  const writeAudit = coverageSummary.testScope?.representativeWriteAudit || {};
  const blockingReasonCodes = [];

  if (coverageSummary.perDirectoryAcceptanceAudit !== false || humanSummary?.perDirectoryAcceptanceAudit !== false) {
    blockingReasonCodes.push('scope-ambiguous');
  }
  if (coverageSummary.corpusMaxFilesHit === true || corpusScan.maxFilesHit === true) {
    blockingReasonCodes.push('corpus-scan-truncated');
  }
  if (!(coverageSummary.corpusSupportedFontCount > 0)) {
    blockingReasonCodes.push('no-supported-fonts-found');
  }
  if (!(coverageSummary.unsupportedFileCategoryCoverage?.categoryCount > 0)) {
    blockingReasonCodes.push('ignored-file-coverage-missing');
  }
  if (!(coverageSummary.unsupportedFileCategoryCoverage?.extensionsBeyondZipTxtCount > 0)) {
    blockingReasonCodes.push('ignored-file-extension-coverage-too-narrow');
  }
  if (
    archiveHandlingScope.summaryType !== 'archive-handling-scope'
    || archiveHandlingScope.archivesCountedAsIgnored !== true
    || archiveHandlingScope.archivesExtracted !== false
    || archiveHandlingScope.archiveContentsScanned !== false
    || archiveHandlingScope.archiveInternalFontsCovered !== false
  ) {
    blockingReasonCodes.push('archive-handling-scope-ambiguous');
  }
  if (!(coverageSummary.selectedTargetCount > 0)) {
    blockingReasonCodes.push('target-sampling-empty');
  }
  if (
    !Array.isArray(coverageSummary.selectedTargets)
    || !DEFAULT_REAL_CORPUS_TARGETS.every((target) => coverageSummary.selectedTargets.includes(target))
  ) {
    blockingReasonCodes.push('fixed-regression-targets-missing');
  }
  if (uncoveredFunctionalCoverageIds.length > 0 || functionalCoverage.length === 0) {
    blockingReasonCodes.push('functional-coverage-gaps');
  }
  if (toolCoverageSummary.allRequiredToolsCovered !== true) {
    blockingReasonCodes.push('tool-coverage-gaps');
  }
  if (
    outputAudit.singleOutputRoleDecision?.auditAppliesToThisDirectory !== true
    || outputAudit.batchOutputRoleDecision?.auditAppliesToThisDirectory !== true
    || outputAudit.singleOutputStructureDecision?.status !== 'pass'
    || outputAudit.batchOutputStructureDecision?.status !== 'pass'
    || outputAudit.singleStructureConforms !== true
    || outputAudit.batchStructureConforms !== true
    || writeAudit.singleAuditPassed !== true
    || writeAudit.batchAuditPassed !== true
  ) {
    blockingReasonCodes.push('representative-output-audit-failed');
  }

  const status = blockingReasonCodes.includes('corpus-scan-truncated')
    ? 'incomplete'
    : (blockingReasonCodes.length === 0 ? 'pass' : 'action-required');
  const recommendedAction = status === 'pass'
    ? 'continue'
    : (status === 'incomplete' ? 'rerun-real-corpus-suite-with-higher-maxFiles' : 'inspect-coverageSummary-and-runs');

  return {
    summaryType: 'real-corpus-reliability-gate-decision',
    status,
    reliabilityGatePassed: status === 'pass',
    recommendedAction,
    representativeReliabilityGate: true,
    perDirectoryAcceptanceAudit: false,
    perFontManualAudit: false,
    blockingReasonCodes,
    uncoveredFunctionalCoverageIds,
    fullCorpusFontCountField: 'testScope.corpusScan.supportedFontCount',
    targetCountsAreFullCorpusCounts: false,
    targetCountFields: [
      'testScope.targetSampling.fixedRegressionTargetCount',
      'testScope.targetSampling.selectedTargetCount',
    ],
    archiveHandlingScopeField: 'coverageSummary.archiveHandlingScope',
    archiveCount: archiveHandlingScope.archiveCount,
    archivesExtracted: archiveHandlingScope.archivesExtracted,
    archiveInternalFontsCovered: archiveHandlingScope.archiveInternalFontsCovered,
    corpusSupportedFontCount: corpusScan.supportedFontCount,
    corpusUnsupportedFileCount: corpusScan.unsupportedFileCount,
    fixedRegressionTargetCount: targetSampling.fixedRegressionTargetCount,
    selectedTargetCount: targetSampling.selectedTargetCount,
    availableTargetCount: targetSampling.availableTargetCount,
    coveredFunctionalCoverageCount: functionalCoverage.filter((item) => item.covered === true).length,
    totalFunctionalCoverageCount: functionalCoverage.length,
    coveredRequiredToolCount: toolCoverageSummary.coveredRequiredToolCount,
    requiredToolCount: toolCoverageSummary.requiredToolCount,
    allRequiredToolsCovered: toolCoverageSummary.allRequiredToolsCovered === true,
    uncoveredTools: toolCoverageSummary.uncoveredTools || [],
    representativeWriteSample: writeAudit.sampleInputDir,
    singleOutputRoleDecisionStatus: outputAudit.singleOutputRoleDecision?.status,
    singleOutputRoleAuditApplies: outputAudit.singleOutputRoleDecision?.auditAppliesToThisDirectory,
    batchOutputRoleDecisionStatus: outputAudit.batchOutputRoleDecision?.status,
    batchOutputRoleAuditApplies: outputAudit.batchOutputRoleDecision?.auditAppliesToThisDirectory,
    singleOutputStructureDecisionStatus: outputAudit.singleOutputStructureDecision?.status,
    batchOutputStructureDecisionStatus: outputAudit.batchOutputStructureDecision?.status,
    evidenceFields: [
      'humanSummary',
      'testScope',
      'coverageSummary.functionalCoverage',
      'coverageSummary.toolCoverageSummary',
      'coverageSummary.unsupportedFileCategoryCoverage',
      'coverageSummary.archiveHandlingScope',
      'coverageSummary.outputStructureAuditSummary',
    ],
    passCriteria: 'Require a complete full-root corpus scan, selected target sampling, all functionalCoverage entries covered, all required public MCP tools covered by toolCoverageSummary, archiveHandlingScope.archiveInternalFontsCovered false, representative single and batch outputRoleDecision.auditAppliesToThisDirectory true, outputStructureDecision.status pass, structureSummary.conforms true, and perDirectoryAcceptanceAudit false.',
    nonIntuitiveBehavior: 'status pass means the representative real-corpus feature chain passed; it is not a per-directory acceptance audit, target counts such as 4 or 10 are not the full corpus font count, and archives are counted as ignored files rather than extracted.',
  };
}

function printRealCorpusSuiteHumanSummary(humanSummary) {
  console.log('\n--- real-corpus suite summary ---');
  for (const line of humanSummary.lines || []) {
    console.log(line);
  }
}

function summarizeRealCorpusSuiteRun(run = {}) {
  return {
    scenario: run.scenario,
    ok: run.ok,
    elapsedMs: run.elapsedMs,
    stdoutBytes: run.stdoutBytes,
    stderrBytes: run.stderrBytes,
    outputIncluded: run.outputIncluded,
  };
}

function buildRealCorpusSuiteFinalOutput({
  verbose,
  corpusRoot,
  maxFiles,
  targetLimit,
  integrationLimit,
  sampleCount,
  reliabilityGateDecision,
  humanSummary,
  corpusCountGuide,
  coverageSummary,
  runs,
}) {
  const output = {
    ok: true,
    purpose: 'Representative reliability gate over a local real font corpus; not a per-directory acceptance audit.',
    outputMode: verbose ? 'verbose' : 'compact',
    corpusRoot,
    maxFiles,
    targetLimit,
    integrationLimit,
    sampleCount,
    reliabilityGateDecision,
    corpusCountGuide,
    humanSummary,
    testScope: coverageSummary.testScope,
    coverageSummary: verbose ? coverageSummary : buildCompactRealCorpusCoverageSummary(coverageSummary),
    runSummaries: (runs || []).map(summarizeRealCorpusSuiteRun),
  };

  if (verbose) {
    output.runs = runs;
    output.omittedDetailFields = [];
  } else {
    output.omittedDetailFields = [
      'runs',
      'coverageSummary.functionalCoverage[].evidence',
      'coverageSummary.outputStructureAuditSummary.singleOutputRoleDecision',
      'coverageSummary.outputStructureAuditSummary.singleOutputStructureDecision',
      'coverageSummary.outputStructureAuditSummary.batchOutputRoleDecision',
      'coverageSummary.outputStructureAuditSummary.batchOutputStructureDecision',
    ];
    output.verboseCommandHint = 'Rerun the same command with --verbose to include child run summaries and detailed coverage evidence.';
  }

  return output;
}

async function runSmokeSubprocess(args, label, { verbose = false } = {}) {
  const startedAt = Date.now();
  console.log(`\n--- ${label} ---`);
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [process.argv[1], ...args], {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 50 * 1024 * 1024,
    });
    const elapsedMs = Date.now() - startedAt;
    if (verbose) {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
    } else {
      console.log(`ok (${(elapsedMs / 1000).toFixed(1)}s)`);
    }
    const parsedResult = parseSmokeJsonOutput(stdout);
    return {
      scenario: args[0],
      ok: true,
      elapsedMs,
      stdoutBytes: Buffer.byteLength(stdout || ''),
      stderrBytes: Buffer.byteLength(stderr || ''),
      outputIncluded: verbose,
      summary: summarizeRealCorpusSubprocess(args[0], parsedResult),
    };
  } catch (error) {
    if (error.stdout) process.stdout.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    throw new Error(`${label} failed with exit code ${error.code ?? 'unknown'}: ${error.message}`);
  }
}

async function collectProbeFiles(dir, { maxFiles = 120 } = {}) {
  const files = [];
  const excludedDirs = new Set(['.git', 'node_modules', 'font-split-mcp', '__MACOSX']);
  const shouldExclude = (name) => name.startsWith('._')
    || excludedDirs.has(name)
    || name === 'split-output'
    || name.startsWith('split-output-');

  async function walk(currentDir) {
    if (files.length >= maxFiles) return;
    const entries = (await fs.readdir(currentDir, { withFileTypes: true }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const entry of entries) {
      if (shouldExclude(entry.name)) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
      if (files.length >= maxFiles) return;
    }
  }

  await walk(dir);
  return files;
}

function summarizeProbeFiles(files) {
  const unsupportedExtensions = new Set();
  let supportedCount = 0;
  let unsupportedCount = 0;
  for (const file of files) {
    const extension = path.extname(file).toLowerCase() || '<none>';
    if (isRealCorpusSupportedFont(file)) {
      supportedCount++;
    } else {
      unsupportedCount++;
      unsupportedExtensions.add(extension);
    }
  }
  return {
    supportedCount,
    unsupportedCount,
    unsupportedExtensions: [...unsupportedExtensions].sort(),
  };
}

function isRealCorpusSupportedFont(file) {
  return REAL_CORPUS_FONT_EXTENSIONS.has(path.extname(file).toLowerCase());
}

function parseRealCorpusTargetList(value) {
  if (!value || String(value).trim().toLowerCase() === 'auto') return null;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildRealCorpusTargetProfiles({ corpusRoot, files }) {
  const byTopLevelDir = new Map();
  for (const file of files) {
    const relative = path.relative(corpusRoot, file);
    const parts = relative.split(path.sep).filter(Boolean);
    if (parts.length < 2) continue;
    const inputDir = parts[0];
    const profile = byTopLevelDir.get(inputDir) || {
      inputDir,
      scannedFileCount: 0,
      supportedFontCount: 0,
      unsupportedFileCount: 0,
      fontExtensions: new Set(),
      unsupportedExtensions: new Set(),
    };
    const extension = path.extname(file).toLowerCase() || '<none>';
    profile.scannedFileCount++;
    if (isRealCorpusSupportedFont(file)) {
      profile.supportedFontCount++;
      profile.fontExtensions.add(extension);
    } else {
      profile.unsupportedFileCount++;
      profile.unsupportedExtensions.add(extension);
    }
    byTopLevelDir.set(inputDir, profile);
  }

  return [...byTopLevelDir.values()]
    .filter((profile) => profile.supportedFontCount > 0)
    .map((profile) => ({
      ...profile,
      fontExtensions: [...profile.fontExtensions].sort(),
      unsupportedExtensions: [...profile.unsupportedExtensions].sort(),
    }))
    .sort((a, b) => a.inputDir.localeCompare(b.inputDir, undefined, { numeric: true }));
}

function scoreRealCorpusTargetProfile(profile) {
  return profile.supportedFontCount * 8
    + profile.unsupportedFileCount * 2
    + profile.fontExtensions.length * 20
    + profile.unsupportedExtensions.length * 12
    + (profile.fontExtensions.some((extension) => extension === '.woff' || extension === '.woff2') ? 25 : 0)
    + (profile.unsupportedFileCount > 0 ? 15 : 0);
}

function selectRealCorpusTargets({ requestedTargets, targetProfiles, sampleCount }) {
  if (requestedTargets) {
    return {
      mode: 'explicit',
      targets: requestedTargets,
      availableTargetCount: targetProfiles.length,
      selectedProfiles: targetProfiles.filter((profile) => requestedTargets.includes(profile.inputDir)),
    };
  }

  const profileByInputDir = new Map(targetProfiles.map((profile) => [profile.inputDir, profile]));
  const selected = [];
  const selectedSet = new Set();
  const addTarget = (inputDir) => {
    if (!inputDir || selectedSet.has(inputDir) || !profileByInputDir.has(inputDir)) return;
    selected.push(inputDir);
    selectedSet.add(inputDir);
  };

  for (const inputDir of DEFAULT_REAL_CORPUS_TARGETS) {
    addTarget(inputDir);
  }

  const ranked = [...targetProfiles]
    .filter((profile) => !selectedSet.has(profile.inputDir))
    .sort((a, b) => {
      const scoreDelta = scoreRealCorpusTargetProfile(b) - scoreRealCorpusTargetProfile(a);
      return scoreDelta || a.inputDir.localeCompare(b.inputDir, undefined, { numeric: true });
    });
  for (const profile of ranked) {
    if (selected.length >= sampleCount) break;
    addTarget(profile.inputDir);
  }

  return {
    mode: 'auto',
    targets: selected,
    availableTargetCount: targetProfiles.length,
    selectedProfiles: selected.map((inputDir) => profileByInputDir.get(inputDir)).filter(Boolean),
  };
}

async function findRealCorpusSample({ corpusRoot, requestedInputDir, maxFiles }) {
  if (requestedInputDir) {
    const requestedAbsolute = path.resolve(corpusRoot, requestedInputDir);
    if (!isInsidePath(corpusRoot, requestedAbsolute)) {
      throw new Error(`Requested sample dir is outside corpus root: ${requestedInputDir}`);
    }
    const files = await collectProbeFiles(requestedAbsolute, { maxFiles });
    const summary = summarizeProbeFiles(files);
    if (summary.supportedCount === 0) {
      throw new Error(`Requested sample dir contains no supported font files within ${maxFiles} files: ${requestedInputDir}`);
    }
    return {
      inputDir: path.relative(corpusRoot, requestedAbsolute).replaceAll(path.sep, '/') || '.',
      summary,
    };
  }

  const preferred = path.join(corpusRoot, 'aexpective');
  if (await fsExists(preferred)) {
    const files = await collectProbeFiles(preferred, { maxFiles });
    const summary = summarizeProbeFiles(files);
    if (summary.supportedCount > 0) {
      return { inputDir: 'aexpective', summary };
    }
  }

  const entries = (await fs.readdir(corpusRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  let fallback = null;
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'font-split-mcp' || entry.name === 'node_modules') continue;
    const candidateDir = path.join(corpusRoot, entry.name);
    const files = await collectProbeFiles(candidateDir, { maxFiles });
    const summary = summarizeProbeFiles(files);
    if (summary.supportedCount === 0) continue;
    const candidate = { inputDir: entry.name, summary };
    if (summary.unsupportedCount > 0) return candidate;
    fallback ??= candidate;
  }

  if (fallback) return fallback;
  throw new Error(`No supported font sample directory found under real corpus root: ${corpusRoot}`);
}

async function findRealCorpusSampleFont({ corpusRoot, inputDir, maxFiles }) {
  const sampleRoot = path.resolve(corpusRoot, inputDir);
  const files = await collectProbeFiles(sampleRoot, { maxFiles });
  const fontFile = files.find((file) => isRealCorpusSupportedFont(file));
  if (!fontFile) {
    throw new Error(`No supported font file found under real corpus sample: ${inputDir}`);
  }
  return path.relative(corpusRoot, fontFile).replaceAll(path.sep, '/');
}


export {
  DEFAULT_REAL_CORPUS_TARGETS,
  DEFAULT_REAL_CORPUS_TARGET_SAMPLE_COUNT,
  REAL_CORPUS_TARGET_EXPECTATIONS,
  summarizeSourceLayoutMismatch,
  sourceLayoutMismatchSummaryCovered,
  summarizeSourceSafetyDecision,
  sourceSafetyDecisionCovered,
  summarizeInputCountGuide,
  inputCountGuideCovered,
  summarizeInputDirectoryDecision,
  inputDirectoryDecisionCovered,
  summarizeLayoutDecision,
  layoutDecisionCovered,
  summarizeStagingDirectoryDecision,
  stagingDirectoryDecisionCovered,
  assertRealCorpusStagingDirectoryDecision,
  assertRealCorpusLayoutDecision,
  assertRealCorpusSourceLayoutMismatchSummary,
  buildUnsupportedFileCategoryCoverage,
  buildArchiveHandlingScope,
  buildRealCorpusSuiteCoverageSummary,
  buildRealCorpusSuiteHumanSummary,
  buildRealCorpusCountGuide,
  buildCompactOutputStructureAuditSummary,
  buildCompactRealCorpusCoverageSummary,
  buildRealCorpusReliabilityGateDecision,
  printRealCorpusSuiteHumanSummary,
  summarizeRealCorpusSuiteRun,
  buildRealCorpusSuiteFinalOutput,
  runSmokeSubprocess,
  collectProbeFiles,
  summarizeProbeFiles,
  isRealCorpusSupportedFont,
  parseRealCorpusTargetList,
  buildRealCorpusTargetProfiles,
  scoreRealCorpusTargetProfile,
  selectRealCorpusTargets,
  findRealCorpusSample,
  findRealCorpusSampleFont,
};
