export function buildRealCorpusSuiteHumanSummary(coverageSummary) {
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

export function buildRealCorpusCountGuide(coverageSummary, humanSummary) {
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
