export function getUnsupportedCategoryCount(summary, category) {
  return (summary?.byCategory || []).find((item) => item.category === category)?.count ?? 0;
}

export function summarizeRealCorpusSubprocess(scenario, result) {
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
