import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getRuntimeStatus,
  inspectFontInputs,
  inspectSplitOutput,
  organizeFontDirectory,
  splitFontBatch,
} from '../font-split.js';
import { buildMinimalTtf } from './fixtures.js';
import {
  assertOutputAuditStatus,
  assertSafeRecommendedBatchPreviewArgs,
} from './assertions.js';

async function runRuntimeStatusSmoke() {
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
}

async function runFontInputsSmoke() {
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
  if (
    result.inputCountGuide?.summaryType !== 'input-count-guide'
    || result.inputCountGuide?.appliesToTool !== 'inspect_font_inputs'
    || result.inputCountGuide?.countCompleteness !== 'complete-for-scanned-root'
    || result.inputCountGuide?.scannedFileCount !== result.scannedFileCount
    || result.inputCountGuide?.supportedFontCount !== result.supportedFontCount
    || result.inputCountGuide?.unsupportedFileCount !== result.unsupportedFileCount
    || result.inputCountGuide?.filesIncluded !== true
    || result.inputCountGuide?.fileDetailsVisibility !== 'included'
    || result.inputCountGuide?.unsupportedFilesHandling?.archivesExtracted !== false
    || result.inputCountGuide?.unsupportedFilesHandling?.unsupportedFilesIgnored !== true
    || result.inputCountGuide?.recommendedAction !== 'continue'
  ) {
    throw new Error('Expected input inspection to expose an inputCountGuide for scan count interpretation.');
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
  assertSafeRecommendedBatchPreviewArgs(result.recommendedBatchPreviewArgs, {
    inputDir,
    batchGroupBy: 'font-family',
    maxFiles: 10,
  }, 'font-inputs invalid-root');
  if (
    result.layout?.layoutKind !== 'flat'
    || result.layout?.recommendedBatchOptions?.batchGroupBy !== 'font-family'
    || result.inputDirectoryDecision?.summaryType !== 'input-directory-decision'
    || result.inputDirectoryDecision?.appliesToTool !== 'inspect_font_inputs'
    || result.inputDirectoryDecision?.recommendedMode !== 'review-invalid-fonts'
    || result.inputDirectoryDecision?.preferredNextTool !== 'inspect_font_inputs'
    || result.inputDirectoryDecision?.writesFilesBeforeReview !== false
    || result.inputDirectoryDecision?.sourceDestructive !== false
    || result.inputDirectoryDecision?.safeBatchPreviewArgs?.workflowPreset !== 'safe-preview'
    || result.inputDirectoryDecision?.safeBatchPreviewArgs?.maxFiles !== 10
    || result.inputDirectoryDecision?.safeOrganizationPreviewArgs?.workflowPreset !== 'safe-preview'
    || result.inputDirectoryDecision?.safeOrganizationPreviewArgs?.maxFiles !== 10
    || result.inputDirectoryDecision?.evidence?.hasArchives !== true
    || !result.inputDirectoryDecision?.mustInspectFields?.includes('recommendedBatchPreviewArgs')
    || !result.inputDirectoryDecision?.nonIntuitiveBehavior?.some((item) => item.includes('never writes output'))
  ) {
    throw new Error('Expected input inspection to expose inputDirectoryDecision for invalid-font triage.');
  }
  const layoutDir = `${inputDir}-layout`;
  await fs.rm(layoutDir, { recursive: true, force: true });
  await fs.mkdir(path.join(layoutDir, 'Nested'), { recursive: true });
  const layoutFixtureFont = buildMinimalTtf({
    familyName: 'Layout Fixture',
    subfamilyName: 'Regular',
    glyphCount: 4,
  });
  await fs.writeFile(path.join(layoutDir, 'Root-Regular.ttf'), layoutFixtureFont);
  await fs.writeFile(path.join(layoutDir, 'Nested', 'Nested-Regular.ttf'), layoutFixtureFont);
  const mixedLayout = await inspectFontInputs({
    inputDir: layoutDir,
    maxFiles: 20,
    includeFiles: false,
  });
  assertSafeRecommendedBatchPreviewArgs(mixedLayout.recommendedBatchPreviewArgs, {
    inputDir: layoutDir,
    batchGroupBy: 'source-dir',
    maxFiles: 20,
  }, 'font-inputs mixed-layout');
  if (
    mixedLayout.layout?.layoutKind !== 'mixed'
    || mixedLayout.inputDirectoryDecision?.recommendedMode !== 'organize-safe-preview-first'
    || mixedLayout.inputDirectoryDecision?.preferredNextTool !== 'organize_font_directory'
    || mixedLayout.inputDirectoryDecision?.directoryStructureRisk !== 'high'
    || mixedLayout.inputDirectoryDecision?.safeOrganizationPreviewArgs?.inputDir !== layoutDir
    || mixedLayout.inputDirectoryDecision?.safeOrganizationPreviewArgs?.workflowPreset !== 'safe-preview'
    || mixedLayout.inputDirectoryDecision?.safeOrganizationPreviewArgs?.maxFiles !== 20
    || mixedLayout.inputDirectoryDecision?.suggestedArgs?.workflowPreset !== 'safe-preview'
    || mixedLayout.inputDirectoryDecision?.suggestedArgs?.maxFiles !== 20
    || mixedLayout.inputDirectoryDecision?.evidence?.rootFontCount !== 1
    || mixedLayout.inputDirectoryDecision?.evidence?.nestedFontCount !== 1
  ) {
    throw new Error('Expected mixed input inspection to recommend non-destructive organization safe-preview first.');
  }
  const truncated = await inspectFontInputs({
    inputDir,
    maxFiles: 1,
    includeFiles: false,
  });
  if (truncated.scannedFileCount !== 1 || truncated.maxFilesHit !== true || truncated.filesIncluded !== false) {
    throw new Error('Expected input inspection to report accurate maxFiles truncation.');
  }
  if (
    truncated.inputCountGuide?.summaryType !== 'input-count-guide'
    || truncated.inputCountGuide?.countCompleteness !== 'truncated'
    || truncated.inputCountGuide?.fileDetailsVisibility !== 'omitted-by-request'
    || truncated.inputCountGuide?.filesIncluded !== false
    || truncated.inputCountGuide?.recommendedAction !== 'rerun-with-higher-maxFiles-before-trusting-counts'
    || !truncated.inputCountGuide?.nonIntuitiveBehavior?.some((item) => item.includes('filesIncluded false'))
    || !truncated.inputCountGuide?.nonIntuitiveBehavior?.some((item) => item.includes('maxFilesHit true'))
  ) {
    throw new Error('Expected truncated input inspection to explain incomplete counts and omitted file details.');
  }
  const truncatedInputWarningCodes = new Set((truncated.inspectionWarnings || []).map((warning) => warning.code));
  for (const expectedWarning of ['input-scan-truncated', 'input-files-omitted']) {
    if (!truncatedInputWarningCodes.has(expectedWarning)) {
      throw new Error(`Expected input inspection warning ${expectedWarning}.`);
    }
  }
  console.log(JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ truncated }, null, 2));
}

