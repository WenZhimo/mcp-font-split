import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getAgentGuidance, getRuntimeStatus, inspectFontInputs, inspectSplitOutput, organizeFontDirectory, splitFont, splitFontBatch } from './font-split.js';
import { errorText } from './mcp-response.js';

const execFileAsync = promisify(execFile);
const scenario = process.argv[2] || 'single';
const fontPath = process.argv[3] || '0xA000/0xA000-Regular.ttf';
const outDir = process.argv[4] || 'font-split-mcp/.font-split-smoke-output';
const REAL_CORPUS_FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.otc', '.woff', '.woff2']);
const DEFAULT_REAL_CORPUS_TARGETS = ['aexpective', 'tiny5', 'agu_display', 'architectural'];
const DEFAULT_REAL_CORPUS_TARGET_SAMPLE_COUNT = 10;
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
    decisionChecklistSummaryType: summary.decisionChecklist?.summaryType,
    decisionChecklistPrimaryRoute: summary.decisionChecklist?.primaryRoute,
    decisionChecklistSplitWriteReadiness: summary.decisionChecklist?.splitWriteReadiness,
    decisionChecklistCopyOnlyStagingReadiness: summary.decisionChecklist?.copyOnlyStagingReadiness,
    decisionChecklistItemIds: (summary.decisionChecklist?.items || []).map((item) => item.id),
    decisionChecklistSourceSafetyStatus: (summary.decisionChecklist?.items || []).find((item) => item.id === 'source-safety-preserved')?.status,
    decisionChecklistDirectPreviewStatus: (summary.decisionChecklist?.items || []).find((item) => item.id === 'direct-original-input-preview')?.status,
    decisionChecklistWarningsStatus: (summary.decisionChecklist?.items || []).find((item) => item.id === 'warnings-reviewed')?.status,
  };
}

function sourceLayoutMismatchSummaryCovered(summary) {
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
  );
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
      corpusUnsupportedFileDecision: result.corpus?.unsupportedFileDecision,
      corpusUnsupportedByExtension: result.corpus?.unsupportedFileSummary?.byExtension,
      corpusUnsupportedByCategory: result.corpus?.unsupportedFileSummary?.byCategory,
      corpusUnsupportedHandlingSummary: result.corpus?.unsupportedFileSummary?.handlingSummary,
      corpusUnsupportedArchiveCount: getUnsupportedCategoryCount(result.corpus?.unsupportedFileSummary, 'archive'),
      corpusMaxFilesHit: result.corpus?.maxFilesHit,
      sampleInputDir: result.sample?.inputDir,
      sampleSupportedFontCount: result.inspection?.supportedFontCount,
      sampleUnsupportedFileCount: result.inspection?.unsupportedFileSummary?.total,
      sampleUnsupportedFileDecision: result.inspection?.unsupportedFileDecision,
      sourceLayoutMismatchSummary: result.organization?.sourceLayoutMismatchSummary,
    };
  }
  if (scenario === 'real-corpus-targets') {
    const targetSourceLayoutMismatchSummaries = (result.targets || []).map((target) => ({
      inputDir: target.inputDir,
      summary: target.sourceLayoutMismatchSummary,
    }));
    return {
      corpusSupportedFontCount: result.corpus?.supportedFontCount,
      corpusUnsupportedFileCount: result.corpus?.unsupportedFileSummary?.total,
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
      targetSourceLayoutMismatchSummaries,
    };
  }
  if (scenario === 'real-corpus-integration') {
    return {
      corpusSupportedFontCount: result.corpus?.supportedFontCount,
      corpusUnsupportedFileCount: result.corpus?.unsupportedFileSummary?.total,
      corpusUnsupportedFileDecision: result.corpus?.unsupportedFileDecision,
      corpusUnsupportedByExtension: result.corpus?.unsupportedFileSummary?.byExtension,
      corpusUnsupportedByCategory: result.corpus?.unsupportedFileSummary?.byCategory,
      corpusUnsupportedHandlingSummary: result.corpus?.unsupportedFileSummary?.handlingSummary,
      corpusUnsupportedArchiveCount: getUnsupportedCategoryCount(result.corpus?.unsupportedFileSummary, 'archive'),
      corpusMaxFilesHit: result.corpus?.maxFilesHit,
      sampleInputDir: result.sample?.inputDir,
      sampleFontPath: result.sampleFontPath,
      outputRoot: result.outputRoot,
      singleOutputStructureDecision: result.singleAudit?.outputStructureDecision,
      singleAuditStatus: result.singleAudit?.auditStatus,
      singleAuditPassed: result.singleAudit?.auditPassed,
      singleStructureConforms: result.singleAudit?.structureSummary?.conforms,
      singleStructureLayoutKind: result.singleAudit?.structureSummary?.layoutKind,
      singleManifestCoverageOk: result.singleAudit?.structureSummary?.manifestCoverageOk,
      singleStructureIssueCount: result.singleAudit?.structureSummary?.issueCount,
      batchOutputStructureDecision: result.batchAudit?.outputStructureDecision,
      batchAuditStatus: result.batchAudit?.auditStatus,
      batchAuditPassed: result.batchAudit?.auditPassed,
      batchStructureConforms: result.batchAudit?.structureSummary?.conforms,
      batchStructureLayoutKind: result.batchAudit?.structureSummary?.layoutKind,
      batchManifestCoverageOk: result.batchAudit?.structureSummary?.manifestCoverageOk,
      batchStructureIssueCount: result.batchAudit?.structureSummary?.issueCount,
      organizationPreviewSourceLayoutMismatchSummary: result.organization?.preview?.sourceLayoutMismatchSummary,
      organizationWriteSourceLayoutMismatchSummary: result.organization?.write?.sourceLayoutMismatchSummary,
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
  const outputStructureAuditSummary = {
    summaryType: 'real-corpus-output-structure-audit',
    sampleInputDir: integration.sampleInputDir,
    outputRoot: integration.outputRoot,
    singleOutputStructureDecision: integration.singleOutputStructureDecision,
    singleAuditStatus: integration.singleAuditStatus,
    singleAuditPassed: integration.singleAuditPassed,
    singleStructureConforms: integration.singleStructureConforms,
    singleStructureLayoutKind: integration.singleStructureLayoutKind,
    singleManifestCoverageOk: integration.singleManifestCoverageOk,
    singleStructureIssueCount: integration.singleStructureIssueCount,
    batchOutputStructureDecision: integration.batchOutputStructureDecision,
    batchAuditStatus: integration.batchAuditStatus,
    batchAuditPassed: integration.batchAuditPassed,
    batchStructureConforms: integration.batchStructureConforms,
    batchStructureLayoutKind: integration.batchStructureLayoutKind,
    batchManifestCoverageOk: integration.batchManifestCoverageOk,
    batchStructureIssueCount: integration.batchStructureIssueCount,
  };
  const selectedTargets = targets.selectedTargets || [];
  const targetSourceLayoutMismatchSummaries = targets.targetSourceLayoutMismatchSummaries || [];
  const targetSourceLayoutMismatchSummaryCount = targetSourceLayoutMismatchSummaries
    .filter((item) => sourceLayoutMismatchSummaryCovered(item.summary))
    .length;
  const sourceLayoutMismatchSummaryEvidence = {
    readonly: readonly.sourceLayoutMismatchSummary,
    targetSummaryCount: targetSourceLayoutMismatchSummaryCount,
    targetSelectedCount: targets.selectedTargetCount,
    targetSamples: targetSourceLayoutMismatchSummaries.slice(0, 3),
    integrationPreview: integration.organizationPreviewSourceLayoutMismatchSummary,
    integrationWrite: integration.organizationWriteSourceLayoutMismatchSummary,
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
      singleOutputStructureDecisionStatus: integration.singleOutputStructureDecision?.status,
      singleAuditStatus: integration.singleAuditStatus,
      singleAuditPassed: integration.singleAuditPassed,
      singleStructureConforms: integration.singleStructureConforms,
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
  return {
    testStrategy: 'full-root compact scan plus representative target sampling plus one bounded write/audit path',
    perDirectoryAcceptanceAudit: false,
    testScope,
    functionalCoverage,
    corpusSupportedFontCount,
    corpusUnsupportedFileCount,
    corpusUnsupportedFileDecision,
    corpusUnsupportedByExtension,
    corpusUnsupportedByCategory,
    corpusUnsupportedHandlingSummary,
    corpusUnsupportedArchiveCount,
    unsupportedFileCategoryCoverage,
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
  const structureAudit = coverageSummary.outputStructureAuditSummary || {};
  const fixedCount = targetSampling.fixedRegressionTargetCount ?? coverageSummary.fixedRegressionTargets?.length;
  const selectedCount = targetSampling.selectedTargetCount ?? coverageSummary.selectedTargetCount;
  const availableCount = targetSampling.availableTargetCount ?? coverageSummary.availableTargetCount;
  const functionalCoverage = coverageSummary.functionalCoverage || [];
  const coveredCount = functionalCoverage.filter((item) => item.covered === true).length;
  const totalCoverageCount = functionalCoverage.length;
  const lines = [
    `Full corpus scan: ${corpusScan.supportedFontCount ?? 'unknown'} supported font files and ${corpusScan.unsupportedFileCount ?? 'unknown'} ignored/non-font files; maxFilesHit=${corpusScan.maxFilesHit}.`,
    `Ignored-file coverage: ${ignoredCoverage.categoryCount ?? 'unknown'} categories (${(ignoredCoverage.categories || []).slice(0, 6).join(', ') || 'none'}), ${ignoredCoverage.extensionCount ?? 'unknown'} extension types, ${ignoredCoverage.extensionsBeyondZipTxtCount ?? 'unknown'} extension types beyond .zip/.txt.`,
    `Target sampling: ${fixedCount ?? 'unknown'} fixed regression targets and ${selectedCount ?? 'unknown'} selected representative targets out of ${availableCount ?? 'unknown'} available target directories; this is not per-directory acceptance.`,
    `Representative write audit: sample=${writeAudit.sampleInputDir || 'unknown'}, single=${writeAudit.singleAuditStatus || 'unknown'} structureConforms=${structureAudit.singleStructureConforms}, batch=${writeAudit.batchAuditStatus || 'unknown'} structureConforms=${structureAudit.batchStructureConforms}.`,
    `Interpretation: small numbers such as ${fixedCount ?? 'fixed'} or ${selectedCount ?? 'selected'} are target counts, not the full corpus font count; use testScope.corpusScan.supportedFontCount for the root-level font total.`,
    `Functional coverage: ${coveredCount}/${totalCoverageCount} real-corpus feature paths covered.`,
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
    fixedRegressionTargetCount: fixedCount,
    selectedTargetCount: selectedCount,
    availableTargetCount: availableCount,
    representativeWriteSample: writeAudit.sampleInputDir,
    singleAuditStatus: writeAudit.singleAuditStatus,
    singleStructureConforms: structureAudit.singleStructureConforms,
    batchAuditStatus: writeAudit.batchAuditStatus,
    batchStructureConforms: structureAudit.batchStructureConforms,
    perDirectoryAcceptanceAudit: false,
  };
}

function buildRealCorpusReliabilityGateDecision(coverageSummary, humanSummary) {
  const functionalCoverage = coverageSummary.functionalCoverage || [];
  const uncoveredFunctionalCoverageIds = functionalCoverage
    .filter((item) => item.covered !== true)
    .map((item) => item.id)
    .filter(Boolean);
  const outputAudit = coverageSummary.outputStructureAuditSummary || {};
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
  if (
    outputAudit.singleOutputStructureDecision?.status !== 'pass'
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
    corpusSupportedFontCount: corpusScan.supportedFontCount,
    corpusUnsupportedFileCount: corpusScan.unsupportedFileCount,
    fixedRegressionTargetCount: targetSampling.fixedRegressionTargetCount,
    selectedTargetCount: targetSampling.selectedTargetCount,
    availableTargetCount: targetSampling.availableTargetCount,
    coveredFunctionalCoverageCount: functionalCoverage.filter((item) => item.covered === true).length,
    totalFunctionalCoverageCount: functionalCoverage.length,
    representativeWriteSample: writeAudit.sampleInputDir,
    singleOutputStructureDecisionStatus: outputAudit.singleOutputStructureDecision?.status,
    batchOutputStructureDecisionStatus: outputAudit.batchOutputStructureDecision?.status,
    evidenceFields: [
      'humanSummary',
      'testScope',
      'coverageSummary.functionalCoverage',
      'coverageSummary.unsupportedFileCategoryCoverage',
      'coverageSummary.outputStructureAuditSummary',
    ],
    passCriteria: 'Require a complete full-root corpus scan, selected target sampling, all functionalCoverage entries covered, representative single and batch outputStructureDecision.status pass, structureSummary.conforms true, and perDirectoryAcceptanceAudit false.',
    nonIntuitiveBehavior: 'status pass means the representative real-corpus feature chain passed; it is not a per-directory acceptance audit and target counts such as 4 or 10 are not the full corpus font count.',
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

function pad4(buffer) {
  const remainder = buffer.length % 4;
  if (remainder === 0) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(4 - remainder)]);
}

function checksumTable(buffer) {
  const padded = pad4(buffer);
  let sum = 0;
  for (let offset = 0; offset < padded.length; offset += 4) {
    sum = (sum + padded.readUInt32BE(offset)) >>> 0;
  }
  return sum;
}

function writeUtf16Be(value) {
  const buffer = Buffer.alloc(value.length * 2);
  for (let i = 0; i < value.length; i++) {
    buffer.writeUInt16BE(value.charCodeAt(i), i * 2);
  }
  return buffer;
}

function buildNameTable(records) {
  const encodedRecords = records.map(([nameId, value]) => ({
    nameId,
    data: writeUtf16Be(value),
  }));
  const headerSize = 6;
  const recordSize = 12;
  const stringOffset = headerSize + encodedRecords.length * recordSize;
  const stringData = Buffer.concat(encodedRecords.map((record) => record.data));
  const table = Buffer.alloc(stringOffset + stringData.length);

  table.writeUInt16BE(0, 0);
  table.writeUInt16BE(encodedRecords.length, 2);
  table.writeUInt16BE(stringOffset, 4);

  let dataOffset = 0;
  encodedRecords.forEach((record, index) => {
    const recordOffset = headerSize + index * recordSize;
    table.writeUInt16BE(3, recordOffset);
    table.writeUInt16BE(1, recordOffset + 2);
    table.writeUInt16BE(0x0409, recordOffset + 4);
    table.writeUInt16BE(record.nameId, recordOffset + 6);
    table.writeUInt16BE(record.data.length, recordOffset + 8);
    table.writeUInt16BE(dataOffset, recordOffset + 10);
    dataOffset += record.data.length;
  });
  stringData.copy(table, stringOffset);
  return table;
}

// Minimal sfnt fixture for organizer metadata parsing; it is not meant for real splitting/rendering.
function buildMinimalTtf({ familyName = 'Fixture Sans', subfamilyName = 'Regular', glyphCount = 3 } = {}) {
  const tables = [
    {
      tag: 'maxp',
      data: Buffer.from([0x00, 0x01, 0x00, 0x00, (glyphCount >> 8) & 0xff, glyphCount & 0xff]),
    },
    {
      tag: 'name',
      data: buildNameTable([
        [1, familyName],
        [2, subfamilyName],
        [4, `${familyName} ${subfamilyName}`],
        [6, `${familyName.replace(/\s+/g, '')}-${subfamilyName.replace(/\s+/g, '')}`],
        [16, familyName],
        [17, subfamilyName],
      ]),
    },
  ].sort((a, b) => a.tag.localeCompare(b.tag));

  const numTables = tables.length;
  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = 16 * (2 ** entrySelector);
  const rangeShift = numTables * 16 - searchRange;
  const headerSize = 12 + numTables * 16;
  let dataOffset = headerSize;
  const tableRecords = tables.map((table) => {
    const data = pad4(table.data);
    const record = {
      ...table,
      checksum: checksumTable(table.data),
      offset: dataOffset,
      length: table.data.length,
      paddedData: data,
    };
    dataOffset += data.length;
    return record;
  });
  const font = Buffer.alloc(dataOffset);

  font.writeUInt32BE(0x00010000, 0);
  font.writeUInt16BE(numTables, 4);
  font.writeUInt16BE(searchRange, 6);
  font.writeUInt16BE(entrySelector, 8);
  font.writeUInt16BE(rangeShift, 10);

  tableRecords.forEach((table, index) => {
    const recordOffset = 12 + index * 16;
    font.write(table.tag, recordOffset, 4, 'ascii');
    font.writeUInt32BE(table.checksum, recordOffset + 4);
    font.writeUInt32BE(table.offset, recordOffset + 8);
    font.writeUInt32BE(table.length, recordOffset + 12);
    table.paddedData.copy(font, table.offset);
  });

  return font;
}

function assertInspectFieldsExist(action, responsesByTool, context) {
  if (!action) {
    throw new Error(`${context}: expected action for inspectFields check.`);
  }
  assertSourceLayoutDecisionChecklistCompanionFields(action, `${context}: action ${action.id}`);
  if (typeof action.successCriteria !== 'string' || action.successCriteria.trim() === '') {
    throw new Error(`${context}: action ${action.id} (${action.tool}) is missing successCriteria.`);
  }
  if (!Array.isArray(action.inspectFields)) return;
  const response = responsesByTool[action.tool];
  if (!response) return;
  const missing = action.inspectFields.filter((field) => {
    const topLevelField = field.split('.')[0];
    return !Object.hasOwn(response, topLevelField);
  });
  if (missing.length > 0) {
    throw new Error(`${context}: action ${action.id} (${action.tool}) references missing inspectFields: ${missing.join(', ')}`);
  }
}

function assertRecommendedNextActionInspectFields(actions, responsesByTool, context) {
  for (const action of actions || []) {
    assertInspectFieldsExist(action, responsesByTool, context);
  }
}

function assertSourceLayoutDecisionChecklistCompanionFields(value, context, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      assertSourceLayoutDecisionChecklistCompanionFields(item, context, seen);
    }
    return;
  }
  for (const fieldListName of ['inspectFields', 'mustInspectFields', 'responseFields']) {
    const fields = value[fieldListName];
    if (
      Array.isArray(fields)
      && fields.includes('sourceLayoutMismatchSummary')
      && !fields.includes('sourceLayoutMismatchSummary.decisionChecklist')
    ) {
      throw new Error(`${context}: ${fieldListName} must include sourceLayoutMismatchSummary.decisionChecklist whenever it includes sourceLayoutMismatchSummary.`);
    }
  }
  for (const child of Object.values(value)) {
    assertSourceLayoutDecisionChecklistCompanionFields(child, context, seen);
  }
}

function assertNonEmptyString(value, context, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${context}: expected non-empty ${fieldName}.`);
  }
}

function assertNonEmptyStringArray(value, context, fieldName) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(`${context}: expected non-empty string array ${fieldName}.`);
  }
}

function assertNonEmptyArray(value, context, fieldName) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context}: expected non-empty array ${fieldName}.`);
  }
}

function assertGuidanceItemsHaveCompletionProof(items, { collectionName, inspectFieldName = 'inspectFields' }) {
  if (!Array.isArray(items)) {
    throw new Error(`Expected ${collectionName} to be an array.`);
  }
  for (const item of items) {
    const id = item?.id || item?.templateId;
    assertNonEmptyString(id, collectionName, 'id');
    assertNonEmptyStringArray(item?.[inspectFieldName], `${collectionName}.${id}`, inspectFieldName);
    assertNonEmptyString(item?.successCriteria, `${collectionName}.${id}`, 'successCriteria');
  }
}

function assertNextToolDecisionSummary(summary, { context, workflow, primaryRouteId }) {
  if (
    !summary
    || summary.summaryType !== 'next-tool-decision-summary'
    || summary.workflow !== workflow
    || summary.primaryRouteId !== primaryRouteId
    || summary.safetyDefaults?.organizationWritesAreCopyOnly !== true
    || summary.safetyDefaults?.sourceDestructive !== false
    || summary.safetyDefaults?.outputAuditRequiredAfterWrite !== true
  ) {
    throw new Error(`${context}: expected nextToolDecisionSummary for ${workflow}.`);
  }
  assertNonEmptyStringArray(summary.routeOrder, context, 'routeOrder');
  assertNonEmptyArray(summary.routes, context, 'routes');
  const routesById = new Map(summary.routes.map((route) => [route.id, route]));
  const quickExamplesById = new Map((summary.quickStartCallExamples || []).map((example) => [example.id, example]));
  if (
    summary.workflowQuickStart?.summaryType !== 'workflow-quick-start'
    || summary.workflowQuickStart?.workflow !== workflow
    || !summary.workflowQuickStart?.generatedFromQuickStartCallExamples
    || !quickExamplesById.has(summary.workflowQuickStart?.recommendedExampleId)
    || summary.workflowQuickStart?.recommendedCallExample?.id !== summary.workflowQuickStart?.recommendedExampleId
    || summary.workflowQuickStart?.recommendedCallExample?.sourceDestructive !== false
    || !summary.workflowQuickStart?.recommendedCallExample?.generatedFromTemplate
    || !Array.isArray(summary.workflowQuickStart?.alternateExampleIds)
    || !Array.isArray(summary.workflowQuickStart?.alternateCallExamples)
    || typeof summary.workflowQuickStart?.decisionHint !== 'string'
  ) {
    throw new Error(`${context}: expected workflowQuickStart to point at a template-derived recommended quick call.`);
  }
  const expectedWorkflowQuickStartByWorkflow = {
    overview: 'inspect-unfamiliar-source',
    single: 'process-single-font',
    batch: 'inspect-unfamiliar-source',
    inspect: 'inspect-unfamiliar-source',
    organize: 'plan-source-layout',
  };
  if (summary.workflowQuickStart.recommendedExampleId !== expectedWorkflowQuickStartByWorkflow[workflow]) {
    throw new Error(`${context}: expected workflowQuickStart recommendation for ${workflow}.`);
  }
  for (const requiredRoute of ['setup-uncertain', 'unfamiliar-directory', 'layout-uncertain-or-staging-wanted', 'batch-safe-preview', 'batch-reviewed-write', 'output-audit']) {
    if (!routesById.has(requiredRoute)) {
      throw new Error(`${context}: expected route ${requiredRoute}.`);
    }
  }
  for (const route of summary.routes) {
    assertNonEmptyString(route.id, `${context}.routes`, 'id');
    assertNonEmptyString(route.useWhen, `${context}.${route.id}`, 'useWhen');
    assertNonEmptyString(route.firstTool, `${context}.${route.id}`, 'firstTool');
    assertNonEmptyStringArray(route.inspectFields, `${context}.${route.id}`, 'inspectFields');
    assertNonEmptyString(route.continueWhen, `${context}.${route.id}`, 'continueWhen');
    if (typeof route.writesFiles !== 'boolean' || route.sourceDestructive !== false) {
      throw new Error(`${context}.${route.id}: expected explicit write and source-safety flags.`);
    }
  }
  const layoutRoute = routesById.get('layout-uncertain-or-staging-wanted');
  const stagingRoute = routesById.get('copy-only-staging');
  const batchPreviewRoute = routesById.get('batch-safe-preview');
  const batchWriteRoute = routesById.get('batch-reviewed-write');
  const auditRoute = routesById.get('output-audit');
  if (
    layoutRoute?.firstTool !== 'organize_font_directory'
    || layoutRoute?.firstArgsHint?.workflowPreset !== 'safe-preview'
    || !layoutRoute.inspectFields?.includes('sourceLayoutMismatchSummary.decisionChecklist')
    || stagingRoute?.writeBehavior !== 'copy-only-outputDir'
    || stagingRoute?.sourceDestructive !== false
    || batchPreviewRoute?.writesFiles !== false
    || batchPreviewRoute?.firstArgsHint?.workflowPreset !== 'safe-preview'
    || batchWriteRoute?.writesFiles !== true
    || batchWriteRoute?.firstArgsHint?.workflowPreset !== 'reviewed-write'
    || batchWriteRoute?.nextRouteAfterSuccess !== 'output-audit'
    || auditRoute?.firstTool !== 'inspect_split_output'
    || !auditRoute.inspectFields?.includes('outputStructureDecision')
  ) {
    throw new Error(`${context}: expected nextToolDecisionSummary to route layout, preview, reviewed write, and audit safely.`);
  }
  for (const requiredExample of ['process-single-font', 'inspect-unfamiliar-source', 'plan-source-layout', 'quick-structure-first-plan', 'copy-reviewed-staging', 'preview-batch-output', 'write-reviewed-batch-output', 'audit-split-output']) {
    if (!quickExamplesById.has(requiredExample)) {
      throw new Error(`${context}: expected quickStartCallExamples to include ${requiredExample}.`);
    }
  }
  for (const example of summary.quickStartCallExamples || []) {
    assertNonEmptyString(example.templateId, `${context}.quickStartCallExamples.${example.id}`, 'templateId');
    assertNonEmptyString(example.tool, `${context}.quickStartCallExamples.${example.id}`, 'tool');
    assertNonEmptyString(example.useWhen, `${context}.quickStartCallExamples.${example.id}`, 'useWhen');
    assertNonEmptyStringArray(example.inspectFields, `${context}.quickStartCallExamples.${example.id}`, 'inspectFields');
    assertNonEmptyStringArray(example.customize, `${context}.quickStartCallExamples.${example.id}`, 'customize');
    assertNonEmptyString(example.successCriteria, `${context}.quickStartCallExamples.${example.id}`, 'successCriteria');
    if (!example.generatedFromTemplate || typeof example.writesFiles !== 'boolean' || example.sourceDestructive !== false) {
      throw new Error(`${context}.quickStartCallExamples.${example.id}: expected template-derived explicit safety flags.`);
    }
  }
  const stagingExample = quickExamplesById.get('copy-reviewed-staging');
  const singleExample = quickExamplesById.get('process-single-font');
  const previewExample = quickExamplesById.get('preview-batch-output');
  const writeExample = quickExamplesById.get('write-reviewed-batch-output');
  const auditExample = quickExamplesById.get('audit-split-output');
  if (
    singleExample?.tool !== 'split_font'
    || singleExample?.args?.fontPath !== '<font-file>'
    || singleExample?.nextRouteAfterSuccess !== 'output-audit'
    || stagingExample?.args?.workflowPreset !== 'reviewed-write'
    || stagingExample?.args?.outputDir !== '<organized-output-dir>'
    || stagingExample?.writesFiles !== true
    || previewExample?.args?.workflowPreset !== 'safe-preview'
    || previewExample?.writesFiles !== false
    || writeExample?.args?.workflowPreset !== 'reviewed-write'
    || writeExample?.nextRouteAfterSuccess !== 'output-audit'
    || auditExample?.tool !== 'inspect_split_output'
    || auditExample?.args?.outDir !== '<split-output-root>'
  ) {
    throw new Error(`${context}: expected quickStartCallExamples to preserve safe template args and write/audit routing.`);
  }
  assertSourceLayoutDecisionChecklistCompanionFields(summary, `${context}: nextToolDecisionSummary`);
}

function assertRecommendedWorkflowPlanHasCompletionProof(plan, templateIds, context) {
  if (!plan || typeof plan !== 'object') {
    throw new Error(`${context}: expected recommendedWorkflowPlan object.`);
  }
  assertNonEmptyString(plan.id, context, 'id');
  assertNonEmptyArray(plan.orderedSteps, context, 'orderedSteps');
  assertGuidanceItemsHaveCompletionProof(plan.orderedSteps, {
    collectionName: `${context}.orderedSteps`,
  });
  for (const step of plan.orderedSteps || []) {
    if (Object.hasOwn(step, 'completeWhen')) {
      throw new Error(`${context}.orderedSteps.${step.id}: completeWhen is obsolete; use successCriteria.`);
    }
    if (step.templateId && !templateIds.has(step.templateId)) {
      throw new Error(`${context}.orderedSteps.${step.id}: references missing safe template ${step.templateId}.`);
    }
  }
  if (Array.isArray(plan.decisionPoints)) {
    assertGuidanceItemsHaveCompletionProof(plan.decisionPoints, {
      collectionName: `${context}.decisionPoints`,
    });
    for (const decision of plan.decisionPoints || []) {
      if (Object.hasOwn(decision, 'completeWhen')) {
        throw new Error(`${context}.decisionPoints.${decision.id}: completeWhen is obsolete; use successCriteria.`);
      }
      if (decision.useTemplateId && !templateIds.has(decision.useTemplateId)) {
        throw new Error(`${context}.decisionPoints.${decision.id}: references missing safe template ${decision.useTemplateId}.`);
      }
    }
  }
}

