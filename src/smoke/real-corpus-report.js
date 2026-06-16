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

export function buildCompactOutputStructureAuditSummary(summary = {}) {
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

export function buildCompactRealCorpusCoverageSummary(coverageSummary = {}) {
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

export function buildRealCorpusReliabilityGateDecision(
  coverageSummary,
  humanSummary,
  { fixedRegressionTargets = coverageSummary.fixedRegressionTargets || [] } = {},
) {
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
    || !fixedRegressionTargets.every((target) => coverageSummary.selectedTargets.includes(target))
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

export function summarizeRealCorpusSuiteRun(run = {}) {
  return {
    scenario: run.scenario,
    ok: run.ok,
    elapsedMs: run.elapsedMs,
    stdoutBytes: run.stdoutBytes,
    stderrBytes: run.stderrBytes,
    outputIncluded: run.outputIncluded,
  };
}

export function buildRealCorpusSuiteFinalOutput({
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
