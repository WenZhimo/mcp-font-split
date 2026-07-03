import { GUIDANCE_WORKFLOWS } from './catalogs.js';
import { withDirectoryRouteInspectFields } from './guidance-inspect-fields.js';
import { OUTPUT_AUDIT_PASS_CONDITIONS_TEXT } from './output-audit-criteria.js';

export function buildVerificationChecklist() {
  return [
    {
      id: 'runtime-ready',
      appliesTo: GUIDANCE_WORKFLOWS,
      check: 'Before splitting, get_runtime_status.ok is true, or every recommendedActions[] item has been handled.',
      responseFields: ['ok', 'recommendedActions', 'node', 'workspace', 'wasm', 'cnFontSplit'],
    },
    {
      id: 'input-scan-complete',
      appliesTo: ['overview', 'batch', 'inspect', 'organize'],
      check: 'Before trusting a source scan, inspect inputCountGuide, maxFilesHit, and inspectionWarnings; rerun with a higher maxFiles when truncated.',
      responseFields: ['inputCountGuide', 'maxFilesHit', 'inspectionWarnings', 'supportedFontCount', 'unsupportedFileDecision', 'unsupportedFileSummary', 'invalidFontCount', 'missingIdentityCount'],
    },
    {
      id: 'layout-plan-reviewed',
      appliesTo: ['overview', 'batch', 'organize'],
      check: 'When source layout may not match the intended output grouping, call organize_font_directory with dryRun true and inspect inputCountGuide, layoutDecision, layoutDecision.directoryHandling, stagingDirectoryDecision, sourceSafetyDecision, safetySummary, layout, recommendedBatchOptions, recommendedBatchPreviewArgs, organizationDecision, directoryWorkflowSummary, sourceLayoutMismatchSummary, unsupported file summaries, source write flags, organizationWarnings, and planActionSummary before applying any copy plan.',
      responseFields: withDirectoryRouteInspectFields(['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'layout', 'recommendedBatchOptions', 'recommendedNextActions', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'plan']),
    },
    {
      id: 'batch-plan-reviewed',
      appliesTo: ['overview', 'batch'],
      check: 'For unfamiliar batch runs, review a dryRun plan, sourceSafetyDecision, and safetySummary before writing output.',
      responseFields: ['sourceSafetyDecision', 'safetySummary', 'batchPolicySummary', 'sourceDestructive', 'writesSourceTree', 'writesOutputTree', 'outputTreeInsideInputTree', 'mayOverwriteOutputTree', 'dryRun', 'planIncluded', 'plannedCount', 'wouldProcessCount', 'dedupeDecisionSummary', 'skippedDuplicates'],
    },
    {
      id: 'process-outcome-checked',
      appliesTo: ['single', 'batch'],
      check: 'After processing, inspect resultType, outputMode, performedSplit, usedFallback, warnings, batchDecision, batchWarnings, errorCount, and errors before claiming success.',
      responseFields: ['resultType', 'outputMode', 'performedSplit', 'usedFallback', 'warnings', 'batchPolicySummary', 'batchDecision', 'batchWarnings', 'errorCount', 'errors'],
    },
    {
      id: 'fallback-disclosed',
      appliesTo: ['single', 'batch'],
      check: 'If usedFallback is true or outputMode is single-woff2/copy-original, say that the result was not a normal multi-subset split.',
      responseFields: ['usedFallback', 'outputMode', 'resultType'],
    },
    {
      id: 'output-audited',
      appliesTo: ['overview', 'batch', 'inspect'],
      check: `After batch processing, inspect the output directory and require ${OUTPUT_AUDIT_PASS_CONDITIONS_TEXT} before treating the audit as complete.`,
      responseFields: ['outputRoleDecision', 'outputStructureDecision', 'auditStatus', 'auditPassed', 'auditBlockingReasons', 'maxFilesHit', 'inspectionWarnings', 'structureSummary', 'manifestCount', 'missingManifestCount', 'subsetOutputCount', 'singleWoff2OutputCount', 'copyOriginalOutputCount'],
    },
    {
      id: 'local-compact-check-passed',
      appliesTo: GUIDANCE_WORKFLOWS,
      check: 'When maintaining this package, run npm run check:compact for the standard syntax and smoke gate with low-noise output before committing. It suppresses noisy child output on success and reports failed-step tails on failure.',
      command: 'npm run check:compact',
      jsonCommand: 'npm run --silent check:compact -- --json',
      responseFields: ['compact-check-result.ok', 'compact-check-result.failedStepId', 'compact-check-result.steps'],
    },
    {
      id: 'local-real-corpus-suite-passed',
      appliesTo: ['overview', 'batch', 'organize'],
      check: 'When maintaining this package or changing functionality-affecting behavior, run npm run smoke:real-corpus-suite -- <font-corpus-dir> against a local real corpus before calling the change complete. This is a representative reliability gate, not a per-directory acceptance audit.',
      command: 'npm run smoke:real-corpus-suite -- <font-corpus-dir>',
      verboseCommand: 'npm run smoke:real-corpus-suite -- <font-corpus-dir> --verbose',
      responseFields: [],
    },
  ];
}

export function buildLocalVerificationOutputGuide() {
  return {
    summaryType: 'local-verification-output-guide',
    purpose: 'How an AI agent should interpret local maintenance smoke output before claiming this package change is complete.',
    standardCommand: 'npm run check:compact',
    standardJsonCommand: 'npm run --silent check:compact -- --json',
    primaryCommand: 'npm run smoke:real-corpus-suite -- <font-corpus-dir>',
    verboseCommand: 'npm run smoke:real-corpus-suite -- <font-corpus-dir> --verbose',
    primaryDecisionField: 'reliabilityGateDecision',
    requiredOutputFields: [
      'reliabilityGateDecision',
      'corpusCountGuide',
      'humanSummary',
      'testScope',
      'coverageSummary.functionalCoverage',
      'coverageSummary.toolCoverageSummary',
      'coverageSummary.unsupportedFileCategoryCoverage',
      'coverageSummary.archiveHandlingScope',
      'coverageSummary.outputStructureAuditSummary',
      'runSummaries',
      'omittedDetailFields',
    ],
    passCriteria: [
      'reliabilityGateDecision.status is pass',
      'reliabilityGateDecision.reliabilityGatePassed is true',
      'reliabilityGateDecision.blockingReasonCodes is empty',
      'reliabilityGateDecision.targetCountsAreFullCorpusCounts is false',
      'testScope.corpusScan.maxFilesHit is false',
      'coverageSummary.functionalCoverage includes input-count-guide as covered',
      'coverageSummary.functionalCoverage entries are all covered',
      'coverageSummary.toolCoverageSummary.allRequiredToolsCovered is true',
      'coverageSummary.outputStructureAuditSummary single and batch outputRoleDecision.auditAppliesToThisDirectory are not false',
      'coverageSummary.outputStructureAuditSummary single and batch outputStructureDecision.status are pass',
      'coverageSummary.archiveHandlingScope.archiveInternalFontsCovered is false',
    ],
    statusMeanings: [
      {
        status: 'pass',
        meaning: 'The representative real-corpus feature chain passed.',
        agentAction: 'Report it as representative integration/regression evidence, not as manual acceptance of every font directory.',
      },
      {
        status: 'incomplete',
        meaning: 'The corpus scan was truncated or otherwise incomplete.',
        agentAction: 'Rerun with a higher maxFiles or inspect blockingReasonCodes before claiming completion.',
      },
      {
        status: 'action-required',
        meaning: 'At least one required coverage, audit, fixed target, or scope check failed.',
        agentAction: 'Inspect blockingReasonCodes, uncoveredFunctionalCoverageIds, compact coverageSummary, and runSummaries first; rerun with --verbose when child run details or full evidence are needed.',
      },
    ],
    nonIntuitiveBehavior: [
      'This is a representative reliability gate, not a per-directory acceptance audit.',
      'This is not a per-font manual audit.',
      'Small numbers such as fixedRegressionTargetCount 4 or selectedTargetCount 10 are target sampling counts, not the full corpus font count.',
      'Use reliabilityGateDecision.fullCorpusFontCountField or testScope.corpusScan.supportedFontCount for the full bounded corpus font total.',
      'Use corpusCountGuide for the shortest explanation of which counts are full-corpus counts and which are representative target counts.',
      'Use coverageSummary.functionalCoverage input-count-guide to confirm inputCountGuide was checked across inspect, organize, and batch paths.',
      'Use coverageSummary.toolCoverageSummary to confirm public MCP tool surfaces were exercised in representative real-corpus paths.',
      'Default suite output is compact and omits child run details; use verboseCommand for full per-child summaries and evidence.',
      'Archive files are counted as ignored files; the suite does not prove archive extraction because archive extraction is outside this tool layer.',
      'If archive-internal fonts must be tested, extract archives outside this tool first and rerun the suite against the extracted directory tree.',
    ],
    evidenceFields: {
      countGuide: 'corpusCountGuide',
      fullCorpusFontCount: 'testScope.corpusScan.supportedFontCount',
      fixedRegressionTargets: 'testScope.targetSampling.fixedRegressionTargets',
      selectedTargets: 'testScope.targetSampling.selectedTargets',
      representativeWriteAudit: 'testScope.representativeWriteAudit',
      ignoredFileCoverage: 'coverageSummary.unsupportedFileCategoryCoverage',
      archiveHandlingScope: 'coverageSummary.archiveHandlingScope',
      inputCountGuideCoverage: 'coverageSummary.functionalCoverage[id=input-count-guide]',
      toolCoverage: 'coverageSummary.toolCoverageSummary',
      outputStructureAudit: 'coverageSummary.outputStructureAuditSummary',
    },
    completionReportGuide: {
      summaryType: 'local-verification-completion-report-guide',
      purpose: 'What an AI agent should report after local compact and real-corpus gates pass, without overstating the verification scope.',
      requiredClaims: [
        {
          id: 'compact-check',
          evidenceField: 'compact-check-result.ok',
          reportAs: 'The standard syntax and smoke gate passed.',
        },
        {
          id: 'real-corpus-gate',
          evidenceField: 'reliabilityGateDecision.status',
          reportAs: 'The representative real-corpus reliability gate passed.',
        },
        {
          id: 'full-corpus-count',
          evidenceField: 'corpusCountGuide.fullCorpus.supportedFontCount',
          reportAs: 'The bounded full-root scan supported font count.',
        },
        {
          id: 'target-sampling-scope',
          evidenceField: 'corpusCountGuide.representativeTargets',
          reportAs: 'Fixed and selected target counts are representative sampling counts, not full corpus font totals.',
        },
        {
          id: 'ignored-file-coverage',
          evidenceField: 'coverageSummary.unsupportedFileCategoryCoverage',
          reportAs: 'Ignored-file category and extension coverage, including extensions beyond .zip/.txt.',
        },
        {
          id: 'archive-handling-scope',
          evidenceField: 'coverageSummary.archiveHandlingScope',
          reportAs: 'Archive files were counted as ignored files only; archive contents were not scanned as covered fonts.',
        },
        {
          id: 'functional-coverage',
          evidenceField: 'coverageSummary.functionalCoverage',
          reportAs: 'Representative feature paths covered by the suite.',
        },
        {
          id: 'tool-coverage',
          evidenceField: 'coverageSummary.toolCoverageSummary',
          reportAs: 'Public MCP tool surfaces covered by representative real-corpus paths.',
        },
        {
          id: 'representative-output-audit',
          evidenceField: 'coverageSummary.outputStructureAuditSummary',
          reportAs: 'Representative single-font and batch output structure audits passed.',
        },
      ],
      forbiddenClaims: [
        'Do not claim every font was manually inspected.',
        'Do not claim every directory was accepted or individually audited.',
        'Do not treat selectedTargetCount or fixedRegressionTargetCount as the full corpus font count.',
        'Do not answer corpus size questions from target sampling fields; use corpusCountGuide.fullCorpus.supportedFontCount or testScope.corpusScan.supportedFontCount.',
        'Do not imply archives were extracted or validated; archives are only counted as ignored files.',
        'Do not report ok:true alone as proof; cite reliabilityGateDecision.status and outputStructureAuditSummary.',
      ],
      conciseReportTemplate: [
        'check:compact: ok=<compact-check-result.ok>, failedStepId=<compact-check-result.failedStepId>',
        'real-corpus suite: status=<reliabilityGateDecision.status>, fullCorpusFonts=<corpusCountGuide.fullCorpus.supportedFontCount>, ignoredFiles=<corpusCountGuide.fullCorpus.unsupportedFileCount>',
        'real-corpus sampling: fixedTargets=<corpusCountGuide.representativeTargets.fixedRegressionTargetCount>, selectedTargets=<corpusCountGuide.representativeTargets.selectedTargetCount>/<corpusCountGuide.representativeTargets.availableTargetCount>, perDirectoryAcceptanceAudit=false',
        'real-corpus archives: archiveCount=<coverageSummary.archiveHandlingScope.archiveCount>, archiveInternalFontsCovered=<coverageSummary.archiveHandlingScope.archiveInternalFontsCovered>',
        'real-corpus tools: covered=<coverageSummary.toolCoverageSummary.coveredRequiredToolCount>/<coverageSummary.toolCoverageSummary.requiredToolCount>, allRequiredToolsCovered=<coverageSummary.toolCoverageSummary.allRequiredToolsCovered>',
        'real-corpus coverage: functionalCoverage=<covered>/<total>, outputAudit singleRole=<coverageSummary.outputStructureAuditSummary.singleOutputRoleAuditApplies>, single=<coverageSummary.outputStructureAuditSummary.singleOutputStructureDecisionStatus>, batchRole=<coverageSummary.outputStructureAuditSummary.batchOutputRoleAuditApplies>, batch=<coverageSummary.outputStructureAuditSummary.batchOutputStructureDecisionStatus>',
      ],
    },
  };
}