function assertBatchPolicyGuide(policyGuide) {
  assertNonEmptyArray(policyGuide, 'batchPolicyGuide', 'batchPolicyGuide');
  const expectedPolicies = {
    batchGroupBy: ['auto', 'source-dir', 'font-family'],
    batchNamingMode: ['numeric-suffix', 'plain', 'source-suffix'],
    batchDedupeMode: ['font-identity', 'same-path', 'none'],
    batchErrorMode: ['fail-after', 'fail-fast', 'collect'],
  };
  const byOptionName = new Map((policyGuide || []).map((policy) => [policy.optionName, policy]));
  for (const [optionName, values] of Object.entries(expectedPolicies)) {
    const policy = byOptionName.get(optionName);
    if (!policy) {
      throw new Error(`Expected batchPolicyGuide to include ${optionName}.`);
    }
    assertNonEmptyString(policy.id, `batchPolicyGuide.${optionName}`, 'id');
    assertNonEmptyString(policy.defaultValue, `batchPolicyGuide.${optionName}`, 'defaultValue');
    assertNonEmptyString(policy.purpose, `batchPolicyGuide.${optionName}`, 'purpose');
    assertNonEmptyStringArray(policy.appliesTo, `batchPolicyGuide.${optionName}`, 'appliesTo');
    assertNonEmptyArray(policy.values, `batchPolicyGuide.${optionName}`, 'values');
    const actualValues = new Set(policy.values.map((item) => item.value));
    for (const value of values) {
      if (!actualValues.has(value)) {
        throw new Error(`Expected batchPolicyGuide.${optionName} to include value ${value}.`);
      }
    }
    for (const value of policy.values) {
      assertNonEmptyString(value.value, `batchPolicyGuide.${optionName}`, 'value');
      assertNonEmptyString(value.useWhen, `batchPolicyGuide.${optionName}.${value.value}`, 'useWhen');
      assertNonEmptyString(value.avoidWhen, `batchPolicyGuide.${optionName}.${value.value}`, 'avoidWhen');
      assertNonEmptyStringArray(value.inspectFields, `batchPolicyGuide.${optionName}.${value.value}`, 'inspectFields');
      assertNonEmptyString(value.successCriteria, `batchPolicyGuide.${optionName}.${value.value}`, 'successCriteria');
    }
  }
  const dedupeNone = byOptionName.get('batchDedupeMode')?.values?.find((item) => item.value === 'none');
  if (!dedupeNone?.successCriteria?.includes('skippedDuplicates is zero')) {
    throw new Error('Expected batchPolicyGuide batchDedupeMode none to preserve every selected supported font.');
  }
  const namingNumeric = byOptionName.get('batchNamingMode')?.values?.find((item) => item.value === 'numeric-suffix');
  if (!namingNumeric?.successCriteria?.includes('only where collisions require them')) {
    throw new Error('Expected batchPolicyGuide numeric-suffix to explain suffixes only on real conflicts.');
  }
  const collect = byOptionName.get('batchErrorMode')?.values?.find((item) => item.value === 'collect');
  if (!collect?.successCriteria?.includes('Every errors[] entry is inspected')) {
    throw new Error('Expected batchPolicyGuide collect to require errors[] inspection.');
  }
}

function assertBatchPolicySummary(summary, { context, appliesToTool, expectedValues, expectedEffectiveValues = {} }) {
  if (!summary || summary.policySource !== 'get_agent_guidance.batchPolicyGuide' || summary.appliesToTool !== appliesToTool) {
    throw new Error(`${context}: expected batchPolicySummary to point at batchPolicyGuide for ${appliesToTool}.`);
  }
  if (!Array.isArray(summary.selectedPolicies) || summary.selectedPolicies.length === 0) {
    throw new Error(`${context}: expected batchPolicySummary.selectedPolicies.`);
  }
  if (!Array.isArray(summary.policySuccessCriteria) || summary.policySuccessCriteria.length !== summary.selectedPolicies.length) {
    throw new Error(`${context}: expected batchPolicySummary.policySuccessCriteria for every selected policy.`);
  }
  if (!Array.isArray(summary.inspectFields) || summary.inspectFields.length === 0) {
    throw new Error(`${context}: expected batchPolicySummary.inspectFields.`);
  }
  if (!Array.isArray(summary.policyGuideInspectFields) || summary.policyGuideInspectFields.length < summary.inspectFields.length) {
    throw new Error(`${context}: expected batchPolicySummary.policyGuideInspectFields to retain the source policy fields.`);
  }
  for (const [optionName, value] of Object.entries(expectedValues)) {
    const selected = summary.selectedPolicies.find((policy) => policy.optionName === optionName);
    const success = summary.policySuccessCriteria.find((policy) => policy.optionName === optionName);
    if (summary.values?.[optionName] !== value || selected?.value !== value || success?.value !== value) {
      throw new Error(`${context}: expected batchPolicySummary ${optionName} to be ${value}.`);
    }
    if (!selected.inspectFields?.length || !selected.successCriteria || !success.successCriteria) {
      throw new Error(`${context}: expected batchPolicySummary ${optionName} to include inspectFields and successCriteria.`);
    }
  }
  for (const [optionName, value] of Object.entries(expectedEffectiveValues)) {
    const selected = summary.selectedPolicies.find((policy) => policy.optionName === optionName);
    const success = summary.policySuccessCriteria.find((policy) => policy.optionName === optionName);
    if (summary.effectiveValues?.[optionName] !== value || selected?.effectiveValue !== value || success?.effectiveValue !== value) {
      throw new Error(`${context}: expected batchPolicySummary effective ${optionName} to be ${value}.`);
    }
  }
}

function assertDirectoryWorkflowSummary(summary, {
  context,
  expectedLayoutKind,
  expectedRoute,
  expectedCurrentStep,
  expectedReviewReason = null,
  expectedStepIds = [],
}) {
  if (
    !summary
    || summary.summaryType !== 'directory-layout-workflow'
    || summary.appliesToTool !== 'organize_font_directory'
    || summary.currentStep !== expectedCurrentStep
  ) {
    throw new Error(`${context}: expected directoryWorkflowSummary for organize_font_directory ${expectedCurrentStep}.`);
  }
  assertSourceLayoutDecisionChecklistCompanionFields(summary, `${context}: directoryWorkflowSummary`);
  if (
    summary.sourceLayout?.layoutKind !== expectedLayoutKind
    || summary.route?.route !== expectedRoute
    || summary.currentCallSafety?.sourceDestructive !== false
    || summary.currentCallSafety?.sourceFilesPreserved !== true
  ) {
    throw new Error(`${context}: expected directoryWorkflowSummary layout, route, and source safety.`);
  }
  if (!summary.policySnapshot?.batchGroupBy || !summary.policySnapshot?.effectiveBatchDedupeMode) {
    throw new Error(`${context}: expected directoryWorkflowSummary.policySnapshot.`);
  }
  const sourceLayoutMismatchSummary = summary.sourceLayoutMismatchSummary;
  if (
    !sourceLayoutMismatchSummary
    || sourceLayoutMismatchSummary.summaryType !== 'source-layout-mismatch'
    || sourceLayoutMismatchSummary.appliesToTool !== 'organize_font_directory'
    || sourceLayoutMismatchSummary.currentLayoutKind !== expectedLayoutKind
    || sourceLayoutMismatchSummary.copyOnlyStaging?.sourceDestructive !== false
    || sourceLayoutMismatchSummary.copyOnlyStaging?.sourceFilesPreserved !== true
    || sourceLayoutMismatchSummary.copyOnlyStaging?.sourceFilesMovedDeletedOrRewritten !== false
    || sourceLayoutMismatchSummary.directOriginalInput?.previewRequiredBeforeWrite !== true
    || !Array.isArray(sourceLayoutMismatchSummary.successCriteria)
    || !sourceLayoutMismatchSummary.nonIntuitiveBehavior?.some((item) => item.includes('never source-destructive'))
  ) {
    throw new Error(`${context}: expected directoryWorkflowSummary.sourceLayoutMismatchSummary to explain layout match, direct preview, copy-only staging, and source safety.`);
  }
  const decisionChecklist = sourceLayoutMismatchSummary.decisionChecklist;
  const decisionChecklistItemIds = new Set((decisionChecklist?.items || []).map((item) => item.id));
  const sourceSafetyDecision = (decisionChecklist?.items || []).find((item) => item.id === 'source-safety-preserved');
  const directPreviewDecision = (decisionChecklist?.items || []).find((item) => item.id === 'direct-original-input-preview');
  if (
    decisionChecklist?.summaryType !== 'source-layout-decision-checklist'
    || decisionChecklist.primaryRoute !== expectedRoute
    || !decisionChecklist.splitWriteReadiness
    || !decisionChecklist.copyOnlyStagingReadiness
    || sourceSafetyDecision?.status !== 'pass'
    || sourceSafetyDecision?.requiredBeforeWrite !== true
    || !directPreviewDecision?.evidenceFields?.includes('recommendedBatchPreviewArgs')
  ) {
    throw new Error(`${context}: expected sourceLayoutMismatchSummary.decisionChecklist to expose route, write readiness, source safety, and direct preview guidance.`);
  }
  if (
    !['preview-organized-output', 'rerun-with-font-parsing', 'decide-on-invalid-fonts', 'no-copyable-fonts'].includes(expectedRoute)
    && directPreviewDecision?.nextTool !== 'split_font_batch'
  ) {
    throw new Error(`${context}: expected sourceLayoutMismatchSummary.decisionChecklist to point direct preview routes at split_font_batch.`);
  }
  for (const expectedDecisionId of ['source-safety-preserved', 'direct-original-input-preview', 'copy-only-staging', 'plan-detail-before-copy', 'warnings-reviewed', 'post-write-output-audit']) {
    if (!decisionChecklistItemIds.has(expectedDecisionId)) {
      throw new Error(`${context}: expected sourceLayoutMismatchSummary.decisionChecklist item ${expectedDecisionId}.`);
    }
  }
  if (expectedRoute === 'review-mixed-layout' && sourceLayoutMismatchSummary.mismatchDetected !== true) {
    throw new Error(`${context}: expected mixed layout summary to mark a layout mismatch.`);
  }
  if (expectedRoute === 'preview-organized-output' && sourceLayoutMismatchSummary.directOriginalInput?.status !== 'use-organized-output') {
    throw new Error(`${context}: expected copied organization summary to point at the organized output.`);
  }
  if (
    typeof summary.planVisibility?.planIncluded !== 'boolean'
    || !Array.isArray(summary.planVisibility?.detailsOmitted)
    || !summary.planVisibility?.availableSummaryFields?.includes('planActionSummary')
    || !summary.planVisibility?.availableSummaryFields?.includes('sourceLayoutMismatchSummary')
    || !summary.planVisibility?.successCriteria
  ) {
    throw new Error(`${context}: expected directoryWorkflowSummary.planVisibility to describe compact plan visibility.`);
  }
  if (!summary.directBatchPreviewArgs?.workflowPreset || summary.directBatchPreviewArgs.workflowPreset !== 'safe-preview') {
    throw new Error(`${context}: expected directoryWorkflowSummary.directBatchPreviewArgs to be a safe-preview call.`);
  }
  if (!Array.isArray(summary.workflowSteps) || summary.workflowSteps.length < 3) {
    throw new Error(`${context}: expected directoryWorkflowSummary.workflowSteps.`);
  }
  const stepIds = new Set(summary.workflowSteps.map((step) => step.id));
  for (const expectedStepId of ['review-source-layout', 'reviewed-batch-write', 'audit-split-output', ...expectedStepIds]) {
    if (!stepIds.has(expectedStepId)) {
      throw new Error(`${context}: expected directoryWorkflowSummary.workflowSteps to include ${expectedStepId}.`);
    }
  }
  for (const step of summary.workflowSteps) {
    if (!step.tool || typeof step.writesFiles !== 'boolean' || step.sourceDestructive !== false || !step.successCriteria) {
      throw new Error(`${context}: expected directoryWorkflowSummary step ${step.id} to include tool, writesFiles, sourceDestructive, and successCriteria.`);
    }
  }
  if (expectedReviewReason && !(summary.sourceLayout?.reviewReasons || []).includes(expectedReviewReason)) {
    throw new Error(`${context}: expected directoryWorkflowSummary review reason ${expectedReviewReason}.`);
  }
  if (
    !Array.isArray(summary.successCriteria)
    || summary.successCriteria.length < 3
    || !Array.isArray(summary.nonIntuitiveBehavior)
    || !summary.nonIntuitiveBehavior.some((item) => item.includes('never moves, deletes, or rewrites source font files'))
  ) {
    throw new Error(`${context}: expected directoryWorkflowSummary success criteria and non-intuitive behavior notes.`);
  }
}

function assertTemplateOmitsArgs(template, omittedArgs, context) {
  const leaked = omittedArgs.filter((key) => Object.hasOwn(template?.args || {}, key));
  if (leaked.length > 0) {
    throw new Error(`${context}: expected template args to omit preset-provided defaults: ${leaked.join(', ')}`);
  }
}

function assertObjectOmitsKeys(object, omittedKeys, context) {
  const leaked = omittedKeys.filter((key) => Object.hasOwn(object || {}, key));
  if (leaked.length > 0) {
    throw new Error(`${context}: expected object to omit preset-provided defaults: ${leaked.join(', ')}`);
  }
}

function assertOutputAuditStatus(result, expected, context) {
  if (
    result.auditStatus !== expected.auditStatus
    || result.auditPassed !== expected.auditPassed
    || !Array.isArray(result.auditBlockingReasons)
    || result.outputStructureDecision?.summaryType !== 'output-structure-decision'
    || result.outputStructureDecision?.status !== expected.auditStatus
    || result.outputStructureDecision?.auditPassed !== expected.auditPassed
    || result.outputStructureDecision?.maxFilesHit !== result.maxFilesHit
    || result.outputStructureDecision?.structureConforms !== (result.structureSummary?.conforms === true)
  ) {
    throw new Error(`${context}: expected compact output structure decision ${expected.auditStatus}.`);
  }
  if (expected.reasonCode) {
    const reason = result.auditBlockingReasons.find((item) => item.code === expected.reasonCode);
    if (!reason) {
      throw new Error(`${context}: expected auditBlockingReasons to include ${expected.reasonCode}.`);
    }
    const expectedRecommendedAction = expected.reasonCode === 'output-scan-truncated'
      ? 'rerun-inspect-split-output-with-higher-maxFiles'
      : 'inspect-structureSummary-issues';
    if (
      result.outputStructureDecision.reviewRecommended !== true
      || result.outputStructureDecision.recommendedAction !== expectedRecommendedAction
    ) {
      throw new Error(`${context}: expected outputStructureDecision to recommend ${expectedRecommendedAction}.`);
    }
    if (!result.outputStructureDecision.blockingReasonCodes?.includes(expected.reasonCode)) {
      throw new Error(`${context}: expected outputStructureDecision to include blocking reason ${expected.reasonCode}.`);
    }
    if (expected.issueCode && !(reason.issueCodes || []).includes(expected.issueCode)) {
      throw new Error(`${context}: expected ${expected.reasonCode} to reference issue code ${expected.issueCode}.`);
    }
    if (expected.issueCode && !result.outputStructureDecision.issueCodes?.includes(expected.issueCode)) {
      throw new Error(`${context}: expected outputStructureDecision to include issue code ${expected.issueCode}.`);
    }
  } else if (result.auditBlockingReasons.length !== 0) {
    throw new Error(`${context}: expected no auditBlockingReasons for passing audit.`);
  } else if (
    result.outputStructureDecision.reviewRecommended !== false
    || result.outputStructureDecision.recommendedAction !== 'continue'
  ) {
    throw new Error(`${context}: expected passing outputStructureDecision to continue without review.`);
  }
}

function assertActionSuggestedArgsOmit(action, omittedKeys, context) {
  assertObjectOmitsKeys(action?.suggestedArgs, omittedKeys, context);
}

