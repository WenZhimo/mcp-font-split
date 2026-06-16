import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  BATCH_DEDUPE_MODES,
  BATCH_ERROR_MODES,
  BATCH_GROUP_BY_MODES,
  BATCH_NAMING_MODES,
  GUIDANCE_DETAIL_LEVELS,
  GUIDANCE_WORKFLOWS,
  OVERSIZED_KERN_ACTIONS,
  SKIP_MODES,
  SMALL_GLYPH_ACTIONS,
  SPLIT_FAILURE_ACTIONS,
  WORKFLOW_PRESET_NAMES,
  getAgentGuidance,
  getRuntimeStatus,
  inspectFontInputs,
  inspectSplitOutput,
  organizeFontDirectory,
  splitFont,
  splitFontBatch,
} from './font-split.js';
import { runMcpErrorSmoke, runMcpSchemaSmoke } from './smoke/mcp-scenarios.js';
import { buildMinimalTtf } from './smoke/fixtures.js';
import { runApiDocsSmoke, runBehaviorDocsSmoke } from './smoke/docs-checks.js';
import {
  assertInspectFieldsExist,
  assertRecommendedNextActionInspectFields,
  assertSourceLayoutDecisionChecklistCompanionFields,
  assertNonEmptyString,
  assertNonEmptyStringArray,
  assertNonEmptyArray,
  assertGuidanceItemsHaveCompletionProof,
  assertDirectoryRouteInspectFields,
  assertNextToolDecisionSummary,
  assertRecommendedWorkflowPlanHasCompletionProof,
  assertBatchPolicyGuide,
  assertBatchPolicySummary,
  assertConfigurationTrace,
  assertSourceSafetyDecision,
  assertDirectoryWorkflowSummary,
  assertLayoutDecision,
  assertStagingDirectoryDecision,
  assertTemplateOmitsArgs,
  assertObjectOmitsKeys,
  assertOutputAuditStatus,
  assertActionSuggestedArgsOmit,
  isInsidePath,
  assertSafeRecommendedBatchPreviewArgs,
  assertSuggestedArgsPreserveMaxFiles,
} from './smoke/assertions.js';
import {
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
} from './smoke/real-corpus.js';

