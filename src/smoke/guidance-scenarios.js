import fs from 'node:fs/promises';
import { GUIDANCE_WORKFLOWS, getAgentGuidance } from '../font-split.js';
import { buildDirectoryOrganizationSafety } from '../directory-organization-safety.js';
import { buildOutputResultShapeQuickReference } from '../output-result-shape-quick-reference.js';
import { buildBatchCustomizationQuickReference } from '../batch-customization-quick-reference.js';
import {
  assertBatchPolicyGuide,
  assertDirectoryRouteInspectFields,
  assertGuidanceItemsHaveCompletionProof,
  assertNextToolDecisionSummary,
  assertNonEmptyString,
  assertNonEmptyStringArray,
  assertObjectOmitsKeys,
  assertRecommendedWorkflowPlanHasCompletionProof,
  assertSourceLayoutDecisionChecklistCompanionFields,
  assertTemplateOmitsArgs,
} from './assertions.js';

async function runAgentGuidanceSmoke() {
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
    || defaultGuidance.outputResultShapeQuickReference?.summaryType !== 'output-result-shape-quick-reference'
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
    || compactGuidance.outputResultShapeQuickReference?.summaryType !== 'output-result-shape-quick-reference'
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
    !result.responseFieldsToCheck?.includes('outputResultShapeQuickReference')
    || result.toolResponseFieldCatalog?.outputResultShapeQuickReference?.sourceTools?.[0] !== 'get_agent_guidance'
    || !result.toolResponseFieldCatalog?.outputResultShapeQuickReference?.agentAction?.includes('ok:true')
  ) {
    throw new Error('Expected agent guidance to expose outputResultShapeQuickReference as the compact output result-shape entrypoint.');
  }
  if (
    !result.responseFieldsToCheck?.includes('directoryOrganizationQuickAnswer')
    || !result.responseFieldsToCheck?.includes('directoryOrganizationQuickAnswer.directoryOrganizationSafety')
    || result.toolResponseFieldCatalog?.directoryOrganizationQuickAnswer?.sourceTools?.[0] !== 'get_agent_guidance'
    || result.toolResponseFieldCatalog?.['directoryOrganizationQuickAnswer.directoryOrganizationSafety']?.sourceTools?.[0] !== 'get_agent_guidance'
    || !result.toolResponseFieldCatalog?.directoryOrganizationQuickAnswer?.agentAction?.includes('safe-preview')
    || !result.toolResponseFieldCatalog?.['directoryOrganizationQuickAnswer.directoryOrganizationSafety']?.agentAction?.includes('inspect_font_inputs')
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
  const canonicalOrganizerSafety = buildDirectoryOrganizationSafety({
    appliesToTool: 'get_agent_guidance',
  });
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
    || organizerSafety?.defaultMode !== canonicalOrganizerSafety.helperToolDefaultMode
    || organizerSafety?.reviewedWriteMode !== canonicalOrganizerSafety.helperToolWriteMode
    || organizerSafety?.safePreviewArgs?.inputDir !== canonicalOrganizerSafety.safePreviewArgs.inputDir
    || organizerSafety?.safePreviewArgs?.outputDir !== canonicalOrganizerSafety.safePreviewArgs.outputDir
    || organizerSafety?.safePreviewArgs?.workflowPreset !== canonicalOrganizerSafety.safePreviewArgs.workflowPreset
    || organizerSafety?.sourceDestructive !== canonicalOrganizerSafety.sourceDestructive
    || organizerSafety?.sourceFilesPreserved !== canonicalOrganizerSafety.sourceFilesPreserved
    || organizerSafety?.sourceFilesMovedDeletedOrRewritten !== canonicalOrganizerSafety.sourceFilesMovedDeletedOrRewritten
    || organizerSafety?.sourceBackupRequired !== false
    || organizerSafety?.outputRole !== canonicalOrganizerSafety.outputDirRole
    || organizerSafety?.isSplitOutput !== canonicalOrganizerSafety.isSplitOutput
    || organizerSafety?.inspectAfterCopyTool !== canonicalOrganizerSafety.inspectAfterCopyTool
    || organizerSafety?.previewAfterCopyTool !== canonicalOrganizerSafety.previewAfterCopyTool
    || organizerSafety?.auditAfterSplitWriteTool !== canonicalOrganizerSafety.auditAfterSplitWriteTool
    || !organizerSafety?.mustInspectFields?.includes('sourceSafetyDecision')
    || !organizerSafety?.mustInspectFields?.includes('safetySummary')
    || !Array.isArray(organizerSafety?.nonIntuitiveBehavior)
    || !canonicalOrganizerSafety.nonIntuitiveBehavior.every((item) => organizerSafety.nonIntuitiveBehavior.includes(item))
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
  for (const outputStructureField of [
    'structureSummary.rootLevelDiagnosis',
    'structureSummary.staleResidueDiagnosis',
    'structureSummary.manifestCoverageDiagnosis',
    'structureSummary.depthProfile',
  ]) {
    if (!result.responseFieldsToCheck?.includes(outputStructureField)) {
      throw new Error(`Expected agent guidance to recommend checking ${outputStructureField}.`);
    }
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
    || outputCatalogGuidance.outputResultShapeQuickReference?.summaryType !== 'output-result-shape-quick-reference'
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
  const outputResultShapeQuickReference = result.outputResultShapeQuickReference || {};
  const expectedOutputResultShapeQuickReference = buildOutputResultShapeQuickReference();
  if (JSON.stringify(outputResultShapeQuickReference) !== JSON.stringify(expectedOutputResultShapeQuickReference)) {
    throw new Error('Expected agent guidance outputResultShapeQuickReference to match the standalone builder output.');
  }
  const outputResultShapeIds = new Set((outputResultShapeQuickReference.resultShapes || []).map((item) => item.id));
  for (const requiredShape of ['subset-output', 'single-woff2-fallback', 'copy-original-record', 'single-font-split-skipped', 'batch-existing-output-skips', 'dry-run-existing-output-skip-plan', 'batch-partial-errors']) {
    if (!outputResultShapeIds.has(requiredShape)) {
      throw new Error(`Expected outputResultShapeQuickReference to include ${requiredShape}.`);
    }
  }
  for (const requiredField of ['outputMode', 'resultType', 'performedSplit', 'usedFallback', 'skipped', 'skipReason', 'skipMode', 'skippedExisting', 'skippedByManifest', 'planned[].wouldProcess', 'planned[].skipReason', 'errorCount', 'errors']) {
    if (!outputResultShapeQuickReference.inspectFields?.includes(requiredField)) {
      throw new Error(`Expected outputResultShapeQuickReference.inspectFields to include ${requiredField}.`);
    }
  }
  if (
    outputResultShapeQuickReference.summaryType !== 'output-result-shape-quick-reference'
    || !outputResultShapeQuickReference.nonIntuitiveBehavior?.some((item) => item.includes('ok:true'))
  ) {
    throw new Error('Expected outputResultShapeQuickReference to summarize non-intuitive successful output shapes.');
  }
  for (const item of outputResultShapeQuickReference.resultShapes || []) {
    assertNonEmptyString(item.id, 'outputResultShapeQuickReference', 'id');
    assertNonEmptyString(item.meaning, `outputResultShapeQuickReference.${item.id}`, 'meaning');
    assertNonEmptyString(item.agentAction, `outputResultShapeQuickReference.${item.id}`, 'agentAction');
    assertNonEmptyStringArray(item.successEvidence, `outputResultShapeQuickReference.${item.id}`, 'successEvidence');
    if (!item.when || Object.keys(item.when).length === 0) {
      throw new Error(`Expected outputResultShapeQuickReference.${item.id} to declare when conditions.`);
    }
  }
  for (const fieldName of outputResultShapeQuickReference.inspectFields || []) {
    if (!result.toolResponseFieldCatalog?.[fieldName]) {
      throw new Error(`Expected toolResponseFieldCatalog to describe outputResultShapeQuickReference inspect field ${fieldName}.`);
    }
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
  const sourceText = await fs.readFile(new URL('../font-split.js', import.meta.url), 'utf8');
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
    || !sourcePreflightTemplate.inspectFields?.includes('inputDirectoryDecision.directoryOrganizationSafety')
    || !sourcePreflightTemplate.inspectFields?.includes('layout')
    || !sourcePreflightTemplate.inspectFields?.includes('recommendedBatchPreviewArgs')
    || !sourcePreflightTemplate.successCriteria?.includes('inputDirectoryDecision')
  ) {
    throw new Error('Expected source preflight template to expose inputDirectoryDecision, directory organization safety, layout, and safe preview args.');
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
    || !outputAuditTemplate?.inspectFields?.includes('structureSummary.rootLevelDiagnosis')
    || !outputAuditTemplate?.inspectFields?.includes('structureSummary.staleResidueDiagnosis')
    || !outputAuditTemplate?.inspectFields?.includes('structureSummary.manifestCoverageDiagnosis')
    || !outputAuditTemplate?.inspectFields?.includes('structureSummary.depthProfile')
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
    || !workflowPlan.orderedSteps?.some((step) => step.templateId === 'source-preflight-compact' && step.writesFiles === false && step.inspectFields?.includes('inputDirectoryDecision') && step.inspectFields?.includes('inputDirectoryDecision.directoryOrganizationSafety'))
    || !workflowPlan.orderedSteps?.some((step) => step.templateId === 'batch-dry-run-preview' && step.writesFiles === false && step.inspectFields?.includes('batchDecision'))
    || !workflowPlan.orderedSteps?.some((step) => step.templateId === 'batch-process-reviewed-plan' && step.writesFiles === true && step.inspectFields?.includes('batchDecision') && step.inspectFields?.includes('dedupeDecisionSummary'))
    || !workflowPlan.orderedSteps?.some((step) => step.templateId === 'directory-mismatch-plan' && step.inspectFields?.includes('organizationDecision'))
    || !workflowPlan.orderedSteps?.some((step) => step.templateId === 'output-audit-compact' && step.inspectFields?.includes('outputRoleDecision') && step.inspectFields?.includes('outputStructureDecision') && step.inspectFields?.includes('auditStatus') && step.inspectFields?.includes('structureSummary') && step.inspectFields?.includes('structureSummary.rootLevelDiagnosis') && step.inspectFields?.includes('structureSummary.depthProfile'))
  ) {
    throw new Error('Expected batch recommendedWorkflowPlan to order source safety preflight, preview, reviewed write, output audit, and route-decision checks.');
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
    skipMode: 'split_font_batch',
    batchGroupBy: 'split_font_batch',
    batchNamingMode: 'split_font_batch',
    batchDedupeMode: 'split_font_batch',
    batchErrorMode: 'split_font_batch',
    configurationRecipes: 'get_agent_guidance',
    toolSafetyQuickReference: 'get_agent_guidance',
    unsupportedFileCategoryCatalog: 'get_agent_guidance',
    outputStructureCatalog: 'get_agent_guidance',
    outputResultShapeQuickReference: 'get_agent_guidance',
    skipped: 'split_font',
    skipReason: 'split_font',
    recommendedBatchOptions: 'organize_font_directory',
    recommendedBatchPreviewArgs: 'organize_font_directory',
    layoutDecision: 'organize_font_directory',
    'layoutDecision.directoryHandling.recommendedMode': 'organize_font_directory',
    stagingDirectoryDecision: 'organize_font_directory',
    directoryHandlingModeCatalog: 'get_agent_guidance',
    directoryOrganizationQuickAnswer: 'get_agent_guidance',
    'directoryOrganizationQuickAnswer.directoryOrganizationSafety': 'get_agent_guidance',
    'inputDirectoryDecision.directoryOrganizationSafety': 'inspect_font_inputs',
    sourceLayoutMismatchSummary: 'organize_font_directory',
    'sourceLayoutMismatchSummary.decisionChecklist': 'organize_font_directory',
    'sourceLayoutMismatchSummary.copyOnlyStaging.safePreviewArgs': 'organize_font_directory',
    'sourceLayoutMismatchSummary.decisionChecklist.items[].safePreviewArgs': 'organize_font_directory',
    recommendedNextActions: 'split_font_batch',
    'recommendedNextActions[].suggestedArgsField': 'split_font_batch',
    'recommendedNextActions[].suggestedArgs.maxFiles': 'organize_font_directory',
    'planned[].wouldProcess': 'split_font_batch',
    'planned[].skipReason': 'split_font_batch',
    skippedExisting: 'split_font_batch',
    skippedByManifest: 'split_font_batch',
    reprocessedBecauseSourceChanged: 'split_font_batch',
    reprocessedBecauseOptionsChanged: 'split_font_batch',
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
    || directoryQuickAnswer.directoryOrganizationSafety?.summaryType !== 'directory-organization-safety'
    || directoryQuickAnswer.directoryOrganizationSafety?.appliesToTool !== 'get_agent_guidance'
    || directoryQuickAnswer.directoryOrganizationSafety?.safePreviewArgs?.workflowPreset !== 'safe-preview'
    || directoryQuickAnswer.directoryOrganizationSafety?.helperToolWriteMode !== 'copy-only-outputDir'
    || directoryQuickAnswer.directoryOrganizationSafety?.sourceFilesMovedDeletedOrRewritten !== false
    || directoryQuickAnswer.directoryOrganizationSafety?.isSplitOutput !== false
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
  const expectedBatchCustomizationQuickReference = buildBatchCustomizationQuickReference();
  if (JSON.stringify(result.batchCustomizationQuickReference) !== JSON.stringify(expectedBatchCustomizationQuickReference)) {
    throw new Error('Expected agent guidance batchCustomizationQuickReference to match the standalone builder output.');
  }
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

}

export { runAgentGuidanceSmoke };
