import {
  inputCountGuideCovered,
  inputDirectoryDecisionCovered,
  layoutDecisionCovered,
  sourceLayoutMismatchSummaryCovered,
  sourceSafetyDecisionCovered,
  stagingDirectoryDecisionCovered,
} from './real-corpus-response-assertions.js';

export function buildUnsupportedFileCategoryCoverage({ total, byCategory, byExtension, handlingSummary } = {}) {
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

export function buildArchiveHandlingScope({ archiveCount = 0 } = {}) {
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

export function buildRealCorpusToolCoverageSummary(functionalCoverage = [], { requiredTools = [] } = {}) {
  const tools = requiredTools.map((tool) => {
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
    requiredTools,
    requiredToolCount: requiredTools.length,
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

export function buildRealCorpusSuiteCoverageSummary(runs, suiteOptions = {}) {
  const fixedRegressionTargets = suiteOptions.fixedRegressionTargets || [];
  const requiredToolCoverage = suiteOptions.requiredToolCoverage || [];
  const runByScenario = Object.fromEntries((runs || []).map((run) => [run.scenario, run || {}]));
  const byScenario = Object.fromEntries((runs || []).map((run) => [run.scenario, run.summary || {}]));
  const readonlyRun = runByScenario['real-corpus-readonly'] || {};
  const targetsRun = runByScenario['real-corpus-targets'] || {};
  const integrationRun = runByScenario['real-corpus-integration'] || {};
  const readonly = byScenario['real-corpus-readonly'] || {};
  const targets = byScenario['real-corpus-targets'] || {};
  const integration = byScenario['real-corpus-integration'] || {};
  const selectedTargetSet = new Set(targets.selectedTargets || []);
  const fixedRegressionTargetsCovered = fixedRegressionTargets.every((target) => selectedTargetSet.has(target));
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
      fixedRegressionTargetCount: fixedRegressionTargets.length,
      fixedRegressionTargets,
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
      covered: Boolean(targetsRun.ok && fixedRegressionTargetsCovered && targets.selectedTargetCount >= fixedRegressionTargets.length),
      toolPaths: ['inspect_font_inputs', 'organize_font_directory', 'split_font_batch'],
      evidence: {
        fixedRegressionTargets,
        selectedTargets: targets.selectedTargets,
        availableTargetCount: targets.availableTargetCount,
        selectedTargetCount: targets.selectedTargetCount,
      },
    },
    {
      id: 'adaptive-real-corpus-sampling',
      covered: Boolean(targetsRun.ok && targets.selectionMode === 'auto' && targets.selectedTargetCount > fixedRegressionTargets.length),
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
  const toolCoverageSummary = buildRealCorpusToolCoverageSummary(functionalCoverage, {
    requiredTools: requiredToolCoverage,
  });
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
    fixedRegressionTargets,
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