const execFileAsync = promisify(execFile);
const scenario = process.argv[2] || 'single';
const fontPath = process.argv[3] || '0xA000/0xA000-Regular.ttf';
const outDir = process.argv[4] || 'font-split-mcp/.font-split-smoke-output';
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
    || defaultGuidance.projectStatusNotice?.summaryType !== 'project-status-notice'
    || defaultGuidance.toolSafetyQuickReference?.summaryType !== 'tool-safety-quick-reference'
    || !defaultGuidance.safeInvocationTemplates?.length
    || defaultGuidance.localVerificationOutputGuide?.primaryDecisionField !== 'reliabilityGateDecision'
    || !defaultGuidance.directoryHandlingModeCatalog?.['preview-original-input']
    || defaultGuidance.directoryOrganizationQuickAnswer?.summaryType !== 'directory-organization-quick-answer'
    || !defaultGuidance.directoryWorkflowDecisionMatrix?.length
    || !defaultGuidance.configurationRecipes?.length
    || !defaultGuidance.batchPolicyGuide?.length
    || !defaultGuidance.batchCustomizationQuickReference?.length
    || defaultGuidance.toolOptionCatalog?.summaryType !== 'tool-option-catalog'
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
    || result.guidanceView.availableSections.length !== new Set(result.guidanceView.availableSections).size
    || result.guidanceView.sectionsIncluded.length !== new Set(result.guidanceView.sectionsIncluded).size
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
    || compactGuidance.projectStatusNotice?.summaryType !== 'project-status-notice'
    || compactGuidance.toolSafetyQuickReference?.summaryType !== 'tool-safety-quick-reference'
    || !compactGuidance.safeInvocationTemplates?.length
    || compactGuidance.localVerificationOutputGuide?.primaryDecisionField !== 'reliabilityGateDecision'
    || !compactGuidance.directoryHandlingModeCatalog?.['preview-organized-output']
    || compactGuidance.directoryOrganizationQuickAnswer?.summaryType !== 'directory-organization-quick-answer'
    || !compactGuidance.directoryWorkflowDecisionMatrix?.length
    || !compactGuidance.configurationRecipes?.length
    || !compactGuidance.batchPolicyGuide?.length
    || !compactGuidance.batchCustomizationQuickReference?.length
    || compactGuidance.toolOptionCatalog?.summaryType !== 'tool-option-catalog'
    || !compactGuidance.fontIdentityBasisCatalog?.['typographic-family-subfamily']
    || !compactGuidance.fontIdentityBasisCatalog?.['opentype-family-subfamily']
    || !compactGuidance.outputStructureCatalog?.layoutKinds?.['family-tree']
    || !compactGuidance.outputStructureCatalog?.issueCodes?.['missing-manifests']
    || !compactGuidance.unsupportedFileCategoryCatalog?.archive
    || compactGuidance.guidanceView.availableSections.length !== new Set(compactGuidance.guidanceView.availableSections).size
    || compactGuidance.guidanceView.sectionsIncluded.length !== new Set(compactGuidance.guidanceView.sectionsIncluded).size
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
    || Object.hasOwn(workflowOnlyGuidance, 'directoryHandlingModeCatalog')
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
    || Object.hasOwn(catalogGuidance, 'directoryHandlingModeCatalog')
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
  if (
    !result.responseFieldsToCheck?.includes('projectStatusNotice')
    || result.toolResponseFieldCatalog?.projectStatusNotice?.sourceTools?.[0] !== 'get_agent_guidance'
    || !result.toolResponseFieldCatalog?.projectStatusNotice?.agentAction?.includes('current')
  ) {
    throw new Error('Expected agent guidance to expose projectStatusNotice as the pre-release change policy.');
  }
  if (
    result.projectStatusNotice?.summaryType !== 'project-status-notice'
    || result.projectStatusNotice?.formalRelease !== false
    || result.projectStatusNotice?.forwardCompatibilityPolicy?.required !== false
    || result.projectStatusNotice?.forwardCompatibilityPolicy?.removeUnreleasedCompatibilityCruft !== true
    || !result.projectStatusNotice?.authoritativeSources?.includes('get_agent_guidance')
    || !result.projectStatusNotice?.authoritativeSources?.includes('API.md / API.zh-CN.md')
    || !result.projectStatusNotice?.nonIntuitiveBehavior?.some((item) => item.includes('may change'))
  ) {
    throw new Error('Expected projectStatusNotice to describe pre-release status, current-source authority, and no forward-compatibility requirement.');
  }
  if (!result.responseFieldsToCheck?.includes('workflowPresets') || !result.responseFieldsToCheck?.includes('workflowPreset')) {
    throw new Error('Expected agent guidance to recommend checking workflow preset fields.');
  }
  if (!result.responseFieldsToCheck?.includes('configurationRecipes')) {
    throw new Error('Expected agent guidance to recommend checking configuration recipes.');
  }
  if (
    !result.responseFieldsToCheck?.includes('batchCustomizationQuickReference')
    || result.toolResponseFieldCatalog?.batchCustomizationQuickReference?.sourceTools?.[0] !== 'get_agent_guidance'
    || !result.toolResponseFieldCatalog?.batchCustomizationQuickReference?.agentAction?.includes('smallest explicit override')
  ) {
    throw new Error('Expected agent guidance to expose batchCustomizationQuickReference as the compact customization entrypoint.');
  }
  if (
    !result.responseFieldsToCheck?.includes('directoryOrganizationQuickAnswer')
    || result.toolResponseFieldCatalog?.directoryOrganizationQuickAnswer?.sourceTools?.[0] !== 'get_agent_guidance'
    || !result.toolResponseFieldCatalog?.directoryOrganizationQuickAnswer?.agentAction?.includes('safe-preview')
  ) {
    throw new Error('Expected agent guidance to expose directoryOrganizationQuickAnswer as the compact directory safety answer.');
  }
  if (
    !result.responseFieldsToCheck?.includes('toolSafetyQuickReference')
    || result.toolResponseFieldCatalog?.toolSafetyQuickReference?.sourceTools?.[0] !== 'get_agent_guidance'
    || !result.toolResponseFieldCatalog?.toolSafetyQuickReference?.agentAction?.includes('source-destructive')
  ) {
    throw new Error('Expected agent guidance to expose toolSafetyQuickReference as the compact per-tool safety answer.');
  }
  const toolSafetyQuickReference = result.toolSafetyQuickReference || {};
  const safetyEntryByTool = new Map((toolSafetyQuickReference.tools || []).map((item) => [item.tool, item]));
  const organizerSafety = safetyEntryByTool.get('organize_font_directory');
  const batchSafety = safetyEntryByTool.get('split_font_batch');
  const singleSafety = safetyEntryByTool.get('split_font');
  const inspectSafety = safetyEntryByTool.get('inspect_font_inputs');
  const outputInspectSafety = safetyEntryByTool.get('inspect_split_output');
  if (
    toolSafetyQuickReference.summaryType !== 'tool-safety-quick-reference'
    || safetyEntryByTool.size !== 7
    || inspectSafety?.defaultWritesFiles !== false
    || inspectSafety?.sourceDestructive !== false
    || organizerSafety?.defaultWritesFiles !== false
    || organizerSafety?.reviewedWriteMode !== 'copy-only-outputDir'
    || organizerSafety?.sourceDestructive !== false
    || organizerSafety?.sourceFilesMovedDeletedOrRewritten !== false
    || organizerSafety?.sourceBackupRequired !== false
    || !organizerSafety?.mustInspectFields?.includes('sourceSafetyDecision')
    || !organizerSafety?.mustInspectFields?.includes('safetySummary')
    || batchSafety?.defaultWritesFiles !== true
    || batchSafety?.safePreviewArgs?.workflowPreset !== 'safe-preview'
    || batchSafety?.sourceDestructive !== false
    || batchSafety?.outputAuditRequiredAfterWrite !== true
    || singleSafety?.defaultWritesFiles !== true
    || singleSafety?.sourceDestructive !== false
    || !outputInspectSafety?.mustInspectFields?.includes('outputRoleDecision')
    || !toolSafetyQuickReference.nonIntuitiveBehavior?.some((item) => item.includes('writesSourceTree true'))
  ) {
    throw new Error('Expected toolSafetyQuickReference to summarize per-tool write and source safety behavior.');
  }
  if (
    !result.responseFieldsToCheck?.includes('configurationTrace')
    || result.toolResponseFieldCatalog?.configurationTrace?.sourceTools?.[0] !== 'split_font_batch'
    || !result.toolResponseFieldCatalog?.configurationTrace?.agentAction?.includes('overrode the preset')
  ) {
    throw new Error('Expected agent guidance to explain configurationTrace for preset and explicit override provenance.');
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
    'inputCountGuide',
    'inputDirectoryDecision',
    'layout',
    'layout.layoutKind',
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
    !result.responseFieldsToCheck?.includes('outputRoleDecision')
    || !result.responseFieldsToCheck?.includes('outputStructureDecision')
    || !result.responseFieldsToCheck?.includes('auditStatus')
    || !result.responseFieldsToCheck?.includes('auditPassed')
    || !result.responseFieldsToCheck?.includes('auditBlockingReasons')
  ) {
    throw new Error('Expected agent guidance to tell agents to check output role, compact output structure decision, and audit status fields.');
  }
  if (!result.responseFieldsToCheck?.includes('organizationWarnings')) {
    throw new Error('Expected agent guidance to recommend checking organization warnings.');
  }
  if (!result.responseFieldsToCheck?.includes('recommendedNextActions')) {
    throw new Error('Expected agent guidance to recommend checking organization next actions.');
  }
  if (
    !result.responseFieldsToCheck?.includes('recommendedNextActions[].suggestedArgsField')
    || !result.toolResponseFieldCatalog?.['recommendedNextActions[].suggestedArgsField']?.meaning?.includes('Canonical response field')
    || !result.toolResponseFieldCatalog?.['recommendedNextActions[].suggestedArgsField']?.agentAction?.includes('suggestedArgs')
  ) {
    throw new Error('Expected agent guidance to explain recommendedNextActions suggestedArgsField canonical args sources.');
  }
  if (
    !result.responseFieldsToCheck?.includes('recommendedNextActions[].suggestedArgs.maxFiles')
    || !result.toolResponseFieldCatalog?.['recommendedNextActions[].suggestedArgs.maxFiles']?.meaning?.includes('scan cap')
  ) {
    throw new Error('Expected agent guidance to explain recommendedNextActions suggestedArgs maxFiles preservation.');
  }
  if (!result.responseFieldsToCheck?.includes('planActionSummary')) {
    throw new Error('Expected agent guidance to recommend checking organization plan action summaries.');
  }
  if (!result.responseFieldsToCheck?.includes('organizationDecision')) {
    throw new Error('Expected agent guidance to recommend checking organization decision summaries.');
  }
  if (!result.responseFieldsToCheck?.includes('stagingDirectoryDecision')) {
    throw new Error('Expected agent guidance to recommend checking staging directory decision summaries.');
  }
  if (!result.responseFieldsToCheck?.includes('sourceLayoutMismatchSummary.decisionChecklist')) {
    throw new Error('Expected agent guidance to recommend checking source layout decision checklist summaries.');
  }
  if (
    !result.responseFieldsToCheck?.includes('sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs')
    || !result.responseFieldsToCheck?.includes('sourceLayoutMismatchSummary.decisionChecklist.items[].safePreviewArgs')
    || !result.toolResponseFieldCatalog?.['sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs']?.meaning?.includes('organized staging directory')
  ) {
    throw new Error('Expected agent guidance to explain copy-only staging safePreviewArgs for organized-output previews.');
  }
  if (
    !result.responseFieldsToCheck?.includes('layoutDecision.directoryHandling.recommendedMode')
    || !result.responseFieldsToCheck?.includes('directoryHandlingModeCatalog')
  ) {
    throw new Error('Expected agent guidance to recommend checking directory handling mode catalog fields.');
  }
  if (!result.responseFieldsToCheck?.includes('warningCodeCatalog')) {
    throw new Error('Expected agent guidance to recommend checking the warning code catalog.');
  }
  if (!result.responseFieldsToCheck?.includes('toolResponseFieldCatalog')) {
    throw new Error('Expected agent guidance to recommend checking the tool response field catalog.');
  }
  if (!result.responseFieldsToCheck?.includes('toolOptionCatalog')) {
    throw new Error('Expected agent guidance to recommend checking the tool option catalog.');
  }
  if (!result.responseFieldsToCheck?.includes('fontIdentityBasisCatalog')) {
    throw new Error('Expected agent guidance to recommend checking the font identity basis catalog.');
  }
  const identityCatalogGuidance = getAgentGuidance({ sections: ['identity-catalog'] });
  if (
    identityCatalogGuidance.guidanceView?.sectionsIncluded?.length !== 1
    || identityCatalogGuidance.guidanceView.sectionsIncluded[0] !== 'identity-catalog'
    || !identityCatalogGuidance.fontIdentityBasisCatalog?.['typographic-family-subfamily']?.nameIds?.includes(16)
    || !identityCatalogGuidance.fontIdentityBasisCatalog?.['opentype-family-subfamily']?.nameIds?.includes(1)
    || identityCatalogGuidance.fontIdentityBasisCatalog?.['path-fallback']?.semanticIdentity === true
    || Object.hasOwn(identityCatalogGuidance, 'toolOptionCatalog')
    || Object.hasOwn(identityCatalogGuidance, 'toolResponseFieldCatalog')
    || Object.hasOwn(identityCatalogGuidance, 'safeInvocationTemplates')
  ) {
    throw new Error('Expected focused identity-catalog guidance to explain identity basis values without unrelated sections.');
  }
  if (
    !result.fontIdentityBasisCatalog?.['full-name']
    || !result.fontIdentityBasisCatalog?.['postscript-name']
    || result.fontIdentityBasisCatalog?.['typographic-family-subfamily']?.priority !== 1
    || result.fontIdentityBasisCatalog?.['opentype-family-subfamily']?.priority !== 2
    || !result.toolResponseFieldCatalog?.fontIdentityBasisCatalog
    || !result.toolResponseFieldCatalog?.identityBasis
    || !result.toolResponseFieldCatalog?.['dedupeDecisionSummary.identityEvidenceSummary.identityBasisCounts']
  ) {
    throw new Error('Expected full guidance to expose fontIdentityBasisCatalog and response-field catalog entries.');
  }
  if (!result.responseFieldsToCheck?.includes('outputStructureCatalog')) {
    throw new Error('Expected agent guidance to recommend checking the output structure catalog.');
  }
  const outputCatalogGuidance = getAgentGuidance({ sections: ['output-catalog'] });
  if (
    outputCatalogGuidance.guidanceView?.sectionsIncluded?.length !== 1
    || outputCatalogGuidance.guidanceView.sectionsIncluded[0] !== 'output-catalog'
    || !outputCatalogGuidance.outputStructureCatalog?.layoutKinds?.['single-family']
    || !outputCatalogGuidance.outputStructureCatalog?.layoutKinds?.['family-tree']
    || !outputCatalogGuidance.outputStructureCatalog?.issueCodes?.['unexpected-output-files']
    || !outputCatalogGuidance.outputStructureCatalog?.issueCodes?.['web-output-missing']
    || !outputCatalogGuidance.outputStructureCatalog?.auditStatuses?.pass
    || Object.hasOwn(outputCatalogGuidance, 'toolOptionCatalog')
    || Object.hasOwn(outputCatalogGuidance, 'toolResponseFieldCatalog')
    || Object.hasOwn(outputCatalogGuidance, 'safeInvocationTemplates')
  ) {
    throw new Error('Expected focused output-catalog guidance to explain output structure audit values without unrelated sections.');
  }
  if (
    !result.outputStructureCatalog?.outputModes?.subset
    || !result.outputStructureCatalog?.outputModes?.['single-woff2']
    || !result.outputStructureCatalog?.outputModes?.['copy-original']
    || !result.toolResponseFieldCatalog?.outputStructureCatalog
    || !result.toolResponseFieldCatalog?.['structureSummary.layoutKind']
    || !result.toolResponseFieldCatalog?.['structureSummary.issues[].code']
  ) {
    throw new Error('Expected full guidance to expose outputStructureCatalog and response-field catalog entries.');
  }
  if (
    !result.responseFieldsToCheck?.includes('errorResponseCatalog')
    || !result.toolResponseFieldCatalog?.errorResponseCatalog
    || result.errorResponseCatalog?.configurationError?.detailsSummaryType !== 'configuration-error'
  ) {
    throw new Error('Expected agent guidance to describe structured MCP error responses.');
  }
  const optionCatalogGuidance = getAgentGuidance({ sections: ['option-catalog'] });
  if (
    optionCatalogGuidance.guidanceView?.sectionsIncluded?.length !== 1
    || optionCatalogGuidance.guidanceView.sectionsIncluded[0] !== 'option-catalog'
    || optionCatalogGuidance.toolOptionCatalog?.summaryType !== 'tool-option-catalog'
    || Object.hasOwn(optionCatalogGuidance, 'toolResponseFieldCatalog')
    || Object.hasOwn(optionCatalogGuidance, 'safeInvocationTemplates')
  ) {
    throw new Error('Expected focused option-catalog guidance to return only the tool option catalog section.');
  }
  if (
    result.toolOptionCatalog?.summaryType !== 'tool-option-catalog'
    || !result.toolResponseFieldCatalog?.toolOptionCatalog
    || !result.toolOptionCatalog?.split_font_batch?.options?.workflowPreset?.allowedValues?.includes('safe-preview')
    || !result.toolOptionCatalog?.split_font_batch?.options?.workflowPreset?.allowedValues?.includes('reviewed-write')
    || result.toolOptionCatalog?.split_font_batch?.options?.dryRun?.defaultValue !== false
    || !result.toolOptionCatalog?.split_font_batch?.options?.includeResults?.nonIntuitiveBehavior?.includes('Set false for large reviewed writes')
    || result.toolOptionCatalog?.organize_font_directory?.options?.dryRun?.defaultValue !== true
    || result.toolOptionCatalog?.organize_font_directory?.sourceDestructive !== false
    || !result.toolOptionCatalog?.organize_font_directory?.options?.overwriteExisting?.nonIntuitiveBehavior?.includes('outputDir')
    || !result.toolOptionCatalog?.organize_font_directory?.options?.parseFonts?.nonIntuitiveBehavior?.includes('identity dedupe')
    || !result.toolOptionCatalog?.split_font?.options?.smallGlyphAction?.allowedValues?.includes('copy-original')
    || !result.toolOptionCatalog?.split_font?.options?.splitFailureAction?.allowedValues?.includes('single-woff2')
    || !result.toolOptionCatalog?.inspect_split_output?.options?.includeFiles?.nonIntuitiveBehavior?.includes('compact')
  ) {
    throw new Error('Expected toolOptionCatalog to explain defaults, allowed values, safety, and non-intuitive configuration behavior.');
  }
  for (const localVerificationField of [
    'localVerificationOutputGuide',
    'localVerificationOutputGuide.completionReportGuide',
    'localVerificationOutputGuide.completionReportGuide.requiredClaims',
    'localVerificationOutputGuide.completionReportGuide.forbiddenClaims',
    'localVerificationOutputGuide.completionReportGuide.conciseReportTemplate',
  ]) {
    if (!result.responseFieldsToCheck?.includes(localVerificationField)) {
      throw new Error(`Expected agent guidance to recommend checking ${localVerificationField}.`);
    }
  }
  if (
    result.localVerificationOutputGuide?.summaryType !== 'local-verification-output-guide'
    || result.localVerificationOutputGuide?.standardCommand !== 'npm run check:compact'
    || result.localVerificationOutputGuide?.standardJsonCommand !== 'npm run --silent check:compact -- --json'
    || result.localVerificationOutputGuide?.primaryCommand !== 'npm run smoke:real-corpus-suite -- <font-corpus-dir>'
    || Object.hasOwn(result.localVerificationOutputGuide, 'aliasCommand')
    || result.localVerificationOutputGuide?.primaryDecisionField !== 'reliabilityGateDecision'
    || !result.localVerificationOutputGuide?.requiredOutputFields?.includes('corpusCountGuide')
    || !result.localVerificationOutputGuide?.requiredOutputFields?.includes('coverageSummary.toolCoverageSummary')
    || !result.localVerificationOutputGuide?.requiredOutputFields?.includes('coverageSummary.outputStructureAuditSummary')
    || !result.localVerificationOutputGuide?.requiredOutputFields?.includes('coverageSummary.archiveHandlingScope')
    || !result.localVerificationOutputGuide?.requiredOutputFields?.includes('runSummaries')
    || !result.localVerificationOutputGuide?.requiredOutputFields?.includes('omittedDetailFields')
    || !result.localVerificationOutputGuide?.passCriteria?.some((item) => item.includes('reliabilityGateDecision.status is pass'))
    || !result.localVerificationOutputGuide?.passCriteria?.some((item) => item.includes('outputRoleDecision.auditAppliesToThisDirectory'))
    || !result.localVerificationOutputGuide?.nonIntuitiveBehavior?.some((item) => item.includes('not a per-directory acceptance audit'))
    || !result.localVerificationOutputGuide?.nonIntuitiveBehavior?.some((item) => item.includes('Default suite output is compact'))
    || result.localVerificationOutputGuide?.evidenceFields?.countGuide !== 'corpusCountGuide'
    || result.localVerificationOutputGuide?.evidenceFields?.fullCorpusFontCount !== 'testScope.corpusScan.supportedFontCount'
    || result.localVerificationOutputGuide?.evidenceFields?.toolCoverage !== 'coverageSummary.toolCoverageSummary'
    || result.localVerificationOutputGuide?.evidenceFields?.archiveHandlingScope !== 'coverageSummary.archiveHandlingScope'
    || result.localVerificationOutputGuide?.completionReportGuide?.summaryType !== 'local-verification-completion-report-guide'
    || !result.localVerificationOutputGuide?.completionReportGuide?.requiredClaims?.some((item) => item.id === 'full-corpus-count' && item.evidenceField === 'corpusCountGuide.fullCorpus.supportedFontCount')
    || !result.localVerificationOutputGuide?.completionReportGuide?.requiredClaims?.some((item) => item.id === 'archive-handling-scope' && item.evidenceField === 'coverageSummary.archiveHandlingScope')
    || !result.localVerificationOutputGuide?.completionReportGuide?.requiredClaims?.some((item) => item.id === 'tool-coverage' && item.evidenceField === 'coverageSummary.toolCoverageSummary')
    || !result.localVerificationOutputGuide?.completionReportGuide?.requiredClaims?.some((item) => item.id === 'representative-output-audit' && item.evidenceField === 'coverageSummary.outputStructureAuditSummary')
    || !result.localVerificationOutputGuide?.completionReportGuide?.forbiddenClaims?.some((item) => item.includes('every font'))
    || !result.localVerificationOutputGuide?.completionReportGuide?.forbiddenClaims?.some((item) => item.includes('every directory'))
    || !result.localVerificationOutputGuide?.completionReportGuide?.forbiddenClaims?.some((item) => item.includes('archives were extracted'))
    || !result.localVerificationOutputGuide?.completionReportGuide?.conciseReportTemplate?.some((item) => item.includes('real-corpus suite'))
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
  const expectedDirectoryHandlingModes = [
    'rerun-organization',
    'rerun-organization-with-font-parsing',
    'inspect-organization-errors',
    'resolve-invalid-font-policy',
    'stop-no-copyable-fonts',
    'preview-organized-output',
    'inspect-organized-output',
    'review-original-input-safe-preview',
    'preview-original-input',
    'review-organization-decision',
  ];
  for (const mode of expectedDirectoryHandlingModes) {
    const entry = result.directoryHandlingModeCatalog?.[mode];
    if (
      entry?.value !== mode
      || !entry.shortAnswer
      || !entry.meaning
      || !entry.whenSeen
      || !entry.recommendedNextStep
      || entry.writesFilesBeforeReview !== false
      || entry.sourceDestructive !== false
      || !Array.isArray(entry.mustInspectFields)
      || !entry.mustInspectFields.includes('layoutDecision.directoryHandling.recommendedMode')
      || !entry.mustInspectFields.includes('sourceSafetyDecision')
      || !entry.mustInspectFields.includes('organizationWarnings')
      || !entry.mustInspectFields.includes('planActionSummary')
      || !entry.nonIntuitiveBehavior
    ) {
      throw new Error(`Expected directoryHandlingModeCatalog.${mode} to describe routing, safety, and required inspection fields.`);
    }
  }
  for (const mode of Object.keys(result.directoryHandlingModeCatalog || {})) {
    if (!expectedDirectoryHandlingModes.includes(mode)) {
      throw new Error(`Unexpected directory handling mode catalog entry ${mode}.`);
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
    'missing-manifests',
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
  for (const requiredTemplate of ['runtime-diagnostic', 'source-preflight-compact', 'directory-mismatch-plan', 'structure-first-large-directory', 'copy-organized-staging', 'batch-dry-run-preview', 'batch-process-reviewed-plan', 'output-audit-compact']) {
    if (!templateIds.has(requiredTemplate)) {
      throw new Error(`Expected safeInvocationTemplates to include ${requiredTemplate}.`);
    }
  }
  assertGuidanceItemsHaveCompletionProof(result.safeInvocationTemplates || [], {
    collectionName: 'safeInvocationTemplates',
  });
  const sourcePreflightTemplate = (result.safeInvocationTemplates || []).find((item) => item.id === 'source-preflight-compact');
  if (
    sourcePreflightTemplate?.tool !== 'inspect_font_inputs'
    || sourcePreflightTemplate?.writesFiles !== false
    || sourcePreflightTemplate?.sourceDestructive !== false
    || !sourcePreflightTemplate.inspectFields?.includes('inputCountGuide')
    || !sourcePreflightTemplate.inspectFields?.includes('inputDirectoryDecision')
    || !sourcePreflightTemplate.inspectFields?.includes('layout')
    || !sourcePreflightTemplate.inspectFields?.includes('recommendedBatchPreviewArgs')
    || !sourcePreflightTemplate.successCriteria?.includes('inputDirectoryDecision')
  ) {
    throw new Error('Expected source preflight template to expose inputDirectoryDecision, layout, and safe preview args.');
  }
  const mismatchTemplate = (result.safeInvocationTemplates || []).find((item) => item.id === 'directory-mismatch-plan');
  if (
    mismatchTemplate?.tool !== 'organize_font_directory'
    || mismatchTemplate?.writesFiles !== false
    || mismatchTemplate?.sourceDestructive !== false
    || mismatchTemplate?.args?.workflowPreset !== 'safe-preview'
    || !mismatchTemplate.inspectFields?.includes('sourceSafetyDecision')
    || !mismatchTemplate.inspectFields?.includes('sourceDestructive')
    || !mismatchTemplate.inspectFields?.includes('organizationDecision')
    || !mismatchTemplate.inspectFields?.includes('unsupportedFileSummary')
    || !mismatchTemplate.inspectFields?.includes('recommendedBatchPreviewArgs')
  ) {
    throw new Error('Expected directory mismatch template to rely on the safe-preview organization preset.');
  }
  assertDirectoryRouteInspectFields(mismatchTemplate?.inspectFields, 'safeInvocationTemplates.directory-mismatch-plan');
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
  assertDirectoryRouteInspectFields(structureTemplate?.inspectFields, 'safeInvocationTemplates.structure-first-large-directory');
  const copyTemplate = (result.safeInvocationTemplates || []).find((item) => item.id === 'copy-organized-staging');
  if (
    copyTemplate?.tool !== 'organize_font_directory'
    || copyTemplate?.writesFiles !== true
    || copyTemplate?.sourceDestructive !== false
    || copyTemplate?.args?.workflowPreset !== 'reviewed-write'
    || copyTemplate?.args?.outputDir !== 'organized-fonts'
    || !copyTemplate.inspectFields?.includes('sourceSafetyDecision')
    || !copyTemplate.inspectFields?.includes('writesSourceTree')
    || !copyTemplate.inspectFields?.includes('organizationDecision')
    || !copyTemplate.inspectFields?.includes('unsupportedFileSummary')
  ) {
    throw new Error('Expected copy staging template to disclose copy-only source safety.');
  }
  assertDirectoryRouteInspectFields(copyTemplate?.inspectFields, 'safeInvocationTemplates.copy-organized-staging');
  assertTemplateOmitsArgs(copyTemplate, ['dryRun', 'parseFonts', 'includePlan', 'batchGroupBy', 'batchNamingMode', 'batchDedupeMode', 'overwriteExisting'], 'copy-organized-staging');
  const batchPreviewTemplate = (result.safeInvocationTemplates || []).find((item) => item.id === 'batch-dry-run-preview');
  if (
    batchPreviewTemplate?.tool !== 'split_font_batch'
    || batchPreviewTemplate?.writesFiles !== false
    || batchPreviewTemplate?.args?.workflowPreset !== 'safe-preview'
    || batchPreviewTemplate?.args?.limit !== 50000
    || batchPreviewTemplate?.args?.maxFiles !== 50000
    || !batchPreviewTemplate.inspectFields?.includes('sourceSafetyDecision')
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
    || !batchProcessTemplate.inspectFields?.includes('dedupeDecisionSummary')
    || !batchProcessTemplate.nextStep?.includes('inspect_split_output')
  ) {
    throw new Error('Expected reviewed batch processing template to rely on the reviewed-write preset and require output inspection.');
  }
  assertTemplateOmitsArgs(batchProcessTemplate, ['dryRun', 'includeResults', 'skipMode', 'batchNamingMode', 'batchDedupeMode', 'batchErrorMode', 'splitFailureAction'], 'batch-process-reviewed-plan');
  const outputAuditTemplate = (result.safeInvocationTemplates || []).find((item) => item.id === 'output-audit-compact');
  if (
    !outputAuditTemplate?.inspectFields?.includes('outputRoleDecision')
    || !outputAuditTemplate?.inspectFields?.includes('outputStructureDecision')
    || !outputAuditTemplate?.inspectFields?.includes('auditStatus')
    || !outputAuditTemplate?.inspectFields?.includes('auditPassed')
    || !outputAuditTemplate?.inspectFields?.includes('auditBlockingReasons')
    || !outputAuditTemplate?.inspectFields?.includes('structureSummary')
    || !outputAuditTemplate?.successCriteria?.includes('outputRoleDecision.auditAppliesToThisDirectory')
    || !outputAuditTemplate?.successCriteria?.includes('outputStructureDecision.status pass')
    || !outputAuditTemplate?.successCriteria?.includes('auditStatus pass')
  ) {
    throw new Error('Expected output audit template to require outputRoleDecision, compact outputStructureDecision, audit status, and structureSummary inspection.');
  }
  const workflowGuidances = {};
  for (const workflowName of GUIDANCE_WORKFLOWS) {
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
    || !workflowPlan.orderedSteps?.some((step) => step.templateId === 'source-preflight-compact' && step.writesFiles === false && step.inspectFields?.includes('inputDirectoryDecision'))
    || !workflowPlan.orderedSteps?.some((step) => step.templateId === 'batch-dry-run-preview' && step.writesFiles === false && step.inspectFields?.includes('batchDecision'))
    || !workflowPlan.orderedSteps?.some((step) => step.templateId === 'batch-process-reviewed-plan' && step.writesFiles === true && step.inspectFields?.includes('batchDecision') && step.inspectFields?.includes('dedupeDecisionSummary'))
    || !workflowPlan.orderedSteps?.some((step) => step.templateId === 'directory-mismatch-plan' && step.inspectFields?.includes('organizationDecision'))
    || !workflowPlan.orderedSteps?.some((step) => step.templateId === 'output-audit-compact' && step.inspectFields?.includes('outputRoleDecision') && step.inspectFields?.includes('outputStructureDecision') && step.inspectFields?.includes('auditStatus') && step.inspectFields?.includes('structureSummary'))
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
  for (const item of Object.values(result.directoryHandlingModeCatalog || {})) {
    for (const fieldName of item.mustInspectFields || []) referencedFieldNames.add(fieldName);
  }
  for (const item of result.directoryWorkflowExamples || []) {
    for (const fieldName of item.mustInspectFields || []) referencedFieldNames.add(fieldName);
  }
  for (const item of result.configurationRecipes || []) {
    for (const fieldName of item.inspectFields || []) referencedFieldNames.add(fieldName);
    for (const fieldName of item.auditAfterWrite?.requiredFields || []) referencedFieldNames.add(fieldName);
  }
  for (const item of result.batchCustomizationQuickReference || []) {
    for (const fieldName of item.inspectFields || []) referencedFieldNames.add(fieldName);
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
    projectStatusNotice: 'get_agent_guidance',
    batchPolicyGuide: 'get_agent_guidance',
    batchCustomizationQuickReference: 'get_agent_guidance',
    batchPolicySummary: 'split_font_batch',
    configurationTrace: 'split_font_batch',
    batchGroupBy: 'split_font_batch',
    batchNamingMode: 'split_font_batch',
    batchDedupeMode: 'split_font_batch',
    batchErrorMode: 'split_font_batch',
    configurationRecipes: 'get_agent_guidance',
    toolSafetyQuickReference: 'get_agent_guidance',
    unsupportedFileCategoryCatalog: 'get_agent_guidance',
    outputStructureCatalog: 'get_agent_guidance',
    recommendedBatchOptions: 'organize_font_directory',
    recommendedBatchPreviewArgs: 'organize_font_directory',
    layoutDecision: 'organize_font_directory',
    'layoutDecision.directoryHandling.recommendedMode': 'organize_font_directory',
    stagingDirectoryDecision: 'organize_font_directory',
    directoryHandlingModeCatalog: 'get_agent_guidance',
    directoryOrganizationQuickAnswer: 'get_agent_guidance',
    sourceLayoutMismatchSummary: 'organize_font_directory',
    'sourceLayoutMismatchSummary.decisionChecklist': 'organize_font_directory',
    'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs': 'organize_font_directory',
    'sourceLayoutMismatchSummary.decisionChecklist.items[].safePreviewArgs': 'organize_font_directory',
    recommendedNextActions: 'split_font_batch',
    'recommendedNextActions[].suggestedArgsField': 'split_font_batch',
    'recommendedNextActions[].suggestedArgs.maxFiles': 'organize_font_directory',
    safetySummary: 'split_font_batch',
    inputCountGuide: 'inspect_font_inputs',
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
    'structureSummary.layoutKind': 'inspect_split_output',
    'structureSummary.issues[].code': 'inspect_split_output',
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
    'localVerificationOutputGuide.completionReportGuide': 'get_agent_guidance',
    'localVerificationOutputGuide.completionReportGuide.requiredClaims': 'get_agent_guidance',
    'localVerificationOutputGuide.completionReportGuide.forbiddenClaims': 'get_agent_guidance',
    'localVerificationOutputGuide.completionReportGuide.conciseReportTemplate': 'get_agent_guidance',
  };
  for (const [fieldName, toolName] of Object.entries(expectedFieldCatalogEntries)) {
    if (!result.toolResponseFieldCatalog?.[fieldName]?.sourceTools?.includes(toolName)) {
      throw new Error(`Expected toolResponseFieldCatalog.${fieldName} to include ${toolName}.`);
    }
  }
  const directoryQuickAnswer = result.directoryOrganizationQuickAnswer || {};
  if (
    directoryQuickAnswer.summaryType !== 'directory-organization-quick-answer'
    || directoryQuickAnswer.helperTool !== 'organize_font_directory'
    || directoryQuickAnswer.sourceDestructive !== false
    || directoryQuickAnswer.sourceFilesPreserved !== true
    || directoryQuickAnswer.firstCallArgs?.workflowPreset !== 'safe-preview'
    || directoryQuickAnswer.writeArgsAfterReview?.workflowPreset !== 'reviewed-write'
    || directoryQuickAnswer.writeMode !== 'copy-only-outputDir'
    || directoryQuickAnswer.outputDirRole !== 'organized-font-source-staging'
    || directoryQuickAnswer.isSplitOutput !== false
    || !directoryQuickAnswer.inspectFields?.includes('sourceSafetyDecision')
    || !directoryQuickAnswer.inspectFields?.includes('sourceLayoutMismatchSummary')
    || !directoryQuickAnswer.successCriteria?.some((item) => item.includes('sourceDestructive false'))
    || !directoryQuickAnswer.nonIntuitiveBehavior?.some((item) => item.includes('never moves, deletes, or rewrites source font files'))
  ) {
    throw new Error('Expected directoryOrganizationQuickAnswer to directly answer helper-tool and source-safety questions.');
  }
  assertBatchPolicyGuide(result.batchPolicyGuide || []);
  const quickReferenceIds = new Set((result.batchCustomizationQuickReference || []).map((item) => item.id));
  for (const requiredQuickReference of ['safe-defaults', 'preserve-every-source-font', 'source-folder-families', 'metadata-family-groups', 'plain-output-names', 'source-suffix-traceability', 'collect-errors-for-report']) {
    if (!quickReferenceIds.has(requiredQuickReference)) {
      throw new Error(`Expected batchCustomizationQuickReference to include ${requiredQuickReference}.`);
    }
  }
  for (const item of result.batchCustomizationQuickReference || []) {
    assertNonEmptyString(item.id, 'batchCustomizationQuickReference', 'id');
    assertNonEmptyString(item.userIntent, `batchCustomizationQuickReference.${item.id}`, 'userIntent');
    assertNonEmptyStringArray(item.optionNames, `batchCustomizationQuickReference.${item.id}`, 'optionNames');
    assertNonEmptyStringArray(item.inspectFields, `batchCustomizationQuickReference.${item.id}`, 'inspectFields');
    assertNonEmptyString(item.successCriteria, `batchCustomizationQuickReference.${item.id}`, 'successCriteria');
    if (item.previewArgs?.workflowPreset !== 'safe-preview' || item.writeArgsAfterReview?.workflowPreset !== 'reviewed-write') {
      throw new Error(`Expected batchCustomizationQuickReference.${item.id} to use preset-first preview/write args.`);
    }
  }
  const preserveQuickReference = (result.batchCustomizationQuickReference || []).find((item) => item.id === 'preserve-every-source-font');
  const metadataQuickReference = (result.batchCustomizationQuickReference || []).find((item) => item.id === 'metadata-family-groups');
  const plainQuickReference = (result.batchCustomizationQuickReference || []).find((item) => item.id === 'plain-output-names');
  const collectQuickReference = (result.batchCustomizationQuickReference || []).find((item) => item.id === 'collect-errors-for-report');
  if (
    preserveQuickReference?.overrideArgs?.batchDedupeMode !== 'none'
    || !preserveQuickReference.inspectFields?.includes('dedupeDecisionSummary')
    || metadataQuickReference?.overrideArgs?.batchGroupBy !== 'font-family'
    || !metadataQuickReference.nonIntuitiveBehavior?.includes('metadata')
    || plainQuickReference?.overrideArgs?.batchNamingMode !== 'plain'
    || !plainQuickReference.nonIntuitiveBehavior?.includes('collision')
    || collectQuickReference?.overrideArgs?.batchErrorMode !== 'collect'
    || !collectQuickReference.successCriteria?.includes('errorCount zero')
  ) {
    throw new Error('Expected batchCustomizationQuickReference entries to expose compact override args and counterintuitive checks.');
  }
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
  if (!safeDefaultRecipe?.inspectFields?.includes('sourceSafetyDecision') || !safeDefaultRecipe?.inspectFields?.includes('batchDecision') || !safeDefaultRecipe?.successCriteria?.includes('audit')) {
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
  assertDirectoryRouteInspectFields(stagingRecipe?.inspectFields, 'configurationRecipes.copy-clean-staging-directory');
  const structureRecipe = (result.configurationRecipes || []).find((item) => item.id === 'fast-structure-first-scan');
  if (
    structureRecipe?.previewArgs?.workflowPreset !== 'structure-first'
    || !structureRecipe.inspectFields?.includes('dedupeLimitedByParsing')
    || !structureRecipe.inspectFields?.includes('organizationDecision')
    || !structureRecipe.successCriteria?.includes('parseFonts true')
  ) {
    throw new Error('Expected fast structure recipe to use structure-first and require dedupe limitation inspection.');
  }
  assertDirectoryRouteInspectFields(structureRecipe?.inspectFields, 'configurationRecipes.fast-structure-first-scan');
  const metadataRecipe = (result.configurationRecipes || []).find((item) => item.id === 'metadata-family-groups');
  if (!metadataRecipe?.inspectFields?.includes('organizationDecision')) {
    throw new Error('Expected metadata-family-groups recipe to require organizationDecision inspection.');
  }
  assertDirectoryRouteInspectFields(metadataRecipe?.inspectFields, 'configurationRecipes.metadata-family-groups');
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
  assertDirectoryRouteInspectFields(structureDecision?.mustInspectFields, 'directoryWorkflowDecisionMatrix.large-or-noisy-directory-first-pass', 'mustInspectFields');
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
  assertDirectoryRouteInspectFields(mixedDecision?.mustInspectFields, 'directoryWorkflowDecisionMatrix.unknown-or-mixed-directory-layout', 'mustInspectFields');
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
  assertDirectoryRouteInspectFields(stagingDecision?.mustInspectFields, 'directoryWorkflowDecisionMatrix.user-wants-clean-staging-directory', 'mustInspectFields');
  assertObjectOmitsKeys(stagingDecision?.recommendedOptions, ['dryRun', 'includePlan', 'parseFonts', 'overwriteExisting'], 'user-wants-clean-staging-directory recommendedOptions');
  assertObjectOmitsKeys(stagingDecision?.followUpOptions, ['dryRun', 'includePlan', 'parseFonts', 'overwriteExisting'], 'user-wants-clean-staging-directory followUpOptions');
  const exampleIds = new Set((result.directoryWorkflowExamples || []).map((item) => item.id));
  for (const requiredExample of ['flat-vendor-dump', 'archive-per-family-folders', 'mixed-root-and-nested-fonts', 'source-layout-mismatch-comparison', 'copy-only-staging-to-audited-split', 'large-noisy-first-pass']) {
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
  assertDirectoryRouteInspectFields(noisyExample?.mustInspectFields, 'directoryWorkflowExamples.large-noisy-first-pass', 'mustInspectFields');
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
  assertDirectoryRouteInspectFields(mixedExample?.mustInspectFields, 'directoryWorkflowExamples.mixed-root-and-nested-fonts', 'mustInspectFields');
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
  assertDirectoryRouteInspectFields(mismatchComparisonExample?.mustInspectFields, 'directoryWorkflowExamples.source-layout-mismatch-comparison', 'mustInspectFields');
  assertObjectOmitsKeys(mismatchComparisonExample?.firstCall, ['dryRun', 'parseFonts', 'includePlan', 'batchNamingMode', 'batchDedupeMode'], 'source-layout-mismatch-comparison firstCall');
  const stagingRouteExample = (result.directoryWorkflowExamples || []).find((item) => item.id === 'copy-only-staging-to-audited-split');
  const stagingRouteStepIds = new Set((stagingRouteExample?.workflowSteps || []).map((item) => item.id));
  const stagingWriteStep = (stagingRouteExample?.workflowSteps || []).find((item) => item.id === 'write-copy-only-staging');
  const stagedBatchPreviewStep = (stagingRouteExample?.workflowSteps || []).find((item) => item.id === 'preview-staged-batch');
  const batchWriteStep = (stagingRouteExample?.workflowSteps || []).find((item) => item.id === 'write-reviewed-batch');
  const outputAuditStep = (stagingRouteExample?.workflowSteps || []).find((item) => item.id === 'audit-split-output');
  if (
    stagingRouteExample?.firstCall?.workflowPreset !== 'safe-preview'
    || stagingRouteExample?.firstCall?.outputDir !== '<organized-output-dir>'
    || !['preview-organization-plan', 'review-organization-plan', 'write-copy-only-staging', 'preview-staged-batch', 'write-reviewed-batch', 'audit-split-output'].every((stepId) => stagingRouteStepIds.has(stepId))
    || stagingWriteStep?.tool !== 'organize_font_directory'
    || stagingWriteStep?.args?.workflowPreset !== 'reviewed-write'
    || stagedBatchPreviewStep?.tool !== 'split_font_batch'
    || stagedBatchPreviewStep?.argsSource !== 'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs'
    || stagedBatchPreviewStep?.writesFiles !== false
    || batchWriteStep?.tool !== 'split_font_batch'
    || batchWriteStep?.args?.workflowPreset !== 'reviewed-write'
    || outputAuditStep?.tool !== 'inspect_split_output'
    || !stagingRouteExample.mustInspectFields?.includes('sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs')
    || !stagingRouteExample.mustInspectFields?.includes('outputStructureDecision')
    || !stagingRouteExample.successCriteria?.includes('sourceDestructive false')
    || !stagingRouteExample.successCriteria?.includes('inspect_split_output')
  ) {
    throw new Error('Expected copy-only staging example to expose a complete source-safe staging-to-audited-split workflow.');
  }
  assertDirectoryRouteInspectFields(stagingRouteExample?.mustInspectFields, 'directoryWorkflowExamples.copy-only-staging-to-audited-split', 'mustInspectFields');
  const flatExample = (result.directoryWorkflowExamples || []).find((item) => item.id === 'flat-vendor-dump');
  if (
    flatExample?.firstCall?.workflowPreset !== 'safe-preview'
    || !flatExample.mustInspectFields?.includes('organizationDecision')
    || !flatExample.mustInspectFields?.includes('recommendedBatchPreviewArgs')
    || !flatExample.successCriteria?.includes('flat')
  ) {
    throw new Error('Expected flat vendor example to use the safe-preview organization preset.');
  }
  assertDirectoryRouteInspectFields(flatExample?.mustInspectFields, 'directoryWorkflowExamples.flat-vendor-dump', 'mustInspectFields');
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
  assertDirectoryRouteInspectFields(layoutChecklist?.responseFields, 'verificationChecklist.layout-plan-reviewed', 'responseFields');
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
    !outputChecklist?.responseFields?.includes('outputRoleDecision')
    || !outputChecklist?.responseFields?.includes('outputStructureDecision')
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
} else if (scenario === 'check-compact') {
  console.log('Compact check smoke');
  const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
  if (!packageJson.scripts?.['check:syntax']?.includes('scripts/run-check-compact.js')) {
    throw new Error('compact check smoke: expected check:syntax to syntax-check scripts/run-check-compact.js.');
  }

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
  const assertExactValues = (actualValues, expectedValues, context) => {
    const actual = Array.isArray(actualValues) ? actualValues : [];
    const missing = expectedValues.filter((value) => !actual.includes(value));
    const extra = actual.filter((value) => !expectedValues.includes(value));
    if (missing.length > 0 || extra.length > 0 || actual.length !== expectedValues.length) {
      throw new Error(`${context}: expected values to match core constants; missing ${missing.join(', ') || '<none>'}; extra ${extra.join(', ') || '<none>'}.`);
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
    || invalidPreset.details?.source !== 'env'
    || invalidPreset.details?.targetField !== 'workflowPreset'
    || invalidPreset.details?.received !== 'default'
    || invalidPreset.details?.allowedValues?.includes('default')
    || invalidPreset.details?.omitForDefaultBehavior !== true
    || !invalidPreset.error?.includes('Omit it to use batch-run')
  ) {
    throw new Error('invalid workflow preset run: expected default preset to be rejected with machine-readable allowed values.');
  }
  assertExactValues(invalidPreset.details.allowedValues, WORKFLOW_PRESET_NAMES, 'invalid workflow preset allowed values');

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
    || invalidDedupe.details?.source !== 'env'
    || invalidDedupe.details?.targetField !== 'batchDedupeMode'
    || invalidDedupe.details?.received !== 'semantic'
    || !invalidDedupe.details?.allowedValues?.includes('font-identity')
    || invalidDedupe.details?.allowedValues?.includes('semantic')
    || invalidDedupe.details?.omitForDefaultBehavior !== true
    || !invalidDedupe.error?.includes('FONT_SPLIT_BATCH_DEDUPE_MODE must be one of')
  ) {
    throw new Error('invalid dedupe env run: expected invalid enum-like env var to be rejected with machine-readable allowed values.');
  }
  assertExactValues(invalidDedupe.details.allowedValues, BATCH_DEDUPE_MODES, 'invalid dedupe env allowed values');

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
  const fallbackInputDir = `${inputDir}-fallback`;
  const fallbackPath = path.join(fallbackInputDir, 'MixedNames', 'OpenPair-Regular.ttf');
  console.log('Batch identity dedupe smoke:', inputDir, '->', outputRoot);
  await fs.rm(inputDir, { recursive: true, force: true });
  await fs.rm(fallbackInputDir, { recursive: true, force: true });
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(path.dirname(ttfPath), { recursive: true });
  await fs.mkdir(path.dirname(otfPath), { recursive: true });
  await fs.mkdir(path.dirname(fallbackPath), { recursive: true });
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
  await fs.writeFile(fallbackPath, buildMinimalTtf({
    familyName: 'Open Pair',
    subfamilyName: 'Regular',
    glyphCount: 3,
    typographicFamilyName: 'Typographic Only',
    typographicSubfamilyName: null,
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

  const fallbackInspection = await inspectFontInputs({
    inputDir: fallbackInputDir,
    includeFiles: true,
    maxFiles: 10,
  });
  const fallbackFile = fallbackInspection.files?.[0];
  if (
    fallbackInspection.validFontCount !== 1
    || fallbackFile?.identityBasis !== 'opentype-family-subfamily'
    || !fallbackFile?.identityKey?.includes('"family":"open pair"')
    || fallbackFile?.identityKey?.includes('typographic only')
  ) {
    throw new Error('Expected font identity to use paired OpenType name IDs 1/2 instead of mixing typographic family with OpenType subfamily.');
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
  if (
    identityDedupe.dedupeDecisionSummary?.summaryType !== 'dedupe-decision-summary'
    || identityDedupe.dedupeDecisionSummary?.appliesToTool !== 'split_font_batch'
    || identityDedupe.dedupeDecisionSummary?.requestedMode !== 'font-identity'
    || identityDedupe.dedupeDecisionSummary?.effectiveMode !== 'font-identity'
    || identityDedupe.dedupeDecisionSummary?.skippedDuplicateCount !== 1
    || identityDedupe.dedupeDecisionSummary?.identityKeyMissingCount !== 0
    || identityDedupe.dedupeDecisionSummary?.pathFallbackUsed !== false
    || identityDedupe.dedupeDecisionSummary?.representativePriority?.[0] !== '.otf'
    || identityDedupe.dedupeDecisionSummary?.identityEvidenceSummary?.summaryType !== 'dedupe-identity-evidence'
    || identityDedupe.dedupeDecisionSummary?.identityEvidenceSummary?.identityDedupeEvidenceAvailable !== true
    || !identityDedupe.dedupeDecisionSummary?.identityEvidenceSummary?.identityBasisCounts?.some((item) => item.basis === 'typographic-family-subfamily' && item.count === 2)
    || identityDedupe.dedupeDecisionSummary?.identityEvidenceSummary?.duplicateExampleCount !== 1
    || identityDedupe.dedupeDecisionSummary?.identityEvidenceSummary?.duplicateExamples?.[0]?.identityBasis !== 'typographic-family-subfamily'
    || !identityDedupe.dedupeDecisionSummary?.identityEvidenceSummary?.duplicateExamples?.[0]?.identityKey?.includes('"family":"fixture sans"')
  ) {
    throw new Error('Expected font-identity batch dedupe to expose compact dedupeDecisionSummary identity evidence.');
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
  assertConfigurationTrace(rawDefaultPreview.configurationTrace, {
    context: 'workflow-presets raw batch defaults',
    appliesToTool: 'split_font_batch',
    workflowPreset: null,
    expectedSources: {
      dryRun: 'explicit-argument',
      includeResults: 'explicit-argument',
      batchDedupeMode: 'raw-default',
    },
    expectedEffectiveValues: {
      dryRun: true,
      includeResults: true,
      batchDedupeMode: 'font-identity',
    },
    expectedExplicitOverrideFields: ['dryRun', 'includeResults'],
  });

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
  assertConfigurationTrace(safePreview.configurationTrace, {
    context: 'workflow-presets safe-preview batch',
    appliesToTool: 'split_font_batch',
    workflowPreset: 'safe-preview',
    expectedSources: {
      dryRun: 'workflow-preset',
      includeResults: 'workflow-preset',
      batchDedupeMode: 'workflow-preset',
    },
    expectedEffectiveValues: {
      dryRun: true,
      includeResults: true,
      batchDedupeMode: 'font-identity',
    },
  });
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
  assertConfigurationTrace(structureFirstBatchOverride.configurationTrace, {
    context: 'workflow-presets structure-first batch override',
    appliesToTool: 'split_font_batch',
    workflowPreset: 'structure-first',
    expectedSources: {
      dryRun: 'workflow-preset',
      includeResults: 'explicit-argument',
      batchDedupeMode: 'explicit-argument',
    },
    expectedEffectiveValues: {
      includeResults: true,
      batchDedupeMode: 'font-identity',
    },
    expectedExplicitOverrideFields: ['includeResults', 'batchDedupeMode'],
  });

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
  assertConfigurationTrace(undefinedOverridePreview.configurationTrace, {
    context: 'workflow-presets undefined batch override',
    appliesToTool: 'split_font_batch',
    workflowPreset: 'safe-preview',
    expectedSources: {
      dryRun: 'workflow-preset',
      includeResults: 'workflow-preset',
    },
    expectedEffectiveValues: {
      dryRun: true,
      includeResults: true,
    },
  });

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
  assertConfigurationTrace(structureFirst.configurationTrace, {
    context: 'workflow-presets structure-first organization',
    appliesToTool: 'organize_font_directory',
    workflowPreset: 'structure-first',
    expectedSources: {
      dryRun: 'workflow-preset',
      parseFonts: 'workflow-preset',
      includePlan: 'workflow-preset',
      batchDedupeMode: 'workflow-preset',
    },
    expectedEffectiveValues: {
      dryRun: true,
      parseFonts: false,
      includePlan: false,
      batchDedupeMode: 'font-identity',
    },
  });

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
  assertConfigurationTrace(explicitOverride.configurationTrace, {
    context: 'workflow-presets explicit organization override',
    appliesToTool: 'organize_font_directory',
    workflowPreset: 'structure-first',
    expectedSources: {
      dryRun: 'workflow-preset',
      parseFonts: 'explicit-argument',
      includePlan: 'explicit-argument',
      batchDedupeMode: 'workflow-preset',
    },
    expectedEffectiveValues: {
      parseFonts: true,
      includePlan: true,
      batchDedupeMode: 'font-identity',
    },
    expectedExplicitOverrideFields: ['parseFonts', 'includePlan'],
  });

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
  for (const expectedWarning of ['output-files-omitted', 'output-families-omitted', 'missing-manifests']) {
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
    || auditAction?.suggestedArgsField !== 'batchDecision.auditArgs'
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
} else if (scenario === 'inspect-organized-staging') {
  const outDir = process.argv[3] || 'font-split-mcp/.font-split-inspect-organized-staging';
  console.log('Organized staging inspection smoke:', outDir);
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(path.join(outDir, 'FamilyA'), { recursive: true });
  await fs.writeFile(
    path.join(outDir, 'FamilyA', 'FixtureSans-Regular.ttf'),
    buildMinimalTtf({ familyName: 'Fixture Sans', subfamilyName: 'Regular', glyphCount: 5 }),
  );
  await fs.writeFile(path.join(outDir, 'font-organization-manifest.json'), JSON.stringify({
    manifestVersion: 1,
    toolVersion: '0.0.0',
    result: {
      operationMode: 'copy-only',
      sourceDestructive: false,
      outputDirRole: 'organized-font-source-staging',
      isSplitOutput: false,
    },
  }, null, 2));

  const stagingAudit = await inspectSplitOutput({
    outDir,
    includeFiles: false,
    includeFamilies: false,
  });
  if (
    stagingAudit.outputRoleDecision?.summaryType !== 'output-role-decision'
    || stagingAudit.outputRoleDecision?.detectedRole !== 'organized-font-source-staging'
    || stagingAudit.outputRoleDecision?.isSplitOutput !== false
    || stagingAudit.outputRoleDecision?.recommendedAction !== 'inspect-staging-as-input-then-batch-preview'
    || stagingAudit.outputRoleDecision?.organizationManifestPath !== `${outDir}/font-organization-manifest.json`
    || stagingAudit.auditStatus === 'pass'
    || stagingAudit.outputStructureDecision?.status === 'pass'
    || stagingAudit.outputStructureDecision?.recommendedAction !== 'inspect-staging-as-input-then-batch-preview'
    || !stagingAudit.outputStructureDecision?.blockingReasonCodes?.includes('not-split-output')
    || !stagingAudit.inspectionWarnings?.some((warning) => warning.code === 'organized-staging-not-split-output')
    || !stagingAudit.auditBlockingReasons?.some((reason) => reason.code === 'not-split-output')
  ) {
    throw new Error('Expected organized staging output to be flagged as source staging, not split output.');
  }
  console.log(JSON.stringify(stagingAudit, null, 2));
} else if (scenario === 'mcp-error') {
  await runMcpErrorSmoke();
} else if (scenario === 'mcp-schema') {
  await runMcpSchemaSmoke();
} else if (scenario === 'api-docs') {
  await runApiDocsSmoke();
} else if (scenario === 'behavior-docs') {
  await runBehaviorDocsSmoke();
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
  assertSourceSafetyDecision(result.sourceSafetyDecision, {
    context: 'batch-dry-run',
    appliesToTool: 'split_font_batch',
    expectedStatus: 'source-safe-no-write',
    expectedWritesFiles: false,
    expectedWritesSourceTree: false,
    expectedOutputTreeInsideInputTree: false,
    expectedOutputPathRole: 'outputRoot',
    expectedRequiresOutputAudit: false,
  });
  const batchWriteAction = (result.recommendedNextActions || []).find((action) => action.id === 'run-reviewed-batch-write');
  if (
    result.recommendedNextActionCount !== (result.recommendedNextActions || []).length
    || batchWriteAction?.tool !== 'split_font_batch'
    || batchWriteAction?.suggestedArgsField !== 'batchDecision.reviewedWriteArgs'
    || batchWriteAction?.suggestedArgs?.workflowPreset !== 'reviewed-write'
    || batchWriteAction?.suggestedArgs?.inputDir !== inputDir
    || batchWriteAction?.suggestedArgs?.outputRoot !== outputRoot
    || !batchWriteAction.inspectFields?.includes('writesOutputTree')
    || !batchWriteAction.inspectFields?.includes('batchDecision')
    || !batchWriteAction.inspectFields?.includes('dedupeDecisionSummary')
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
  await runRealCorpusSuiteSmoke();
} else if (scenario === 'real-corpus-readonly') {
  await runRealCorpusReadonlySmoke();
} else if (scenario === 'real-corpus-targets') {
  await runRealCorpusTargetsSmoke();
} else if (scenario === 'real-corpus-integration') {
  await runRealCorpusIntegrationSmoke();
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
