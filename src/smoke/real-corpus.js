import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import {
  getAgentGuidance,
  getRuntimeStatus,
  inspectFontInputs,
  inspectSplitOutput,
  organizeFontDirectory,
  splitFont,
  splitFontBatch,
} from '../font-split.js';
import { promisify } from 'node:util';
import {
  assertInspectFieldsExist,
  assertObjectOmitsKeys,
  assertSourceSafetyDecision,
  isInsidePath,
} from './assertions.js';
import {
  buildCompactOutputStructureAuditSummary,
  buildCompactRealCorpusCoverageSummary,
  buildRealCorpusCountGuide,
  buildRealCorpusReliabilityGateDecision,
  buildRealCorpusSuiteFinalOutput,
  buildRealCorpusSuiteHumanSummary,
  summarizeRealCorpusSuiteRun,
} from './real-corpus-report.js';

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
    directoryOrganizationSafety: decision.directoryOrganizationSafety,
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

function printRealCorpusSuiteHumanSummary(humanSummary) {
  console.log('\n--- real-corpus suite summary ---');
  for (const line of humanSummary.lines || []) {
    console.log(line);
  }
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

async function runRealCorpusSuiteSmoke() {
  const rawSuiteArgs = process.argv.slice(3);
  const verbose = rawSuiteArgs.includes('--verbose') || process.env.FONT_SPLIT_REAL_CORPUS_SUITE_VERBOSE === 'true';
  const suiteArgs = rawSuiteArgs.filter((arg) => arg !== '--verbose');
  const corpusRoot = path.resolve(suiteArgs[0] || process.env.FONT_SPLIT_REAL_CORPUS_DIR || path.join(process.cwd(), '..'));
  const maxFiles = Number.parseInt(suiteArgs[1] || process.env.FONT_SPLIT_REAL_CORPUS_MAX_FILES || '50000', 10);
  const targetLimit = Number.parseInt(suiteArgs[2] || process.env.FONT_SPLIT_REAL_CORPUS_TARGET_LIMIT || '100', 10);
  const integrationLimit = Number.parseInt(suiteArgs[3] || process.env.FONT_SPLIT_REAL_CORPUS_INTEGRATION_LIMIT || '20', 10);
  const sampleCount = Number.parseInt(suiteArgs[4] || process.env.FONT_SPLIT_REAL_CORPUS_TARGET_SAMPLE_COUNT || String(DEFAULT_REAL_CORPUS_TARGET_SAMPLE_COUNT), 10);
  if (
    !Number.isFinite(maxFiles)
    || maxFiles < 1
    || !Number.isFinite(targetLimit)
    || targetLimit < 1
    || !Number.isFinite(integrationLimit)
    || integrationLimit < 1
    || !Number.isFinite(sampleCount)
    || sampleCount < 1
  ) {
    throw new Error('Expected positive maxFiles, targetLimit, integrationLimit, and sampleCount for real-corpus-suite smoke.');
  }

  console.log('Real corpus reliability suite:', corpusRoot, 'output:', verbose ? 'verbose' : 'compact', 'maxFiles:', maxFiles, 'targetLimit:', targetLimit, 'integrationLimit:', integrationLimit, 'sampleCount:', sampleCount);
  const runs = [];
  runs.push(await runSmokeSubprocess([
    'real-corpus-readonly',
    corpusRoot,
    '',
    String(maxFiles),
  ], 'real-corpus read-only discovery and preview', { verbose }));
  runs.push(await runSmokeSubprocess([
    'real-corpus-targets',
    corpusRoot,
    'auto',
    String(maxFiles),
    String(targetLimit),
    String(sampleCount),
  ], 'real-corpus targeted regression and adaptive sampling', { verbose }));
  runs.push(await runSmokeSubprocess([
    'real-corpus-integration',
    corpusRoot,
    '',
    '',
    String(maxFiles),
    String(integrationLimit),
  ], 'real-corpus representative write and output audit', { verbose }));

  const coverageSummary = buildRealCorpusSuiteCoverageSummary(runs, {
    maxFiles,
    targetLimit,
    integrationLimit,
    sampleCount,
  });
  const humanSummary = buildRealCorpusSuiteHumanSummary(coverageSummary);
  const corpusCountGuide = buildRealCorpusCountGuide(coverageSummary, humanSummary);
  const reliabilityGateDecision = buildRealCorpusReliabilityGateDecision(coverageSummary, humanSummary, {
    fixedRegressionTargets: DEFAULT_REAL_CORPUS_TARGETS,
  });
  const ignoredCoverageLine = (humanSummary.lines || []).find((line) => line.includes('Ignored-file coverage')) || '';
  const missingIgnoredCategories = (coverageSummary.unsupportedFileCategoryCoverage?.categories || [])
    .filter((category) => !ignoredCoverageLine.includes(category));
  if (
    coverageSummary.perDirectoryAcceptanceAudit !== false
    || coverageSummary.testScope?.corpusScan?.scopeKind !== 'full-root-bounded-scan'
    || coverageSummary.testScope?.corpusScan?.supportedFontCount !== coverageSummary.corpusSupportedFontCount
    || coverageSummary.testScope?.corpusScan?.unsupportedFileDecisionStatus !== coverageSummary.corpusUnsupportedFileDecision?.status
    || coverageSummary.testScope?.corpusScan?.unsupportedCategoryCount !== coverageSummary.unsupportedFileCategoryCoverage?.categoryCount
    || coverageSummary.testScope?.corpusScan?.unsupportedExtensionCount !== coverageSummary.unsupportedFileCategoryCoverage?.extensionCount
    || coverageSummary.testScope?.targetSampling?.scopeKind !== 'fixed-regression-plus-adaptive-sampling'
    || coverageSummary.testScope?.targetSampling?.fixedRegressionTargetCount !== DEFAULT_REAL_CORPUS_TARGETS.length
    || coverageSummary.testScope?.targetSampling?.selectedTargetCount !== coverageSummary.selectedTargetCount
    || coverageSummary.testScope?.targetSampling?.availableTargetCount !== coverageSummary.availableTargetCount
    || coverageSummary.testScope?.targetSampling?.perDirectoryAcceptanceAudit !== false
    || coverageSummary.testScope?.representativeWriteAudit?.scopeKind !== 'single-representative-write-and-audit'
    || coverageSummary.testScope?.representativeWriteAudit?.batchAuditStatus !== coverageSummary.batchAuditStatus
    || coverageSummary.outputStructureAuditSummary?.singleOutputRoleDecision?.auditAppliesToThisDirectory !== true
    || coverageSummary.outputStructureAuditSummary?.batchOutputRoleDecision?.auditAppliesToThisDirectory !== true
    || coverageSummary.outputStructureAuditSummary?.singleOutputStructureDecision?.status !== 'pass'
    || coverageSummary.outputStructureAuditSummary?.batchOutputStructureDecision?.status !== 'pass'
    || coverageSummary.testScope?.representativeWriteAudit?.singleOutputRoleAuditApplies !== true
    || coverageSummary.testScope?.representativeWriteAudit?.batchOutputRoleAuditApplies !== true
    || coverageSummary.testScope?.representativeWriteAudit?.singleStructureConforms !== true
    || coverageSummary.testScope?.representativeWriteAudit?.batchStructureConforms !== true
    || !Array.isArray(coverageSummary.functionalCoverage)
    || !coverageSummary.functionalCoverage.some((item) => item.id === 'input-count-guide')
    || !coverageSummary.functionalCoverage.some((item) => item.id === 'source-layout-mismatch-summary')
    || !coverageSummary.functionalCoverage.some((item) => item.id === 'staging-directory-decision')
    || coverageSummary.toolCoverageSummary?.summaryType !== 'real-corpus-tool-coverage-summary'
    || coverageSummary.toolCoverageSummary?.allRequiredToolsCovered !== true
    || coverageSummary.toolCoverageSummary?.scopeClarification?.perDirectoryAcceptanceAudit !== false
    || !coverageSummary.toolCoverageSummary?.tools?.some((item) => item.tool === 'split_font_batch' && item.covered === true)
    || coverageSummary.functionalCoverage.some((item) => item.covered !== true)
    || coverageSummary.corpusSupportedFontCount < 1
    || coverageSummary.corpusUnsupportedFileDecision?.summaryType !== 'unsupported-file-decision'
    || coverageSummary.corpusUnsupportedFileDecision?.totalUnsupportedFileCount !== coverageSummary.corpusUnsupportedFileCount
    || coverageSummary.corpusUnsupportedFileDecision?.handlingSummary?.archivesExtracted !== false
    || !Array.isArray(coverageSummary.corpusUnsupportedByCategory)
    || coverageSummary.unsupportedFileCategoryCoverage?.summaryType !== 'unsupported-file-category-coverage'
    || coverageSummary.unsupportedFileCategoryCoverage?.extensionsBeyondZipTxtCount < 1
    || coverageSummary.archiveHandlingScope?.summaryType !== 'archive-handling-scope'
    || coverageSummary.archiveHandlingScope?.archiveCount !== coverageSummary.unsupportedFileCategoryCoverage?.archiveCount
    || coverageSummary.archiveHandlingScope?.archivesCountedAsIgnored !== true
    || coverageSummary.archiveHandlingScope?.archivesExtracted !== false
    || coverageSummary.archiveHandlingScope?.archiveContentsScanned !== false
    || coverageSummary.archiveHandlingScope?.archiveInternalFontsCovered !== false
    || coverageSummary.archiveHandlingScope?.recommendedAction !== 'extract-archives-outside-this-tool-if-needed'
    || coverageSummary.selectedTargetCount < 1
    || coverageSummary.batchAuditStatus !== 'pass'
    || coverageSummary.outputStructureAuditSummary?.summaryType !== 'real-corpus-output-structure-audit'
    || coverageSummary.outputStructureAuditSummary?.singleStructureConforms !== true
    || coverageSummary.outputStructureAuditSummary?.batchStructureConforms !== true
    || humanSummary.summaryType !== 'real-corpus-suite-human-summary'
    || humanSummary.fullCorpusSupportedFontCount !== coverageSummary.corpusSupportedFontCount
    || humanSummary.ignoredFileCategoryCount !== coverageSummary.unsupportedFileCategoryCoverage?.categoryCount
    || humanSummary.ignoredFileExtensionsBeyondZipTxtCount !== coverageSummary.unsupportedFileCategoryCoverage?.extensionsBeyondZipTxtCount
    || humanSummary.selectedTargetCount !== coverageSummary.selectedTargetCount
    || humanSummary.singleStructureConforms !== true
    || humanSummary.batchStructureConforms !== true
    || humanSummary.allRequiredToolsCovered !== true
    || humanSummary.perDirectoryAcceptanceAudit !== false
    || corpusCountGuide.summaryType !== 'real-corpus-count-guide'
    || corpusCountGuide.fullCorpus?.supportedFontCount !== coverageSummary.corpusSupportedFontCount
    || corpusCountGuide.fullCorpus?.supportedFontCountField !== 'testScope.corpusScan.supportedFontCount'
    || corpusCountGuide.representativeTargets?.targetCountsAreFullCorpusCounts !== false
    || corpusCountGuide.representativeTargets?.perDirectoryAcceptanceAudit !== false
    || corpusCountGuide.representativeTargets?.selectedTargetCount !== coverageSummary.selectedTargetCount
    || !corpusCountGuide.directAnswer?.includes('not full corpus counts')
    || reliabilityGateDecision.summaryType !== 'real-corpus-reliability-gate-decision'
    || reliabilityGateDecision.status !== 'pass'
    || reliabilityGateDecision.reliabilityGatePassed !== true
    || reliabilityGateDecision.recommendedAction !== 'continue'
    || reliabilityGateDecision.representativeReliabilityGate !== true
    || reliabilityGateDecision.perDirectoryAcceptanceAudit !== false
    || reliabilityGateDecision.perFontManualAudit !== false
    || reliabilityGateDecision.targetCountsAreFullCorpusCounts !== false
    || reliabilityGateDecision.corpusSupportedFontCount !== coverageSummary.corpusSupportedFontCount
    || reliabilityGateDecision.selectedTargetCount !== coverageSummary.selectedTargetCount
    || reliabilityGateDecision.coveredFunctionalCoverageCount !== coverageSummary.functionalCoverage.length
    || reliabilityGateDecision.allRequiredToolsCovered !== true
    || reliabilityGateDecision.coveredRequiredToolCount !== coverageSummary.toolCoverageSummary?.requiredToolCount
    || !reliabilityGateDecision.evidenceFields?.includes('coverageSummary.toolCoverageSummary')
    || reliabilityGateDecision.archiveInternalFontsCovered !== false
    || reliabilityGateDecision.singleOutputRoleAuditApplies !== true
    || reliabilityGateDecision.batchOutputRoleAuditApplies !== true
    || reliabilityGateDecision.blockingReasonCodes?.length !== 0
    || !reliabilityGateDecision.evidenceFields?.includes('coverageSummary.archiveHandlingScope')
    || !reliabilityGateDecision.evidenceFields?.includes('coverageSummary.outputStructureAuditSummary')
    || !reliabilityGateDecision.passCriteria?.includes('outputRoleDecision.auditAppliesToThisDirectory')
    || !reliabilityGateDecision.passCriteria?.includes('outputStructureDecision.status pass')
    || !reliabilityGateDecision.nonIntuitiveBehavior?.includes('not the full corpus font count')
    || !ignoredCoverageLine
    || missingIgnoredCategories.length !== 0
    || !humanSummary.lines?.some((line) => line.includes('structureConforms=true'))
    || !humanSummary.lines?.some((line) => line.includes('not the full corpus font count'))
    || !humanSummary.lines?.some((line) => line.includes('Tool coverage:'))
  ) {
    throw new Error('Expected real-corpus-suite compact coverage summary to expose explicit reliabilityGateDecision, testScope, humanSummary, covered function paths, root counts, unsupported categories, selected targets, and passing output audits.');
  }

  printRealCorpusSuiteHumanSummary(humanSummary);
  const finalOutput = buildRealCorpusSuiteFinalOutput({
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
  });
  const finalOutputJson = JSON.stringify(finalOutput, null, 2);
  if (
    !verbose
    && (
      Object.hasOwn(finalOutput, 'runs')
      || finalOutput.outputMode !== 'compact'
      || finalOutput.corpusCountGuide?.summaryType !== 'real-corpus-count-guide'
      || finalOutput.corpusCountGuide?.fullCorpus?.supportedFontCountField !== 'testScope.corpusScan.supportedFontCount'
      || finalOutput.corpusCountGuide?.representativeTargets?.targetCountsAreFullCorpusCounts !== false
      || finalOutput.corpusCountGuide?.representativeTargets?.perDirectoryAcceptanceAudit !== false
      || !finalOutput.corpusCountGuide?.directAnswer?.includes('Full corpus scan counted')
      || finalOutput.coverageSummary?.outputStructureAuditSummary?.singleOutputRoleAuditApplies !== true
      || finalOutput.coverageSummary?.outputStructureAuditSummary?.batchOutputRoleAuditApplies !== true
      || finalOutput.coverageSummary?.outputStructureAuditSummary?.singleOutputRoleDecisionStatus !== 'audit-target'
      || finalOutput.coverageSummary?.outputStructureAuditSummary?.batchOutputRoleDecisionStatus !== 'audit-target'
      || !Array.isArray(finalOutput.runSummaries)
      || finalOutput.runSummaries.length !== runs.length
      || finalOutput.runSummaries.some((run) => Object.hasOwn(run, 'summary'))
      || finalOutput.coverageSummary?.summaryType !== 'real-corpus-suite-compact-coverage'
      || finalOutput.coverageSummary?.toolCoverageSummary?.allRequiredToolsCovered !== true
      || finalOutput.coverageSummary?.archiveHandlingScope?.archiveInternalFontsCovered !== false
      || finalOutput.coverageSummary?.functionalCoverage?.some((item) => Object.hasOwn(item, 'evidence') || item.evidenceOmitted !== true)
      || !finalOutput.omittedDetailFields?.includes('runs')
      || !finalOutput.omittedDetailFields?.includes('coverageSummary.outputStructureAuditSummary.singleOutputRoleDecision')
      || !finalOutput.omittedDetailFields?.includes('coverageSummary.outputStructureAuditSummary.batchOutputRoleDecision')
      || !finalOutput.verboseCommandHint?.includes('--verbose')
      || Buffer.byteLength(finalOutputJson, 'utf8') > 50000
    )
  ) {
    throw new Error('Expected real-corpus-suite compact output to omit child run details and large evidence while retaining decision fields.');
  }
  if (
    verbose
    && (
      finalOutput.outputMode !== 'verbose'
      || !Array.isArray(finalOutput.runs)
      || finalOutput.runs.length !== runs.length
      || finalOutput.coverageSummary?.summaryType === 'real-corpus-suite-compact-coverage'
    )
  ) {
    throw new Error('Expected real-corpus-suite verbose output to retain full child runs and detailed coverage.');
  }
  console.log(finalOutputJson);

}

async function runRealCorpusReadonlySmoke() {
  const corpusRoot = path.resolve(process.argv[3] || process.env.FONT_SPLIT_REAL_CORPUS_DIR || path.join(process.cwd(), '..'));
  const requestedInputDir = process.argv[4] || null;
  const maxFiles = Number.parseInt(process.argv[5] || process.env.FONT_SPLIT_REAL_CORPUS_MAX_FILES || '50000', 10);
  if (!Number.isFinite(maxFiles) || maxFiles < 1) {
    throw new Error('Expected maxFiles to be a positive integer for real-corpus-readonly smoke.');
  }
  process.env.FONT_SPLIT_ROOT = corpusRoot;

  const corpusProbeFiles = await collectProbeFiles(corpusRoot, { maxFiles });
  const corpusSummary = summarizeProbeFiles(corpusProbeFiles);
  if (corpusSummary.supportedCount < 1) {
    throw new Error(`Expected real corpus root to contain supported font files within ${maxFiles} files.`);
  }

  const sample = await findRealCorpusSample({ corpusRoot, requestedInputDir, maxFiles });
  const outputDir = '.font-split-real-corpus-readonly-output';
  const batchPreviewRoot = '.font-split-real-corpus-batch-preview';
  const resolvedOutputDir = path.resolve(corpusRoot, outputDir);
  const resolvedBatchPreviewRoot = path.resolve(corpusRoot, batchPreviewRoot);
  const outputDirExistedBefore = await fsExists(resolvedOutputDir);
  const batchPreviewRootExistedBefore = await fsExists(resolvedBatchPreviewRoot);
  console.log('Real corpus read-only smoke:', corpusRoot, 'corpus fonts:', corpusSummary.supportedCount, 'sample:', sample.inputDir, 'maxFiles:', maxFiles);

  const runtime = await getRuntimeStatus();
  if (runtime.ok !== true || path.resolve(runtime.workspace?.root || '') !== corpusRoot) {
    throw new Error('Expected runtime status to use the real corpus as FONT_SPLIT_ROOT.');
  }

  const corpusInspection = await inspectFontInputs({
    inputDir: '.',
    maxFiles,
    includeFiles: false,
  });
  if (
    corpusInspection.supportedFontCount !== corpusSummary.supportedCount
    || corpusInspection.unsupportedFileSummary?.total !== corpusSummary.unsupportedCount
    || corpusInspection.unsupportedFileDecision?.summaryType !== 'unsupported-file-decision'
    || corpusInspection.unsupportedFileDecision?.totalUnsupportedFileCount !== corpusSummary.unsupportedCount
    || corpusInspection.unsupportedFileDecision?.handlingSummary?.archivesExtracted !== false
    || corpusInspection.filesIncluded !== false
  ) {
    throw new Error('Expected real corpus root inspection to summarize and triage the full bounded corpus without file details.');
  }
  if (!inputCountGuideCovered(corpusInspection.inputCountGuide, {
    appliesToTool: 'inspect_font_inputs',
    fileDetailsVisibility: 'omitted-by-request',
  })) {
    throw new Error('Expected real corpus root inspection to expose inputCountGuide.');
  }
  if (
    corpusInspection.layout?.layoutKind === undefined
    || corpusInspection.recommendedBatchPreviewArgs?.workflowPreset !== 'safe-preview'
    || corpusInspection.recommendedBatchPreviewArgs?.maxFiles !== maxFiles
    || corpusInspection.inputDirectoryDecision?.summaryType !== 'input-directory-decision'
    || corpusInspection.inputDirectoryDecision?.appliesToTool !== 'inspect_font_inputs'
    || corpusInspection.inputDirectoryDecision?.writesFilesBeforeReview !== false
    || corpusInspection.inputDirectoryDecision?.sourceDestructive !== false
    || corpusInspection.inputDirectoryDecision?.safeBatchPreviewArgs?.workflowPreset !== 'safe-preview'
    || corpusInspection.inputDirectoryDecision?.safeBatchPreviewArgs?.maxFiles !== maxFiles
    || corpusInspection.inputDirectoryDecision?.safeOrganizationPreviewArgs?.workflowPreset !== 'safe-preview'
    || corpusInspection.inputDirectoryDecision?.safeOrganizationPreviewArgs?.maxFiles !== maxFiles
    || !corpusInspection.inputDirectoryDecision?.mustInspectFields?.includes('recommendedBatchPreviewArgs')
  ) {
    throw new Error('Expected real corpus root inspection to expose inputDirectoryDecision, layout, and safe preview args.');
  }

  const inspection = await inspectFontInputs({
    inputDir: sample.inputDir,
    maxFiles,
    includeFiles: false,
  });
  if (
    inspection.supportedFontCount < 1
    || inspection.filesIncluded !== false
    || inspection.unsupportedFileSummary?.total !== sample.summary.unsupportedCount
    || inspection.unsupportedFileDecision?.summaryType !== 'unsupported-file-decision'
    || inspection.unsupportedFileDecision?.totalUnsupportedFileCount !== sample.summary.unsupportedCount
    || inspection.unsupportedFileDecision?.handlingSummary?.archivesExtracted !== false
  ) {
    throw new Error('Expected real corpus input inspection to summarize and triage the bounded sample without file details.');
  }
  if (!inputCountGuideCovered(inspection.inputCountGuide, {
    appliesToTool: 'inspect_font_inputs',
    fileDetailsVisibility: 'omitted-by-request',
  })) {
    throw new Error('Expected real corpus sample inspection to expose inputCountGuide.');
  }
  if (
    inspection.layout?.layoutKind === undefined
    || inspection.recommendedBatchPreviewArgs?.workflowPreset !== 'safe-preview'
    || inspection.recommendedBatchPreviewArgs?.maxFiles !== maxFiles
    || inspection.inputDirectoryDecision?.summaryType !== 'input-directory-decision'
    || inspection.inputDirectoryDecision?.appliesToTool !== 'inspect_font_inputs'
    || inspection.inputDirectoryDecision?.writesFilesBeforeReview !== false
    || inspection.inputDirectoryDecision?.sourceDestructive !== false
    || inspection.inputDirectoryDecision?.safeBatchPreviewArgs?.workflowPreset !== 'safe-preview'
    || inspection.inputDirectoryDecision?.safeBatchPreviewArgs?.maxFiles !== maxFiles
    || inspection.inputDirectoryDecision?.safeOrganizationPreviewArgs?.workflowPreset !== 'safe-preview'
    || inspection.inputDirectoryDecision?.safeOrganizationPreviewArgs?.maxFiles !== maxFiles
  ) {
    throw new Error('Expected real corpus sample inspection to expose inputDirectoryDecision, layout, and safe preview args.');
  }
  const unsupportedExtensions = new Set((inspection.unsupportedFileSummary?.byExtension || []).map((item) => item.extension));
  for (const extension of sample.summary.unsupportedExtensions) {
    if (!unsupportedExtensions.has(extension)) {
      throw new Error(`Expected real corpus unsupported summary to include ${extension}.`);
    }
  }
  if (
    sample.summary.unsupportedExtensions.some((extension) => extension !== '.zip' && extension !== '.txt')
    && !(inspection.unsupportedFileSummary?.byExtension || []).some((item) => item.extension !== '.zip' && item.extension !== '.txt')
  ) {
    throw new Error('Expected real corpus unsupported summary to include extensions beyond .zip and .txt when present.');
  }

  const organization = await organizeFontDirectory({
    inputDir: sample.inputDir,
    outputDir,
    workflowPreset: 'structure-first',
    maxFiles,
  });
  if (
    organization.workflowPreset !== 'structure-first'
    || organization.dryRun !== true
    || organization.parsedFontMetadata !== false
    || organization.writesOutputTree !== false
    || organization.sourceDestructive !== false
    || organization.recommendedBatchPreviewArgs?.inputDir !== sample.inputDir
    || organization.recommendedBatchPreviewArgs?.workflowPreset !== 'safe-preview'
    || organization.recommendedBatchPreviewArgs?.maxFiles !== maxFiles
  ) {
    throw new Error('Expected real corpus organization smoke to stay structure-first, no-write, and return safe batch preview args.');
  }
  assertRealCorpusSourceLayoutMismatchSummary(organization.sourceLayoutMismatchSummary, 'real-corpus-readonly organization');
  assertRealCorpusLayoutDecision(organization.layoutDecision, 'real-corpus-readonly organization');
  assertRealCorpusStagingDirectoryDecision(organization.stagingDirectoryDecision, 'real-corpus-readonly organization', {
    status: 'not-written-dry-run',
    operationMode: 'plan-only',
  });
  assertSourceSafetyDecision(organization.sourceSafetyDecision, {
    context: 'real-corpus-readonly organization',
    appliesToTool: 'organize_font_directory',
    expectedStatus: 'source-safe-no-write',
    expectedWritesFiles: false,
    expectedWritesSourceTree: false,
    expectedOutputTreeInsideInputTree: false,
    expectedOutputPathRole: 'outputDir',
    expectedRequiresOutputAudit: false,
  });
  assertObjectOmitsKeys(organization.recommendedBatchPreviewArgs, [
    'dryRun',
    'includeResults',
    'skipMode',
    'batchNamingMode',
    'batchDedupeMode',
    'batchErrorMode',
    'splitFailureAction',
  ], 'real-corpus-readonly recommendedBatchPreviewArgs');
  if (!inputCountGuideCovered(organization.inputCountGuide, {
    appliesToTool: 'organize_font_directory',
    fileDetailsVisibility: 'not-returned-by-this-tool',
  })) {
    throw new Error('Expected real corpus organization preview to expose inputCountGuide.');
  }

  const batchPreview = await splitFontBatch({
    inputDir: sample.inputDir,
    outputRoot: batchPreviewRoot,
    workflowPreset: 'safe-preview',
    batchGroupBy: organization.recommendedBatchPreviewArgs?.batchGroupBy,
    limit: Math.min(20, maxFiles),
    maxFiles,
    silent: true,
  });
  const batchWriteAction = (batchPreview.recommendedNextActions || []).find((action) => action.id === 'run-reviewed-batch-write');
  if (
    batchPreview.dryRun !== true
    || batchPreview.resultsIncluded !== true
    || batchPreview.selectedFontCount < 1
    || batchWriteAction?.tool !== 'split_font_batch'
    || batchWriteAction?.suggestedArgs?.workflowPreset !== 'reviewed-write'
    || batchWriteAction?.suggestedArgs?.inputDir !== sample.inputDir
    || batchWriteAction?.suggestedArgs?.outputRoot !== batchPreviewRoot
  ) {
    throw new Error('Expected real corpus batch preview to stay read-only and recommend a reviewed-write follow-up.');
  }
  assertSourceSafetyDecision(batchPreview.sourceSafetyDecision, {
    context: 'real-corpus-readonly batch preview',
    appliesToTool: 'split_font_batch',
    expectedStatus: 'source-safe-no-write',
    expectedWritesFiles: false,
    expectedWritesSourceTree: false,
    expectedOutputTreeInsideInputTree: false,
    expectedOutputPathRole: 'outputRoot',
    expectedRequiresOutputAudit: false,
  });
  assertInspectFieldsExist(batchWriteAction, {
    split_font_batch: batchPreview,
  }, 'real-corpus-readonly batch preview action');
  if (!inputCountGuideCovered(batchPreview.inputCountGuide, {
    appliesToTool: 'split_font_batch',
    fileDetailsVisibility: 'not-returned-by-this-tool',
  })) {
    throw new Error('Expected real corpus batch preview to expose inputCountGuide.');
  }

  if ((await fsExists(resolvedOutputDir)) !== outputDirExistedBefore) {
    throw new Error('Expected real-corpus-readonly smoke not to create or remove the output directory.');
  }
  if ((await fsExists(resolvedBatchPreviewRoot)) !== batchPreviewRootExistedBefore) {
    throw new Error('Expected real-corpus-readonly batch preview not to create or remove the output directory.');
  }

  console.log(JSON.stringify({
    corpusRoot,
    corpus: {
      supportedFontCount: corpusInspection.supportedFontCount,
      inputCountGuide: summarizeInputCountGuide(corpusInspection.inputCountGuide),
      inputDirectoryDecision: summarizeInputDirectoryDecision(corpusInspection.inputDirectoryDecision),
      layout: corpusInspection.layout,
      recommendedBatchPreviewArgs: corpusInspection.recommendedBatchPreviewArgs,
      unsupportedFileDecision: corpusInspection.unsupportedFileDecision,
      unsupportedFileSummary: corpusInspection.unsupportedFileSummary,
      maxFilesHit: corpusInspection.maxFilesHit,
      filesIncluded: corpusInspection.filesIncluded,
    },
    sample,
    inspection: {
      supportedFontCount: inspection.supportedFontCount,
      inputCountGuide: summarizeInputCountGuide(inspection.inputCountGuide),
      inputDirectoryDecision: summarizeInputDirectoryDecision(inspection.inputDirectoryDecision),
      layout: inspection.layout,
      recommendedBatchPreviewArgs: inspection.recommendedBatchPreviewArgs,
      unsupportedFileDecision: inspection.unsupportedFileDecision,
      unsupportedFileSummary: inspection.unsupportedFileSummary,
      maxFilesHit: inspection.maxFilesHit,
      filesIncluded: inspection.filesIncluded,
    },
    organization: {
      layout: organization.layout,
      recommendedBatchPreviewArgs: organization.recommendedBatchPreviewArgs,
      inputCountGuide: summarizeInputCountGuide(organization.inputCountGuide),
      sourceSafetyDecision: summarizeSourceSafetyDecision(organization.sourceSafetyDecision),
      safetySummary: organization.safetySummary,
      parsedFontMetadata: organization.parsedFontMetadata,
      dedupeLimitedByParsing: organization.dedupeLimitedByParsing,
      organizationWarnings: organization.organizationWarnings,
      layoutDecision: summarizeLayoutDecision(organization.layoutDecision),
      stagingDirectoryDecision: summarizeStagingDirectoryDecision(organization.stagingDirectoryDecision),
      sourceLayoutMismatchSummary: summarizeSourceLayoutMismatch(organization.sourceLayoutMismatchSummary),
    },
    batchPreview: {
      dryRun: batchPreview.dryRun,
      discoveredFontCount: batchPreview.discoveredFontCount,
      deduplicatedCount: batchPreview.deduplicatedCount,
      selectedFontCount: batchPreview.selectedFontCount,
      skippedDuplicates: batchPreview.skippedDuplicates,
      inputCountGuide: summarizeInputCountGuide(batchPreview.inputCountGuide),
      sourceSafetyDecision: summarizeSourceSafetyDecision(batchPreview.sourceSafetyDecision),
      recommendedNextActions: batchPreview.recommendedNextActions,
    },
  }, null, 2));

}

async function runRealCorpusTargetsSmoke() {
  const corpusRoot = path.resolve(process.argv[3] || process.env.FONT_SPLIT_REAL_CORPUS_DIR || path.join(process.cwd(), '..'));
  const requestedTargets = parseRealCorpusTargetList(process.argv[4] || process.env.FONT_SPLIT_REAL_CORPUS_TARGETS);
  const maxFiles = Number.parseInt(process.argv[5] || process.env.FONT_SPLIT_REAL_CORPUS_MAX_FILES || '50000', 10);
  const limit = Number.parseInt(process.argv[6] || process.env.FONT_SPLIT_REAL_CORPUS_TARGET_LIMIT || '100', 10);
  const sampleCount = Number.parseInt(process.argv[7] || process.env.FONT_SPLIT_REAL_CORPUS_TARGET_SAMPLE_COUNT || String(DEFAULT_REAL_CORPUS_TARGET_SAMPLE_COUNT), 10);
  if (
    (requestedTargets && requestedTargets.length === 0)
    || !Number.isFinite(maxFiles)
    || maxFiles < 1
    || !Number.isFinite(limit)
    || limit < 1
    || !Number.isFinite(sampleCount)
    || sampleCount < 1
  ) {
    throw new Error('Expected targets plus positive maxFiles, limit, and sampleCount for real-corpus-targets smoke.');
  }
  process.env.FONT_SPLIT_ROOT = corpusRoot;

  const outputDir = 'font-split-mcp/.font-split-real-corpus-targets-organized-preview';
  const outputRoot = 'font-split-mcp/.font-split-real-corpus-targets-output';
  const resolvedOutputDir = path.resolve(corpusRoot, outputDir);
  const resolvedOutputRoot = path.resolve(corpusRoot, outputRoot);
  const outputDirExistedBefore = await fsExists(resolvedOutputDir);
  const outputRootExistedBefore = await fsExists(resolvedOutputRoot);

  const corpusProbeFiles = await collectProbeFiles(corpusRoot, { maxFiles });
  const targetProfiles = buildRealCorpusTargetProfiles({ corpusRoot, files: corpusProbeFiles });
  const targetSelection = selectRealCorpusTargets({ requestedTargets, targetProfiles, sampleCount });
  const targets = targetSelection.targets;
  if (targets.length === 0) {
    throw new Error(`Expected real corpus root to contain at least one supported top-level sample directory within ${maxFiles} files.`);
  }

  const corpusInspection = await inspectFontInputs({
    inputDir: '.',
    maxFiles,
    includeFiles: false,
  });
  if (corpusInspection.supportedFontCount < 1 || corpusInspection.filesIncluded !== false || corpusInspection.maxFilesHit !== false) {
    throw new Error('Expected targeted real corpus smoke to inspect the full bounded corpus root without truncation.');
  }
  if (!inputCountGuideCovered(corpusInspection.inputCountGuide, {
    appliesToTool: 'inspect_font_inputs',
    fileDetailsVisibility: 'omitted-by-request',
  })) {
    throw new Error('Expected targeted real corpus root inspection to expose inputCountGuide.');
  }

  console.log('Real corpus targeted dry-run smoke:', corpusRoot, 'selection:', targetSelection.mode, 'targets:', targets.join(','), 'limit:', limit, 'maxFiles:', maxFiles);
  const targetSummaries = [];
  for (const target of targets) {
    const sample = await findRealCorpusSample({ corpusRoot, requestedInputDir: target, maxFiles });
    const inspection = await inspectFontInputs({
      inputDir: sample.inputDir,
      maxFiles,
      includeFiles: false,
    });
    const organization = await organizeFontDirectory({
      inputDir: sample.inputDir,
      outputDir,
      workflowPreset: 'structure-first',
      maxFiles,
    });
    const batchPreview = await splitFontBatch({
      inputDir: sample.inputDir,
      outputRoot,
      workflowPreset: 'safe-preview',
      batchGroupBy: organization.recommendedBatchPreviewArgs?.batchGroupBy,
      limit: Math.min(limit, maxFiles),
      maxFiles,
      silent: true,
    });
    const batchWriteAction = (batchPreview.recommendedNextActions || []).find((action) => action.id === 'run-reviewed-batch-write');
    const planned = batchPreview.planned || [];
    const numericSuffixCount = planned.filter((item) => /-\d+$/.test(item.splitDirName || '')).length;
    const sourceSuffixCount = planned.filter((item) => (item.splitDirName || '').includes('--')).length;
    const expected = REAL_CORPUS_TARGET_EXPECTATIONS[sample.inputDir];
    if (
      inspection.supportedFontCount < 1
      || organization.dryRun !== true
      || organization.writesOutputTree !== false
      || organization.sourceDestructive !== false
      || organization.recommendedBatchPreviewArgs?.inputDir !== sample.inputDir
      || organization.recommendedBatchPreviewArgs?.workflowPreset !== 'safe-preview'
      || organization.recommendedBatchPreviewArgs?.maxFiles !== maxFiles
      || batchPreview.dryRun !== true
      || batchPreview.writesOutputTree !== false
      || batchPreview.sourceDestructive !== false
      || batchPreview.maxFilesHit !== false
      || batchPreview.selectedFontCount < 1
      || batchWriteAction?.tool !== 'split_font_batch'
      || batchWriteAction?.suggestedArgs?.workflowPreset !== 'reviewed-write'
      || batchWriteAction?.suggestedArgs?.batchGroupBy !== organization.recommendedBatchPreviewArgs?.batchGroupBy
      || (expected && numericSuffixCount !== 0)
      || sourceSuffixCount !== 0
    ) {
      throw new Error(`Expected targeted real corpus dry-run to stay safe and stable for ${target}.`);
    }
    assertRealCorpusSourceLayoutMismatchSummary(organization.sourceLayoutMismatchSummary, `real-corpus-targets ${target} organization`);
    assertRealCorpusLayoutDecision(organization.layoutDecision, `real-corpus-targets ${target} organization`);
    assertRealCorpusStagingDirectoryDecision(organization.stagingDirectoryDecision, `real-corpus-targets ${target} organization`, {
      status: 'not-written-dry-run',
      operationMode: 'plan-only',
    });
    assertSourceSafetyDecision(organization.sourceSafetyDecision, {
      context: `real-corpus-targets ${target} organization`,
      appliesToTool: 'organize_font_directory',
      expectedStatus: 'source-safe-no-write',
      expectedWritesFiles: false,
      expectedWritesSourceTree: false,
      expectedOutputTreeInsideInputTree: false,
      expectedOutputPathRole: 'outputDir',
      expectedRequiresOutputAudit: false,
    });
    assertSourceSafetyDecision(batchPreview.sourceSafetyDecision, {
      context: `real-corpus-targets ${target} batch preview`,
      appliesToTool: 'split_font_batch',
      expectedStatus: 'source-safe-no-write',
      expectedWritesFiles: false,
      expectedWritesSourceTree: false,
      expectedOutputTreeInsideInputTree: false,
      expectedOutputPathRole: 'outputRoot',
      expectedRequiresOutputAudit: false,
    });
    assertInspectFieldsExist(batchWriteAction, {
      split_font_batch: batchPreview,
    }, `real-corpus-targets ${target} batch action`);
    if (
      !inputCountGuideCovered(inspection.inputCountGuide, {
        appliesToTool: 'inspect_font_inputs',
        fileDetailsVisibility: 'omitted-by-request',
      })
      || !inputCountGuideCovered(organization.inputCountGuide, {
        appliesToTool: 'organize_font_directory',
        fileDetailsVisibility: 'not-returned-by-this-tool',
      })
      || !inputCountGuideCovered(batchPreview.inputCountGuide, {
        appliesToTool: 'split_font_batch',
        fileDetailsVisibility: 'not-returned-by-this-tool',
      })
    ) {
      throw new Error(`Expected real corpus target ${target} to expose inputCountGuide across inspect, organize, and batch preview.`);
    }

    if (
      expected
      && (
        inspection.supportedFontCount !== expected.supportedFontCount
        || inspection.unsupportedFileSummary?.total !== expected.unsupportedTotal
        || organization.layout?.layoutKind !== expected.layoutKind
        || organization.recommendedBatchPreviewArgs?.batchGroupBy !== expected.batchGroupBy
        || batchPreview.discoveredFontCount !== expected.discoveredFontCount
        || batchPreview.deduplicatedCount !== expected.deduplicatedCount
        || batchPreview.skippedDuplicates !== expected.skippedDuplicates
      )
    ) {
      throw new Error(`Real corpus target ${sample.inputDir} drifted from the expected naming/dedupe baseline.`);
    }

    targetSummaries.push({
      inputDir: sample.inputDir,
      supportedFontCount: inspection.supportedFontCount,
      inputCountGuide: summarizeInputCountGuide(inspection.inputCountGuide),
      unsupportedFileSummary: inspection.unsupportedFileSummary,
      layout: organization.layout,
      recommendedBatchPreviewArgs: organization.recommendedBatchPreviewArgs,
      organizationInputCountGuide: summarizeInputCountGuide(organization.inputCountGuide),
      organizationSourceSafetyDecision: summarizeSourceSafetyDecision(organization.sourceSafetyDecision),
      layoutDecision: summarizeLayoutDecision(organization.layoutDecision),
      stagingDirectoryDecision: summarizeStagingDirectoryDecision(organization.stagingDirectoryDecision),
      sourceLayoutMismatchSummary: summarizeSourceLayoutMismatch(organization.sourceLayoutMismatchSummary),
      discoveredFontCount: batchPreview.discoveredFontCount,
      deduplicatedCount: batchPreview.deduplicatedCount,
      selectedFontCount: batchPreview.selectedFontCount,
      skippedDuplicates: batchPreview.skippedDuplicates,
      numericSuffixCount,
      sourceSuffixCount,
      batchPreviewInputCountGuide: summarizeInputCountGuide(batchPreview.inputCountGuide),
      batchPreviewSourceSafetyDecision: summarizeSourceSafetyDecision(batchPreview.sourceSafetyDecision),
      planned: planned.map((item) => ({
        input: item.input,
        groupName: item.groupName,
        splitDirName: item.splitDirName,
        copiedOriginalFileName: item.copiedOriginalFileName,
      })),
      recommendedNextActions: batchPreview.recommendedNextActions,
    });
  }

  if ((await fsExists(resolvedOutputDir)) !== outputDirExistedBefore || (await fsExists(resolvedOutputRoot)) !== outputRootExistedBefore) {
    throw new Error('Expected targeted real corpus dry-run smoke not to create or remove output directories.');
  }

  console.log(JSON.stringify({
    corpusRoot,
    selection: {
      mode: targetSelection.mode,
      requestedTargets,
      sampleCount,
      availableTargetCount: targetSelection.availableTargetCount,
      selectedTargetCount: targets.length,
      selectedProfiles: targetSelection.selectedProfiles,
    },
    corpus: {
      supportedFontCount: corpusInspection.supportedFontCount,
      inputCountGuide: summarizeInputCountGuide(corpusInspection.inputCountGuide),
      unsupportedFileDecision: corpusInspection.unsupportedFileDecision,
      unsupportedFileSummary: corpusInspection.unsupportedFileSummary,
      maxFilesHit: corpusInspection.maxFilesHit,
    },
    targets: targetSummaries,
  }, null, 2));

}

async function runRealCorpusIntegrationSmoke() {
  const corpusRoot = path.resolve(process.argv[3] || process.env.FONT_SPLIT_REAL_CORPUS_DIR || path.join(process.cwd(), '..'));
  const requestedInputDir = process.argv[4] || null;
  const outputRoot = process.argv[5] || 'font-split-mcp/.font-split-real-corpus-integration-output';
  const maxFiles = Number.parseInt(process.argv[6] || process.env.FONT_SPLIT_REAL_CORPUS_MAX_FILES || '50000', 10);
  const limit = Number.parseInt(process.argv[7] || process.env.FONT_SPLIT_REAL_CORPUS_INTEGRATION_LIMIT || '20', 10);
  if (!Number.isFinite(maxFiles) || maxFiles < 1 || !Number.isFinite(limit) || limit < 1) {
    throw new Error('Expected maxFiles and limit to be positive integers for real-corpus-integration smoke.');
  }
  process.env.FONT_SPLIT_ROOT = corpusRoot;

  const resolvedOutputRoot = path.resolve(corpusRoot, outputRoot);
  if (!isInsidePath(corpusRoot, resolvedOutputRoot) || !path.basename(resolvedOutputRoot).startsWith('.font-split-')) {
    throw new Error('real-corpus-integration only clears and writes a generated .font-split-* output directory inside the corpus root.');
  }
  await fs.rm(resolvedOutputRoot, { recursive: true, force: true });

  const sample = await findRealCorpusSample({ corpusRoot, requestedInputDir, maxFiles });
  const sampleFontPath = await findRealCorpusSampleFont({ corpusRoot, inputDir: sample.inputDir, maxFiles });
  const organizationOutputDir = `${outputRoot}/organized`;
  const singleOutputDir = `${outputRoot}/single`;
  const batchOutputRoot = `${outputRoot}/batch`;

  console.log('Real corpus integration smoke:', corpusRoot, 'sample:', sample.inputDir, 'font:', sampleFontPath, '->', outputRoot, 'limit:', limit, 'maxFiles:', maxFiles);

  const runtime = await getRuntimeStatus();
  if (runtime.ok !== true || path.resolve(runtime.workspace?.root || '') !== corpusRoot) {
    throw new Error('Expected real-corpus-integration runtime status to use the real corpus as FONT_SPLIT_ROOT.');
  }

  const guidance = getAgentGuidance({ workflow: 'batch' });
  if (
    guidance.agentOptimized !== true
    || guidance.workflow !== 'batch'
    || !guidance.safeInvocationTemplates?.some((template) => template.tool === 'split_font_batch')
    || !guidance.directoryWorkflowDecisionMatrix?.length
  ) {
    throw new Error('Expected real-corpus-integration guidance to expose agent-safe batch workflow hints.');
  }

  const corpusInspection = await inspectFontInputs({
    inputDir: '.',
    maxFiles,
    includeFiles: false,
  });
  if (corpusInspection.supportedFontCount < 1 || corpusInspection.filesIncluded !== false || corpusInspection.maxFilesHit !== false) {
    throw new Error('Expected real-corpus-integration to inspect the full bounded corpus root without truncation.');
  }
  if (corpusInspection.recommendedBatchPreviewArgs?.maxFiles !== maxFiles) {
    throw new Error('Expected real-corpus-integration root inspection safe-preview args to preserve maxFiles.');
  }
  if (!inputCountGuideCovered(corpusInspection.inputCountGuide, {
    appliesToTool: 'inspect_font_inputs',
    fileDetailsVisibility: 'omitted-by-request',
  })) {
    throw new Error('Expected real-corpus-integration root inspection to expose inputCountGuide.');
  }

  const sampleInspection = await inspectFontInputs({
    inputDir: sample.inputDir,
    maxFiles,
    includeFiles: false,
  });
  if (
    sampleInspection.supportedFontCount < 1
    || sampleInspection.filesIncluded !== false
    || sampleInspection.unsupportedFileSummary?.total !== sample.summary.unsupportedCount
    || sampleInspection.recommendedBatchPreviewArgs?.maxFiles !== maxFiles
  ) {
    throw new Error('Expected real-corpus-integration sample inspection to summarize the selected real sample.');
  }
  if (!inputCountGuideCovered(sampleInspection.inputCountGuide, {
    appliesToTool: 'inspect_font_inputs',
    fileDetailsVisibility: 'omitted-by-request',
  })) {
    throw new Error('Expected real-corpus-integration sample inspection to expose inputCountGuide.');
  }

  const organizationPreview = await organizeFontDirectory({
    inputDir: sample.inputDir,
    outputDir: organizationOutputDir,
    workflowPreset: 'safe-preview',
    maxFiles,
  });
  if (
    organizationPreview.dryRun !== true
    || organizationPreview.writesOutputTree !== false
    || organizationPreview.sourceDestructive !== false
    || organizationPreview.recommendedBatchPreviewArgs?.inputDir !== sample.inputDir
    || organizationPreview.recommendedBatchPreviewArgs?.maxFiles !== maxFiles
  ) {
    throw new Error('Expected real-corpus-integration organization preview to be source-safe and no-write.');
  }
  assertRealCorpusSourceLayoutMismatchSummary(organizationPreview.sourceLayoutMismatchSummary, 'real-corpus-integration organization preview');
  assertRealCorpusLayoutDecision(organizationPreview.layoutDecision, 'real-corpus-integration organization preview');
  assertRealCorpusStagingDirectoryDecision(organizationPreview.stagingDirectoryDecision, 'real-corpus-integration organization preview', {
    status: 'not-written-dry-run',
    operationMode: 'plan-only',
  });
  assertSourceSafetyDecision(organizationPreview.sourceSafetyDecision, {
    context: 'real-corpus-integration organization preview',
    appliesToTool: 'organize_font_directory',
    expectedStatus: 'source-safe-no-write',
    expectedWritesFiles: false,
    expectedWritesSourceTree: false,
    expectedOutputTreeInsideInputTree: false,
    expectedOutputPathRole: 'outputDir',
    expectedRequiresOutputAudit: false,
  });
  if (!inputCountGuideCovered(organizationPreview.inputCountGuide, {
    appliesToTool: 'organize_font_directory',
    fileDetailsVisibility: 'not-returned-by-this-tool',
  })) {
    throw new Error('Expected real-corpus-integration organization preview to expose inputCountGuide.');
  }

  const organizationWrite = await organizeFontDirectory({
    inputDir: sample.inputDir,
    outputDir: organizationOutputDir,
    workflowPreset: 'reviewed-write',
    batchGroupBy: organizationPreview.recommendedBatchPreviewArgs?.batchGroupBy,
    maxFiles,
  });
  if (
    organizationWrite.dryRun !== false
    || organizationWrite.writesOutputTree !== true
    || organizationWrite.sourceDestructive !== false
    || organizationWrite.organizationManifestWritten !== true
    || organizationWrite.copiedCount < 1
    || organizationWrite.errorCount !== 0
  ) {
    throw new Error('Expected real-corpus-integration organization write to copy into output only and preserve source files.');
  }
  assertRealCorpusSourceLayoutMismatchSummary(organizationWrite.sourceLayoutMismatchSummary, 'real-corpus-integration organization write');
  assertRealCorpusLayoutDecision(organizationWrite.layoutDecision, 'real-corpus-integration organization write');
  assertRealCorpusStagingDirectoryDecision(organizationWrite.stagingDirectoryDecision, 'real-corpus-integration organization write', {
    status: 'ready-for-source-preflight',
    operationMode: 'copy-only',
  });
  assertSourceSafetyDecision(organizationWrite.sourceSafetyDecision, {
    context: 'real-corpus-integration organization write',
    appliesToTool: 'organize_font_directory',
    expectedStatus: 'source-safe-output-tree-write',
    expectedWritesFiles: true,
    expectedWritesSourceTree: false,
    expectedOutputTreeInsideInputTree: false,
    expectedOutputPathRole: 'outputDir',
    expectedRequiresOutputAudit: false,
  });
  if (!inputCountGuideCovered(organizationWrite.inputCountGuide, {
    appliesToTool: 'organize_font_directory',
    fileDetailsVisibility: 'not-returned-by-this-tool',
  })) {
    throw new Error('Expected real-corpus-integration organization write to expose inputCountGuide.');
  }

  const organizedInspection = await inspectFontInputs({
    inputDir: organizationOutputDir,
    maxFiles,
    includeFiles: false,
  });
  if (organizedInspection.supportedFontCount < 1 || organizedInspection.filesIncluded !== false) {
    throw new Error('Expected real-corpus-integration to inspect organized copied fonts.');
  }
  if (!inputCountGuideCovered(organizedInspection.inputCountGuide, {
    appliesToTool: 'inspect_font_inputs',
    fileDetailsVisibility: 'omitted-by-request',
  })) {
    throw new Error('Expected real-corpus-integration organized inspection to expose inputCountGuide.');
  }

  const singleSplit = await splitFont({
    fontPath: sampleFontPath,
    outDir: singleOutputDir,
    testHtml: true,
    reporter: true,
    splitFailureAction: 'single-woff2',
    silent: true,
  });
  if (
    singleSplit.ok !== true
    || singleSplit.manifestWritten !== true
    || !singleSplit.manifestPath
    || !['subset', 'single-woff2-small-glyph', 'single-woff2-split-failure', 'single-woff2', 'copy-original-small-glyph'].includes(singleSplit.resultType)
  ) {
    throw new Error('Expected real-corpus-integration single font split to write an auditable result.');
  }

  const singleAudit = await inspectSplitOutput({
    outDir: singleOutputDir,
    includeFiles: false,
    includeFamilies: false,
  });
  const singleActionWarnings = (singleAudit.inspectionWarnings || [])
    .filter((warning) => !['output-files-omitted', 'output-families-omitted'].includes(warning.code));
  if (
    singleAudit.fontEntryCount < 1
    || singleAudit.manifestCount < 1
    || singleAudit.auditStatus !== 'pass'
    || singleAudit.auditPassed !== true
    || singleAudit.outputStructureDecision?.status !== 'pass'
    || singleAudit.outputStructureDecision?.recommendedAction !== 'continue'
    || singleAudit.structureSummary?.conforms !== true
    || singleActionWarnings.length > 0
  ) {
    throw new Error('Expected real-corpus-integration single output audit to conform.');
  }

  const batchPreview = await splitFontBatch({
    inputDir: sample.inputDir,
    outputRoot: batchOutputRoot,
    workflowPreset: 'safe-preview',
    batchGroupBy: organizationPreview.recommendedBatchPreviewArgs?.batchGroupBy,
    limit: Math.min(limit, maxFiles),
    maxFiles,
    silent: true,
  });
  const batchWriteAction = (batchPreview.recommendedNextActions || []).find((action) => action.id === 'run-reviewed-batch-write');
  if (
    batchPreview.dryRun !== true
    || batchPreview.writesOutputTree !== false
    || batchPreview.sourceDestructive !== false
    || batchPreview.selectedFontCount < 1
    || batchWriteAction?.tool !== 'split_font_batch'
    || batchWriteAction?.suggestedArgs?.workflowPreset !== 'reviewed-write'
  ) {
    throw new Error('Expected real-corpus-integration batch preview to be no-write and suggest reviewed-write.');
  }
  assertSourceSafetyDecision(batchPreview.sourceSafetyDecision, {
    context: 'real-corpus-integration batch preview',
    appliesToTool: 'split_font_batch',
    expectedStatus: 'source-safe-no-write',
    expectedWritesFiles: false,
    expectedWritesSourceTree: false,
    expectedOutputTreeInsideInputTree: false,
    expectedOutputPathRole: 'outputRoot',
    expectedRequiresOutputAudit: false,
  });
  assertInspectFieldsExist(batchWriteAction, {
    split_font_batch: batchPreview,
  }, 'real-corpus-integration batch preview action');
  if (!inputCountGuideCovered(batchPreview.inputCountGuide, {
    appliesToTool: 'split_font_batch',
    fileDetailsVisibility: 'not-returned-by-this-tool',
  })) {
    throw new Error('Expected real-corpus-integration batch preview to expose inputCountGuide.');
  }

  const batchWrite = await splitFontBatch({
    inputDir: sample.inputDir,
    outputRoot: batchOutputRoot,
    workflowPreset: 'reviewed-write',
    batchGroupBy: organizationPreview.recommendedBatchPreviewArgs?.batchGroupBy,
    limit: Math.min(limit, maxFiles),
    maxFiles,
    silent: true,
  });
  const auditAction = (batchWrite.recommendedNextActions || []).find((action) => action.id === 'audit-split-output');
  if (
    batchWrite.dryRun !== false
    || batchWrite.writesOutputTree !== true
    || batchWrite.sourceDestructive !== false
    || batchWrite.processedFontCount < 1
    || batchWrite.errorCount !== 0
    || auditAction?.tool !== 'inspect_split_output'
    || auditAction?.suggestedArgs?.outDir !== batchOutputRoot
  ) {
    throw new Error('Expected real-corpus-integration batch write to write output and recommend audit.');
  }
  assertSourceSafetyDecision(batchWrite.sourceSafetyDecision, {
    context: 'real-corpus-integration batch write',
    appliesToTool: 'split_font_batch',
    expectedStatus: 'source-safe-output-tree-write',
    expectedWritesFiles: true,
    expectedWritesSourceTree: false,
    expectedOutputTreeInsideInputTree: false,
    expectedOutputPathRole: 'outputRoot',
    expectedRequiresOutputAudit: true,
  });
  if (!inputCountGuideCovered(batchWrite.inputCountGuide, {
    appliesToTool: 'split_font_batch',
    fileDetailsVisibility: 'not-returned-by-this-tool',
  })) {
    throw new Error('Expected real-corpus-integration batch write to expose inputCountGuide.');
  }

  const batchAudit = await inspectSplitOutput(auditAction.suggestedArgs);
  const batchActionWarnings = (batchAudit.inspectionWarnings || [])
    .filter((warning) => !['output-files-omitted', 'output-families-omitted'].includes(warning.code));
  if (
    batchAudit.maxFilesHit !== false
    || batchAudit.auditStatus !== 'pass'
    || batchAudit.auditPassed !== true
    || batchAudit.outputStructureDecision?.status !== 'pass'
    || batchAudit.outputStructureDecision?.recommendedAction !== 'continue'
    || batchAudit.structureSummary?.conforms !== true
    || batchActionWarnings.length > 0
    || batchAudit.fontEntryCount < 1
  ) {
    throw new Error('Expected real-corpus-integration batch output audit to conform.');
  }
  assertInspectFieldsExist(auditAction, {
    inspect_split_output: batchAudit,
  }, 'real-corpus-integration batch audit action');

  console.log(JSON.stringify({
    corpusRoot,
    outputRoot,
    corpus: {
      supportedFontCount: corpusInspection.supportedFontCount,
      inputCountGuide: summarizeInputCountGuide(corpusInspection.inputCountGuide),
      unsupportedFileDecision: corpusInspection.unsupportedFileDecision,
      unsupportedFileSummary: corpusInspection.unsupportedFileSummary,
      maxFilesHit: corpusInspection.maxFilesHit,
    },
    sample,
    sampleFontPath,
    organization: {
      preview: {
        layout: organizationPreview.layout,
        recommendedBatchPreviewArgs: organizationPreview.recommendedBatchPreviewArgs,
        inputCountGuide: summarizeInputCountGuide(organizationPreview.inputCountGuide),
        sourceSafetyDecision: summarizeSourceSafetyDecision(organizationPreview.sourceSafetyDecision),
        safetySummary: organizationPreview.safetySummary,
        layoutDecision: summarizeLayoutDecision(organizationPreview.layoutDecision),
        stagingDirectoryDecision: summarizeStagingDirectoryDecision(organizationPreview.stagingDirectoryDecision),
        sourceLayoutMismatchSummary: summarizeSourceLayoutMismatch(organizationPreview.sourceLayoutMismatchSummary),
      },
      write: {
        outputDir: organizationWrite.outputDir,
        copiedCount: organizationWrite.copiedCount,
        deduplicatedCount: organizationWrite.deduplicatedCount,
        skippedDuplicates: organizationWrite.skippedDuplicates,
        inputCountGuide: summarizeInputCountGuide(organizationWrite.inputCountGuide),
        sourceSafetyDecision: summarizeSourceSafetyDecision(organizationWrite.sourceSafetyDecision),
        safetySummary: organizationWrite.safetySummary,
        organizationManifestPath: organizationWrite.organizationManifestPath,
        layoutDecision: summarizeLayoutDecision(organizationWrite.layoutDecision),
        stagingDirectoryDecision: summarizeStagingDirectoryDecision(organizationWrite.stagingDirectoryDecision),
        sourceLayoutMismatchSummary: summarizeSourceLayoutMismatch(organizationWrite.sourceLayoutMismatchSummary),
      },
      organizedInspection: {
        supportedFontCount: organizedInspection.supportedFontCount,
        inputCountGuide: summarizeInputCountGuide(organizedInspection.inputCountGuide),
        unsupportedFileSummary: organizedInspection.unsupportedFileSummary,
      },
    },
    singleSplit: {
      input: singleSplit.input,
      outDir: singleSplit.outDir,
      splitDir: singleSplit.splitDir,
      resultType: singleSplit.resultType,
      outputMode: singleSplit.outputMode,
      performedSplit: singleSplit.performedSplit,
      usedFallback: singleSplit.usedFallback,
      manifestPath: singleSplit.manifestPath,
    },
    singleAudit: {
      outDir: singleAudit.outDir,
      fontEntryCount: singleAudit.fontEntryCount,
      manifestCount: singleAudit.manifestCount,
      auditStatus: singleAudit.auditStatus,
      auditPassed: singleAudit.auditPassed,
      outputRoleDecision: singleAudit.outputRoleDecision,
      outputStructureDecision: singleAudit.outputStructureDecision,
      auditBlockingReasons: singleAudit.auditBlockingReasons,
      structureSummary: singleAudit.structureSummary,
      inspectionWarnings: singleAudit.inspectionWarnings,
    },
    batchPreview: {
      dryRun: batchPreview.dryRun,
      discoveredFontCount: batchPreview.discoveredFontCount,
      deduplicatedCount: batchPreview.deduplicatedCount,
      selectedFontCount: batchPreview.selectedFontCount,
      skippedDuplicates: batchPreview.skippedDuplicates,
      inputCountGuide: summarizeInputCountGuide(batchPreview.inputCountGuide),
      sourceSafetyDecision: summarizeSourceSafetyDecision(batchPreview.sourceSafetyDecision),
      recommendedNextActions: batchPreview.recommendedNextActions,
    },
    batchWrite: {
      outputRoot: batchWrite.outputRoot,
      processedFontCount: batchWrite.processedFontCount,
      errorCount: batchWrite.errorCount,
      processingSummary: batchWrite.processingSummary,
      inputCountGuide: summarizeInputCountGuide(batchWrite.inputCountGuide),
      sourceSafetyDecision: summarizeSourceSafetyDecision(batchWrite.sourceSafetyDecision),
      recommendedNextActions: batchWrite.recommendedNextActions,
    },
    batchAudit: {
      outDir: batchAudit.outDir,
      fileCount: batchAudit.fileCount,
      familyCount: batchAudit.familyCount,
      fontEntryCount: batchAudit.fontEntryCount,
      manifestCount: batchAudit.manifestCount,
      subsetOutputCount: batchAudit.subsetOutputCount,
      singleWoff2OutputCount: batchAudit.singleWoff2OutputCount,
      copyOriginalOutputCount: batchAudit.copyOriginalOutputCount,
      auditStatus: batchAudit.auditStatus,
      auditPassed: batchAudit.auditPassed,
      outputRoleDecision: batchAudit.outputRoleDecision,
      outputStructureDecision: batchAudit.outputStructureDecision,
      auditBlockingReasons: batchAudit.auditBlockingReasons,
      inspectionWarnings: batchAudit.inspectionWarnings,
      structureSummary: batchAudit.structureSummary,
    },
  }, null, 2));
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
  runRealCorpusSuiteSmoke,
  runRealCorpusReadonlySmoke,
  runRealCorpusTargetsSmoke,
  runRealCorpusIntegrationSmoke,
};
