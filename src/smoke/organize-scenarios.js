import fs from 'node:fs/promises';
import path from 'node:path';
import {
  inspectFontInputs,
  inspectSplitOutput,
  organizeFontDirectory,
  splitFontBatch,
} from '../font-split.js';
import { buildMinimalTtf } from './fixtures.js';
import {
  assertActionSuggestedArgsOmit,
  assertBatchPolicySummary,
  assertDirectoryWorkflowSummary,
  assertInspectFieldsExist,
  assertLayoutDecision,
  assertRecommendedNextActionInspectFields,
  assertSafeRecommendedBatchPreviewArgs,
  assertSourceSafetyDecision,
  assertStagingDirectoryDecision,
  assertSuggestedArgsPreserveMaxFiles,
} from './assertions.js';

async function fsExists(filePath) {
  return fs.access(filePath).then(() => true).catch(() => false);
}

async function runOrganizeDryRunSmoke() {
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
  assertSourceSafetyDecision(result.sourceSafetyDecision, {
    context: 'organize-dry-run',
    appliesToTool: 'organize_font_directory',
    expectedStatus: 'source-safe-no-write',
    expectedWritesFiles: false,
    expectedWritesSourceTree: false,
    expectedOutputTreeInsideInputTree: false,
    expectedOutputPathRole: 'outputDir',
    expectedRequiresOutputAudit: false,
  });
  if (result.layout?.layoutKind !== 'nested' || result.recommendedBatchOptions?.batchGroupBy !== 'source-dir') {
    throw new Error('Expected organization layout analysis to recommend source-dir grouping for nested input.');
  }
  assertSafeRecommendedBatchPreviewArgs(result.recommendedBatchPreviewArgs, {
    inputDir,
    batchGroupBy: 'source-dir',
    maxFiles: 10,
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
  assertSuggestedArgsPreserveMaxFiles(
    (result.recommendedNextActions || []).find((action) => action.id === 'decide-on-invalid-fonts'),
    10,
    'organize-dry-run decide-on-invalid-fonts action',
  );
  assertDirectoryWorkflowSummary(result.directoryWorkflowSummary, {
    context: 'organize-dry-run',
    expectedLayoutKind: 'nested',
    expectedRoute: 'decide-on-invalid-fonts',
    expectedCurrentStep: 'layout-plan',
    expectedReviewReason: 'invalid-fonts-skipped',
  });
  assertLayoutDecision(result.layoutDecision, {
    context: 'organize-dry-run',
    expectedLayoutKind: 'nested',
    expectedRoute: 'decide-on-invalid-fonts',
    expectedOperationMode: 'plan-only',
    expectedDirectStatus: 'available-after-invalid-font-decision',
    expectedStagingNeed: 'defer-until-review',
    expectedRecommendedMode: 'resolve-invalid-font-policy',
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
  assertSourceSafetyDecision(compact.sourceSafetyDecision, {
    context: 'organize-dry-run compact',
    appliesToTool: 'organize_font_directory',
    expectedStatus: 'source-safe-no-write',
    expectedWritesFiles: false,
    expectedWritesSourceTree: false,
    expectedOutputTreeInsideInputTree: false,
    expectedOutputPathRole: 'outputDir',
    expectedRequiresOutputAudit: false,
  });
  assertLayoutDecision(compact.layoutDecision, {
    context: 'organize-dry-run compact',
    expectedLayoutKind: 'nested',
    expectedRoute: 'decide-on-invalid-fonts',
    expectedOperationMode: 'plan-only',
    expectedDirectStatus: 'available-after-invalid-font-decision',
    expectedStagingNeed: 'defer-until-review',
    expectedRecommendedMode: 'resolve-invalid-font-policy',
  });
  if (
    compact.directoryWorkflowSummary?.planVisibility?.planIncluded !== false
    || !compact.directoryWorkflowSummary?.planVisibility?.detailsOmitted?.includes('plan')
    || !compact.directoryWorkflowSummary?.planVisibility?.availableSummaryFields?.includes('planActionSummary')
    || !compact.directoryWorkflowSummary?.planVisibility?.availableSummaryFields?.includes('layoutDecision')
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
}

async function runOrganizeCopySmoke() {
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
  assertSourceSafetyDecision(copied.sourceSafetyDecision, {
    context: 'organize-copy',
    appliesToTool: 'organize_font_directory',
    expectedStatus: 'source-safe-output-tree-write',
    expectedWritesFiles: true,
    expectedWritesSourceTree: false,
    expectedOutputTreeInsideInputTree: false,
    expectedOutputPathRole: 'outputDir',
    expectedRequiresOutputAudit: false,
  });
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
    || copied.organizationDecision?.safeBatchPreviewArgs?.maxFiles !== 10
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
  const organizedPreviewStep = copied.directoryWorkflowSummary?.workflowSteps
    ?.find((step) => step.id === 'preview-batch-split-organized-output');
  const copyOnlyStagingChecklistItem = copied.sourceLayoutMismatchSummary?.decisionChecklist?.items
    ?.find((item) => item.id === 'copy-only-staging');
  if (
    copied.sourceLayoutMismatchSummary?.copyOnlyStaging?.safePreviewArgs?.inputDir !== outputDir
    || copied.sourceLayoutMismatchSummary?.copyOnlyStaging?.safePreviewArgs?.maxFiles !== 10
    || copied.sourceLayoutMismatchSummary?.copyOnlyStaging?.suggestedArgsField !== 'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs'
    || copyOnlyStagingChecklistItem?.safePreviewArgs?.inputDir !== outputDir
    || copyOnlyStagingChecklistItem?.safePreviewArgs?.maxFiles !== 10
    || copyOnlyStagingChecklistItem?.suggestedArgsField !== 'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs'
  ) {
    throw new Error('Expected organize-copy sourceLayoutMismatchSummary copy-only staging guidance to expose copyable safePreviewArgs with maxFiles.');
  }
  if (
    organizedPreviewStep?.suggestedArgsField !== 'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs'
    || organizedPreviewStep?.suggestedArgs?.inputDir !== outputDir
    || organizedPreviewStep?.suggestedArgs?.maxFiles !== 10
  ) {
    throw new Error('Expected organize-copy workflowSteps preview step to point at the canonical copy-only staging safePreviewArgs.');
  }
  assertLayoutDecision(copied.layoutDecision, {
    context: 'organize-copy',
    expectedLayoutKind: 'nested',
    expectedRoute: 'preview-organized-output',
    expectedOperationMode: 'copy-only',
    expectedDirectStatus: 'use-organized-output',
    expectedStagingNeed: 'already-written-copy-only',
    expectedRecommendedMode: 'preview-organized-output',
  });
  if (copied.layoutDecision?.directoryHandling?.safePreviewArgs?.maxFiles !== 10) {
    throw new Error('Expected organize-copy layoutDecision.directoryHandling.safePreviewArgs to preserve maxFiles.');
  }
  assertStagingDirectoryDecision(copied.stagingDirectoryDecision, {
    context: 'organize-copy',
    expectedStatus: 'ready-for-source-preflight',
    expectedOutputDir: outputDir,
    expectedCopiedCount: 1,
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
  const inspectCopiedAction = (copied.recommendedNextActions || []).find((action) => action.id === 'inspect-organized-output');
  if (
    copiedBatchAction?.suggestedArgs?.workflowPreset !== 'safe-preview'
    || copiedBatchAction?.suggestedArgsField !== 'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs'
    || copiedBatchAction?.suggestedArgs?.batchGroupBy !== 'source-dir'
  ) {
    throw new Error('Expected organized-output batch preview action to use safe-preview with source-dir grouping only as the scene-specific override.');
  }
  assertSuggestedArgsPreserveMaxFiles(inspectCopiedAction, 10, 'inspect-organized-output suggestedArgs');
  assertSuggestedArgsPreserveMaxFiles(copiedBatchAction, 10, 'preview-batch-split-organized-output suggestedArgs');
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
  if (
    manifest.summary?.safetySummary?.sourceDestructive !== false
    || manifest.summary?.safetySummary?.writeScope !== 'output-tree-only'
    || manifest.summary?.sourceSafetyDecision?.status !== 'source-safe-output-tree-write'
  ) {
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
  assertSourceSafetyDecision(overwritten.sourceSafetyDecision, {
    context: 'organize-copy overwrite',
    appliesToTool: 'organize_font_directory',
    expectedStatus: 'source-safe-output-tree-write',
    expectedWritesFiles: true,
    expectedWritesSourceTree: false,
    expectedOutputTreeInsideInputTree: false,
    expectedOutputPathRole: 'outputDir',
    expectedRequiresOutputAudit: false,
  });
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
}

async function runOrganizeValidFontSmoke() {
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
  if (!inspection.files?.every((file) => file.identityBasis === 'typographic-family-subfamily')) {
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
  if (
    result.dedupeDecisionSummary?.summaryType !== 'dedupe-decision-summary'
    || result.dedupeDecisionSummary?.appliesToTool !== 'organize_font_directory'
    || result.dedupeDecisionSummary?.requestedMode !== 'font-identity'
    || result.dedupeDecisionSummary?.effectiveMode !== 'font-identity'
    || result.dedupeDecisionSummary?.skippedDuplicateCount !== 1
    || result.dedupeDecisionSummary?.identityKeyMissingCount !== 0
    || result.dedupeDecisionSummary?.pathFallbackUsed !== false
    || result.dedupeDecisionSummary?.identityEvidenceSummary?.summaryType !== 'dedupe-identity-evidence'
    || result.dedupeDecisionSummary?.identityEvidenceSummary?.identityDedupeEvidenceAvailable !== true
    || !result.dedupeDecisionSummary?.identityEvidenceSummary?.identityBasisCounts?.some((item) => item.basis === 'typographic-family-subfamily' && item.count === 2)
    || result.dedupeDecisionSummary?.identityEvidenceSummary?.duplicateExampleCount !== 1
    || result.dedupeDecisionSummary?.identityEvidenceSummary?.duplicateExamples?.[0]?.identityBasis !== 'typographic-family-subfamily'
    || !result.dedupeDecisionSummary?.identityEvidenceSummary?.duplicateExamples?.[0]?.identityKey?.includes('"family":"fixture sans"')
  ) {
    throw new Error('Expected valid-font organization to expose compact dedupeDecisionSummary identity evidence.');
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
    maxFiles: 10,
  }, 'organize-valid-font');
  assertStagingDirectoryDecision(result.stagingDirectoryDecision, {
    context: 'organize-valid-font',
    expectedStatus: 'ready-for-source-preflight',
    expectedOutputDir: outputDir,
    expectedCopiedCount: 1,
  });
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
}

async function runOrganizeStructureOnlySmoke() {
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
  if (
    result.dedupeDecisionSummary?.requestedMode !== 'font-identity'
    || result.dedupeDecisionSummary?.effectiveMode !== 'same-path'
    || result.dedupeDecisionSummary?.dedupeLimitedByParsing !== true
    || result.dedupeDecisionSummary?.pathFallbackUsed !== true
    || result.dedupeDecisionSummary?.identityDedupeAvailable !== false
  ) {
    throw new Error('Expected structure-only organization dedupeDecisionSummary to explain same-path fallback.');
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
    maxFiles: 10,
  }, 'organize-structure-only');
  const rerunWithParsingAction = (result.recommendedNextActions || []).find((action) => action.id === 'rerun-with-font-parsing');
  if (
    rerunWithParsingAction?.suggestedArgs?.workflowPreset !== 'safe-preview'
    || rerunWithParsingAction?.suggestedArgs?.batchGroupBy !== 'font-family'
    || !rerunWithParsingAction?.inspectFields?.includes('organizationDecision')
  ) {
    throw new Error('Expected rerun-with-font-parsing to use safe-preview, preserve only the metadata-family grouping override, and inspect organizationDecision.');
  }
  assertSuggestedArgsPreserveMaxFiles(rerunWithParsingAction, 10, 'rerun-with-font-parsing suggestedArgs');
  assertActionSuggestedArgsOmit(rerunWithParsingAction, ['dryRun', 'parseFonts', 'includePlan', 'batchNamingMode', 'batchDedupeMode', 'overwriteExisting'], 'rerun-with-font-parsing suggestedArgs');
  const structurePreviewAction = (result.recommendedNextActions || []).find((action) => action.id === 'preview-batch-split-original-layout');
  if (
    structurePreviewAction?.suggestedArgs?.workflowPreset !== 'safe-preview'
    || structurePreviewAction?.suggestedArgs?.batchGroupBy !== 'source-dir'
    || !structurePreviewAction?.inspectFields?.includes('batchDecision')
  ) {
    throw new Error('Expected structure-only batch preview action to use safe-preview with source-dir grouping and inspect batchDecision.');
  }
  assertSuggestedArgsPreserveMaxFiles(structurePreviewAction, 10, 'preview-batch-split-original-layout suggestedArgs');
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
}

async function runOrganizeOutputInsideInputSmoke() {
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
  assertSourceSafetyDecision(result.sourceSafetyDecision, {
    context: 'organize-output-inside-input dry-run',
    appliesToTool: 'organize_font_directory',
    expectedStatus: 'source-safe-no-write',
    expectedWritesFiles: false,
    expectedWritesSourceTree: false,
    expectedOutputTreeInsideInputTree: true,
    expectedOutputPathRole: 'outputDir',
    expectedRequiresOutputAudit: false,
  });
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
  assertSourceSafetyDecision(copiedInside.sourceSafetyDecision, {
    context: 'organize-output-inside-input copy',
    appliesToTool: 'organize_font_directory',
    expectedStatus: 'source-safe-output-inside-input-tree',
    expectedWritesFiles: true,
    expectedWritesSourceTree: true,
    expectedOutputTreeInsideInputTree: true,
    expectedOutputPathRole: 'outputDir',
    expectedRequiresOutputAudit: false,
  });
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
  assertSourceSafetyDecision(batchInside.sourceSafetyDecision, {
    context: 'organize-output-inside-input batch write',
    appliesToTool: 'split_font_batch',
    expectedStatus: 'source-safe-output-inside-input-tree',
    expectedWritesFiles: true,
    expectedWritesSourceTree: true,
    expectedOutputTreeInsideInputTree: true,
    expectedOutputPathRole: 'outputRoot',
    expectedRequiresOutputAudit: true,
  });
  const batchInsideInspect = await inspectSplitOutput({
    outDir: batchOutputRoot,
    includeFiles: false,
    includeFamilies: false,
  });
  if (batchInsideInspect.structureSummary?.conforms !== true) {
    throw new Error('Expected nested batch outputRoot to remain structurally valid when inspected directly.');
  }

  console.log(JSON.stringify({ result, copiedInside, batchInside, batchInsideInspect }, null, 2));
}

export {
  runOrganizeDryRunSmoke,
  runOrganizeCopySmoke,
  runOrganizeValidFontSmoke,
  runOrganizeStructureOnlySmoke,
  runOrganizeOutputInsideInputSmoke,
};