function isInsidePath(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertSafeRecommendedBatchPreviewArgs(previewArgs, expected, context) {
  if (
    previewArgs?.inputDir !== expected.inputDir
    || previewArgs?.workflowPreset !== 'safe-preview'
    || (expected.batchGroupBy !== undefined && previewArgs?.batchGroupBy !== expected.batchGroupBy)
  ) {
    throw new Error(`${context}: expected recommendedBatchPreviewArgs to be a copyable safe-preview batch call for the detected layout.`);
  }
  assertObjectOmitsKeys(previewArgs, [
    'dryRun',
    'includeResults',
    'skipMode',
    'batchNamingMode',
    'batchDedupeMode',
    'batchErrorMode',
    'splitFailureAction',
  ], `${context} recommendedBatchPreviewArgs`);
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

if (scenario === 'single') {
  console.log('Splitting:', fontPath, '->', outDir);
  const result = await splitFont({
    fontPath,
    outDir,
    testHtml: true,
    reporter: true,
    chunkSize: 70 * 1024,
    fontFamily: 'SmokeTestFont',
    silent: true,
  });
  console.log(JSON.stringify(result, null, 2));

  console.log('\nInspecting output:');
  console.log(JSON.stringify(await inspectSplitOutput({ outDir }), null, 2));
} else if (scenario === 'batch-incremental') {
  const inputDir = process.argv[3] || '0xA000';
  const outputRoot = process.argv[4] || 'font-split-mcp/.font-split-batch-output';
  console.log('Batch run #1 (manifest mode)');
  const first = await splitFontBatch({
    inputDir,
    outputRoot,
    limit: 5,
    maxFiles: 200,
    skipMode: 'manifest',
    batchGroupBy: 'font-family',
    batchNamingMode: 'numeric-suffix',
    batchDedupeMode: 'font-identity',
    chunkSize: 70 * 1024,
    silent: true,
  });
  console.log(JSON.stringify(first, null, 2));
  console.log('\nBatch run #2 (same config, expect manifest skips)');
  const second = await splitFontBatch({
    inputDir,
    outputRoot,
    limit: 5,
    maxFiles: 200,
    skipMode: 'manifest',
    batchGroupBy: 'font-family',
    batchNamingMode: 'numeric-suffix',
    batchDedupeMode: 'font-identity',
    chunkSize: 70 * 1024,
    silent: true,
  });
  console.log(JSON.stringify(second, null, 2));
  if (first.results[0]) {
    console.log('\nSample split dir from run #1:', first.results[0].splitDir);
  }
  if (second.results[0]) {
    console.log('Sample split dir from run #2:', second.results[0].splitDir);
  } else {
    console.log('Sample split dir from run #2: skipped via manifest reuse');
  }
} else if (scenario === 'inspect') {
  console.log(JSON.stringify(await inspectSplitOutput({ outDir: fontPath }), null, 2));
} else if (scenario === 'agent-guidance') {
  const defaultGuidance = getAgentGuidance({ workflow: 'batch' });
  if (
    defaultGuidance.guidanceView?.detailLevel !== 'compact'
    || !defaultGuidance.guidanceView?.omittedSections?.includes('warning-catalog')
    || !defaultGuidance.guidanceView?.omittedSections?.includes('field-catalog')
    || Object.hasOwn(defaultGuidance, 'warningCodeCatalog')
    || Object.hasOwn(defaultGuidance, 'toolResponseFieldCatalog')
    || !defaultGuidance.errorResponseCatalog?.configurationError
    || Object.hasOwn(defaultGuidance, 'directoryWorkflowExamples')
    || !defaultGuidance.safeInvocationTemplates?.length
    || defaultGuidance.localVerificationOutputGuide?.primaryDecisionField !== 'reliabilityGateDecision'
    || !defaultGuidance.directoryWorkflowDecisionMatrix?.length
    || !defaultGuidance.configurationRecipes?.length
    || !defaultGuidance.batchPolicyGuide?.length
    || !defaultGuidance.unsupportedFileCategoryCatalog?.archive
    || defaultGuidance.nextToolDecisionSummary?.primaryRouteId !== 'unfamiliar-directory'
    || !defaultGuidance.recommendedWorkflowPlan?.orderedSteps?.length
  ) {
    throw new Error('Expected default agent guidance to be compact and omit bulky catalogs/examples.');
  }
  assertBatchPolicyGuide(defaultGuidance.batchPolicyGuide || []);
  assertNextToolDecisionSummary(defaultGuidance.nextToolDecisionSummary, {
    context: 'agent-guidance default compact',
    workflow: 'batch',
    primaryRouteId: 'unfamiliar-directory',
  });
  const result = getAgentGuidance({ workflow: 'batch', detailLevel: 'full' });
  if (result.agentOptimized !== true || result.workflow !== 'batch' || !result.tools.some((tool) => tool.name === 'inspect_font_inputs')) {
    throw new Error('Expected agent guidance to describe the batch workflow and preflight tool.');
  }
  if (
    result.guidanceView?.detailLevel !== 'full'
    || !result.guidanceView?.sectionsIncluded?.includes('warning-catalog')
    || !result.guidanceView?.sectionsIncluded?.includes('error-catalog')
    || !result.guidanceView?.availableSections?.includes('field-catalog')
    || !result.guidanceView?.availableSections?.includes('error-catalog')
  ) {
    throw new Error('Expected explicit full guidance to expose the full guidance view.');
  }
  const compactGuidance = getAgentGuidance({ workflow: 'organize', detailLevel: 'compact' });
  if (
    compactGuidance.guidanceView?.detailLevel !== 'compact'
    || compactGuidance.workflow !== 'organize'
    || !compactGuidance.guidanceView?.omittedSections?.includes('warning-catalog')
    || !compactGuidance.guidanceView?.omittedSections?.includes('field-catalog')
    || Object.hasOwn(compactGuidance, 'warningCodeCatalog')
    || Object.hasOwn(compactGuidance, 'toolResponseFieldCatalog')
    || !compactGuidance.errorResponseCatalog?.configurationError
    || Object.hasOwn(compactGuidance, 'directoryWorkflowExamples')
    || !compactGuidance.safeInvocationTemplates?.length
    || compactGuidance.localVerificationOutputGuide?.primaryDecisionField !== 'reliabilityGateDecision'
    || !compactGuidance.directoryWorkflowDecisionMatrix?.length
    || !compactGuidance.configurationRecipes?.length
    || !compactGuidance.batchPolicyGuide?.length
    || !compactGuidance.unsupportedFileCategoryCatalog?.archive
    || compactGuidance.nextToolDecisionSummary?.primaryRouteId !== 'layout-uncertain-or-staging-wanted'
  ) {
    throw new Error('Expected compact agent guidance to keep workflow essentials and omit bulky catalogs/examples.');
  }
  assertBatchPolicyGuide(compactGuidance.batchPolicyGuide || []);
  assertNextToolDecisionSummary(result.nextToolDecisionSummary, {
    context: 'agent-guidance full',
    workflow: 'batch',
    primaryRouteId: 'unfamiliar-directory',
  });
  assertNextToolDecisionSummary(compactGuidance.nextToolDecisionSummary, {
    context: 'agent-guidance organize compact',
    workflow: 'organize',
    primaryRouteId: 'layout-uncertain-or-staging-wanted',
  });
  const workflowOnlyGuidance = getAgentGuidance({ workflow: 'organize', sections: ['workflow'] });
  if (
    workflowOnlyGuidance.guidanceView?.sectionsIncluded?.length !== 1
    || workflowOnlyGuidance.guidanceView?.sectionsIncluded?.[0] !== 'workflow'
    || workflowOnlyGuidance.workflow !== 'organize'
    || Object.hasOwn(workflowOnlyGuidance, 'safeInvocationTemplates')
    || Object.hasOwn(workflowOnlyGuidance, 'configurationRecipes')
    || Object.hasOwn(workflowOnlyGuidance, 'directoryWorkflowDecisionMatrix')
    || !workflowOnlyGuidance.recommendedWorkflowPlan?.orderedSteps?.length
    || workflowOnlyGuidance.nextToolDecisionSummary?.workflowQuickStart?.recommendedExampleId !== 'plan-source-layout'
    || workflowOnlyGuidance.nextToolDecisionSummary?.workflowQuickStart?.recommendedCallExample?.tool !== 'organize_font_directory'
    || workflowOnlyGuidance.nextToolDecisionSummary?.workflowQuickStart?.recommendedCallExample?.args?.workflowPreset !== 'safe-preview'
    || workflowOnlyGuidance.nextToolDecisionSummary?.workflowQuickStart?.recommendedCallExample?.writesFiles !== false
    || workflowOnlyGuidance.nextToolDecisionSummary?.workflowQuickStart?.recommendedCallExample?.sourceDestructive !== false
  ) {
    throw new Error('Expected workflow-only guidance to expose an organize quick start without bulky sections or write behavior.');
  }
  assertNextToolDecisionSummary(workflowOnlyGuidance.nextToolDecisionSummary, {
    context: 'agent-guidance organize workflow section',
    workflow: 'organize',
    primaryRouteId: 'layout-uncertain-or-staging-wanted',
  });
  assertSourceLayoutDecisionChecklistCompanionFields(result, 'agent-guidance full');
  assertSourceLayoutDecisionChecklistCompanionFields(compactGuidance, 'agent-guidance compact');
  const catalogGuidance = getAgentGuidance({ sections: ['warning-catalog', 'field-catalog', 'error-catalog'] });
  if (
    catalogGuidance.guidanceView?.sectionsIncluded?.length !== 3
    || !catalogGuidance.warningCodeCatalog
    || !catalogGuidance.toolResponseFieldCatalog
    || !catalogGuidance.errorResponseCatalog
    || Object.hasOwn(catalogGuidance, 'safeInvocationTemplates')
    || Object.hasOwn(catalogGuidance, 'localVerificationOutputGuide')
    || Object.hasOwn(catalogGuidance, 'directoryWorkflowDecisionMatrix')
  ) {
    throw new Error('Expected focused agent guidance sections to return only requested catalogs.');
  }
  if (
    catalogGuidance.errorResponseCatalog.configurationError?.errorName !== 'FontSplitConfigurationError'
    || catalogGuidance.errorResponseCatalog.configurationError?.errorType !== 'configuration-error'
    || catalogGuidance.errorResponseCatalog.configurationError?.detailsSummaryType !== 'configuration-error'
    || !catalogGuidance.errorResponseCatalog.configurationError?.mcpResponseShape?.fields?.includes('errorType')
    || !catalogGuidance.errorResponseCatalog.configurationError?.mcpResponseShape?.fields?.includes('details')
    || catalogGuidance.errorResponseCatalog.batchSplitError?.errorType !== 'batch-split-error'
    || !catalogGuidance.errorResponseCatalog.batchSplitError?.mcpResponseShape?.jsonTextWhenDetailsPresent
    || !catalogGuidance.errorResponseCatalog.plainError?.mcpResponseShape?.plainTextWhenNoDetails
  ) {
    throw new Error('Expected errorResponseCatalog to describe structured MCP error payloads and configuration errors.');
  }
  if (!result.tools.some((tool) => tool.name === 'organize_font_directory')) {
    throw new Error('Expected agent guidance to describe the directory organization tool.');
  }
  if (!result.tools.some((tool) => tool.name === 'get_runtime_status')) {
    throw new Error('Expected agent guidance to describe the runtime status tool.');
  }
  if (result.recommendedInspectOptions?.includeFiles !== false || result.recommendedInspectOptions?.includeFamilies !== false) {
    throw new Error('Expected agent guidance to recommend compact output inspection.');
  }
  const presetIds = new Set((result.workflowPresets || []).map((item) => item.id));
  if (presetIds.has('default')) {
    throw new Error('Expected workflowPresets to omit redundant default preset; omit workflowPreset for raw defaults.');
  }
  for (const requiredPreset of ['safe-preview', 'reviewed-write', 'structure-first', 'source-layout', 'metadata-family', 'preserve-all']) {
    if (!presetIds.has(requiredPreset)) {
      throw new Error(`Expected agent guidance workflowPresets to include ${requiredPreset}.`);
    }
  }
  if (!result.responseFieldsToCheck?.includes('cnFontSplit.runtimeVersion')) {
    throw new Error('Expected agent guidance to recommend checking cn-font-split runtime details.');
  }
  if (!result.responseFieldsToCheck?.includes('workflowPresets') || !result.responseFieldsToCheck?.includes('workflowPreset')) {
    throw new Error('Expected agent guidance to recommend checking workflow preset fields.');
  }
  if (!result.responseFieldsToCheck?.includes('configurationRecipes')) {
    throw new Error('Expected agent guidance to recommend checking configuration recipes.');
  }
  if (!result.responseFieldsToCheck?.includes('unsupportedFileCategoryCatalog')) {
    throw new Error('Expected agent guidance to recommend checking unsupportedFileCategoryCatalog.');
  }
  if (
    !result.unsupportedFileCategoryCatalog?.archive?.handling?.includes('never extracted')
    || !result.unsupportedFileCategoryCatalog?.['unsupported-font']?.extensions?.includes('.eot')
    || !result.unsupportedFileCategoryCatalog?.extensionless?.extensions?.includes('<none>')
  ) {
    throw new Error('Expected unsupportedFileCategoryCatalog to explain archive, unsupported-font, and extensionless handling.');
  }
  for (const fieldName of [
    'unsupportedFileDecision',
    'unsupportedFileSummary.total',
    'unsupportedFileSummary.byExtension',
    'unsupportedFileSummary.byCategory',
    'unsupportedFileSummary.examples',
    'unsupportedFileSummary.examplesTruncated',
  ]) {
    if (!result.responseFieldsToCheck?.includes(fieldName)) {
      throw new Error(`Expected agent guidance to recommend checking ${fieldName}.`);
    }
  }
  if (!result.responseFieldsToCheck?.includes('recommendedBatchPreviewArgs')) {
    throw new Error('Expected agent guidance to recommend checking safe batch preview args.');
  }
  if (!result.responseFieldsToCheck?.includes('recommendedActions')) {
    throw new Error('Expected agent guidance to recommend checking remediation actions.');
  }
  if (!result.responseFieldsToCheck?.includes('node')) {
    throw new Error('Expected agent guidance to recommend checking Node runtime details.');
  }
  if (!result.responseFieldsToCheck?.includes('wasm.fontSplitWasmPathConfigured')) {
    throw new Error('Expected agent guidance to recommend checking custom WASM path status.');
  }
  if (!result.responseFieldsToCheck?.includes('batchWarnings')) {
    throw new Error('Expected agent guidance to recommend checking batch warnings.');
  }
  if (!result.responseFieldsToCheck?.includes('batchDecision')) {
    throw new Error('Expected agent guidance to recommend checking batch decision summaries.');
  }
  if (!result.responseFieldsToCheck?.includes('inspectionWarnings')) {
    throw new Error('Expected agent guidance to recommend checking inspection warnings.');
  }
  if (
    !result.responseFieldsToCheck?.includes('outputStructureDecision')
    || !result.responseFieldsToCheck?.includes('auditStatus')
    || !result.responseFieldsToCheck?.includes('auditPassed')
    || !result.responseFieldsToCheck?.includes('auditBlockingReasons')
  ) {
    throw new Error('Expected agent guidance to tell agents to check compact output structure decision and audit status fields.');
  }
  if (!result.responseFieldsToCheck?.includes('organizationWarnings')) {
    throw new Error('Expected agent guidance to recommend checking organization warnings.');
  }
  if (!result.responseFieldsToCheck?.includes('recommendedNextActions')) {
    throw new Error('Expected agent guidance to recommend checking organization next actions.');
  }
  if (!result.responseFieldsToCheck?.includes('planActionSummary')) {
    throw new Error('Expected agent guidance to recommend checking organization plan action summaries.');
  }
  if (!result.responseFieldsToCheck?.includes('organizationDecision')) {
    throw new Error('Expected agent guidance to recommend checking organization decision summaries.');
  }
  if (!result.responseFieldsToCheck?.includes('sourceLayoutMismatchSummary.decisionChecklist')) {
    throw new Error('Expected agent guidance to recommend checking source layout decision checklist summaries.');
  }
  if (!result.responseFieldsToCheck?.includes('warningCodeCatalog')) {
    throw new Error('Expected agent guidance to recommend checking the warning code catalog.');
  }
  if (!result.responseFieldsToCheck?.includes('toolResponseFieldCatalog')) {
    throw new Error('Expected agent guidance to recommend checking the tool response field catalog.');
  }
  if (
    !result.responseFieldsToCheck?.includes('errorResponseCatalog')
    || !result.toolResponseFieldCatalog?.errorResponseCatalog
    || result.errorResponseCatalog?.configurationError?.detailsSummaryType !== 'configuration-error'
  ) {
    throw new Error('Expected agent guidance to describe structured MCP error responses.');
  }
  if (!result.responseFieldsToCheck?.includes('localVerificationOutputGuide')) {
    throw new Error('Expected agent guidance to recommend checking the local verification output guide.');
  }
  if (
    result.localVerificationOutputGuide?.summaryType !== 'local-verification-output-guide'
    || result.localVerificationOutputGuide?.standardCommand !== 'npm run check:compact'
    || result.localVerificationOutputGuide?.standardJsonCommand !== 'npm run --silent check:compact -- --json'
    || result.localVerificationOutputGuide?.primaryCommand !== 'npm run smoke:real-corpus-suite -- <font-corpus-dir>'
    || Object.hasOwn(result.localVerificationOutputGuide, 'aliasCommand')
    || result.localVerificationOutputGuide?.primaryDecisionField !== 'reliabilityGateDecision'
    || !result.localVerificationOutputGuide?.requiredOutputFields?.includes('coverageSummary.outputStructureAuditSummary')
    || !result.localVerificationOutputGuide?.passCriteria?.some((item) => item.includes('reliabilityGateDecision.status is pass'))
    || !result.localVerificationOutputGuide?.nonIntuitiveBehavior?.some((item) => item.includes('not a per-directory acceptance audit'))
    || result.localVerificationOutputGuide?.evidenceFields?.fullCorpusFontCount !== 'testScope.corpusScan.supportedFontCount'
  ) {
    throw new Error('Expected localVerificationOutputGuide to explain real-corpus reliability gate output interpretation.');
  }
  const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
  if (
    packageJson.scripts?.['check:compact'] !== 'node scripts/run-check-compact.js'
    || packageJson.scripts?.['smoke:check-compact'] !== 'node src/smoke-test.js check-compact'
  ) {
    throw new Error('Expected package scripts to expose check:compact and smoke:check-compact.');
  }
  if (Object.hasOwn(packageJson.scripts || {}, 'smoke:real-corpus')) {
    throw new Error('Expected real-corpus smoke command to use the single canonical smoke:real-corpus-suite script.');
  }
  if (!result.responseFieldsToCheck?.includes('safeInvocationTemplates')) {
    throw new Error('Expected agent guidance to recommend checking safe invocation templates.');
  }
  if (!result.responseFieldsToCheck?.includes('guidanceView')) {
    throw new Error('Expected agent guidance to recommend checking guidance view metadata.');
  }
  if (!result.responseFieldsToCheck?.includes('recommendedWorkflowPlan')) {
    throw new Error('Expected agent guidance to recommend checking the ordered workflow plan.');
  }
  if (!result.responseFieldsToCheck?.includes('nextToolDecisionSummary')) {
    throw new Error('Expected agent guidance to recommend checking the next tool decision summary.');
  }
  if (!result.responseFieldsToCheck?.includes('nextToolDecisionSummary.quickStartCallExamples')) {
    throw new Error('Expected agent guidance to recommend checking quick start call examples.');
  }
  if (!result.responseFieldsToCheck?.includes('nextToolDecisionSummary.workflowQuickStart')) {
    throw new Error('Expected agent guidance to recommend checking workflow quick start.');
  }
  for (const removedVersionField of [
    'warningCodeCatalogVersion',
    'toolResponseFieldCatalogVersion',
    'safeInvocationTemplatesVersion',
    'recommendedWorkflowPlanVersion',
  ]) {
    if (
      Object.hasOwn(result, removedVersionField)
      || result.responseFieldsToCheck?.includes(removedVersionField)
      || result.toolResponseFieldCatalog?.[removedVersionField]
    ) {
      throw new Error(`Expected unreleased forward-compatibility field ${removedVersionField} to be removed from agent guidance.`);
    }
  }
  const expectedWarningCodes = [
    'dry-run-no-write',
    'input-scan-truncated',
    'batch-limit-truncated',
    'batch-plan-omitted',
    'batch-results-omitted',
    'existing-output-skipped',
    'errors-collected',
    'input-files-omitted',
    'invalid-fonts-found',
    'font-identity-missing',
    'output-scan-truncated',
    'output-files-omitted',
    'output-families-omitted',
    'legacy-output-detected',
    'organization-dry-run',
    'organization-writes-output',
    'font-parsing-skipped',
    'output-overwrite-enabled',
    'unsupported-files-ignored',
    'invalid-fonts-skipped',
    'duplicate-fonts-skipped',
    'mixed-layout-detected',
    'output-inside-input',
  ];
  for (const code of expectedWarningCodes) {
    const entry = result.warningCodeCatalog?.[code];
    if (!entry || !Array.isArray(entry.sources) || entry.sources.length === 0 || !entry.severity || !entry.suggestedAction) {
      throw new Error(`Expected warningCodeCatalog to describe ${code}.`);
    }
  }
  const sourceText = await fs.readFile(new URL('./font-split.js', import.meta.url), 'utf8');
  const sourceWarningCodes = new Set([...sourceText.matchAll(/push\('([^']+)',/g)].map((match) => match[1]));
  for (const code of sourceWarningCodes) {
    if (!result.warningCodeCatalog?.[code]) {
      throw new Error(`Expected warningCodeCatalog to cover source warning code ${code}.`);
    }
  }
  const templateIds = new Set((result.safeInvocationTemplates || []).map((item) => item.id));
  for (const requiredTemplate of ['runtime-diagnostic', 'directory-mismatch-plan', 'structure-first-large-directory', 'copy-organized-staging', 'batch-dry-run-preview', 'batch-process-reviewed-plan', 'output-audit-compact']) {
    if (!templateIds.has(requiredTemplate)) {
      throw new Error(`Expected safeInvocationTemplates to include ${requiredTemplate}.`);
    }
  }
  assertGuidanceItemsHaveCompletionProof(result.safeInvocationTemplates || [], {
    collectionName: 'safeInvocationTemplates',
  });
  const mismatchTemplate = (result.safeInvocationTemplates || []).find((item) => item.id === 'directory-mismatch-plan');
  if (
    mismatchTemplate?.tool !== 'organize_font_directory'
    || mismatchTemplate?.writesFiles !== false
    || mismatchTemplate?.sourceDestructive !== false
    || mismatchTemplate?.args?.workflowPreset !== 'safe-preview'
    || !mismatchTemplate.inspectFields?.includes('sourceDestructive')
    || !mismatchTemplate.inspectFields?.includes('organizationDecision')
    || !mismatchTemplate.inspectFields?.includes('unsupportedFileSummary')
    || !mismatchTemplate.inspectFields?.includes('recommendedBatchPreviewArgs')
  ) {
    throw new Error('Expected directory mismatch template to rely on the safe-preview organization preset.');
  }
  assertTemplateOmitsArgs(mismatchTemplate, ['dryRun', 'parseFonts', 'includePlan', 'batchGroupBy', 'batchNamingMode', 'batchDedupeMode', 'overwriteExisting'], 'directory-mismatch-plan');
  const structureTemplate = (result.safeInvocationTemplates || []).find((item) => item.id === 'structure-first-large-directory');
  if (
    structureTemplate?.tool !== 'organize_font_directory'
    || structureTemplate?.args?.workflowPreset !== 'structure-first'
    || !structureTemplate.inspectFields?.includes('dedupeLimitedByParsing')
    || !structureTemplate.inspectFields?.includes('organizationDecision')
    || !structureTemplate.inspectFields?.includes('recommendedBatchPreviewArgs')
  ) {
    throw new Error('Expected structure-first template to expose dedupe limitations and safe batch preview args.');
  }
  const copyTemplate = (result.safeInvocationTemplates || []).find((item) => item.id === 'copy-organized-staging');
  if (
    copyTemplate?.tool !== 'organize_font_directory'
    || copyTemplate?.writesFiles !== true
    || copyTemplate?.sourceDestructive !== false
    || copyTemplate?.args?.workflowPreset !== 'reviewed-write'
    || copyTemplate?.args?.outputDir !== 'organized-fonts'
    || !copyTemplate.inspectFields?.includes('writesSourceTree')
    || !copyTemplate.inspectFields?.includes('organizationDecision')
    || !copyTemplate.inspectFields?.includes('unsupportedFileSummary')
  ) {
    throw new Error('Expected copy staging template to disclose copy-only source safety.');
  }
  assertTemplateOmitsArgs(copyTemplate, ['dryRun', 'parseFonts', 'includePlan', 'batchGroupBy', 'batchNamingMode', 'batchDedupeMode', 'overwriteExisting'], 'copy-organized-staging');
  const batchPreviewTemplate = (result.safeInvocationTemplates || []).find((item) => item.id === 'batch-dry-run-preview');
  if (
    batchPreviewTemplate?.tool !== 'split_font_batch'
    || batchPreviewTemplate?.writesFiles !== false
    || batchPreviewTemplate?.args?.workflowPreset !== 'safe-preview'
    || batchPreviewTemplate?.args?.limit !== 50000
    || batchPreviewTemplate?.args?.maxFiles !== 50000
    || !batchPreviewTemplate.inspectFields?.includes('safetySummary')
    || !batchPreviewTemplate.inspectFields?.includes('sourceDestructive')
    || !batchPreviewTemplate.inspectFields?.includes('writesOutputTree')
    || !batchPreviewTemplate.inspectFields?.includes('outputTreeInsideInputTree')
    || !batchPreviewTemplate.inspectFields?.includes('batchDecision')
  ) {
    throw new Error('Expected batch preview template to rely on the safe-preview batch preset.');
  }
  assertTemplateOmitsArgs(batchPreviewTemplate, ['dryRun', 'includeResults', 'skipMode', 'batchNamingMode', 'batchDedupeMode', 'batchErrorMode', 'splitFailureAction'], 'batch-dry-run-preview');
  const batchProcessTemplate = (result.safeInvocationTemplates || []).find((item) => item.id === 'batch-process-reviewed-plan');
  if (
    batchProcessTemplate?.tool !== 'split_font_batch'
    || batchProcessTemplate?.writesFiles !== true
    || batchProcessTemplate?.sourceDestructive !== false
    || batchProcessTemplate?.args?.workflowPreset !== 'reviewed-write'
    || batchProcessTemplate?.args?.limit !== 50000
    || batchProcessTemplate?.args?.maxFiles !== 50000
    || !batchProcessTemplate.inspectFields?.includes('batchDecision')
    || !batchProcessTemplate.nextStep?.includes('inspect_split_output')
  ) {
    throw new Error('Expected reviewed batch processing template to rely on the reviewed-write preset and require output inspection.');
  }
  assertTemplateOmitsArgs(batchProcessTemplate, ['dryRun', 'includeResults', 'skipMode', 'batchNamingMode', 'batchDedupeMode', 'batchErrorMode', 'splitFailureAction'], 'batch-process-reviewed-plan');
  const outputAuditTemplate = (result.safeInvocationTemplates || []).find((item) => item.id === 'output-audit-compact');
  if (
    !outputAuditTemplate?.inspectFields?.includes('outputStructureDecision')
    || !outputAuditTemplate?.inspectFields?.includes('auditStatus')
    || !outputAuditTemplate?.inspectFields?.includes('auditPassed')
    || !outputAuditTemplate?.inspectFields?.includes('auditBlockingReasons')
    || !outputAuditTemplate?.inspectFields?.includes('structureSummary')
    || !outputAuditTemplate?.successCriteria?.includes('outputStructureDecision.status pass')
    || !outputAuditTemplate?.successCriteria?.includes('auditStatus pass')
  ) {
    throw new Error('Expected output audit template to require compact outputStructureDecision, audit status, and structureSummary inspection.');
  }
  const workflowGuidances = {};
  for (const workflowName of ['overview', 'single', 'batch', 'inspect', 'organize']) {
    workflowGuidances[workflowName] = workflowName === 'batch'
      ? result
      : getAgentGuidance({ workflow: workflowName, detailLevel: 'full' });
    const workflowTemplateIds = new Set((workflowGuidances[workflowName].safeInvocationTemplates || []).map((item) => item.id));
    assertRecommendedWorkflowPlanHasCompletionProof(
      workflowGuidances[workflowName].recommendedWorkflowPlan,
      workflowTemplateIds,
      `recommendedWorkflowPlan.${workflowName}`,
    );
  }
  const workflowPlan = result.recommendedWorkflowPlan;
  if (
    workflowPlan?.id !== 'batch-workflow'
    || !workflowPlan.orderedSteps?.some((step) => step.templateId === 'batch-dry-run-preview' && step.writesFiles === false && step.inspectFields?.includes('batchDecision'))
    || !workflowPlan.orderedSteps?.some((step) => step.templateId === 'batch-process-reviewed-plan' && step.writesFiles === true && step.inspectFields?.includes('batchDecision'))
    || !workflowPlan.orderedSteps?.some((step) => step.templateId === 'directory-mismatch-plan' && step.inspectFields?.includes('organizationDecision'))
    || !workflowPlan.orderedSteps?.some((step) => step.templateId === 'output-audit-compact' && step.inspectFields?.includes('outputStructureDecision') && step.inspectFields?.includes('auditStatus') && step.inspectFields?.includes('structureSummary'))
  ) {
    throw new Error('Expected batch recommendedWorkflowPlan to order preview, reviewed write, output audit, and route-decision checks.');
  }
  const referencedTemplateIds = new Set();
  for (const step of workflowPlan.orderedSteps || []) {
    if (step.templateId) referencedTemplateIds.add(step.templateId);
  }
  for (const decision of workflowPlan.decisionPoints || []) {
    if (decision.useTemplateId) referencedTemplateIds.add(decision.useTemplateId);
  }
  for (const templateId of referencedTemplateIds) {
    if (!templateIds.has(templateId)) {
      throw new Error(`Expected recommendedWorkflowPlan to reference existing safe template ${templateId}.`);
    }
  }
  for (const fieldName of result.responseFieldsToCheck || []) {
    const entry = result.toolResponseFieldCatalog?.[fieldName];
    if (!entry || !Array.isArray(entry.sourceTools) || entry.sourceTools.length === 0 || !entry.meaning || !entry.agentAction) {
      throw new Error(`Expected toolResponseFieldCatalog to describe ${fieldName}.`);
    }
  }
  const referencedFieldNames = new Set();
  for (const item of result.verificationChecklist || []) {
    for (const fieldName of item.responseFields || []) referencedFieldNames.add(fieldName);
  }
  for (const item of result.directoryWorkflowDecisionMatrix || []) {
    for (const fieldName of item.mustInspectFields || []) referencedFieldNames.add(fieldName);
  }
  for (const item of result.directoryWorkflowExamples || []) {
    for (const fieldName of item.mustInspectFields || []) referencedFieldNames.add(fieldName);
  }
  for (const item of result.configurationRecipes || []) {
    for (const fieldName of item.inspectFields || []) referencedFieldNames.add(fieldName);
    for (const fieldName of item.auditAfterWrite?.requiredFields || []) referencedFieldNames.add(fieldName);
  }
  for (const item of result.safeInvocationTemplates || []) {
    for (const fieldName of item.inspectFields || []) referencedFieldNames.add(fieldName);
  }
  for (const policy of result.batchPolicyGuide || []) {
    for (const value of policy.values || []) {
      for (const fieldName of value.inspectFields || []) referencedFieldNames.add(fieldName);
    }
  }
  for (const workflowGuidance of Object.values(workflowGuidances)) {
    for (const step of workflowGuidance.recommendedWorkflowPlan?.orderedSteps || []) {
      for (const fieldName of step.inspectFields || []) referencedFieldNames.add(fieldName);
    }
    for (const decision of workflowGuidance.recommendedWorkflowPlan?.decisionPoints || []) {
      for (const fieldName of decision.inspectFields || []) referencedFieldNames.add(fieldName);
    }
  }
  for (const fieldName of referencedFieldNames) {
    if (!result.toolResponseFieldCatalog?.[fieldName]) {
      throw new Error(`Expected toolResponseFieldCatalog to describe referenced inspect field ${fieldName}.`);
    }
  }
  const expectedFieldCatalogEntries = {
    workflowPresets: 'get_agent_guidance',
    workflowPreset: 'split_font_batch',
    batchPolicyGuide: 'get_agent_guidance',
    batchPolicySummary: 'split_font_batch',
    batchGroupBy: 'split_font_batch',
    batchNamingMode: 'split_font_batch',
    batchDedupeMode: 'split_font_batch',
    batchErrorMode: 'split_font_batch',
    configurationRecipes: 'get_agent_guidance',
    unsupportedFileCategoryCatalog: 'get_agent_guidance',
    recommendedBatchOptions: 'organize_font_directory',
    recommendedBatchPreviewArgs: 'organize_font_directory',
    sourceLayoutMismatchSummary: 'organize_font_directory',
    'sourceLayoutMismatchSummary.decisionChecklist': 'organize_font_directory',
    recommendedNextActions: 'split_font_batch',
    safetySummary: 'split_font_batch',
    unsupportedFileSummary: 'organize_font_directory',
    'unsupportedFileSummary.total': 'inspect_font_inputs',
    'unsupportedFileSummary.byExtension': 'inspect_font_inputs',
    'unsupportedFileSummary.byCategory': 'inspect_font_inputs',
    'unsupportedFileSummary.categoryDetails': 'inspect_font_inputs',
    'unsupportedFileSummary.handlingSummary': 'inspect_font_inputs',
    'unsupportedFileSummary.examples': 'inspect_font_inputs',
    'unsupportedFileSummary.examplesTruncated': 'inspect_font_inputs',
    outputStructureDecision: 'inspect_split_output',
    structureSummary: 'inspect_split_output',
    auditStatus: 'inspect_split_output',
    auditPassed: 'inspect_split_output',
    auditBlockingReasons: 'inspect_split_output',
    sourceDestructive: 'split_font_batch',
    outputTreeInsideInputTree: 'split_font_batch',
    batchWarnings: 'split_font_batch',
    inspectionWarnings: 'inspect_split_output',
    warningCodeCatalog: 'get_agent_guidance',
    recommendedWorkflowPlan: 'get_agent_guidance',
    nextToolDecisionSummary: 'get_agent_guidance',
    'nextToolDecisionSummary.quickStartCallExamples': 'get_agent_guidance',
    'nextToolDecisionSummary.workflowQuickStart': 'get_agent_guidance',
    localVerificationOutputGuide: 'get_agent_guidance',
  };
  for (const [fieldName, toolName] of Object.entries(expectedFieldCatalogEntries)) {
    if (!result.toolResponseFieldCatalog?.[fieldName]?.sourceTools?.includes(toolName)) {
      throw new Error(`Expected toolResponseFieldCatalog.${fieldName} to include ${toolName}.`);
    }
  }
  assertBatchPolicyGuide(result.batchPolicyGuide || []);
  const recipeIds = new Set((result.configurationRecipes || []).map((item) => item.id));
  for (const requiredRecipe of ['safe-default-batch', 'preserve-every-source-font', 'source-folder-families', 'metadata-family-groups', 'fast-structure-first-scan', 'copy-clean-staging-directory', 'large-reviewed-write']) {
    if (!recipeIds.has(requiredRecipe)) {
      throw new Error(`Expected configurationRecipes to include ${requiredRecipe}.`);
    }
  }
  assertGuidanceItemsHaveCompletionProof(result.configurationRecipes || [], {
    collectionName: 'configurationRecipes',
  });
  const safeDefaultRecipe = (result.configurationRecipes || []).find((item) => item.id === 'safe-default-batch');
  if (!safeDefaultRecipe?.inspectFields?.includes('batchDecision') || !safeDefaultRecipe?.successCriteria?.includes('audit')) {
    throw new Error('Expected safe-default-batch recipe to include route-decision inspection and output audit success criteria.');
  }
  const preserveRecipe = (result.configurationRecipes || []).find((item) => item.id === 'preserve-every-source-font');
  if (
    preserveRecipe?.previewArgs?.workflowPreset !== 'safe-preview'
    || preserveRecipe?.previewArgs?.batchDedupeMode !== 'none'
    || preserveRecipe?.writeArgsAfterReview?.workflowPreset !== 'reviewed-write'
    || preserveRecipe?.writesFilesBeforeReview !== false
    || preserveRecipe?.sourceDestructive !== false
    || !preserveRecipe.inspectFields?.includes('batchDecision')
    || !preserveRecipe.successCriteria?.includes('batchDedupeMode none')
  ) {
    throw new Error('Expected preserve-every-source-font recipe to disable dedupe only inside preview/write presets.');
  }
  const sourceFolderRecipe = (result.configurationRecipes || []).find((item) => item.id === 'source-folder-families');
  if (!sourceFolderRecipe?.inspectFields?.includes('batchDecision')) {
    throw new Error('Expected source-folder-families recipe to require batchDecision inspection.');
  }
  const stagingRecipe = (result.configurationRecipes || []).find((item) => item.id === 'copy-clean-staging-directory');
  if (
    stagingRecipe?.firstTool !== 'organize_font_directory'
    || stagingRecipe?.writeBehavior !== 'copy-only-outputDir'
    || stagingRecipe?.sourceDestructive !== false
    || !stagingRecipe.inspectFields?.includes('organizationDecision')
    || !stagingRecipe.inspectFields?.includes('writesSourceTree')
    || !stagingRecipe.successCriteria?.includes('copy-only')
  ) {
    throw new Error('Expected copy-clean-staging-directory recipe to disclose copy-only source safety.');
  }
  const structureRecipe = (result.configurationRecipes || []).find((item) => item.id === 'fast-structure-first-scan');
  if (
    structureRecipe?.previewArgs?.workflowPreset !== 'structure-first'
    || !structureRecipe.inspectFields?.includes('dedupeLimitedByParsing')
    || !structureRecipe.inspectFields?.includes('organizationDecision')
    || !structureRecipe.successCriteria?.includes('parseFonts true')
  ) {
    throw new Error('Expected fast structure recipe to use structure-first and require dedupe limitation inspection.');
  }
  const metadataRecipe = (result.configurationRecipes || []).find((item) => item.id === 'metadata-family-groups');
  if (!metadataRecipe?.inspectFields?.includes('organizationDecision')) {
    throw new Error('Expected metadata-family-groups recipe to require organizationDecision inspection.');
  }
  const reviewedWriteRecipe = (result.configurationRecipes || []).find((item) => item.id === 'large-reviewed-write');
  if (!reviewedWriteRecipe?.inspectFields?.includes('batchDecision')) {
    throw new Error('Expected large-reviewed-write recipe to require batchDecision inspection.');
  }
  const decisionIds = new Set((result.directoryWorkflowDecisionMatrix || []).map((item) => item.id));
  for (const requiredDecision of ['known-good-batch-layout', 'unknown-or-mixed-directory-layout', 'large-or-noisy-directory-first-pass', 'user-wants-clean-staging-directory']) {
    if (!decisionIds.has(requiredDecision)) {
      throw new Error(`Expected agent guidance decision matrix to include ${requiredDecision}.`);
    }
  }
  assertGuidanceItemsHaveCompletionProof(result.directoryWorkflowDecisionMatrix || [], {
    collectionName: 'directoryWorkflowDecisionMatrix',
    inspectFieldName: 'mustInspectFields',
  });
  const structureDecision = (result.directoryWorkflowDecisionMatrix || []).find((item) => item.id === 'large-or-noisy-directory-first-pass');
  if (
    structureDecision?.recommendedOptions?.workflowPreset !== 'structure-first'
    || !structureDecision.mustInspectFields?.includes('dedupeLimitedByParsing')
    || !structureDecision.mustInspectFields?.includes('organizationDecision')
    || !structureDecision.mustInspectFields?.includes('sourceLayoutMismatchSummary')
    || !structureDecision.mustInspectFields?.includes('unsupportedFileSummary')
    || !structureDecision.mustInspectFields?.includes('planActionSummary')
    || !structureDecision.mustInspectFields?.includes('recommendedBatchPreviewArgs')
    || !structureDecision.successCriteria?.includes('parseFonts true')
  ) {
    throw new Error('Expected structure-first guidance to use the structure-first preset and require dedupe checks.');
  }
  assertObjectOmitsKeys(structureDecision?.recommendedOptions, ['dryRun', 'includePlan', 'parseFonts'], 'large-or-noisy-directory-first-pass recommendedOptions');
  const knownBatchDecision = (result.directoryWorkflowDecisionMatrix || []).find((item) => item.id === 'known-good-batch-layout');
  if (
    knownBatchDecision?.recommendedOptions?.workflowPreset !== 'safe-preview'
    || knownBatchDecision?.followUpOptions?.workflowPreset !== 'reviewed-write'
    || !knownBatchDecision?.mustInspectFields?.includes('unsupportedFileSummary')
    || !knownBatchDecision?.mustInspectFields?.includes('safetySummary')
    || !knownBatchDecision?.mustInspectFields?.includes('batchDecision')
    || !knownBatchDecision?.mustInspectFields?.includes('outputTreeInsideInputTree')
    || !knownBatchDecision?.successCriteria?.includes('safe-preview')
  ) {
    throw new Error('Expected direct batch guidance to use workflow presets while requiring unsupportedFileSummary and full safety inspection.');
  }
  assertObjectOmitsKeys(knownBatchDecision?.recommendedOptions, ['dryRun', 'includeResults', 'skipMode', 'batchNamingMode', 'batchDedupeMode', 'batchErrorMode'], 'known-good-batch-layout recommendedOptions');
  assertObjectOmitsKeys(knownBatchDecision?.followUpOptions, ['dryRun', 'includeResults', 'skipMode', 'batchNamingMode', 'batchDedupeMode', 'batchErrorMode'], 'known-good-batch-layout followUpOptions');
  const mixedDecision = (result.directoryWorkflowDecisionMatrix || []).find((item) => item.id === 'unknown-or-mixed-directory-layout');
  if (
    mixedDecision?.recommendedOptions?.workflowPreset !== 'safe-preview'
    || mixedDecision?.followUpOptions?.workflowPreset !== 'safe-preview'
    || !mixedDecision?.mustInspectFields?.includes('organizationDecision')
    || !mixedDecision?.mustInspectFields?.includes('sourceLayoutMismatchSummary')
    || !mixedDecision?.mustInspectFields?.includes('planActionSummary')
    || !mixedDecision?.mustInspectFields?.includes('recommendedBatchPreviewArgs')
    || !mixedDecision?.successCriteria?.includes('sourceDestructive false')
  ) {
    throw new Error('Expected mixed-layout guidance to use safe-preview and require planActionSummary inspection.');
  }
  assertObjectOmitsKeys(mixedDecision?.recommendedOptions, ['dryRun', 'includePlan', 'parseFonts', 'batchNamingMode', 'batchDedupeMode'], 'unknown-or-mixed-directory-layout recommendedOptions');
  assertObjectOmitsKeys(mixedDecision?.followUpOptions, ['dryRun', 'includeResults', 'skipMode', 'batchNamingMode', 'batchDedupeMode', 'batchErrorMode'], 'unknown-or-mixed-directory-layout followUpOptions');
  const stagingDecision = (result.directoryWorkflowDecisionMatrix || []).find((item) => item.id === 'user-wants-clean-staging-directory');
  if (
    stagingDecision?.sourceDestructive !== false
    || stagingDecision?.recommendedOptions?.workflowPreset !== 'safe-preview'
    || stagingDecision?.followUpOptions?.workflowPreset !== 'reviewed-write'
    || !stagingDecision.mustInspectFields?.includes('organizationDecision')
    || !stagingDecision.mustInspectFields?.includes('sourceLayoutMismatchSummary')
    || !stagingDecision.mustInspectFields?.includes('unsupportedFileSummary')
    || !stagingDecision.mustInspectFields?.includes('planActionSummary')
    || !stagingDecision.mustInspectFields?.includes('outputTreeInsideInputTree')
    || !stagingDecision.successCriteria?.includes('copy-only')
  ) {
    throw new Error('Expected staging guidance to disclose source safety and preset-based copy-only follow-up.');
  }
  assertObjectOmitsKeys(stagingDecision?.recommendedOptions, ['dryRun', 'includePlan', 'parseFonts', 'overwriteExisting'], 'user-wants-clean-staging-directory recommendedOptions');
  assertObjectOmitsKeys(stagingDecision?.followUpOptions, ['dryRun', 'includePlan', 'parseFonts', 'overwriteExisting'], 'user-wants-clean-staging-directory followUpOptions');
  const exampleIds = new Set((result.directoryWorkflowExamples || []).map((item) => item.id));
  for (const requiredExample of ['flat-vendor-dump', 'archive-per-family-folders', 'mixed-root-and-nested-fonts', 'source-layout-mismatch-comparison', 'large-noisy-first-pass']) {
    if (!exampleIds.has(requiredExample)) {
      throw new Error(`Expected agent guidance examples to include ${requiredExample}.`);
    }
  }
  assertGuidanceItemsHaveCompletionProof(result.directoryWorkflowExamples || [], {
    collectionName: 'directoryWorkflowExamples',
    inspectFieldName: 'mustInspectFields',
  });
  const noisyExample = (result.directoryWorkflowExamples || []).find((item) => item.id === 'large-noisy-first-pass');
  if (
    noisyExample?.firstCall?.workflowPreset !== 'structure-first'
    || !noisyExample.mustInspectFields?.includes('dedupeLimitedByParsing')
    || !noisyExample.mustInspectFields?.includes('organizationDecision')
    || !noisyExample.mustInspectFields?.includes('unsupportedFileSummary')
    || !noisyExample.mustInspectFields?.includes('planActionSummary')
    || !noisyExample.mustInspectFields?.includes('recommendedBatchPreviewArgs')
    || !noisyExample.successCriteria?.includes('parseFonts true')
  ) {
    throw new Error('Expected noisy-directory example to use structure-first and require dedupe limitation checks.');
  }
  assertObjectOmitsKeys(noisyExample?.firstCall, ['dryRun', 'parseFonts', 'includePlan'], 'large-noisy-first-pass firstCall');
  const archiveExample = (result.directoryWorkflowExamples || []).find((item) => item.id === 'archive-per-family-folders');
  if (
    archiveExample?.firstCall?.workflowPreset !== 'safe-preview'
    || archiveExample?.firstCall?.batchGroupBy !== 'source-dir'
    || !archiveExample?.mustInspectFields?.includes('batchDecision')
    || !archiveExample?.mustInspectFields?.includes('unsupportedFileSummary')
    || !archiveExample?.successCriteria?.includes('source-dir')
  ) {
    throw new Error('Expected archive-per-family example to use safe-preview with source-dir grouping and require unsupportedFileSummary inspection.');
  }
  assertObjectOmitsKeys(archiveExample?.firstCall, ['dryRun', 'includeResults', 'skipMode', 'batchNamingMode', 'batchDedupeMode', 'batchErrorMode'], 'archive-per-family-folders firstCall');
  const mixedExample = (result.directoryWorkflowExamples || []).find((item) => item.id === 'mixed-root-and-nested-fonts');
  if (
    mixedExample?.safety?.sourceDestructive !== false
    || mixedExample?.firstCall?.workflowPreset !== 'safe-preview'
    || !mixedExample.mustInspectFields?.includes('organizationDecision')
    || !mixedExample.mustInspectFields?.includes('writesSourceTree')
    || !mixedExample.mustInspectFields?.includes('outputTreeInsideInputTree')
    || !mixedExample.mustInspectFields?.includes('planActionSummary')
    || !mixedExample.mustInspectFields?.includes('recommendedBatchPreviewArgs')
    || !mixedExample.successCriteria?.includes('sourceDestructive')
  ) {
    throw new Error('Expected mixed-layout example to disclose source safety fields.');
  }
  assertObjectOmitsKeys(mixedExample?.firstCall, ['dryRun', 'parseFonts', 'includePlan', 'batchNamingMode', 'batchDedupeMode'], 'mixed-root-and-nested-fonts firstCall');
  const mismatchComparisonExample = (result.directoryWorkflowExamples || []).find((item) => item.id === 'source-layout-mismatch-comparison');
  const mismatchComparisonCaseIds = new Set((mismatchComparisonExample?.comparisonCases || []).map((item) => item.caseId));
  if (
    mismatchComparisonExample?.firstCall?.workflowPreset !== 'safe-preview'
    || !['flat', 'nested', 'mixed', 'output-inside-input'].every((caseId) => mismatchComparisonCaseIds.has(caseId))
    || !mismatchComparisonExample.mustInspectFields?.includes('sourceLayoutMismatchSummary')
    || !mismatchComparisonExample.mustInspectFields?.includes('outputTreeInsideInputTree')
    || !mismatchComparisonExample.mustInspectFields?.includes('organizationWarnings')
    || !mismatchComparisonExample.mustInspectFields?.includes('recommendedBatchPreviewArgs')
    || !mismatchComparisonExample.successCriteria?.includes('sourceLayoutMismatchSummary')
    || !mismatchComparisonExample.concern?.includes('routing guidance only')
  ) {
    throw new Error('Expected source-layout mismatch comparison example to cover flat/nested/mixed/output-inside-input routing and required inspect fields.');
  }
  assertObjectOmitsKeys(mismatchComparisonExample?.firstCall, ['dryRun', 'parseFonts', 'includePlan', 'batchNamingMode', 'batchDedupeMode'], 'source-layout-mismatch-comparison firstCall');
  const flatExample = (result.directoryWorkflowExamples || []).find((item) => item.id === 'flat-vendor-dump');
  if (
    flatExample?.firstCall?.workflowPreset !== 'safe-preview'
    || !flatExample.mustInspectFields?.includes('organizationDecision')
    || !flatExample.mustInspectFields?.includes('recommendedBatchPreviewArgs')
    || !flatExample.successCriteria?.includes('flat')
  ) {
    throw new Error('Expected flat vendor example to use the safe-preview organization preset.');
  }
  assertObjectOmitsKeys(flatExample?.firstCall, ['dryRun', 'parseFonts', 'includePlan', 'batchNamingMode', 'batchDedupeMode'], 'flat-vendor-dump firstCall');
  const checklistIds = new Set((result.verificationChecklist || []).map((item) => item.id));
  for (const requiredId of ['runtime-ready', 'layout-plan-reviewed', 'process-outcome-checked', 'fallback-disclosed', 'output-audited', 'local-compact-check-passed', 'local-real-corpus-suite-passed']) {
    if (!checklistIds.has(requiredId)) {
      throw new Error(`Expected agent guidance verification checklist to include ${requiredId}.`);
    }
  }
  const layoutChecklist = (result.verificationChecklist || []).find((item) => item.id === 'layout-plan-reviewed');
  if (!layoutChecklist?.responseFields?.includes('safetySummary')) {
    throw new Error('Expected layout verification checklist to include safetySummary.');
  }
  if (!layoutChecklist?.responseFields?.includes('recommendedNextActions')) {
    throw new Error('Expected layout verification checklist to include recommendedNextActions.');
  }
  if (!layoutChecklist?.responseFields?.includes('unsupportedFileSummary')) {
    throw new Error('Expected layout verification checklist to include unsupportedFileSummary.');
  }
  if (!layoutChecklist?.responseFields?.includes('unsupportedFileDecision')) {
    throw new Error('Expected layout verification checklist to include unsupportedFileDecision.');
  }
  if (!layoutChecklist?.responseFields?.includes('planActionSummary')) {
    throw new Error('Expected layout verification checklist to include planActionSummary.');
  }
  if (!layoutChecklist?.responseFields?.includes('recommendedBatchPreviewArgs')) {
    throw new Error('Expected layout verification checklist to include recommendedBatchPreviewArgs.');
  }
  if (!layoutChecklist?.responseFields?.includes('sourceLayoutMismatchSummary')) {
    throw new Error('Expected layout verification checklist to include sourceLayoutMismatchSummary.');
  }
  if (!layoutChecklist?.responseFields?.includes('organizationDecision')) {
    throw new Error('Expected layout verification checklist to include organizationDecision.');
  }
  const processChecklist = (result.verificationChecklist || []).find((item) => item.id === 'process-outcome-checked');
  if (
    !processChecklist?.responseFields?.includes('batchDecision')
    || !processChecklist?.responseFields?.includes('batchWarnings')
    || !processChecklist?.responseFields?.includes('errorCount')
    || !processChecklist?.responseFields?.includes('errors')
  ) {
    throw new Error('Expected process verification checklist to include batch route decisions and error fields.');
  }
  const outputChecklist = (result.verificationChecklist || []).find((item) => item.id === 'output-audited');
  if (
    !outputChecklist?.responseFields?.includes('outputStructureDecision')
    || !outputChecklist?.responseFields?.includes('auditStatus')
    || !outputChecklist?.responseFields?.includes('auditPassed')
    || !outputChecklist?.responseFields?.includes('auditBlockingReasons')
    || !outputChecklist?.responseFields?.includes('structureSummary')
  ) {
    throw new Error('Expected output verification checklist to include compact outputStructureDecision, audit status fields, and structureSummary.');
  }
  const corpusSuiteChecklist = (result.verificationChecklist || []).find((item) => item.id === 'local-real-corpus-suite-passed');
  const compactCheckChecklist = (result.verificationChecklist || []).find((item) => item.id === 'local-compact-check-passed');
  if (
    compactCheckChecklist?.command !== 'npm run check:compact'
    || compactCheckChecklist?.jsonCommand !== 'npm run --silent check:compact -- --json'
    || !compactCheckChecklist?.responseFields?.includes('compact-check-result.failedStepId')
    || !compactCheckChecklist?.check?.includes('low-noise output')
  ) {
    throw new Error('Expected verification checklist to include the local compact check gate.');
  }
  if (
    corpusSuiteChecklist?.command !== 'npm run smoke:real-corpus-suite -- <font-corpus-dir>'
    || corpusSuiteChecklist?.verboseCommand !== 'npm run smoke:real-corpus-suite -- <font-corpus-dir> --verbose'
    || !corpusSuiteChecklist?.check?.includes('representative reliability gate')
    || result.localVerificationOutputGuide?.primaryDecisionField !== 'reliabilityGateDecision'
  ) {
    throw new Error('Expected verification checklist to include the local real-corpus suite reliability gate.');
  }
  console.log(JSON.stringify(result, null, 2));
} else if (scenario === 'runtime-status') {
  const result = await getRuntimeStatus();
  if (result.ok !== true || !result.workspace?.isDirectory || !result.wasm?.isFile) {
    throw new Error('Expected runtime status to confirm workspace and WASM availability.');
  }
  if (!result.checks?.every((check) => check.ok === true)) {
    throw new Error('Expected runtime status checks to pass.');
  }
  if (result.node?.ok !== true || !result.checks.some((check) => check.name === 'node-runtime')) {
    throw new Error('Expected runtime status to validate the Node runtime.');
  }
  if (!result.cnFontSplit?.packageVersion) {
    throw new Error('Expected runtime status to include cn-font-split package version.');
  }
  if (result.wasm?.fontSplitWasmPathConfigured !== false) {
    throw new Error('Expected runtime status to report the default WASM path mode.');
  }
  if (!Array.isArray(result.recommendedActions)) {
    throw new Error('Expected runtime status to include recommendedActions.');
  }
  console.log(JSON.stringify(result, null, 2));
} else if (scenario === 'font-inputs') {
  const inputDir = process.argv[3] || 'font-split-mcp/.font-split-input-inspect';
  console.log('Font input inspection smoke:', inputDir);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.mkdir(inputDir, { recursive: true });
  await fs.writeFile(path.join(inputDir, 'notes.txt'), 'not a font');
  await fs.writeFile(path.join(inputDir, 'archive.zip'), 'not a font archive');
  await fs.writeFile(path.join(inputDir, 'preview.png'), 'not a font image');
  await fs.writeFile(path.join(inputDir, 'LICENSE'), 'not a font license');
  await fs.writeFile(path.join(inputDir, 'not-a-font.ttf'), 'not a real font');

  const result = await inspectFontInputs({
    inputDir,
    maxFiles: 10,
    includeFiles: true,
  });
  if (result.supportedFontCount !== 1 || result.invalidFontCount !== 1 || result.files?.[0]?.status !== 'invalid') {
    throw new Error('Expected input inspection to report one invalid font-like file.');
  }
  if (!result.inspectionWarnings?.some((warning) => warning.code === 'invalid-fonts-found')) {
    throw new Error('Expected input inspection to warn about invalid fonts.');
  }
  if (result.maxFilesHit !== false) {
    throw new Error('Expected maxFilesHit false when the scan did not exceed maxFiles.');
  }
  const unsupportedInputExtensions = new Set((result.unsupportedFileSummary?.byExtension || []).map((item) => item.extension));
  const unsupportedInputCategories = Object.fromEntries((result.unsupportedFileSummary?.byCategory || []).map((item) => [item.category, item.count]));
  const unsupportedInputCategoryDetails = Object.fromEntries((result.unsupportedFileSummary?.categoryDetails || []).map((item) => [item.category, item]));
  if (
    result.unsupportedFileSummary?.total !== 4
    || !unsupportedInputExtensions.has('.txt')
    || !unsupportedInputExtensions.has('.zip')
    || !unsupportedInputExtensions.has('.png')
    || !unsupportedInputExtensions.has('<none>')
    || unsupportedInputCategories.document !== 1
    || unsupportedInputCategories.archive !== 1
    || unsupportedInputCategories.image !== 1
    || unsupportedInputCategories.extensionless !== 1
    || unsupportedInputCategoryDetails.archive?.count !== 1
    || !unsupportedInputCategoryDetails.archive?.handling?.includes('never extracted')
    || result.unsupportedFileSummary?.handlingSummary?.unsupportedFilesIgnored !== true
    || result.unsupportedFileSummary?.handlingSummary?.unsupportedFilesCopiedByOrganization !== false
    || result.unsupportedFileSummary?.handlingSummary?.unsupportedFilesSplitByBatch !== false
    || result.unsupportedFileSummary?.handlingSummary?.archivesExtracted !== false
    || result.unsupportedFileSummary?.handlingSummary?.archiveCount !== 1
  ) {
    throw new Error('Expected input inspection to summarize unsupported file extensions, categories, and handling behavior.');
  }
  if (
    result.unsupportedFileDecision?.summaryType !== 'unsupported-file-decision'
    || result.unsupportedFileDecision?.status !== 'ignored-files-present'
    || result.unsupportedFileDecision?.totalUnsupportedFileCount !== 4
    || result.unsupportedFileDecision?.categoryCount !== 4
    || result.unsupportedFileDecision?.extensionCount !== 4
    || result.unsupportedFileDecision?.hasArchives !== true
    || result.unsupportedFileDecision?.archiveCount !== 1
    || result.unsupportedFileDecision?.hasExtensionsBeyondZipTxt !== true
    || result.unsupportedFileDecision?.extensionsBeyondZipTxtCount !== 2
    || result.unsupportedFileDecision?.handlingSummary?.archivesExtracted !== false
    || result.unsupportedFileDecision?.handlingSummary?.unsupportedFilesCopiedByOrganization !== false
    || result.unsupportedFileDecision?.handlingSummary?.unsupportedFilesSplitByBatch !== false
    || result.unsupportedFileDecision?.recommendedAction !== 'inspect-unsupportedFileSummary-before-writing'
  ) {
    throw new Error('Expected input inspection to expose compact unsupportedFileDecision triage.');
  }
  const truncated = await inspectFontInputs({
    inputDir,
    maxFiles: 1,
    includeFiles: false,
  });
  if (truncated.scannedFileCount !== 1 || truncated.maxFilesHit !== true || truncated.filesIncluded !== false) {
    throw new Error('Expected input inspection to report accurate maxFiles truncation.');
  }
  const truncatedInputWarningCodes = new Set((truncated.inspectionWarnings || []).map((warning) => warning.code));
  for (const expectedWarning of ['input-scan-truncated', 'input-files-omitted']) {
    if (!truncatedInputWarningCodes.has(expectedWarning)) {
      throw new Error(`Expected input inspection warning ${expectedWarning}.`);
    }
  }
  console.log(JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ truncated }, null, 2));
} else if (scenario === 'scan-limits') {
  const inputDir = process.argv[3] || 'font-split-mcp/.font-split-scan-limits';
  console.log('Scan limit smoke:', inputDir);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.mkdir(inputDir, { recursive: true });
  await fs.writeFile(path.join(inputDir, 'a-note.txt'), 'not a font');
  await fs.writeFile(path.join(inputDir, 'b-not-a-font.ttf'), 'not a real font');

  const inputInspect = await inspectFontInputs({ inputDir, maxFiles: 1, includeFiles: false });
  if (inputInspect.scannedFileCount !== 1 || inputInspect.maxFilesHit !== true) {
    throw new Error('Expected inspectFontInputs to report maxFilesHit only when more files exist.');
  }
  if (!inputInspect.inspectionWarnings?.some((warning) => warning.code === 'input-scan-truncated')) {
    throw new Error('Expected inspectFontInputs to warn about scan truncation.');
  }

  const batchPlan = await splitFontBatch({
    inputDir,
    outputRoot: `${inputDir}-output`,
    maxFiles: 1,
    limit: 1,
    dryRun: true,
    includeResults: false,
    silent: true,
  });
  if (batchPlan.scannedFileCount !== 1 || batchPlan.maxFilesHit !== true || batchPlan.processedFontCount !== 0) {
    throw new Error('Expected splitFontBatch dry-run to report accurate scan truncation without processing.');
  }
  if (
    batchPlan.safetySummary?.operationMode !== 'preview-only'
    || batchPlan.sourceDestructive !== false
    || batchPlan.sourceFilesPreserved !== true
    || batchPlan.writesSourceTree !== false
    || batchPlan.writesOutputTree !== false
    || batchPlan.outputTreeInsideInputTree !== false
    || batchPlan.mayOverwriteOutputTree !== false
  ) {
    throw new Error('Expected splitFontBatch dry-run safety summary to be source-safe and no-write.');
  }
  if (batchPlan.unsupportedFileSummary?.total !== 1 || batchPlan.unsupportedFileSummary?.byExtension?.[0]?.extension !== '.txt') {
    throw new Error('Expected splitFontBatch dry-run to summarize scanned unsupported files.');
  }
  if (
    batchPlan.unsupportedFileDecision?.summaryType !== 'unsupported-file-decision'
    || batchPlan.unsupportedFileDecision?.status !== 'ignored-files-present'
    || batchPlan.unsupportedFileDecision?.totalUnsupportedFileCount !== 1
    || batchPlan.unsupportedFileDecision?.categories?.[0] !== 'document'
    || batchPlan.unsupportedFileDecision?.hasArchives !== false
    || batchPlan.unsupportedFileDecision?.hasExtensionsBeyondZipTxt !== false
  ) {
    throw new Error('Expected splitFontBatch dry-run to expose compact unsupportedFileDecision triage.');
  }
  const batchWarningCodes = new Set((batchPlan.batchWarnings || []).map((warning) => warning.code));
  for (const expectedWarning of ['dry-run-no-write', 'input-scan-truncated', 'batch-plan-omitted']) {
    if (!batchWarningCodes.has(expectedWarning)) {
      throw new Error(`Expected splitFontBatch dry-run warning ${expectedWarning}.`);
    }
  }

  const outputInspect = await inspectSplitOutput({ outDir: inputDir, maxFiles: 1 });
  if (outputInspect.fileCount !== 1 || outputInspect.maxFilesHit !== true) {
    throw new Error('Expected inspectSplitOutput to report accurate scan truncation.');
  }
  assertOutputAuditStatus(outputInspect, {
    auditStatus: 'incomplete',
    auditPassed: false,
    reasonCode: 'output-scan-truncated',
  }, 'scan-limits truncated output audit');
  if (!outputInspect.inspectionWarnings?.some((warning) => warning.code === 'output-scan-truncated')) {
    throw new Error('Expected inspectSplitOutput to warn about output scan truncation.');
  }

  console.log(JSON.stringify({ inputInspect, batchPlan, outputInspect }, null, 2));
} else if (scenario === 'workspace-root-path') {
  const inputDir = process.argv[3] || '.';
  const outputDir = process.argv[4] || '.font-split-root-path-output';
  console.log('Workspace root path smoke:', inputDir, '->', outputDir);
  const result = await organizeFontDirectory({
    inputDir,
    outputDir,
    dryRun: true,
    parseFonts: false,
    includePlan: false,
    maxFiles: 5,
  });
  if (result.inputDir !== '.') {
    throw new Error(`Expected workspace root inputDir to normalize to "." but got ${JSON.stringify(result.inputDir)}.`);
  }
  if (!result.recommendedNextActions?.some((action) => action.suggestedArgs?.inputDir === '.')) {
    throw new Error('Expected recommended next actions to normalize root inputDir to ".".');
  }
  console.log(JSON.stringify(result, null, 2));
} else if (scenario === 'organize-dry-run') {
  const inputDir = process.argv[3] || '.font-split-organize-input';
  const outputDir = process.argv[4] || '.font-split-organize-output';
  console.log('Directory organization dry-run smoke:', inputDir, '->', outputDir);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(path.join(inputDir, 'FamilyA'), { recursive: true });
  await fs.writeFile(path.join(inputDir, 'FamilyA', 'not-a-font.ttf'), 'not a real font');
  await fs.writeFile(path.join(inputDir, 'notes.txt'), 'not a font');
  await fs.writeFile(path.join(inputDir, 'archive.zip'), 'not a font archive');
  await fs.writeFile(path.join(inputDir, 'preview.png'), 'not a font image');
  await fs.writeFile(path.join(inputDir, 'LICENSE'), 'not a font license');

  const result = await organizeFontDirectory({
    inputDir,
    outputDir,
    dryRun: true,
    includePlan: true,
    maxFiles: 10,
  });
  if (result.dryRun !== true || result.operationMode !== 'plan-only' || result.sourceDestructive !== false || result.writesSourceTree !== false || result.writesOutputTree !== false || result.outputTreeInsideInputTree !== false || result.mayOverwriteOutputTree !== false || Object.hasOwn(result, 'destructive')) {
    throw new Error('Expected organizeFontDirectory dry-run to be source-non-destructive and plan-only.');
  }
  if (
    result.safetySummary?.operationMode !== 'plan-only'
    || result.safetySummary?.sourceDestructive !== false
    || result.safetySummary?.sourceFilesPreserved !== true
    || result.safetySummary?.writesSourceTree !== false
    || result.safetySummary?.writesOutputTree !== false
    || result.safetySummary?.outputTreeInsideInputTree !== false
    || result.safetySummary?.writeScope !== 'none'
    || result.safetySummary?.overwriteScope !== 'none'
  ) {
    throw new Error('Expected organizeFontDirectory dry-run safetySummary to emphasize no writes and source preservation.');
  }
  if (result.layout?.layoutKind !== 'nested' || result.recommendedBatchOptions?.batchGroupBy !== 'source-dir') {
    throw new Error('Expected organization layout analysis to recommend source-dir grouping for nested input.');
  }
  assertSafeRecommendedBatchPreviewArgs(result.recommendedBatchPreviewArgs, {
    inputDir,
    batchGroupBy: 'source-dir',
  }, 'organize-dry-run');
  if (!result.organizationWarnings?.some((warning) => warning.code === 'organization-dry-run')) {
    throw new Error('Expected organization dry-run warning.');
  }
  if (!result.organizationWarnings?.some((warning) => warning.code === 'invalid-fonts-skipped')) {
    throw new Error('Expected organization warning about skipped invalid fonts.');
  }
  if (result.planActionSummary?.total !== 1 || result.planActionSummary?.byAction?.['skipped-invalid'] !== 1) {
    throw new Error('Expected organization dry-run to summarize skipped-invalid plan actions.');
  }
  if (
    result.organizationDecision?.route !== 'decide-on-invalid-fonts'
    || result.organizationDecision?.preferredNextActionId !== 'decide-on-invalid-fonts'
    || result.organizationDecision?.sourceDestructive !== false
    || result.organizationDecision?.writesBeforeReview !== false
  ) {
    throw new Error('Expected organization dry-run to summarize the invalid-font decision route.');
  }
  assertDirectoryWorkflowSummary(result.directoryWorkflowSummary, {
    context: 'organize-dry-run',
    expectedLayoutKind: 'nested',
    expectedRoute: 'decide-on-invalid-fonts',
    expectedCurrentStep: 'layout-plan',
    expectedReviewReason: 'invalid-fonts-skipped',
  });
  if (
    result.sourceLayoutMismatchSummary?.summaryType !== 'source-layout-mismatch'
    || result.sourceLayoutMismatchSummary?.currentLayoutKind !== result.directoryWorkflowSummary?.sourceLayoutMismatchSummary?.currentLayoutKind
    || result.sourceLayoutMismatchSummary?.copyOnlyStaging?.sourceDestructive !== false
  ) {
    throw new Error('Expected organizeFontDirectory to expose sourceLayoutMismatchSummary both top-level and inside directoryWorkflowSummary.');
  }
  const unsupportedOrganizationExtensions = new Set((result.unsupportedFileSummary?.byExtension || []).map((item) => item.extension));
  const unsupportedOrganizationCategories = Object.fromEntries((result.unsupportedFileSummary?.byCategory || []).map((item) => [item.category, item.count]));
  const unsupportedOrganizationCategoryDetails = Object.fromEntries((result.unsupportedFileSummary?.categoryDetails || []).map((item) => [item.category, item]));
  if (
    result.unsupportedFileSummary?.total !== 4
    || !unsupportedOrganizationExtensions.has('.txt')
    || !unsupportedOrganizationExtensions.has('.zip')
    || !unsupportedOrganizationExtensions.has('.png')
    || !unsupportedOrganizationExtensions.has('<none>')
    || unsupportedOrganizationCategories.document !== 1
    || unsupportedOrganizationCategories.archive !== 1
    || unsupportedOrganizationCategories.image !== 1
    || unsupportedOrganizationCategories.extensionless !== 1
    || unsupportedOrganizationCategoryDetails.archive?.count !== 1
    || !unsupportedOrganizationCategoryDetails.archive?.handling?.includes('never extracted')
    || result.unsupportedFileSummary?.handlingSummary?.unsupportedFilesIgnored !== true
    || result.unsupportedFileSummary?.handlingSummary?.unsupportedFilesCopiedByOrganization !== false
    || result.unsupportedFileSummary?.handlingSummary?.unsupportedFilesSplitByBatch !== false
    || result.unsupportedFileSummary?.handlingSummary?.archivesExtracted !== false
    || result.unsupportedFileSummary?.handlingSummary?.archiveCount !== 1
  ) {
    throw new Error('Expected organization dry-run to summarize unsupported file extensions, categories, and handling behavior.');
  }
  if (
    result.unsupportedFileDecision?.summaryType !== 'unsupported-file-decision'
    || result.unsupportedFileDecision?.status !== 'ignored-files-present'
    || result.unsupportedFileDecision?.totalUnsupportedFileCount !== 4
    || result.unsupportedFileDecision?.categoryCount !== 4
    || result.unsupportedFileDecision?.extensionCount !== 4
    || result.unsupportedFileDecision?.hasArchives !== true
    || result.unsupportedFileDecision?.hasExtensionsBeyondZipTxt !== true
    || result.unsupportedFileDecision?.handlingSummary?.unsupportedFilesCopiedByOrganization !== false
    || result.unsupportedFileDecision?.handlingSummary?.archivesExtracted !== false
    || !result.unsupportedFileDecision?.nonIntuitiveBehavior?.includes('does not extract archives')
  ) {
    throw new Error('Expected organization dry-run to expose compact unsupportedFileDecision triage.');
  }
  const dryRunNextActionIds = new Set((result.recommendedNextActions || []).map((action) => action.id));
  for (const expectedAction of ['review-plan-before-writing', 'decide-on-invalid-fonts']) {
    if (!dryRunNextActionIds.has(expectedAction)) {
      throw new Error(`Expected organization dry-run next actions to include ${expectedAction}.`);
    }
  }
  for (const expectedAction of ['review-plan-before-writing', 'decide-on-invalid-fonts']) {
    const action = (result.recommendedNextActions || []).find((item) => item.id === expectedAction);
    if (!action?.inspectFields?.includes('planActionSummary')) {
      throw new Error(`Expected ${expectedAction} to require planActionSummary inspection.`);
    }
  }
  const invalidFontsAction = (result.recommendedNextActions || []).find((item) => item.id === 'decide-on-invalid-fonts');
  if (
    invalidFontsAction?.suggestedArgs?.workflowPreset !== 'safe-preview'
    || invalidFontsAction?.suggestedArgs?.copyInvalidFonts !== true
  ) {
    throw new Error('Expected decide-on-invalid-fonts to use safe-preview with only the copyInvalidFonts override.');
  }
  assertActionSuggestedArgsOmit(invalidFontsAction, ['dryRun', 'parseFonts', 'includePlan', 'batchNamingMode', 'batchDedupeMode', 'overwriteExisting'], 'decide-on-invalid-fonts suggestedArgs');
  assertRecommendedNextActionInspectFields(result.recommendedNextActions, {
    organize_font_directory: result,
  }, 'organize-dry-run');
  if (await fsExists(outputDir)) {
    throw new Error('Expected organization dry-run not to create outputDir.');
  }

  const compact = await organizeFontDirectory({
    inputDir,
    outputDir,
    dryRun: true,
    includePlan: false,
    maxFiles: 10,
  });
  if (compact.planIncluded !== false || Object.hasOwn(compact, 'plan')) {
    throw new Error('Expected compact organization dry-run to omit plan details.');
  }
  if (compact.planActionSummary?.total !== 1 || compact.planActionSummary?.byAction?.['skipped-invalid'] !== 1) {
    throw new Error('Expected compact organization dry-run to keep plan action summary.');
  }
  if (compact.organizationDecision?.route !== 'decide-on-invalid-fonts') {
    throw new Error('Expected compact organization dry-run to keep organizationDecision.');
  }
  if (
    compact.directoryWorkflowSummary?.planVisibility?.planIncluded !== false
    || !compact.directoryWorkflowSummary?.planVisibility?.detailsOmitted?.includes('plan')
    || !compact.directoryWorkflowSummary?.planVisibility?.availableSummaryFields?.includes('planActionSummary')
    || !compact.directoryWorkflowSummary?.planVisibility?.availableSummaryFields?.includes('sourceLayoutMismatchSummary')
    || !compact.directoryWorkflowSummary?.planVisibility?.availableSummaryFields?.includes('sourceLayoutMismatchSummary.decisionChecklist')
    || compact.directoryWorkflowSummary?.planVisibility?.rerunWithPlanBeforeWrite !== true
    || compact.directoryWorkflowSummary?.planVisibility?.rerunWithPlanArgs?.workflowPreset !== 'safe-preview'
    || compact.directoryWorkflowSummary?.planVisibility?.rerunWithPlanArgs?.includePlan !== true
    || compact.directoryWorkflowSummary?.planVisibility?.rerunWithPlanArgs?.inputDir !== inputDir
    || compact.directoryWorkflowSummary?.planVisibility?.rerunWithPlanArgs?.outputDir !== outputDir
    || compact.sourceLayoutMismatchSummary?.summaryType !== 'source-layout-mismatch'
  ) {
    throw new Error('Expected compact organization dry-run to explain omitted plan[] details and provide rerun guidance.');
  }
  console.log(JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ compact }, null, 2));
} else if (scenario === 'organize-copy') {
  const inputDir = process.argv[3] || '.font-split-organize-copy-input';
  const outputDir = process.argv[4] || '.font-split-organize-copy-output';
  const sourcePath = path.join(inputDir, 'FamilyA', 'not-a-font.ttf');
  const targetPath = path.join(outputDir, 'FamilyA', 'not-a-font.ttf');
  const manifestPath = path.join(outputDir, 'font-organization-manifest.json');
  console.log('Directory organization copy smoke:', inputDir, '->', outputDir);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.writeFile(sourcePath, 'not a real font');

  const copied = await organizeFontDirectory({
    inputDir,
    outputDir,
    dryRun: false,
    includePlan: true,
    copyInvalidFonts: true,
    batchNamingMode: 'plain',
    maxFiles: 10,
  });
  if (copied.operationMode !== 'copy-only' || copied.sourceDestructive !== false || copied.writesSourceTree !== false || copied.writesOutputTree !== true || copied.outputTreeInsideInputTree !== false || copied.mayOverwriteOutputTree !== false || Object.hasOwn(copied, 'destructive')) {
    throw new Error('Expected organizeFontDirectory copy mode to write only the output tree without overwrite risk.');
  }
  if (
    copied.safetySummary?.operationMode !== 'copy-only'
    || copied.safetySummary?.sourceDestructive !== false
    || copied.safetySummary?.sourceFilesPreserved !== true
    || copied.safetySummary?.writesSourceTree !== false
    || copied.safetySummary?.writesOutputTree !== true
    || copied.safetySummary?.outputTreeInsideInputTree !== false
    || copied.safetySummary?.mayOverwriteOutputTree !== false
    || copied.safetySummary?.writeScope !== 'output-tree-only'
    || copied.safetySummary?.overwriteScope !== 'none'
  ) {
    throw new Error('Expected organizeFontDirectory copy safetySummary to limit writes to the output tree.');
  }
  if (copied.copiedCount !== 1 || copied.organizationManifestWritten !== true || copied.organizationManifestPath !== `${outputDir}/font-organization-manifest.json`) {
    throw new Error('Expected organizeFontDirectory copy mode to copy one file and write a manifest.');
  }
  if (copied.planActionSummary?.total !== 1 || copied.planActionSummary?.byAction?.copied !== 1) {
    throw new Error('Expected organization copy mode to summarize copied plan actions.');
  }
  if (
    copied.organizationDecision?.route !== 'preview-organized-output'
    || copied.organizationDecision?.preferredNextActionId !== 'preview-batch-split-organized-output'
    || copied.organizationDecision?.nextInputDir !== outputDir
    || copied.organizationDecision?.safeBatchPreviewArgs?.inputDir !== outputDir
    || copied.organizationDecision?.sourceDestructive !== false
    || copied.organizationDecision?.writesBeforeReview !== false
  ) {
    throw new Error('Expected organization copy mode to recommend previewing the organized output.');
  }
  assertDirectoryWorkflowSummary(copied.directoryWorkflowSummary, {
    context: 'organize-copy',
    expectedLayoutKind: 'nested',
    expectedRoute: 'preview-organized-output',
    expectedCurrentStep: 'copy-only-staging',
    expectedStepIds: ['preview-batch-split-organized-output'],
  });
  if (!copied.organizationWarnings?.some((warning) => warning.code === 'organization-writes-output')) {
    throw new Error('Expected organization copy warning.');
  }
  const copyNextActionIds = new Set((copied.recommendedNextActions || []).map((action) => action.id));
  for (const expectedAction of ['inspect-organized-output', 'preview-batch-split-organized-output']) {
    if (!copyNextActionIds.has(expectedAction)) {
      throw new Error(`Expected organization copy next actions to include ${expectedAction}.`);
    }
  }
  const copiedBatchAction = (copied.recommendedNextActions || []).find((action) => action.id === 'preview-batch-split-organized-output');
  if (
    copiedBatchAction?.suggestedArgs?.workflowPreset !== 'safe-preview'
    || copiedBatchAction?.suggestedArgs?.batchGroupBy !== 'source-dir'
  ) {
    throw new Error('Expected organized-output batch preview action to use safe-preview with source-dir grouping only as the scene-specific override.');
  }
  assertActionSuggestedArgsOmit(copiedBatchAction, ['dryRun', 'includeResults', 'skipMode', 'batchNamingMode', 'batchDedupeMode', 'batchErrorMode'], 'preview-batch-split-organized-output suggestedArgs');
  if (await fs.readFile(sourcePath, 'utf8') !== 'not a real font') {
    throw new Error('Expected source file content to be preserved after organization copy.');
  }
  if (await fs.readFile(targetPath, 'utf8') !== 'not a real font') {
    throw new Error('Expected organized target copy to match source content.');
  }
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.summary?.copiedCount !== 1 || manifest.entries?.[0]?.source !== `${inputDir}/FamilyA/not-a-font.ttf`) {
    throw new Error('Expected organization manifest to record the copied source.');
  }
  if (manifest.summary?.safetySummary?.sourceDestructive !== false || manifest.summary?.safetySummary?.writeScope !== 'output-tree-only') {
    throw new Error('Expected organization manifest summary to record source-safe output-only writes.');
  }
  const copiedInspect = await inspectFontInputs({
    inputDir: outputDir,
    includeFiles: false,
    maxFiles: 10,
  });
  const copiedBatchPreview = await splitFontBatch({
    inputDir: outputDir,
    outputRoot: `${outputDir}-split-preview`,
    dryRun: true,
    includeResults: true,
    batchErrorMode: 'collect',
    maxFiles: 10,
    silent: true,
  });
  assertRecommendedNextActionInspectFields(copied.recommendedNextActions, {
    inspect_font_inputs: copiedInspect,
    split_font_batch: copiedBatchPreview,
  }, 'organize-copy');

  await fs.writeFile(sourcePath, 'replacement font-like file');
  const overwritten = await organizeFontDirectory({
    inputDir,
    outputDir,
    dryRun: false,
    includePlan: true,
    copyInvalidFonts: true,
    batchNamingMode: 'plain',
    overwriteExisting: true,
    maxFiles: 10,
  });
  if (overwritten.sourceDestructive !== false || overwritten.writesSourceTree !== false || overwritten.writesOutputTree !== true || overwritten.outputTreeInsideInputTree !== false || overwritten.mayOverwriteOutputTree !== true || Object.hasOwn(overwritten, 'destructive')) {
    throw new Error('Expected overwrite mode to flag output-tree overwrite risk while preserving source safety.');
  }
  if (
    overwritten.safetySummary?.sourceDestructive !== false
    || overwritten.safetySummary?.writesSourceTree !== false
    || overwritten.safetySummary?.writesOutputTree !== true
    || overwritten.safetySummary?.outputTreeInsideInputTree !== false
    || overwritten.safetySummary?.mayOverwriteOutputTree !== true
    || overwritten.safetySummary?.overwriteScope !== 'output-tree-only'
    || Object.hasOwn(overwritten.safetySummary || {}, 'destructiveMeaning')
  ) {
    throw new Error('Expected overwrite safetySummary to scope destructive risk to the output tree only.');
  }
  if (overwritten.planActionSummary?.total !== 1 || overwritten.planActionSummary?.byAction?.copied !== 1) {
    throw new Error('Expected overwrite-enabled organization copy to summarize copied plan actions.');
  }
  if (overwritten.organizationDecision?.route !== 'preview-organized-output') {
    throw new Error('Expected overwrite-enabled organization copy to keep the organized-output preview route.');
  }
  if (!overwritten.organizationWarnings?.some((warning) => warning.code === 'output-overwrite-enabled')) {
    throw new Error('Expected organization overwrite warning.');
  }
  if (await fs.readFile(sourcePath, 'utf8') !== 'replacement font-like file') {
    throw new Error('Expected source file content to remain after overwrite-enabled organization copy.');
  }
  if (await fs.readFile(targetPath, 'utf8') !== 'replacement font-like file') {
    throw new Error('Expected overwrite-enabled organization copy to update the target file.');
  }

  console.log(JSON.stringify({ copied, overwritten }, null, 2));
} else if (scenario === 'organize-valid-font') {
  const inputDir = process.argv[3] || '.font-split-organize-valid-input';
  const outputDir = process.argv[4] || '.font-split-organize-valid-output';
  const sourceA = path.join(inputDir, 'Loose', 'FixtureSans-Regular.ttf');
  const sourceB = path.join(inputDir, 'Duplicate', 'FixtureSans-Regular.ttf');
  const targetPath = path.join(outputDir, 'Fixture Sans', 'FixtureSans-Regular.ttf');
  const fixtureFont = buildMinimalTtf({
    familyName: 'Fixture Sans',
    subfamilyName: 'Regular',
    glyphCount: 3,
  });
  console.log('Directory organization valid-font smoke:', inputDir, '->', outputDir);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(sourceA), { recursive: true });
  await fs.mkdir(path.dirname(sourceB), { recursive: true });
  await fs.writeFile(sourceA, fixtureFont);
  await fs.writeFile(sourceB, fixtureFont);

  const inspection = await inspectFontInputs({
    inputDir,
    includeFiles: true,
    maxFiles: 10,
  });
  if (inspection.validFontCount !== 2 || inspection.invalidFontCount !== 0 || inspection.files?.[0]?.glyphCount !== 3) {
    throw new Error('Expected generated fixture fonts to parse as valid inputs with glyph counts.');
  }
  if (!inspection.files?.every((file) => file.identityBasis === 'family-subfamily')) {
    throw new Error('Expected generated fixture fonts to expose family/subfamily identity.');
  }

  const result = await organizeFontDirectory({
    inputDir,
    outputDir,
    dryRun: false,
    includePlan: true,
    batchGroupBy: 'font-family',
    batchNamingMode: 'plain',
    batchDedupeMode: 'font-identity',
    maxFiles: 10,
  });
  if (result.operationMode !== 'copy-only' || result.validFontCount !== 2 || result.invalidFontCount !== 0 || result.deduplicatedCount !== 1 || result.skippedDuplicates !== 1 || result.copiedCount !== 1) {
    throw new Error('Expected valid-font organization to parse, identity-dedupe, and copy one representative.');
  }
  assertBatchPolicySummary(result.batchPolicySummary, {
    context: 'organize-valid-font',
    appliesToTool: 'organize_font_directory',
    expectedValues: {
      batchGroupBy: 'font-family',
      batchNamingMode: 'plain',
      batchDedupeMode: 'font-identity',
    },
    expectedEffectiveValues: {
      batchDedupeMode: 'font-identity',
    },
  });
  if (result.planActionSummary?.total !== 2 || result.planActionSummary?.byAction?.copied !== 1 || result.planActionSummary?.byAction?.['skipped-duplicate'] !== 1) {
    throw new Error('Expected valid-font organization to summarize copied and skipped-duplicate actions.');
  }
  if (result.layout?.layoutKind !== 'nested' || result.recommendedBatchOptions?.batchGroupBy !== 'source-dir') {
    throw new Error('Expected valid-font organization to still summarize the source directory layout.');
  }
  if (
    result.organizationDecision?.route !== 'preview-organized-output'
    || result.organizationDecision?.nextInputDir !== outputDir
    || result.organizationDecision?.safeBatchPreviewArgs?.workflowPreset !== 'safe-preview'
  ) {
    throw new Error('Expected valid-font organization to recommend previewing the organized output.');
  }
  assertDirectoryWorkflowSummary(result.directoryWorkflowSummary, {
    context: 'organize-valid-font',
    expectedLayoutKind: 'nested',
    expectedRoute: 'preview-organized-output',
    expectedCurrentStep: 'copy-only-staging',
    expectedReviewReason: 'duplicates-skipped',
    expectedStepIds: ['preview-batch-split-organized-output'],
  });
  assertSafeRecommendedBatchPreviewArgs(result.recommendedBatchPreviewArgs, {
    inputDir,
    batchGroupBy: 'source-dir',
  }, 'organize-valid-font');
  if (result.plan?.filter((item) => item.action === 'skipped-duplicate').length !== 1) {
    throw new Error('Expected valid-font organization plan to disclose the duplicate skipped by identity.');
  }
  const copiedPlan = result.plan?.find((item) => item.action === 'copied');
  if (!copiedPlan || copiedPlan.groupName !== 'Fixture Sans' || copiedPlan.status !== 'valid' || copiedPlan.glyphCount !== 3 || !copiedPlan.identityKey) {
    throw new Error('Expected copied valid-font plan entry to include metadata-derived group and identity details.');
  }
  if (!result.organizationWarnings?.some((warning) => warning.code === 'duplicate-fonts-skipped')) {
    throw new Error('Expected valid-font organization to warn when identity dedupe skips a duplicate.');
  }
  if (await fs.readFile(targetPath).then((content) => !content.equals(fixtureFont)).catch(() => true)) {
    throw new Error('Expected valid-font organization to copy the generated fixture font.');
  }
  const manifest = JSON.parse(await fs.readFile(path.join(outputDir, 'font-organization-manifest.json'), 'utf8'));
  if (manifest.summary?.copiedCount !== 1 || manifest.entries?.[0]?.groupName !== 'Fixture Sans') {
    throw new Error('Expected valid-font organization manifest to record metadata-derived grouping.');
  }
  const organizedInspection = await inspectFontInputs({
    inputDir: outputDir,
    includeFiles: false,
    maxFiles: 10,
  });
  const organizedBatchPreview = await splitFontBatch({
    inputDir: outputDir,
    outputRoot: `${outputDir}-split-preview`,
    dryRun: true,
    includeResults: true,
    maxFiles: 10,
    silent: true,
  });
  assertRecommendedNextActionInspectFields(result.recommendedNextActions, {
    inspect_font_inputs: organizedInspection,
    split_font_batch: organizedBatchPreview,
  }, 'organize-valid-font');
  console.log(JSON.stringify({ inspection, result }, null, 2));
} else if (scenario === 'organize-structure-only') {
  const inputDir = process.argv[3] || '.font-split-organize-structure-input';
  const outputDir = process.argv[4] || '.font-split-organize-structure-output';
  console.log('Directory organization structure-only smoke:', inputDir, '->', outputDir);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(path.join(inputDir, 'FamilyA'), { recursive: true });
  await fs.writeFile(path.join(inputDir, 'FamilyA', 'not-a-font.ttf'), 'not a real font');

  const result = await organizeFontDirectory({
    inputDir,
    outputDir,
    dryRun: true,
    includePlan: true,
    parseFonts: false,
    batchGroupBy: 'font-family',
    batchDedupeMode: 'font-identity',
    maxFiles: 10,
  });
  if (result.parsedFontMetadata !== false || result.unparsedFontCount !== 1 || result.validFontCount !== null || result.invalidFontCount !== null) {
    throw new Error('Expected structure-only organization to mark font metadata as unparsed.');
  }
  if (result.effectiveBatchDedupeMode !== 'same-path' || result.dedupeLimitedByParsing !== true) {
    throw new Error('Expected structure-only organization to downgrade identity dedupe.');
  }
  assertBatchPolicySummary(result.batchPolicySummary, {
    context: 'organize-structure-only',
    appliesToTool: 'organize_font_directory',
    expectedValues: {
      batchGroupBy: 'font-family',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
    },
    expectedEffectiveValues: {
      batchDedupeMode: 'same-path',
    },
  });
  if (!result.organizationWarnings?.some((warning) => warning.code === 'font-parsing-skipped')) {
    throw new Error('Expected structure-only organization warning about skipped font parsing.');
  }
  if (result.planActionSummary?.total !== 1 || result.planActionSummary?.byAction?.['would-copy'] !== 1) {
    throw new Error('Expected structure-only organization to summarize would-copy plan actions.');
  }
  if (
    result.organizationDecision?.route !== 'rerun-with-font-parsing'
    || result.organizationDecision?.preferredNextActionId !== 'rerun-with-font-parsing'
    || result.organizationDecision?.sourceDestructive !== false
  ) {
    throw new Error('Expected structure-only organization to summarize the font-parsing rerun decision route.');
  }
  assertDirectoryWorkflowSummary(result.directoryWorkflowSummary, {
    context: 'organize-structure-only',
    expectedLayoutKind: 'nested',
    expectedRoute: 'rerun-with-font-parsing',
    expectedCurrentStep: 'layout-plan',
    expectedReviewReason: 'metadata-not-parsed',
    expectedStepIds: ['rerun-with-font-parsing', 'preview-batch-split-original-layout'],
  });
  const structureNextActionIds = new Set((result.recommendedNextActions || []).map((action) => action.id));
  if (!structureNextActionIds.has('rerun-with-font-parsing')) {
    throw new Error('Expected structure-only organization next actions to recommend rerunning with font parsing.');
  }
  if (result.plan?.[0]?.status !== 'not-parsed' || result.plan?.[0]?.groupName !== 'not-a-font') {
    throw new Error('Expected structure-only organization plan to use path-based fallback details.');
  }
  assertSafeRecommendedBatchPreviewArgs(result.recommendedBatchPreviewArgs, {
    inputDir,
    batchGroupBy: 'source-dir',
  }, 'organize-structure-only');
  const rerunWithParsingAction = (result.recommendedNextActions || []).find((action) => action.id === 'rerun-with-font-parsing');
  if (
    rerunWithParsingAction?.suggestedArgs?.workflowPreset !== 'safe-preview'
    || rerunWithParsingAction?.suggestedArgs?.batchGroupBy !== 'font-family'
    || !rerunWithParsingAction?.inspectFields?.includes('organizationDecision')
  ) {
    throw new Error('Expected rerun-with-font-parsing to use safe-preview, preserve only the metadata-family grouping override, and inspect organizationDecision.');
  }
  assertActionSuggestedArgsOmit(rerunWithParsingAction, ['dryRun', 'parseFonts', 'includePlan', 'batchNamingMode', 'batchDedupeMode', 'overwriteExisting'], 'rerun-with-font-parsing suggestedArgs');
  const structurePreviewAction = (result.recommendedNextActions || []).find((action) => action.id === 'preview-batch-split-original-layout');
  if (
    structurePreviewAction?.suggestedArgs?.workflowPreset !== 'safe-preview'
    || structurePreviewAction?.suggestedArgs?.batchGroupBy !== 'source-dir'
    || !structurePreviewAction?.inspectFields?.includes('batchDecision')
  ) {
    throw new Error('Expected structure-only batch preview action to use safe-preview with source-dir grouping and inspect batchDecision.');
  }
  assertActionSuggestedArgsOmit(structurePreviewAction, ['dryRun', 'includeResults', 'skipMode', 'batchNamingMode', 'batchDedupeMode', 'batchErrorMode'], 'preview-batch-split-original-layout suggestedArgs');
  for (const expectedAction of ['rerun-with-font-parsing', 'review-plan-before-writing']) {
    assertInspectFieldsExist((result.recommendedNextActions || []).find((action) => action.id === expectedAction), {
      organize_font_directory: result,
    }, 'organize-structure-only');
  }
  const structureBatchPreview = await splitFontBatch({
    inputDir,
    outputRoot: `${outputDir}-split-preview`,
    dryRun: true,
    includeResults: true,
    batchErrorMode: 'collect',
    maxFiles: 10,
    silent: true,
  });
  assertInspectFieldsExist((result.recommendedNextActions || []).find((action) => action.id === 'preview-batch-split-original-layout'), {
    split_font_batch: structureBatchPreview,
  }, 'organize-structure-only');
  if (await fsExists(outputDir)) {
    throw new Error('Expected structure-only dry-run not to create outputDir.');
  }
  console.log(JSON.stringify(result, null, 2));
} else if (scenario === 'organize-output-inside-input') {
  const inputDir = process.argv[3] || '.font-split-organize-inside-input';
  const outputDirName = process.argv[4] || 'organized-fonts';
  const outputDir = path.join(inputDir, outputDirName);
  console.log('Directory organization output-inside-input smoke:', inputDir, '->', outputDir);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.mkdir(path.join(inputDir, 'FamilyA'), { recursive: true });
  await fs.writeFile(path.join(inputDir, 'FamilyA', 'not-a-font.ttf'), 'not a real font');

  const result = await organizeFontDirectory({
    inputDir,
    outputDir,
    dryRun: true,
    includePlan: true,
    copyInvalidFonts: true,
    batchNamingMode: 'plain',
    maxFiles: 10,
  });
  if (
    result.dryRun !== true
    || result.sourceDestructive !== false
    || result.writesSourceTree !== false
    || result.writesOutputTree !== false
    || result.outputTreeInsideInputTree !== true
    || result.safetySummary?.outputTreeInsideInputTree !== true
  ) {
    throw new Error('Expected output-inside-input organization smoke to stay dry-run while disclosing nested output.');
  }
  if (!result.organizationWarnings?.some((warning) => warning.code === 'output-inside-input')) {
    throw new Error('Expected organization warning when outputDir is inside inputDir.');
  }
  assertDirectoryWorkflowSummary(result.directoryWorkflowSummary, {
    context: 'organize-output-inside-input dry-run',
    expectedLayoutKind: 'nested',
    expectedRoute: 'preview-original-layout',
    expectedCurrentStep: 'layout-plan',
    expectedReviewReason: 'output-tree-inside-input-tree',
    expectedStepIds: ['preview-batch-split-original-layout', 'copy-organized-staging-directory'],
  });
  const avoidAction = (result.recommendedNextActions || []).find((action) => action.id === 'avoid-reprocessing-organized-copies');
  if (!avoidAction || avoidAction.tool !== 'split_font_batch' || avoidAction.suggestedArgs?.inputDir !== `${inputDir}/${outputDirName}`) {
    throw new Error('Expected next action to guide agents away from reprocessing organized copies.');
  }
  if (
    avoidAction.suggestedArgs?.workflowPreset !== 'safe-preview'
    || avoidAction.suggestedArgs?.batchGroupBy !== 'source-dir'
  ) {
    throw new Error('Expected avoid-reprocessing next action to use safe-preview with source-dir grouping as the only batch policy override.');
  }
  assertActionSuggestedArgsOmit(avoidAction, ['dryRun', 'includeResults', 'skipMode', 'batchNamingMode', 'batchDedupeMode', 'batchErrorMode'], 'avoid-reprocessing-organized-copies suggestedArgs');
  if (!avoidAction.inspectFields?.includes('batchDecision') || !avoidAction.inspectFields?.includes('batchWarnings')) {
    throw new Error('Expected avoid-reprocessing next action to require batch route decision and warning inspection.');
  }
  const insideBatchPreview = await splitFontBatch({
    inputDir,
    outputRoot: `${inputDir}-split-preview`,
    dryRun: true,
    includeResults: true,
    batchErrorMode: 'collect',
    maxFiles: 10,
    silent: true,
  });
  assertInspectFieldsExist(avoidAction, {
    split_font_batch: insideBatchPreview,
  }, 'organize-output-inside-input');
  if (await fsExists(outputDir)) {
    throw new Error('Expected output-inside-input dry-run not to create outputDir.');
  }
  const copiedInside = await organizeFontDirectory({
    inputDir,
    outputDir,
    dryRun: false,
    includePlan: true,
    copyInvalidFonts: true,
    batchNamingMode: 'plain',
    maxFiles: 10,
  });
  if (
    copiedInside.sourceDestructive !== false
    || copiedInside.sourceFilesPreserved !== true
    || copiedInside.writesSourceTree !== true
    || copiedInside.writesOutputTree !== true
    || copiedInside.outputTreeInsideInputTree !== true
    || copiedInside.mayOverwriteOutputTree !== false
    || copiedInside.safetySummary?.writeScope !== 'output-tree-inside-input-tree'
    || !copiedInside.organizationWarnings?.some((warning) => warning.code === 'output-inside-input')
  ) {
    throw new Error('Expected real organization inside inputDir to disclose source-tree writes without source destruction.');
  }
  assertDirectoryWorkflowSummary(copiedInside.directoryWorkflowSummary, {
    context: 'organize-output-inside-input copy',
    expectedLayoutKind: 'nested',
    expectedRoute: 'preview-organized-output',
    expectedCurrentStep: 'copy-only-staging',
    expectedReviewReason: 'output-tree-inside-input-tree',
    expectedStepIds: ['preview-batch-split-organized-output'],
  });

  const batchInputDir = `${inputDir}-batch`;
  const batchOutputRoot = path.join(batchInputDir, 'split-output');
  await fs.rm(batchInputDir, { recursive: true, force: true });
  await fs.mkdir(batchInputDir, { recursive: true });
  await fs.writeFile(
    path.join(batchInputDir, 'FixtureSans-Regular.ttf'),
    buildMinimalTtf({ familyName: 'Fixture Sans', subfamilyName: 'Regular', glyphCount: 5 }),
  );
  const batchInside = await splitFontBatch({
    inputDir: batchInputDir,
    outputRoot: batchOutputRoot,
    workflowPreset: 'reviewed-write',
    smallGlyphAction: 'copy-original',
    limit: 10,
    maxFiles: 20,
    silent: true,
  });
  if (
    batchInside.sourceDestructive !== false
    || batchInside.sourceFilesPreserved !== true
    || batchInside.writesSourceTree !== true
    || batchInside.writesOutputTree !== true
    || batchInside.outputTreeInsideInputTree !== true
    || batchInside.mayOverwriteOutputTree !== true
    || batchInside.safetySummary?.writeScope !== 'output-tree-inside-input-tree'
    || !batchInside.batchWarnings?.some((warning) => warning.code === 'output-inside-input')
  ) {
    throw new Error('Expected real batch output inside inputDir to disclose source-tree writes without source destruction.');
  }
  const batchInsideInspect = await inspectSplitOutput({
    outDir: batchOutputRoot,
    includeFiles: false,
    includeFamilies: false,
  });
  if (batchInsideInspect.structureSummary?.conforms !== true) {
    throw new Error('Expected nested batch outputRoot to remain structurally valid when inspected directly.');
  }

  console.log(JSON.stringify({ result, copiedInside, batchInside, batchInsideInspect }, null, 2));
} else if (scenario === 'check-compact') {
  console.log('Compact check smoke');
  const parseCompactJson = (stdout, context) => {
    try {
      return JSON.parse(stdout);
    } catch (error) {
      throw new Error(`${context}: expected compact check output to be JSON. ${error.message}`);
    }
  };

  const { stdout: passStdout, stderr: passStderr } = await execFileAsync(process.execPath, ['scripts/run-check-compact.js', '--self-test-pass', '--json'], {
    cwd: process.cwd(),
  });
  if (passStderr.trim() !== '') {
    throw new Error('compact check pass self-test: expected stderr to stay empty.');
  }
  const passResult = parseCompactJson(passStdout, 'compact check pass self-test');
  if (
    passResult.ok !== true
    || passResult.summaryType !== 'compact-check-result'
    || passResult.totalStepCount !== 2
    || passResult.completedStepCount !== 2
    || passResult.failedStepId !== null
    || passResult.steps?.some((step) => step.ok !== true || Object.hasOwn(step, 'stdoutTail'))
    || !passResult.nonIntuitiveBehavior?.includes('suppresses noisy child output')
  ) {
    throw new Error('compact check pass self-test: expected compact successful JSON summary without child output tails.');
  }

  let failStdout = '';
  let failStderr = '';
  try {
    await execFileAsync(process.execPath, ['scripts/run-check-compact.js', '--self-test-fail', '--json'], {
      cwd: process.cwd(),
    });
  } catch (error) {
    failStdout = error.stdout || '';
    failStderr = error.stderr || '';
  }
  if (failStderr.trim() !== '') {
    throw new Error('compact check fail self-test: expected --json failures to keep stderr empty.');
  }
  const failResult = parseCompactJson(failStdout, 'compact check fail self-test');
  const failedStep = failResult.steps?.find((step) => step.id === 'compact-check-self-test-fail');
  if (
    failResult.ok !== false
    || failResult.summaryType !== 'compact-check-result'
    || failResult.failedStepId !== 'compact-check-self-test-fail'
    || failedStep?.ok !== false
    || failedStep?.exitCode !== 3
    || !failedStep?.stdoutTail?.includes('before failure')
    || !failedStep?.stderrTail?.includes('synthetic failure')
  ) {
    throw new Error('compact check fail self-test: expected failing JSON summary to preserve stdout/stderr tails and failed step metadata.');
  }

  const { stdout: textStdout } = await execFileAsync(process.execPath, ['scripts/run-check-compact.js', '--self-test-pass'], {
    cwd: process.cwd(),
  });
  if (
    !textStdout.includes('mcp-font-split compact check')
    || !textStdout.includes('compact-check-result')
    || textStdout.includes('self-test pass')
  ) {
    throw new Error('compact check text self-test: expected concise text summary without child stdout spam.');
  }

  console.log(JSON.stringify({ passResult, failResult, textSummaryIncluded: true }, null, 2));
} else if (scenario === 'batch-run-cli') {
  const inputDir = process.argv[3] || '.font-split-batch-run-cli';
  const outputRoot = process.argv[4] || '.font-split-batch-run-cli-output';
  console.log('Batch runner CLI smoke:', inputDir, '->', outputRoot);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(inputDir, { recursive: true });
  await fs.writeFile(path.join(inputDir, 'a-note.txt'), 'not a font');
  await fs.writeFile(path.join(inputDir, 'b-not-a-font.ttf'), 'not a real font');

  const assertCliOutputIncludes = (stdout, expectedTexts, context) => {
    for (const expectedText of expectedTexts) {
      if (!stdout.includes(expectedText)) {
        throw new Error(`${context}: expected batch-run CLI output to include ${expectedText}.`);
      }
    }
  };
  const parseCliJson = (stdout, context) => {
    try {
      return JSON.parse(stdout);
    } catch (error) {
      throw new Error(`${context}: expected batch-run CLI output to be parseable JSON. ${error.message}`);
    }
  };
  const readmeText = await fs.readFile('README.md', 'utf8');
  const readmeEnText = await fs.readFile('README.en.md', 'utf8');
  if (
    !readmeText.includes('`default` 不是有效值')
    || !readmeText.includes('无效 preset 拒绝')
    || !readmeText.includes('BatchRunConfigurationError')
    || !readmeText.includes('`errorType`')
    || !readmeText.includes('枚举型、布尔型或数字型')
    || !readmeEnText.includes('`default` is not valid')
    || !readmeEnText.includes('invalid preset rejection')
    || !readmeEnText.includes('BatchRunConfigurationError')
    || !readmeEnText.includes('`errorType`')
    || !readmeEnText.includes('enum-like, boolean, or numeric')
  ) {
    throw new Error('Expected README docs to describe batch:run invalid configuration rejection.');
  }

  const { stdout: safePreviewStdout } = await execFileAsync(process.execPath, ['batch-run.js', inputDir, outputRoot, '1', '1', '--dry-run'], {
    cwd: process.cwd(),
  });
  assertCliOutputIncludes(safePreviewStdout, [
    '"workflowPreset": "safe-preview"',
    'Batch warnings:',
    'dry-run-no-write',
    'input-scan-truncated',
    'Results included: true',
  ], 'safe-preview flag run');

  const { stdout: structureFirstStdout } = await execFileAsync(process.execPath, ['batch-run.js', inputDir, outputRoot, '1', '1'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FONT_SPLIT_WORKFLOW_PRESET: 'structure-first',
    },
  });
  assertCliOutputIncludes(structureFirstStdout, [
    '"workflowPreset": "structure-first"',
    'Mode: dry-run',
    'Results included: false',
    'input-scan-truncated',
    'batch-plan-omitted',
  ], 'structure-first env preset run');

  const { stdout: includeResultsOverrideStdout } = await execFileAsync(process.execPath, ['batch-run.js', inputDir, outputRoot, '1', '1'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FONT_SPLIT_WORKFLOW_PRESET: 'structure-first',
      FONT_SPLIT_INCLUDE_RESULTS: 'true',
    },
  });
  assertCliOutputIncludes(includeResultsOverrideStdout, [
    '"workflowPreset": "structure-first"',
    '"includeResults": true',
    'Mode: dry-run',
    'Results included: true',
  ], 'includeResults env override run');
  if (includeResultsOverrideStdout.includes('batch-plan-omitted')) {
    throw new Error('includeResults env override run: expected includeResults true to keep dry-run plan details.');
  }

  let invalidPresetStdout = '';
  let invalidPresetStderr = '';
  try {
    await execFileAsync(process.execPath, ['batch-run.js', '--json-summary', inputDir, outputRoot, '1', '1'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FONT_SPLIT_WORKFLOW_PRESET: 'default',
      },
    });
  } catch (error) {
    invalidPresetStdout = error.stdout || '';
    invalidPresetStderr = error.stderr || '';
  }
  if (invalidPresetStderr.trim() !== '') {
    throw new Error('invalid workflow preset run: expected json-summary configuration errors to keep stderr empty.');
  }
  const invalidPreset = parseCliJson(invalidPresetStdout, 'invalid workflow preset run');
  if (
    invalidPreset.ok !== false
    || invalidPreset.name !== 'BatchRunConfigurationError'
    || invalidPreset.errorType !== 'configuration-error'
    || invalidPreset.options?.workflowPreset !== null
    || invalidPreset.options?.requestedWorkflowPreset !== 'default'
    || invalidPreset.details?.summaryType !== 'configuration-error'
    || invalidPreset.details?.option !== 'FONT_SPLIT_WORKFLOW_PRESET'
    || invalidPreset.details?.received !== 'default'
    || invalidPreset.details?.allowedValues?.includes('default')
    || invalidPreset.details?.omitForDefaultBehavior !== true
    || !invalidPreset.error?.includes('Omit it to use batch-run')
  ) {
    throw new Error('invalid workflow preset run: expected default preset to be rejected with machine-readable allowed values.');
  }

  let invalidDedupeStdout = '';
  let invalidDedupeStderr = '';
  try {
    await execFileAsync(process.execPath, ['batch-run.js', '--json-summary', inputDir, outputRoot, '1', '1'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FONT_SPLIT_BATCH_DEDUPE_MODE: 'semantic',
      },
    });
  } catch (error) {
    invalidDedupeStdout = error.stdout || '';
    invalidDedupeStderr = error.stderr || '';
  }
  if (invalidDedupeStderr.trim() !== '') {
    throw new Error('invalid dedupe env run: expected json-summary configuration errors to keep stderr empty.');
  }
  const invalidDedupe = parseCliJson(invalidDedupeStdout, 'invalid dedupe env run');
  if (
    invalidDedupe.ok !== false
    || invalidDedupe.name !== 'BatchRunConfigurationError'
    || invalidDedupe.errorType !== 'configuration-error'
    || invalidDedupe.options?.workflowPreset !== 'reviewed-write'
    || invalidDedupe.options?.requestedBatchDedupeMode !== 'semantic'
    || invalidDedupe.details?.summaryType !== 'configuration-error'
    || invalidDedupe.details?.option !== 'FONT_SPLIT_BATCH_DEDUPE_MODE'
    || invalidDedupe.details?.received !== 'semantic'
    || !invalidDedupe.details?.allowedValues?.includes('font-identity')
    || invalidDedupe.details?.allowedValues?.includes('semantic')
    || invalidDedupe.details?.omitForDefaultBehavior !== true
    || !invalidDedupe.error?.includes('FONT_SPLIT_BATCH_DEDUPE_MODE must be one of')
  ) {
    throw new Error('invalid dedupe env run: expected invalid enum-like env var to be rejected with machine-readable allowed values.');
  }

  let invalidBooleanStdout = '';
  let invalidBooleanStderr = '';
  try {
    await execFileAsync(process.execPath, ['batch-run.js', '--json-summary', inputDir, outputRoot, '1', '1'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FONT_SPLIT_INCLUDE_RESULTS: 'maybe',
      },
    });
  } catch (error) {
    invalidBooleanStdout = error.stdout || '';
    invalidBooleanStderr = error.stderr || '';
  }
  if (invalidBooleanStderr.trim() !== '') {
    throw new Error('invalid boolean env run: expected json-summary configuration errors to keep stderr empty.');
  }
  const invalidBoolean = parseCliJson(invalidBooleanStdout, 'invalid boolean env run');
  if (
    invalidBoolean.ok !== false
    || invalidBoolean.name !== 'BatchRunConfigurationError'
    || invalidBoolean.errorType !== 'configuration-error'
    || invalidBoolean.options?.requestedIncludeResults !== 'maybe'
    || Object.hasOwn(invalidBoolean.options || {}, 'includeResults')
    || invalidBoolean.details?.summaryType !== 'configuration-error'
    || invalidBoolean.details?.option !== 'FONT_SPLIT_INCLUDE_RESULTS'
    || invalidBoolean.details?.source !== 'env'
    || invalidBoolean.details?.expectedType !== 'boolean'
    || !invalidBoolean.details?.allowedValues?.includes('true')
    || !invalidBoolean.details?.allowedValues?.includes('false')
  ) {
    throw new Error('invalid boolean env run: expected invalid boolean env var to be rejected with machine-readable allowed values.');
  }

  let invalidLimitEnvStdout = '';
  let invalidLimitEnvStderr = '';
  try {
    await execFileAsync(process.execPath, ['batch-run.js', '--json-summary', inputDir, outputRoot, '1', '1'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FONT_SPLIT_LIMIT: 'zero',
      },
    });
  } catch (error) {
    invalidLimitEnvStdout = error.stdout || '';
    invalidLimitEnvStderr = error.stderr || '';
  }
  if (invalidLimitEnvStderr.trim() !== '') {
    throw new Error('invalid limit env run: expected json-summary configuration errors to keep stderr empty.');
  }
  const invalidLimitEnv = parseCliJson(invalidLimitEnvStdout, 'invalid limit env run');
  if (
    invalidLimitEnv.ok !== false
    || invalidLimitEnv.name !== 'BatchRunConfigurationError'
    || invalidLimitEnv.errorType !== 'configuration-error'
    || invalidLimitEnv.options?.limit !== null
    || invalidLimitEnv.options?.requestedLimit !== 'zero'
    || invalidLimitEnv.details?.summaryType !== 'configuration-error'
    || invalidLimitEnv.details?.option !== 'FONT_SPLIT_LIMIT'
    || invalidLimitEnv.details?.source !== 'env'
    || invalidLimitEnv.details?.targetField !== 'limit'
    || invalidLimitEnv.details?.expectedType !== 'positive-integer'
  ) {
    throw new Error('invalid limit env run: expected invalid numeric env var to be rejected with machine-readable numeric details.');
  }

  let invalidPositionalLimitStdout = '';
  let invalidPositionalLimitStderr = '';
  try {
    await execFileAsync(process.execPath, ['batch-run.js', '--json-summary', inputDir, outputRoot, 'zero', '1'], {
      cwd: process.cwd(),
    });
  } catch (error) {
    invalidPositionalLimitStdout = error.stdout || '';
    invalidPositionalLimitStderr = error.stderr || '';
  }
  if (invalidPositionalLimitStderr.trim() !== '') {
    throw new Error('invalid positional limit run: expected json-summary configuration errors to keep stderr empty.');
  }
  const invalidPositionalLimit = parseCliJson(invalidPositionalLimitStdout, 'invalid positional limit run');
  if (
    invalidPositionalLimit.ok !== false
    || invalidPositionalLimit.name !== 'BatchRunConfigurationError'
    || invalidPositionalLimit.errorType !== 'configuration-error'
    || invalidPositionalLimit.options?.limit !== null
    || invalidPositionalLimit.options?.requestedLimit !== 'zero'
    || invalidPositionalLimit.details?.summaryType !== 'configuration-error'
    || invalidPositionalLimit.details?.option !== 'limit'
    || invalidPositionalLimit.details?.source !== 'positional'
    || invalidPositionalLimit.details?.targetField !== 'limit'
    || invalidPositionalLimit.details?.expectedType !== 'positive-integer'
  ) {
    throw new Error('invalid positional limit run: expected invalid numeric positional arg to be rejected with machine-readable numeric details.');
  }

  const { stdout: jsonSuccessStdout, stderr: jsonSuccessStderr } = await execFileAsync(process.execPath, ['batch-run.js', '--json', inputDir, outputRoot, '1', '1', '--dry-run'], {
    cwd: process.cwd(),
  });
  if (jsonSuccessStderr.trim() !== '') {
    throw new Error('json success run: expected stderr to stay empty.');
  }
  const jsonSuccess = parseCliJson(jsonSuccessStdout, 'json success run');
  if (
    jsonSuccess.ok !== true
    || jsonSuccess.runner?.outputMode !== 'json'
    || jsonSuccess.options?.workflowPreset !== 'safe-preview'
    || jsonSuccess.options?.dryRun !== true
    || jsonSuccess.result?.dryRun !== true
    || jsonSuccess.result?.resultsIncluded !== true
    || jsonSuccess.result?.maxFilesHit !== true
  ) {
    throw new Error('json success run: expected machine-readable safe-preview dry-run result.');
  }

  let jsonFailureStdout = '';
  try {
    await execFileAsync(process.execPath, ['batch-run.js', '--json', inputDir, outputRoot, '2', '2'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FONT_SPLIT_WORKFLOW_PRESET: 'structure-first',
      },
    });
  } catch (error) {
    jsonFailureStdout = error.stdout || '';
  }
  const jsonFailure = parseCliJson(jsonFailureStdout, 'json failure run');
  if (
    jsonFailure.ok !== false
    || jsonFailure.runner?.outputMode !== 'json'
    || jsonFailure.options?.workflowPreset !== 'structure-first'
    || jsonFailure.name !== 'BatchSplitError'
    || jsonFailure.errorType !== 'batch-split-error'
    || jsonFailure.details?.summary?.workflowPreset !== 'structure-first'
    || jsonFailure.details?.summary?.errorCount !== 1
  ) {
    throw new Error('json failure run: expected machine-readable batch error details.');
  }

  const { stdout: jsonSummarySuccessStdout } = await execFileAsync(process.execPath, ['batch-run.js', '--json-summary', inputDir, outputRoot, '1', '1', '--dry-run'], {
    cwd: process.cwd(),
  });
  const jsonSummarySuccess = parseCliJson(jsonSummarySuccessStdout, 'json summary success run');
  if (
    jsonSummarySuccess.ok !== true
    || jsonSummarySuccess.runner?.outputMode !== 'json-summary'
    || Object.hasOwn(jsonSummarySuccess, 'result')
    || jsonSummarySuccess.summary?.workflowPreset !== 'safe-preview'
    || jsonSummarySuccess.summary?.resultsIncluded !== true
    || !jsonSummarySuccess.summary?.omittedDetailFields?.includes('planned')
  ) {
    throw new Error('json summary success run: expected compact safe-preview summary without full result.');
  }

  let jsonSummaryFailureStdout = '';
  try {
    await execFileAsync(process.execPath, ['batch-run.js', '--json-summary', inputDir, outputRoot, '2', '2'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FONT_SPLIT_WORKFLOW_PRESET: 'structure-first',
      },
    });
  } catch (error) {
    jsonSummaryFailureStdout = error.stdout || '';
  }
  const jsonSummaryFailure = parseCliJson(jsonSummaryFailureStdout, 'json summary failure run');
  if (
    jsonSummaryFailure.ok !== false
    || jsonSummaryFailure.runner?.outputMode !== 'json-summary'
    || Object.hasOwn(jsonSummaryFailure, 'details')
    || jsonSummaryFailure.name !== 'BatchSplitError'
    || jsonSummaryFailure.errorType !== 'batch-split-error'
    || jsonSummaryFailure.summary?.workflowPreset !== 'structure-first'
    || jsonSummaryFailure.summary?.errorCount !== 1
    || jsonSummaryFailure.errors?.length !== 1
  ) {
    throw new Error('json summary failure run: expected compact batch error summary without full details.');
  }

  console.log(JSON.stringify({
    safePreview: safePreviewStdout,
    structureFirst: structureFirstStdout,
    includeResultsOverride: includeResultsOverrideStdout,
    invalidPreset,
    invalidDedupe,
    invalidBoolean,
    invalidLimitEnv,
    invalidPositionalLimit,
    jsonSuccess,
    jsonFailure,
    jsonSummarySuccess,
    jsonSummaryFailure,
  }, null, 2));
} else if (scenario === 'batch-identity-dedupe') {
  const inputDir = process.argv[3] || '.font-split-batch-identity-input';
  const outputRoot = process.argv[4] || '.font-split-batch-identity-output';
  const ttfPath = path.join(inputDir, 'Ttf', 'FixtureSans-Regular.ttf');
  const otfPath = path.join(inputDir, 'Otf', 'FixtureSans-Regular.otf');
  console.log('Batch identity dedupe smoke:', inputDir, '->', outputRoot);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(path.dirname(ttfPath), { recursive: true });
  await fs.mkdir(path.dirname(otfPath), { recursive: true });
  await fs.writeFile(ttfPath, buildMinimalTtf({
    familyName: 'Fixture Sans',
    subfamilyName: 'Regular',
    glyphCount: 3,
  }));
  await fs.writeFile(otfPath, buildMinimalTtf({
    familyName: 'Fixture Sans',
    subfamilyName: 'Regular',
    glyphCount: 5,
  }));

  const inspection = await inspectFontInputs({
    inputDir,
    includeFiles: true,
    maxFiles: 10,
  });
  const identityKeys = new Set((inspection.files || []).map((file) => file.identityKey));
  const glyphCounts = new Set((inspection.files || []).map((file) => file.glyphCount));
  if (inspection.validFontCount !== 2 || identityKeys.size !== 1 || glyphCounts.size !== 2) {
    throw new Error('Expected fixture fonts to share identity while exposing different glyph counts.');
  }

  const identityDedupe = await splitFontBatch({
    inputDir,
    outputRoot,
    dryRun: true,
    includeResults: true,
    limit: 10,
    maxFiles: 10,
    batchGroupBy: 'font-family',
    batchDedupeMode: 'font-identity',
    batchNamingMode: 'numeric-suffix',
    skipMode: 'force',
    silent: true,
  });
  if (identityDedupe.discoveredFontCount !== 2 || identityDedupe.deduplicatedCount !== 1 || identityDedupe.skippedDuplicates !== 1 || identityDedupe.planned?.length !== 1) {
    throw new Error('Expected font-identity batch dedupe to collapse same-identity fonts despite glyph count differences.');
  }
  assertBatchPolicySummary(identityDedupe.batchPolicySummary, {
    context: 'batch-identity font-identity dry-run',
    appliesToTool: 'split_font_batch',
    expectedValues: {
      batchGroupBy: 'font-family',
      batchNamingMode: 'numeric-suffix',
      batchDedupeMode: 'font-identity',
      batchErrorMode: 'fail-after',
    },
  });
  if (
    identityDedupe.batchDecision?.route !== 'review-dry-run-plan'
    || identityDedupe.batchDecision?.preferredNextActionId !== 'run-reviewed-batch-write'
    || identityDedupe.batchDecision?.reviewedWriteArgs?.workflowPreset !== 'reviewed-write'
    || identityDedupe.batchDecision?.reviewedWriteArgs?.inputDir !== inputDir
    || identityDedupe.batchDecision?.sourceDestructive !== false
    || identityDedupe.batchDecision?.requiresOutputAudit !== false
  ) {
    throw new Error('Expected font-identity dry-run to recommend reviewing the dry-run plan before a reviewed write.');
  }
  if (identityDedupe.planned[0].input !== `${inputDir}/Otf/FixtureSans-Regular.otf`) {
    throw new Error('Expected .otf representative to win over .ttf for same-identity batch inputs.');
  }

  const pathDedupe = await splitFontBatch({
    inputDir,
    outputRoot,
    dryRun: true,
    includeResults: true,
    limit: 10,
    maxFiles: 10,
    batchGroupBy: 'font-family',
    batchDedupeMode: 'same-path',
    batchNamingMode: 'numeric-suffix',
    skipMode: 'force',
    silent: true,
  });
  if (pathDedupe.deduplicatedCount !== 2 || pathDedupe.skippedDuplicates !== 0 || pathDedupe.planned?.length !== 2) {
    throw new Error('Expected same-path batch dedupe to keep same-identity fonts from different source paths.');
  }
  const pathDedupeSplitDirNames = new Set(pathDedupe.planned.map((item) => item.splitDirName));
  if (!pathDedupeSplitDirNames.has('FixtureSans-Regular') || !pathDedupeSplitDirNames.has('FixtureSans-Regular-1')) {
    throw new Error('Expected numeric-suffix batch naming to avoid same-run splitDirName collisions.');
  }
  const truncatedPreview = await splitFontBatch({
    inputDir,
    outputRoot,
    workflowPreset: 'safe-preview',
    limit: 10,
    maxFiles: 1,
    batchGroupBy: 'font-family',
    batchDedupeMode: 'none',
    skipMode: 'force',
    silent: true,
  });
  const rerunAction = (truncatedPreview.recommendedNextActions || []).find((action) => action.id === 'rerun-batch-with-higher-maxFiles');
  if (
    truncatedPreview.maxFilesHit !== true
    || rerunAction?.tool !== 'split_font_batch'
    || rerunAction?.suggestedArgs?.workflowPreset !== 'safe-preview'
    || rerunAction?.suggestedArgs?.maxFiles !== '<higher-than-current>'
    || rerunAction?.suggestedArgs?.batchGroupBy !== 'font-family'
    || rerunAction?.suggestedArgs?.batchDedupeMode !== 'none'
    || rerunAction?.suggestedArgs?.skipMode !== 'force'
    || !rerunAction?.inspectFields?.includes('batchDecision')
    || truncatedPreview.batchDecision?.route !== 'rerun-batch-with-higher-maxFiles'
    || truncatedPreview.batchDecision?.preferredNextActionId !== 'rerun-batch-with-higher-maxFiles'
    || truncatedPreview.batchDecision?.rerunArgs?.maxFiles !== '<higher-than-current>'
    || truncatedPreview.batchDecision?.rerunArgs?.workflowPreset !== 'safe-preview'
  ) {
    throw new Error('Expected truncated batch preview to recommend rerun args that preserve explicit batch policy overrides.');
  }
  assertInspectFieldsExist(rerunAction, {
    split_font_batch: truncatedPreview,
  }, 'batch-identity truncated rerun action');
  if (await fsExists(outputRoot)) {
    throw new Error('Expected batch identity dry-runs not to create outputRoot.');
  }
  console.log(JSON.stringify({ inspection, identityDedupe, pathDedupe, truncatedPreview }, null, 2));
} else if (scenario === 'workflow-presets') {
  const inputDir = process.argv[3] || 'font-split-mcp/.font-split-preset-input';
  const outputRoot = process.argv[4] || 'font-split-mcp/.font-split-preset-output';
  console.log('Workflow preset smoke:', inputDir, '->', outputRoot);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(path.join(inputDir, 'Otf'), { recursive: true });
  await fs.mkdir(path.join(inputDir, 'Ttf'), { recursive: true });
  const otfPath = path.join(inputDir, 'Otf', 'FixtureSans-Regular.otf');
  const ttfPath = path.join(inputDir, 'Ttf', 'FixtureSans-Regular.ttf');
  await fs.writeFile(otfPath, buildMinimalTtf({ familyName: 'Fixture Sans', subfamilyName: 'Regular', glyphCount: 5 }));
  await fs.writeFile(ttfPath, buildMinimalTtf({ familyName: 'Fixture Sans', subfamilyName: 'Regular', glyphCount: 3 }));
  await fs.writeFile(path.join(inputDir, 'notes.txt'), 'not a font');

  const rawDefaultPreview = await splitFontBatch({
    inputDir,
    outputRoot,
    dryRun: true,
    includeResults: true,
    limit: 10,
    maxFiles: 20,
    silent: true,
  });
  if (
    rawDefaultPreview.workflowPreset !== null
    || rawDefaultPreview.dryRun !== true
    || rawDefaultPreview.resultsIncluded !== true
    || rawDefaultPreview.batchNamingMode !== 'numeric-suffix'
    || rawDefaultPreview.batchDedupeMode !== 'font-identity'
    || rawDefaultPreview.batchErrorMode !== 'fail-after'
    || rawDefaultPreview.skipMode !== 'manifest'
  ) {
    throw new Error('Expected omitted workflowPreset to use raw defaults and report workflowPreset null.');
  }

  const safePreview = await splitFontBatch({
    inputDir,
    outputRoot,
    workflowPreset: 'safe-preview',
    limit: 10,
    maxFiles: 20,
    silent: true,
  });
  if (
    safePreview.workflowPreset !== 'safe-preview'
    || safePreview.dryRun !== true
    || safePreview.safetySummary?.operationMode !== 'preview-only'
    || safePreview.sourceDestructive !== false
    || safePreview.writesSourceTree !== false
    || safePreview.writesOutputTree !== false
    || safePreview.outputTreeInsideInputTree !== false
    || safePreview.mayOverwriteOutputTree !== false
    || safePreview.resultsIncluded !== true
    || safePreview.skipMode !== 'manifest'
    || safePreview.batchErrorMode !== 'fail-after'
    || safePreview.batchNamingMode !== 'numeric-suffix'
    || safePreview.batchDedupeMode !== 'font-identity'
    || safePreview.deduplicatedCount !== 1
    || safePreview.skippedDuplicates !== 1
    || safePreview.unsupportedFileSummary?.total !== 1
    || safePreview.unsupportedFileDecision?.summaryType !== 'unsupported-file-decision'
    || safePreview.unsupportedFileDecision?.totalUnsupportedFileCount !== 1
    || safePreview.unsupportedFileDecision?.categories?.[0] !== 'document'
  ) {
    throw new Error('Expected safe-preview preset to apply no-write safe batch defaults.');
  }
  if (await fsExists(outputRoot)) {
    throw new Error('Expected safe-preview preset not to create outputRoot.');
  }

  const preserveAll = await splitFontBatch({
    inputDir,
    outputRoot,
    workflowPreset: 'preserve-all',
    dryRun: true,
    includeResults: true,
    batchGroupBy: 'font-family',
    limit: 10,
    maxFiles: 20,
    silent: true,
  });
  if (
    preserveAll.workflowPreset !== 'preserve-all'
    || preserveAll.batchDedupeMode !== 'none'
    || preserveAll.deduplicatedCount !== 2
    || preserveAll.skippedDuplicates !== 0
  ) {
    throw new Error('Expected preserve-all preset to disable batch dedupe while allowing explicit dryRun/group overrides.');
  }

  const structureFirstBatch = await splitFontBatch({
    inputDir,
    outputRoot,
    workflowPreset: 'structure-first',
    limit: 10,
    maxFiles: 20,
    silent: true,
  });
  if (
    structureFirstBatch.workflowPreset !== 'structure-first'
    || structureFirstBatch.dryRun !== true
    || structureFirstBatch.safetySummary?.operationMode !== 'preview-only'
    || structureFirstBatch.writesOutputTree !== false
    || structureFirstBatch.outputTreeInsideInputTree !== false
    || structureFirstBatch.resultsIncluded !== false
    || structureFirstBatch.batchDedupeMode !== 'same-path'
    || structureFirstBatch.deduplicatedCount !== 2
    || structureFirstBatch.skippedDuplicates !== 0
  ) {
    throw new Error('Expected structure-first batch preset to use no-write same-path structural defaults.');
  }

  const structureFirstBatchOverride = await splitFontBatch({
    inputDir,
    outputRoot,
    workflowPreset: 'structure-first',
    batchDedupeMode: 'font-identity',
    includeResults: true,
    limit: 10,
    maxFiles: 20,
    silent: true,
  });
  if (
    structureFirstBatchOverride.workflowPreset !== 'structure-first'
    || structureFirstBatchOverride.batchDedupeMode !== 'font-identity'
    || structureFirstBatchOverride.resultsIncluded !== true
    || structureFirstBatchOverride.deduplicatedCount !== 1
    || structureFirstBatchOverride.skippedDuplicates !== 1
  ) {
    throw new Error('Expected explicit batch arguments to override structure-first preset defaults.');
  }

  const undefinedOverridePreview = await splitFontBatch({
    inputDir,
    outputRoot,
    workflowPreset: 'safe-preview',
    dryRun: undefined,
    includeResults: undefined,
    limit: 10,
    maxFiles: 20,
    silent: true,
  });
  if (undefinedOverridePreview.dryRun !== true || undefinedOverridePreview.resultsIncluded !== true) {
    throw new Error('Expected undefined explicit values not to erase workflowPreset defaults.');
  }

  const structureFirst = await organizeFontDirectory({
    inputDir,
    outputDir: outputRoot,
    workflowPreset: 'structure-first',
    maxFiles: 20,
  });
  if (
    structureFirst.workflowPreset !== 'structure-first'
    || structureFirst.dryRun !== true
    || structureFirst.parsedFontMetadata !== false
    || structureFirst.planIncluded !== false
    || structureFirst.effectiveBatchDedupeMode !== 'same-path'
    || structureFirst.dedupeLimitedByParsing !== true
  ) {
    throw new Error('Expected structure-first preset to apply no-write metadata-free organization defaults.');
  }

  const explicitOverride = await organizeFontDirectory({
    inputDir,
    outputDir: outputRoot,
    workflowPreset: 'structure-first',
    parseFonts: true,
    includePlan: true,
    maxFiles: 20,
  });
  if (
    explicitOverride.workflowPreset !== 'structure-first'
    || explicitOverride.parsedFontMetadata !== true
    || explicitOverride.planIncluded !== true
    || explicitOverride.effectiveBatchDedupeMode !== 'font-identity'
  ) {
    throw new Error('Expected explicit organization arguments to override workflowPreset defaults.');
  }

  console.log(JSON.stringify({
    safePreview,
    preserveAll,
    structureFirstBatch,
    structureFirstBatchOverride,
    undefinedOverridePreview,
    structureFirst,
    explicitOverride,
  }, null, 2));
} else if (scenario === 'inspect-compact') {
  const inputDir = process.argv[3] || 'font-split-mcp/.font-split-inspect-compact';
  console.log('Compact output inspection smoke:', inputDir);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.mkdir(path.join(inputDir, 'Nested'), { recursive: true });
  await fs.writeFile(path.join(inputDir, 'sample.txt'), 'sample');
  await fs.writeFile(path.join(inputDir, 'Nested', 'result.css'), 'body{}');

  const compact = await inspectSplitOutput({
    outDir: inputDir,
    includeFiles: false,
    includeFamilies: false,
  });
  if (compact.filesIncluded !== false || compact.familiesIncluded !== false) {
    throw new Error('Expected compact output inspection to mark files and families as omitted.');
  }
  if (Object.hasOwn(compact, 'files') || Object.hasOwn(compact, 'families')) {
    throw new Error('Expected compact output inspection to omit files[] and families[].');
  }
  if (compact.fileCount !== 2 || compact.familyCount < 1) {
    throw new Error('Expected compact output inspection to retain summary counts.');
  }
  assertOutputAuditStatus(compact, {
    auditStatus: 'action-required',
    auditPassed: false,
    reasonCode: 'output-structure-issues',
  }, 'inspect-compact output audit');
  const compactWarningCodes = new Set((compact.inspectionWarnings || []).map((warning) => warning.code));
  for (const expectedWarning of ['output-files-omitted', 'output-families-omitted', 'legacy-output-detected']) {
    if (!compactWarningCodes.has(expectedWarning)) {
      throw new Error(`Expected compact output inspection warning ${expectedWarning}.`);
    }
  }
  console.log(JSON.stringify(compact, null, 2));
} else if (scenario === 'inspect-structure') {
  const outDir = process.argv[3] || 'font-split-mcp/.font-split-inspect-structure';
  console.log('Structured output inspection smoke:', outDir);
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(path.join(outDir, 'FamilyA', 'FixtureSans-Regular'), { recursive: true });
  await fs.mkdir(path.join(outDir, 'FamilyB', 'FixtureSerif-Regular'), { recursive: true });
  await fs.writeFile(path.join(outDir, 'FamilyA', 'FixtureSans-Regular.ttf'), 'font-a');
  await fs.writeFile(path.join(outDir, 'FamilyA', 'FixtureSans-Regular', 'FixtureSans-Regular.woff2'), 'woff2-a');
  await fs.writeFile(path.join(outDir, 'FamilyA', 'FixtureSans-Regular', 'result.css'), 'body{}');
  await fs.writeFile(
    path.join(outDir, 'FamilyA', 'FixtureSans-Regular', 'split-meta.json'),
    JSON.stringify({
      manifestVersion: 1,
      toolVersion: '0.0.0',
      result: {
        outputMode: 'subset',
        resultType: 'subset',
      },
    }, null, 2),
  );
  await fs.writeFile(path.join(outDir, 'FamilyB', 'FixtureSerif-Regular.otf'), 'font-b');
  await fs.writeFile(path.join(outDir, 'FamilyB', 'FixtureSerif-Regular', 'FixtureSerif-Regular.woff2'), 'woff2-b');
  await fs.writeFile(path.join(outDir, 'FamilyB', 'FixtureSerif-Regular', 'result.css'), 'body{}');
  await fs.writeFile(
    path.join(outDir, 'FamilyB', 'FixtureSerif-Regular', 'split-meta.json'),
    JSON.stringify({
      manifestVersion: 1,
      toolVersion: '0.0.0',
      result: {
        outputMode: 'subset',
        resultType: 'subset',
      },
    }, null, 2),
  );

  const clean = await inspectSplitOutput({
    outDir,
    includeFiles: false,
    includeFamilies: false,
  });
  if (
    clean.structureSummary?.conforms !== true
    || clean.structureSummary?.layoutKind !== 'family-tree'
    || clean.structureSummary?.unexpectedFileCount !== 0
    || clean.structureSummary?.manifestCoverageOk !== true
  ) {
    throw new Error('Expected clean structured output to conform to the documented directory layout.');
  }
  assertOutputAuditStatus(clean, {
    auditStatus: 'pass',
    auditPassed: true,
  }, 'inspect-structure clean output audit');
  if ((clean.inspectionWarnings || []).some((warning) => warning.code === 'output-structure-issues')) {
    throw new Error('Expected clean structured output not to raise structure warnings.');
  }

  await fs.writeFile(path.join(outDir, 'notes.txt'), 'stray file');
  const noisy = await inspectSplitOutput({
    outDir,
    includeFiles: false,
    includeFamilies: false,
  });
  if (
    noisy.structureSummary?.conforms !== false
    || noisy.structureSummary?.unexpectedFileCount < 1
    || !noisy.structureSummary?.issues?.some((issue) => issue.code === 'unexpected-output-files')
    || !noisy.inspectionWarnings?.some((warning) => warning.code === 'output-structure-issues')
  ) {
    throw new Error('Expected stray output files to fail the structure audit.');
  }
  assertOutputAuditStatus(noisy, {
    auditStatus: 'action-required',
    auditPassed: false,
    reasonCode: 'output-structure-issues',
    issueCode: 'unexpected-output-files',
  }, 'inspect-structure noisy output audit');

  await fs.mkdir(path.join(outDir, 'FamilyA', 'FixtureSans-Regular', 'extra'), { recursive: true });
  await fs.writeFile(path.join(outDir, 'FamilyA', 'FixtureSans-Regular', 'extra', 'deep.txt'), 'wrong depth');
  const wrongDepth = await inspectSplitOutput({
    outDir,
    includeFiles: false,
    includeFamilies: false,
  });
  if (
    wrongDepth.structureSummary?.conforms !== false
    || wrongDepth.structureSummary?.unexpectedDepthFileCount < 1
    || !wrongDepth.structureSummary?.issues?.some((issue) => issue.code === 'unexpected-output-depth')
  ) {
    throw new Error('Expected files below the documented output depth to fail the structure audit.');
  }
  assertOutputAuditStatus(wrongDepth, {
    auditStatus: 'action-required',
    auditPassed: false,
    reasonCode: 'output-structure-issues',
    issueCode: 'unexpected-output-depth',
  }, 'inspect-structure wrong-depth output audit');

  const batchInputDir = `${outDir}-batch-input`;
  const batchOutputRoot = `${outDir}-batch-output`;
  await fs.rm(batchInputDir, { recursive: true, force: true });
  await fs.rm(batchOutputRoot, { recursive: true, force: true });
  await fs.mkdir(batchInputDir, { recursive: true });
  await fs.writeFile(
    path.join(batchInputDir, 'FixtureSans-Regular.ttf'),
    buildMinimalTtf({ familyName: 'Fixture Sans', subfamilyName: 'Regular', glyphCount: 5 }),
  );
  const batchWrite = await splitFontBatch({
    inputDir: batchInputDir,
    outputRoot: batchOutputRoot,
    workflowPreset: 'reviewed-write',
    batchGroupBy: 'font-family',
    smallGlyphAction: 'copy-original',
    limit: 10,
    maxFiles: 20,
    silent: true,
  });
  const batchInspect = await inspectSplitOutput({
    outDir: batchOutputRoot,
    includeFiles: false,
    includeFamilies: false,
  });
  const batchInspectDetailed = await inspectSplitOutput({
    outDir: batchOutputRoot,
    includeFiles: false,
    includeFamilies: true,
  });
  const batchManifest = batchInspectDetailed.families?.[0]?.fontEntries?.[0]?.manifest;
  const auditAction = (batchWrite.recommendedNextActions || []).find((action) => action.id === 'audit-split-output');
  if (
    batchWrite.workflowPreset !== 'reviewed-write'
    || batchWrite.dryRun !== false
    || batchWrite.safetySummary?.operationMode !== 'batch-output'
    || batchWrite.sourceDestructive !== false
    || batchWrite.sourceFilesPreserved !== true
    || batchWrite.writesSourceTree !== false
    || batchWrite.writesOutputTree !== true
    || batchWrite.outputTreeInsideInputTree !== false
    || batchWrite.mayOverwriteOutputTree !== true
    || batchWrite.processedFontCount !== 1
    || batchInspect.auditStatus !== 'pass'
    || batchInspect.auditPassed !== true
    || batchInspect.outputStructureDecision?.status !== 'pass'
    || batchInspect.outputStructureDecision?.recommendedAction !== 'continue'
    || batchInspect.auditBlockingReasons?.length !== 0
    || batchInspect.structureSummary?.conforms !== true
    || batchInspect.structureSummary?.layoutKind !== 'family-tree'
    || batchInspect.structureSummary?.manifestCoverageOk !== true
    || batchInspect.copyOriginalOutputCount !== 1
    || batchInspect.structureSummary?.outputModeCounts?.['copy-original'] !== 1
    || batchWrite.recommendedNextActionCount !== (batchWrite.recommendedNextActions || []).length
    || batchWrite.batchDecision?.route !== 'audit-written-output'
    || batchWrite.batchDecision?.preferredNextActionId !== 'audit-split-output'
    || batchWrite.batchDecision?.nextTool !== 'inspect_split_output'
    || batchWrite.batchDecision?.auditArgs?.outDir !== batchOutputRoot
    || batchWrite.batchDecision?.requiresOutputAudit !== true
    || auditAction?.tool !== 'inspect_split_output'
    || auditAction?.suggestedArgs?.outDir !== batchOutputRoot
    || auditAction?.suggestedArgs?.includeFiles !== false
    || auditAction?.suggestedArgs?.includeFamilies !== false
    || !auditAction.inspectFields?.includes('outputStructureDecision')
    || !auditAction.inspectFields?.includes('auditStatus')
    || !auditAction.inspectFields?.includes('structureSummary')
  ) {
    throw new Error('Expected real batch copy-original output to match the documented output directory structure.');
  }
  assertInspectFieldsExist(auditAction, {
    inspect_split_output: batchInspect,
  }, 'inspect-structure batch audit action');
  if (Object.hasOwn(batchManifest?.effectiveConfig || {}, 'workflowPreset')) {
    throw new Error('Expected workflowPreset shorthand not to be stored as an output-affecting manifest config.');
  }

  console.log(JSON.stringify({ clean, noisy, wrongDepth, batchWrite, batchInspect }, null, 2));
} else if (scenario === 'mcp-error') {
  const detailedError = new Error('batch failed');
  detailedError.name = 'BatchSplitError';
  detailedError.details = {
    mode: 'fail-after',
    errors: [{ file: 'bad.ttf', error: 'not a font' }],
    summary: { errorCount: 1 },
  };
  const detailed = errorText(detailedError);
  const parsed = JSON.parse(detailed.content[0].text);
  if (
    detailed.isError !== true
    || parsed.name !== 'BatchSplitError'
    || parsed.errorType !== 'batch-split-error'
    || parsed.details?.errors?.[0]?.file !== 'bad.ttf'
  ) {
    throw new Error('Expected MCP error response to preserve structured details.');
  }

  const configError = new Error('batchDedupeMode must be one of none, same-path, font-identity. Omit it to use the documented default.');
  configError.name = 'FontSplitConfigurationError';
  configError.details = {
    summaryType: 'configuration-error',
    optionName: 'batchDedupeMode',
    received: 'semantic',
    allowedValues: ['none', 'same-path', 'font-identity'],
    defaultWhenOmitted: 'font-identity',
    omitForDefaultBehavior: true,
  };
  const configuration = errorText(configError);
  const parsedConfiguration = JSON.parse(configuration.content[0].text);
  if (
    configuration.isError !== true
    || parsedConfiguration.name !== 'FontSplitConfigurationError'
    || parsedConfiguration.errorType !== 'configuration-error'
    || parsedConfiguration.details?.summaryType !== 'configuration-error'
    || parsedConfiguration.details?.optionName !== 'batchDedupeMode'
    || parsedConfiguration.details?.omitForDefaultBehavior !== true
  ) {
    throw new Error('Expected MCP configuration error response to preserve configuration-error details.');
  }

  const plain = errorText(new Error('plain failure'));
  if (plain.content[0].text !== 'plain failure') {
    throw new Error('Expected plain MCP error response to stay concise.');
  }
  console.log(JSON.stringify({ detailed: parsed, configuration: parsedConfiguration, plain: plain.content[0].text }, null, 2));
} else if (scenario === 'mcp-schema') {
  const client = new Client({ name: 'mcp-schema-smoke', version: '0.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['src/server.js'],
    cwd: process.cwd(),
  });
  await client.connect(transport);
  try {
    const result = await client.listTools();
    const tools = Object.fromEntries(result.tools.map((tool) => [tool.name, tool]));
    const guidanceProps = tools.get_agent_guidance?.inputSchema?.properties || {};
    const splitFontProps = tools.split_font?.inputSchema?.properties || {};
    const batchProps = tools.split_font_batch?.inputSchema?.properties || {};
    const organizeProps = tools.organize_font_directory?.inputSchema?.properties || {};
    const expectDescriptionIncludes = (toolName, phrases) => {
      const description = tools[toolName]?.description || '';
      for (const phrase of phrases) {
        if (!description.includes(phrase)) {
          throw new Error(`${toolName} description is missing ${phrase}`);
        }
      }
    };
    const batchOnly = ['skipMode', 'batchGroupBy', 'batchNamingMode', 'batchDedupeMode', 'batchErrorMode', 'debugBatchDecisions'];
    const leaked = batchOnly.filter((key) => Object.hasOwn(splitFontProps, key));
    const missing = batchOnly.filter((key) => !Object.hasOwn(batchProps, key));
    if (leaked.length > 0) {
      throw new Error(`split_font leaked batch-only properties: ${leaked.join(', ')}`);
    }
    if (missing.length > 0) {
      throw new Error(`split_font_batch is missing batch-only properties: ${missing.join(', ')}`);
    }
    for (const requiredGuidanceProp of ['workflow', 'detailLevel', 'sections']) {
      if (!Object.hasOwn(guidanceProps, requiredGuidanceProp)) {
        throw new Error(`get_agent_guidance is missing ${requiredGuidanceProp}`);
      }
    }
    for (const requiredOrganizeProp of ['dryRun', 'outputDir', 'overwriteExisting', 'copyInvalidFonts']) {
      if (!Object.hasOwn(organizeProps, requiredOrganizeProp)) {
        throw new Error(`organize_font_directory is missing ${requiredOrganizeProp}`);
      }
    }
    if (!Object.hasOwn(batchProps, 'workflowPreset') || !Object.hasOwn(organizeProps, 'workflowPreset')) {
      throw new Error('Expected batch and organization tools to expose workflowPreset.');
    }
    if (
      batchProps.workflowPreset?.enum?.includes('default')
      || organizeProps.workflowPreset?.enum?.includes('default')
      || batchProps.workflowPreset?.anyOf?.some((entry) => entry.enum?.includes('default'))
      || organizeProps.workflowPreset?.anyOf?.some((entry) => entry.enum?.includes('default'))
    ) {
      throw new Error('Expected workflowPreset schema to omit redundant default preset; callers should omit workflowPreset for raw defaults.');
    }
    expectDescriptionIncludes('get_agent_guidance', ['nextToolDecisionSummary', 'workflowQuickStart', 'quickStartCallExamples', 'configurationRecipes', 'batchPolicyGuide', 'unsupportedFileCategoryCatalog', 'directoryWorkflowDecisionMatrix', 'safeInvocationTemplates', 'localVerificationOutputGuide', 'errorResponseCatalog', 'warningCodeCatalog', 'toolResponseFieldCatalog', 'response fields to inspect', 'successCriteria', 'detailLevel', 'sections']);
    expectDescriptionIncludes('split_font', ['writes output files', 'resultType', 'usedFallback']);
    expectDescriptionIncludes('split_font_batch', ['dryRun defaults to false', 'includeResults:true', 'safetySummary', 'batchPolicySummary', 'outputTreeInsideInputTree', 'batchDecision', 'batchWarnings', 'source-layout-mismatch-comparison', 'organize_font_directory safe-preview']);
    expectDescriptionIncludes('organize_font_directory', ['dryRun true', 'source-non-destructive', 'never moves or deletes source files', 'safetySummary', 'batchPolicySummary', 'directoryWorkflowSummary', 'sourceLayoutMismatchSummary', 'recommendedBatchPreviewArgs', 'outputTreeInsideInputTree', 'source-layout-mismatch-comparison']);
    expectDescriptionIncludes('inspect_split_output', ['outputStructureDecision', 'auditStatus', 'structureSummary', 'maxFilesHit', 'inspectionWarnings', 'includeFiles:false']);
    console.log(JSON.stringify({
      ok: true,
      guidancePropertyCount: Object.keys(guidanceProps).length,
      splitFontPropertyCount: Object.keys(splitFontProps).length,
      splitFontBatchPropertyCount: Object.keys(batchProps).length,
      organizeFontDirectoryPropertyCount: Object.keys(organizeProps).length,
      splitFontBatchHasBatchGroupBy: Object.hasOwn(batchProps, 'batchGroupBy'),
      organizeFontDirectoryHasDryRun: Object.hasOwn(organizeProps, 'dryRun'),
    }, null, 2));
  } finally {
    await client.close();
  }
} else if (scenario === 'api-docs') {
  const apiDocs = {
    'API.md': await fs.readFile('API.md', 'utf8'),
    'API.zh-CN.md': await fs.readFile('API.zh-CN.md', 'utf8'),
  };
  const assertDocsContainAny = (label, tokens) => {
    for (const [fileName, content] of Object.entries(apiDocs)) {
      if (!tokens.some((token) => content.includes(token))) {
        throw new Error(`${fileName} is missing documented ${label}: ${tokens.join(' or ')}`);
      }
    }
  };
  const assertDocsContain = (label, token) => assertDocsContainAny(label, [token]);

  const client = new Client({ name: 'api-docs-smoke', version: '0.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['src/server.js'],
    cwd: process.cwd(),
  });
  await client.connect(transport);
  try {
    const result = await client.listTools();
    const guidance = getAgentGuidance({ workflow: 'batch', detailLevel: 'full' });
    for (const tool of result.tools) {
      assertDocsContain(`${tool.name} heading`, `## \`${tool.name}\``);
      for (const propertyName of Object.keys(tool.inputSchema?.properties || {})) {
        assertDocsContain(`${tool.name}.${propertyName}`, `\`${propertyName}\``);
      }
    }

    for (const sectionName of guidance.guidanceView?.availableSections || []) {
      assertDocsContain(`get_agent_guidance section ${sectionName}`, `\`${sectionName}\``);
    }
    for (const preset of guidance.workflowPresets || []) {
      assertDocsContain(`workflowPreset ${preset.id}`, `\`${preset.id}\``);
    }
    for (const fieldName of [
      'guidanceView',
      'recommendedWorkflowPlan',
      'nextToolDecisionSummary',
      'workflowQuickStart',
      'quickStartCallExamples[]',
      'configurationRecipes',
      'batchPolicyGuide',
      'batchPolicySummary',
      'directoryWorkflowSummary',
      'sourceLayoutMismatchSummary',
      'sourceLayoutMismatchSummary.decisionChecklist',
      'planVisibility',
      'directoryWorkflowSummary.planVisibility',
      'unsupportedFileCategoryCatalog',
      'directoryWorkflowDecisionMatrix',
      'safeInvocationTemplates',
      'localVerificationOutputGuide',
      'errorResponseCatalog',
      'warningCodeCatalog',
      'toolResponseFieldCatalog',
      'workflowPresets',
      'recommendedBatchPreviewArgs',
      'recommendedNextActions',
      'successCriteria',
      'safetySummary',
      'batchGroupBy',
      'batchNamingMode',
      'batchDedupeMode',
      'batchErrorMode',
      'batchDecision',
      'organizationDecision',
      'sourceDestructive',
      'writesSourceTree',
      'writesOutputTree',
      'outputTreeInsideInputTree',
      'mayOverwriteOutputTree',
      'outputStructureDecision',
      'auditStatus',
      'auditPassed',
      'auditBlockingReasons',
      'structureSummary',
      'maxFilesHit',
      'unsupportedFileDecision',
      'unsupportedFileSummary',
      'unsupportedFileSummary.total',
      'unsupportedFileSummary.byExtension',
      'unsupportedFileSummary.byCategory',
      'unsupportedFileSummary.categoryDetails',
      'unsupportedFileSummary.handlingSummary',
      'unsupportedFileSummary.examples',
      'coverageSummary.unsupportedFileCategoryCoverage',
      'coverageSummary.outputStructureAuditSummary',
      'reliabilityGateDecision',
      'debugBatchDecisions',
      'humanSummary',
    ]) {
      assertDocsContainAny(`important field ${fieldName}`, [`\`${fieldName}\``, `\`${fieldName}[]\``]);
    }
    assertDocsContain('compact check checklist id', '`local-compact-check-passed`');
    assertDocsContain('compact check command', '`npm run check:compact`');
    assertDocsContain('compact check result', '`compact-check-result`');
    assertDocsContain('real corpus suite checklist id', '`local-real-corpus-suite-passed`');
    assertDocsContain('local verification output guide', '`localVerificationOutputGuide`');
    assertDocsContain('real corpus suite command', '`npm run smoke:real-corpus-suite -- <font-corpus-dir>`');
    assertDocsContain('real corpus reliability gate decision', '`reliabilityGateDecision`');
    assertDocsContain('real corpus suite test scope', '`testScope`');
    assertDocsContain('real corpus ignored category coverage', '`coverageSummary.unsupportedFileCategoryCoverage`');
    assertDocsContain('real corpus output structure audit summary', '`coverageSummary.outputStructureAuditSummary`');
    assertDocsContain('error response catalog', '`errorResponseCatalog`');
    assertDocsContain('error catalog section', '`error-catalog`');
    assertDocsContain('error type field', '`errorType`');
    assertDocsContain('batch split error type', '`errorType: "batch-split-error"`');
    assertDocsContain('configuration error summary type', '`details.summaryType: "configuration-error"`');
    assertDocsContain('workflow-only quick start request', '`sections: ["workflow"]`');
    assertDocsContain('workflow quick start recommended call', '`workflowQuickStart.recommendedCallExample`');
    assertDocsContain('two-call layout preview example', '`two-call-layout-preview`');
    assertDocsContain('recommendedBatchPreviewArgs spread example', '...organization.recommendedBatchPreviewArgs');
    assertDocsContain('recommendedBatchOptions not complete call warning', '`recommendedBatchOptions`');
    assertDocsContain('copy-only reviewed-write route', '`workflowPreset: "reviewed-write"`');

    console.log(JSON.stringify({
      ok: true,
      docsChecked: Object.keys(apiDocs),
      toolCount: result.tools.length,
      documentedSchemaPropertyCount: result.tools.reduce((count, tool) => count + Object.keys(tool.inputSchema?.properties || {}).length, 0),
      documentedGuidanceSectionCount: guidance.guidanceView?.availableSections?.length || 0,
      documentedWorkflowPresetCount: guidance.workflowPresets?.length || 0,
    }, null, 2));
  } finally {
    await client.close();
  }
} else if (scenario === 'behavior-docs') {
  const behaviorDoc = await fs.readFile('BEHAVIOR.zh-CN.md', 'utf8');
  const readmeZh = await fs.readFile('README.md', 'utf8');
  const readmeEn = await fs.readFile('README.en.md', 'utf8');
  const serverSource = await fs.readFile('src/server.js', 'utf8');
  const guidance = getAgentGuidance({ workflow: 'batch', detailLevel: 'full' });
  const assertBehaviorContains = (label, token) => {
    if (!behaviorDoc.includes(token)) {
      throw new Error(`BEHAVIOR.zh-CN.md is missing documented ${label}: ${token}`);
    }
  };
  const samePathLegacyTokens = [
    'preserve the old same-path',
    'preserves old same-stem',
    'old-style batch behavior',
    '保留旧的“同路径',
    '旧式批量行为',
  ];
  for (const [label, text] of [
    ['README.md', readmeZh],
    ['README.en.md', readmeEn],
    ['BEHAVIOR.zh-CN.md', behaviorDoc],
    ['src/server.js', serverSource],
  ]) {
    for (const token of samePathLegacyTokens) {
      if (text.includes(token)) {
        throw new Error(`${label} should describe same-path as path/stem-level dedupe, not as old behavior: ${token}`);
      }
    }
  }
  if (!readmeZh.includes('路径/stem 级') || !readmeEn.includes('path/stem-level') || !serverSource.includes('same source path stem')) {
    throw new Error('Expected same-path documentation and schema descriptions to explain path/stem-level dedupe semantics.');
  }

  for (const tool of guidance.tools || []) {
    assertBehaviorContains(`tool ${tool.name}`, `\`${tool.name}\``);
  }
  for (const preset of guidance.workflowPresets || []) {
    assertBehaviorContains(`workflowPreset ${preset.id}`, `\`${preset.id}\``);
  }
  for (const token of [
    '`FONT_SPLIT_ROOT`',
    '`guidanceView`',
    '`recommendedWorkflowPlan`',
    '`nextToolDecisionSummary`',
    '`workflowQuickStart`',
    '`workflowQuickStart.recommendedCallExample`',
    '`sections: ["workflow"]`',
    '`quickStartCallExamples[]`',
    '`configurationRecipes[]`',
    '`batchPolicyGuide`',
    '`batchPolicySummary`',
    '`directoryWorkflowSummary`',
    '`sourceLayoutMismatchSummary`',
    '`sourceLayoutMismatchSummary.decisionChecklist`',
    '`planVisibility`',
    '`directoryWorkflowSummary.planVisibility`',
    '`unsupportedFileCategoryCatalog`',
    '`verificationChecklist[]`',
    '`check:compact`',
    '`compact-check-result`',
    '`smoke:real-corpus-suite`',
    '`reliabilityGateDecision`',
    '`humanSummary`',
    '`testScope`',
    '`functionalCoverage[]`',
    '`coverageSummary.unsupportedFileCategoryCoverage`',
    '`coverageSummary.outputStructureAuditSummary`',
    '`directoryWorkflowDecisionMatrix[]`',
    '`directoryWorkflowExamples[]`',
    '`safeInvocationTemplates[]`',
    '`localVerificationOutputGuide`',
    '`errorResponseCatalog`',
    '`toolResponseFieldCatalog`',
    '`workflowPreset`',
    '`dryRun`',
    '`includeResults`',
    '`includePlan`',
    '`parseFonts`',
    '`copyInvalidFonts`',
    '`overwriteExisting`',
    '`safetySummary`',
    '`sourceDestructive`',
    '`writesSourceTree`',
    '`writesOutputTree`',
    '`outputTreeInsideInputTree`',
    '`mayOverwriteOutputTree`',
    '`recommendedBatchPreviewArgs`',
    '`recommendedNextActions[]`',
    '`successCriteria`',
    '`planActionSummary`',
    '`batchDecision`',
    '`organizationDecision`',
    '`directoryWorkflowSummary`',
    '`unsupportedFileDecision`',
    '`unsupportedFileSummary`',
    '`unsupportedFileSummary.byExtension[]`',
    '`unsupportedFileSummary.byCategory[]`',
    '`unsupportedFileSummary.categoryDetails[]`',
    '`unsupportedFileSummary.handlingSummary`',
    '`unsupportedFileSummary.examples[]`',
    '`outputStructureDecision`',
    '`auditStatus`',
    '`auditPassed`',
    '`auditBlockingReasons[]`',
    '`structureSummary`',
    '`maxFilesHit`',
    '`batchWarnings[]`',
    '`organizationWarnings[]`',
    '`inspectionWarnings[]`',
    '`batchGroupBy`',
    '`batchNamingMode`',
    '`batchDedupeMode`',
    '`batchErrorMode`',
    '`skipMode`',
    '`debugBatchDecisions`',
    '`font-identity`',
    '`glyphCount`',
    '`resultType`',
    '`outputMode`',
    '`performedSplit`',
    '`usedFallback`',
    '`ok: true`',
    '`splitFailureAction`',
    '`smallGlyphAction`',
    '`details.summaryType`',
    '`errorType`',
    '`batch-split-error`',
    '`configuration-error`',
  ]) {
    assertBehaviorContains(`high-risk behavior token ${token}`, token);
  }
  for (const warningCode of [
    'input-scan-truncated',
    'output-structure-issues',
    'legacy-output-detected',
    'organization-dry-run',
    'organization-writes-output',
    'font-parsing-skipped',
    'output-overwrite-enabled',
    'unsupported-files-ignored',
    'duplicate-fonts-skipped',
    'output-inside-input',
  ]) {
    assertBehaviorContains(`warning code ${warningCode}`, `\`${warningCode}\``);
  }
  for (const debugEvent of ['dedupe-drop', 'dedupe-replace', 'naming', 'skip-check', 'error']) {
    assertBehaviorContains(`debugBatchDecisions event ${debugEvent}`, `\`${debugEvent}\``);
  }

  console.log(JSON.stringify({
    ok: true,
    toolCount: guidance.tools?.length || 0,
    documentedWorkflowPresetCount: guidance.workflowPresets?.length || 0,
    checkedHighRiskTokenCount: 46,
    checkedWarningCodeCount: 10,
    checkedDebugEventCount: 5,
  }, null, 2));
} else if (scenario === 'batch-compact') {
  const inputDir = process.argv[3] || '0xA000';
  const outputRoot = process.argv[4] || 'font-split-mcp/.font-split-batch-compact-output';
  console.log('Batch compact response smoke:', inputDir, '->', outputRoot);
  const result = await splitFontBatch({
    inputDir,
    outputRoot,
    limit: 2,
    maxFiles: 50,
    includeResults: false,
    skipMode: 'force',
    batchNamingMode: 'numeric-suffix',
    batchDedupeMode: 'font-identity',
    chunkSize: 70 * 1024,
    silent: true,
  });
  if (result.resultsIncluded !== false || Object.hasOwn(result, 'results')) {
    throw new Error('Expected compact batch response to omit results.');
  }
  console.log(JSON.stringify(result, null, 2));
} else if (scenario === 'batch-dry-run') {
  const ownsFixtureInput = process.argv[3] === undefined;
  const inputDir = process.argv[3] || '.font-split-batch-dry-run-input';
  const outputRoot = process.argv[4] || 'font-split-mcp/.font-split-batch-dry-run-output';
  console.log('Batch dry-run smoke:', inputDir, '->', outputRoot);
  if (ownsFixtureInput) {
    await fs.rm(inputDir, { recursive: true, force: true });
    await fs.rm(outputRoot, { recursive: true, force: true });
    await fs.mkdir(inputDir, { recursive: true });
    await fs.writeFile(path.join(inputDir, 'FixtureSans-Regular.ttf'), buildMinimalTtf({
      familyName: 'Fixture Sans',
      subfamilyName: 'Regular',
      glyphCount: 5,
    }));
  }
  const outputRootExistedBefore = await fsExists(outputRoot);
  const result = await splitFontBatch({
    inputDir,
    outputRoot,
    limit: 2,
    maxFiles: 50,
    dryRun: true,
    includeResults: true,
    skipMode: 'force',
    batchNamingMode: 'numeric-suffix',
    batchDedupeMode: 'font-identity',
    chunkSize: 70 * 1024,
    silent: true,
  });
  if (result.dryRun !== true || result.planIncluded !== true || !Array.isArray(result.planned)) {
    throw new Error('Expected dry-run batch response to include planned output.');
  }
  if (Object.hasOwn(result, 'results')) {
    throw new Error('Expected dry-run batch response to omit results.');
  }
  const batchWriteAction = (result.recommendedNextActions || []).find((action) => action.id === 'run-reviewed-batch-write');
  if (
    result.recommendedNextActionCount !== (result.recommendedNextActions || []).length
    || batchWriteAction?.tool !== 'split_font_batch'
    || batchWriteAction?.suggestedArgs?.workflowPreset !== 'reviewed-write'
    || batchWriteAction?.suggestedArgs?.inputDir !== inputDir
    || batchWriteAction?.suggestedArgs?.outputRoot !== outputRoot
    || !batchWriteAction.inspectFields?.includes('writesOutputTree')
    || !batchWriteAction.inspectFields?.includes('batchDecision')
  ) {
    throw new Error('Expected batch dry-run to recommend a reviewed-write follow-up with safety and route-decision fields.');
  }
  if (batchWriteAction.suggestedArgs?.skipMode !== 'force') {
    throw new Error('Expected reviewed-write follow-up to preserve the explicit skipMode override.');
  }
  if (
    result.batchDecision?.route !== 'review-dry-run-plan'
    || result.batchDecision?.preferredNextActionId !== 'run-reviewed-batch-write'
    || result.batchDecision?.nextTool !== 'split_font_batch'
    || result.batchDecision?.reviewedWriteArgs?.inputDir !== inputDir
    || result.batchDecision?.reviewedWriteArgs?.outputRoot !== outputRoot
    || result.batchDecision?.reviewedWriteArgs?.workflowPreset !== 'reviewed-write'
    || result.batchDecision?.sourceDestructive !== false
    || result.batchDecision?.writesOutputTree !== false
  ) {
    throw new Error('Expected batch dry-run to expose a compact reviewed-write decision route.');
  }
  assertActionSuggestedArgsOmit(batchWriteAction, ['dryRun', 'includeResults', 'batchNamingMode', 'batchDedupeMode', 'batchErrorMode', 'splitFailureAction'], 'run-reviewed-batch-write suggestedArgs');
  assertInspectFieldsExist(batchWriteAction, {
    split_font_batch: result,
  }, 'batch-dry-run');
  if ((await fsExists(outputRoot)) !== outputRootExistedBefore) {
    throw new Error('Expected dry-run not to create or remove outputRoot.');
  }
  console.log(JSON.stringify(result, null, 2));
} else if (scenario === 'batch-error-mode') {
  const inputDir = process.argv[3] || 'font-split-mcp/.font-split-error-mode-input';
  const outputRoot = process.argv[4] || 'font-split-mcp/.font-split-error-mode-output';
  console.log('Batch error mode smoke:', inputDir, '->', outputRoot);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(inputDir, { recursive: true });
  await fs.writeFile(path.join(inputDir, 'not-a-font.ttf'), 'not a real font');

  const collect = await splitFontBatch({
    inputDir,
    outputRoot,
    limit: 2,
    maxFiles: 10,
    skipMode: 'force',
    batchErrorMode: 'collect',
    silent: true,
  });
  if (collect.ok !== true || collect.errorCount !== 1 || collect.batchErrorMode !== 'collect') {
    throw new Error('Expected collect mode to return one collected error.');
  }
  if (
    collect.batchDecision?.route !== 'inspect-batch-errors'
    || collect.batchDecision?.preferredNextActionId !== 'inspect-batch-errors'
    || collect.batchDecision?.sourceDestructive !== false
  ) {
    throw new Error('Expected collect mode to expose an inspect-batch-errors decision route.');
  }

  let threw = false;
  try {
    await splitFontBatch({
      inputDir,
      outputRoot,
      limit: 2,
      maxFiles: 10,
      skipMode: 'force',
      batchErrorMode: 'fail-after',
      silent: true,
    });
  } catch (error) {
    threw = true;
    if (error.name !== 'BatchSplitError' || error.details?.errors?.length !== 1) {
      throw error;
    }
  }
  if (!threw) {
    throw new Error('Expected fail-after mode to throw BatchSplitError.');
  }

  console.log(JSON.stringify({
    collect: {
      ok: collect.ok,
      batchErrorMode: collect.batchErrorMode,
      errorCount: collect.errorCount,
      errors: collect.errors,
    },
    failAfterThrew: threw,
  }, null, 2));
} else if (scenario === 'batch-defaults') {
  const inputDir = process.argv[3] || 'font-split-mcp/.font-split-defaults-input';
  const outputRoot = process.argv[4] || 'font-split-mcp/.font-split-defaults-output';
  console.log('Batch defaults smoke:', inputDir, '->', outputRoot);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(inputDir, { recursive: true });
  await fs.writeFile(path.join(inputDir, 'not-a-font.ttf'), 'not a real font');

  const assertConfigurationError = async (context, action, expectedDetails) => {
    let thrown = null;
    try {
      await action();
    } catch (error) {
      thrown = error;
    }
    if (
      thrown?.name !== 'FontSplitConfigurationError'
      || thrown.details?.summaryType !== 'configuration-error'
      || thrown.details?.option !== expectedDetails.option
      || thrown.details?.expectedType !== expectedDetails.expectedType
      || thrown.details?.omitForDefaultBehavior !== true
      || !thrown.details?.nonIntuitiveBehavior?.includes('rejected instead of silently falling back')
    ) {
      throw new Error(`${context}: expected FontSplitConfigurationError with machine-readable details.`);
    }
    return {
      name: thrown.name,
      option: thrown.details.option,
      expectedType: thrown.details.expectedType,
      received: thrown.details.received,
    };
  };

  const invalidBatchDedupe = await assertConfigurationError('invalid direct batch dedupe option', () => splitFontBatch({
    inputDir,
    outputRoot,
    dryRun: true,
    batchDedupeMode: 'semantic',
  }), {
    option: 'batchDedupeMode',
    expectedType: 'enum',
  });

  const invalidBatchLimit = await assertConfigurationError('invalid direct batch limit option', () => splitFontBatch({
    inputDir,
    outputRoot,
    dryRun: true,
    limit: 0,
  }), {
    option: 'limit',
    expectedType: 'positive-integer',
  });

  const invalidBatchBoolean = await assertConfigurationError('invalid direct batch boolean option', () => splitFontBatch({
    inputDir,
    outputRoot,
    dryRun: true,
    includeResults: 'false',
  }), {
    option: 'includeResults',
    expectedType: 'boolean',
  });

  const invalidOrganizationBoolean = await assertConfigurationError('invalid direct organization boolean option', () => organizeFontDirectory({
    inputDir,
    outputDir: `${outputRoot}-organized`,
    parseFonts: 'no',
  }), {
    option: 'parseFonts',
    expectedType: 'boolean',
  });

  const invalidInspectionLimit = await assertConfigurationError('invalid direct inspect maxFiles option', () => inspectFontInputs({
    inputDir,
    maxFiles: 0,
  }), {
    option: 'maxFiles',
    expectedType: 'positive-integer',
  });

  const invalidSingleFontOption = await assertConfigurationError('invalid direct split option', () => splitFont({
    fontPath: path.join(inputDir, 'not-a-font.ttf'),
    smallGlyphAction: 'fallback',
  }), {
    option: 'smallGlyphAction',
    expectedType: 'enum',
  });

  let defaultThrew = false;
  try {
    await splitFontBatch({
      inputDir,
      outputRoot,
      limit: 2,
      maxFiles: 10,
      silent: true,
    });
  } catch (error) {
    defaultThrew = true;
    if (error.name !== 'BatchSplitError' || error.details?.mode !== 'fail-after') {
      throw error;
    }
  }
  if (!defaultThrew) {
    throw new Error('Expected default batchErrorMode to be fail-after.');
  }

  const overridden = await splitFontBatch({
    inputDir,
    outputRoot,
    limit: 2,
    maxFiles: 10,
    skipMode: 'force',
    batchErrorMode: 'collect',
    silent: true,
  });
  if (Object.hasOwn(overridden, 'strictMode') || overridden.skipMode !== 'force' || overridden.batchErrorMode !== 'collect' || overridden.errorCount !== 1) {
    throw new Error('Expected batch defaults to omit strictMode and allow explicit batch options.');
  }

  console.log(JSON.stringify({
    defaultThrew,
    overridden: {
      skipMode: overridden.skipMode,
      batchErrorMode: overridden.batchErrorMode,
      errorCount: overridden.errorCount,
    },
    invalidConfiguration: {
      invalidBatchDedupe,
      invalidBatchLimit,
      invalidBatchBoolean,
      invalidOrganizationBoolean,
      invalidInspectionLimit,
      invalidSingleFontOption,
    },
  }, null, 2));
} else if (scenario === 'real-corpus-suite') {
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
  const reliabilityGateDecision = buildRealCorpusReliabilityGateDecision(coverageSummary, humanSummary);
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
    || coverageSummary.outputStructureAuditSummary?.singleOutputStructureDecision?.status !== 'pass'
    || coverageSummary.outputStructureAuditSummary?.batchOutputStructureDecision?.status !== 'pass'
    || coverageSummary.testScope?.representativeWriteAudit?.singleStructureConforms !== true
    || coverageSummary.testScope?.representativeWriteAudit?.batchStructureConforms !== true
    || !Array.isArray(coverageSummary.functionalCoverage)
    || !coverageSummary.functionalCoverage.some((item) => item.id === 'source-layout-mismatch-summary')
    || coverageSummary.functionalCoverage.some((item) => item.covered !== true)
    || coverageSummary.corpusSupportedFontCount < 1
    || coverageSummary.corpusUnsupportedFileDecision?.summaryType !== 'unsupported-file-decision'
    || coverageSummary.corpusUnsupportedFileDecision?.totalUnsupportedFileCount !== coverageSummary.corpusUnsupportedFileCount
    || coverageSummary.corpusUnsupportedFileDecision?.handlingSummary?.archivesExtracted !== false
    || !Array.isArray(coverageSummary.corpusUnsupportedByCategory)
    || coverageSummary.unsupportedFileCategoryCoverage?.summaryType !== 'unsupported-file-category-coverage'
    || coverageSummary.unsupportedFileCategoryCoverage?.extensionsBeyondZipTxtCount < 1
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
    || humanSummary.perDirectoryAcceptanceAudit !== false
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
    || reliabilityGateDecision.blockingReasonCodes?.length !== 0
    || !reliabilityGateDecision.evidenceFields?.includes('coverageSummary.outputStructureAuditSummary')
    || !reliabilityGateDecision.passCriteria?.includes('outputStructureDecision.status pass')
    || !reliabilityGateDecision.nonIntuitiveBehavior?.includes('not the full corpus font count')
    || !humanSummary.lines?.some((line) => line.includes('Ignored-file coverage'))
    || !humanSummary.lines?.some((line) => line.includes('structureConforms=true'))
    || !humanSummary.lines?.some((line) => line.includes('not the full corpus font count'))
  ) {
    throw new Error('Expected real-corpus-suite compact coverage summary to expose explicit reliabilityGateDecision, testScope, humanSummary, covered function paths, root counts, unsupported categories, selected targets, and passing output audits.');
  }

  printRealCorpusSuiteHumanSummary(humanSummary);
  console.log(JSON.stringify({
    ok: true,
    purpose: 'Representative reliability gate over a local real font corpus; not a per-directory acceptance audit.',
    outputMode: verbose ? 'verbose' : 'compact',
    corpusRoot,
    maxFiles,
    targetLimit,
    integrationLimit,
    sampleCount,
    reliabilityGateDecision,
    humanSummary,
    testScope: coverageSummary.testScope,
    coverageSummary,
    runs,
  }, null, 2));
} else if (scenario === 'real-corpus-readonly') {
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
  ) {
    throw new Error('Expected real corpus organization smoke to stay structure-first, no-write, and return safe batch preview args.');
  }
  assertRealCorpusSourceLayoutMismatchSummary(organization.sourceLayoutMismatchSummary, 'real-corpus-readonly organization');
  assertObjectOmitsKeys(organization.recommendedBatchPreviewArgs, [
    'dryRun',
    'includeResults',
    'skipMode',
    'batchNamingMode',
    'batchDedupeMode',
    'batchErrorMode',
    'splitFailureAction',
  ], 'real-corpus-readonly recommendedBatchPreviewArgs');

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
  assertInspectFieldsExist(batchWriteAction, {
    split_font_batch: batchPreview,
  }, 'real-corpus-readonly batch preview action');

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
      unsupportedFileDecision: corpusInspection.unsupportedFileDecision,
      unsupportedFileSummary: corpusInspection.unsupportedFileSummary,
      maxFilesHit: corpusInspection.maxFilesHit,
      filesIncluded: corpusInspection.filesIncluded,
    },
    sample,
    inspection: {
      supportedFontCount: inspection.supportedFontCount,
      unsupportedFileDecision: inspection.unsupportedFileDecision,
      unsupportedFileSummary: inspection.unsupportedFileSummary,
      maxFilesHit: inspection.maxFilesHit,
      filesIncluded: inspection.filesIncluded,
    },
    organization: {
      layout: organization.layout,
      recommendedBatchPreviewArgs: organization.recommendedBatchPreviewArgs,
      safetySummary: organization.safetySummary,
      parsedFontMetadata: organization.parsedFontMetadata,
      dedupeLimitedByParsing: organization.dedupeLimitedByParsing,
      organizationWarnings: organization.organizationWarnings,
      sourceLayoutMismatchSummary: summarizeSourceLayoutMismatch(organization.sourceLayoutMismatchSummary),
    },
    batchPreview: {
      dryRun: batchPreview.dryRun,
      discoveredFontCount: batchPreview.discoveredFontCount,
      deduplicatedCount: batchPreview.deduplicatedCount,
      selectedFontCount: batchPreview.selectedFontCount,
      skippedDuplicates: batchPreview.skippedDuplicates,
      recommendedNextActions: batchPreview.recommendedNextActions,
    },
  }, null, 2));
} else if (scenario === 'real-corpus-targets') {
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
    assertInspectFieldsExist(batchWriteAction, {
      split_font_batch: batchPreview,
    }, `real-corpus-targets ${target} batch action`);

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
      unsupportedFileSummary: inspection.unsupportedFileSummary,
      layout: organization.layout,
      recommendedBatchPreviewArgs: organization.recommendedBatchPreviewArgs,
      sourceLayoutMismatchSummary: summarizeSourceLayoutMismatch(organization.sourceLayoutMismatchSummary),
      discoveredFontCount: batchPreview.discoveredFontCount,
      deduplicatedCount: batchPreview.deduplicatedCount,
      selectedFontCount: batchPreview.selectedFontCount,
      skippedDuplicates: batchPreview.skippedDuplicates,
      numericSuffixCount,
      sourceSuffixCount,
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
      unsupportedFileDecision: corpusInspection.unsupportedFileDecision,
      unsupportedFileSummary: corpusInspection.unsupportedFileSummary,
      maxFilesHit: corpusInspection.maxFilesHit,
    },
    targets: targetSummaries,
  }, null, 2));
} else if (scenario === 'real-corpus-integration') {
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

  const sampleInspection = await inspectFontInputs({
    inputDir: sample.inputDir,
    maxFiles,
    includeFiles: false,
  });
  if (
    sampleInspection.supportedFontCount < 1
    || sampleInspection.filesIncluded !== false
    || sampleInspection.unsupportedFileSummary?.total !== sample.summary.unsupportedCount
  ) {
    throw new Error('Expected real-corpus-integration sample inspection to summarize the selected real sample.');
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
  ) {
    throw new Error('Expected real-corpus-integration organization preview to be source-safe and no-write.');
  }
  assertRealCorpusSourceLayoutMismatchSummary(organizationPreview.sourceLayoutMismatchSummary, 'real-corpus-integration organization preview');

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

  const organizedInspection = await inspectFontInputs({
    inputDir: organizationOutputDir,
    maxFiles,
    includeFiles: false,
  });
  if (organizedInspection.supportedFontCount < 1 || organizedInspection.filesIncluded !== false) {
    throw new Error('Expected real-corpus-integration to inspect organized copied fonts.');
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
  assertInspectFieldsExist(batchWriteAction, {
    split_font_batch: batchPreview,
  }, 'real-corpus-integration batch preview action');

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
        safetySummary: organizationPreview.safetySummary,
        sourceLayoutMismatchSummary: summarizeSourceLayoutMismatch(organizationPreview.sourceLayoutMismatchSummary),
      },
      write: {
        outputDir: organizationWrite.outputDir,
        copiedCount: organizationWrite.copiedCount,
        deduplicatedCount: organizationWrite.deduplicatedCount,
        skippedDuplicates: organizationWrite.skippedDuplicates,
        safetySummary: organizationWrite.safetySummary,
        organizationManifestPath: organizationWrite.organizationManifestPath,
        sourceLayoutMismatchSummary: summarizeSourceLayoutMismatch(organizationWrite.sourceLayoutMismatchSummary),
      },
      organizedInspection: {
        supportedFontCount: organizedInspection.supportedFontCount,
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
      recommendedNextActions: batchPreview.recommendedNextActions,
    },
    batchWrite: {
      outputRoot: batchWrite.outputRoot,
      processedFontCount: batchWrite.processedFontCount,
      errorCount: batchWrite.errorCount,
      processingSummary: batchWrite.processingSummary,
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
      outputStructureDecision: batchAudit.outputStructureDecision,
      auditBlockingReasons: batchAudit.auditBlockingReasons,
      inspectionWarnings: batchAudit.inspectionWarnings,
      structureSummary: batchAudit.structureSummary,
    },
  }, null, 2));
} else if (scenario === 'small-copy-original') {
  const usesGeneratedInput = !process.argv[3];
  const smallInputDir = '.font-split-small-copy-original-input';
  const smallFontPath = process.argv[3] || path.join(smallInputDir, 'SmallCopyOriginal-Regular.ttf');
  const smallOutDir = process.argv[4] || '.font-split-small-copy-original-output';

  console.log('Small glyph copy-original smoke:', smallFontPath, '->', smallOutDir);
  if (usesGeneratedInput) {
    await fs.rm(smallInputDir, { recursive: true, force: true });
    await fs.rm(smallOutDir, { recursive: true, force: true });
    await fs.mkdir(smallInputDir, { recursive: true });
    await fs.writeFile(smallFontPath, buildMinimalTtf({
      familyName: 'Small Copy Original Smoke',
      subfamilyName: 'Regular',
      glyphCount: 3,
    }));
  }
  const result = await splitFont({
    fontPath: smallFontPath,
    outDir: smallOutDir,
    smallGlyphAction: 'copy-original',
    smallGlyphThreshold: 1000000,
    fontFamily: 'SmallCopyOriginalSmokeFont',
    silent: true,
  });
  console.log(JSON.stringify(result, null, 2));
  console.log('\nInspecting output:');
  console.log(JSON.stringify(await inspectSplitOutput({ outDir: smallOutDir }), null, 2));
} else {
  throw new Error(`Unknown smoke scenario: ${scenario}`);
}

async function fsExists(filePath) {
  const { access } = await import('node:fs/promises');
  return access(filePath).then(() => true).catch(() => false);
}