async function runScanLimitsSmoke() {
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
  if (
    inputInspect.inputCountGuide?.countCompleteness !== 'truncated'
    || inputInspect.inputCountGuide?.fileDetailsVisibility !== 'omitted-by-request'
    || inputInspect.inputCountGuide?.recommendedAction !== 'rerun-with-higher-maxFiles-before-trusting-counts'
  ) {
    throw new Error('Expected inspectFontInputs inputCountGuide to explain truncated scan limits.');
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
    batchPlan.inputCountGuide?.summaryType !== 'input-count-guide'
    || batchPlan.inputCountGuide?.appliesToTool !== 'split_font_batch'
    || batchPlan.inputCountGuide?.supportedFieldName !== 'discoveredFontCount'
    || batchPlan.inputCountGuide?.countCompleteness !== 'truncated'
    || batchPlan.inputCountGuide?.fileDetailsVisibility !== 'not-returned-by-this-tool'
    || batchPlan.inputCountGuide?.unsupportedFilesHandling?.unsupportedFilesSplitByBatch !== false
  ) {
    throw new Error('Expected splitFontBatch to expose inputCountGuide for scanned source counts.');
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
}

async function runWorkspaceRootPathSmoke() {
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
}

export {
  runRuntimeStatusSmoke,
  runFontInputsSmoke,
  runScanLimitsSmoke,
  runWorkspaceRootPathSmoke,
};
